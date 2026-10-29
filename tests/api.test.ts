import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { createApp } from '../src/server/app.js';
import { loadConfig } from '../src/server/config.js';
import { hashPassword, tokenHash } from '../src/server/auth.js';
import { migrate } from '../src/server/migrate.js';
if (!process.env.TEST_DATABASE_URL)
  throw new Error('TEST_DATABASE_URL is required; use disposable PostgreSQL');
const schema = `test_${randomUUID().replaceAll('-', '')}`;
const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
const pool = new pg.Pool({
  connectionString: process.env.TEST_DATABASE_URL,
  options: `-c search_path=${schema}`,
});
let app: Awaited<ReturnType<typeof createApp>>;
const origin = 'http://localhost:5175',
  password = 'fictional-test-password';
const elin = randomUUID(),
  jonas = randomUUID();
let cookie = '',
  otherCookie = '',
  id = '';
async function login(username: string) {
  const result = await app.inject({
    method: 'POST',
    url: '/api/login',
    headers: { origin },
    payload: { username, password },
  });
  assert.equal(result.statusCode, 200);
  assert.match(result.headers['set-cookie'] as string, /HttpOnly/);
  assert.match(result.headers['set-cookie'] as string, /SameSite=Strict/i);
  return (result.headers['set-cookie'] as string).split(';')[0];
}
before(async () => {
  await admin.query(`CREATE SCHEMA ${schema}`);
  await migrate(pool);
  for (const [member, username] of [
    [elin, 'elin'],
    [jonas, 'jonas'],
  ])
    await pool.query(
      'INSERT INTO members(id,username,display_name,password_hash) VALUES ($1,$2,$2,$3)',
      [member, username, await hashPassword(password)],
    );
  app = await createApp(pool, loadConfig({ DATABASE_URL: 'test', APP_ORIGIN: origin }));
});
after(async () => {
  if (app) await app.close();
  await pool.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.end();
});
test('public reads omit secrets; mutations require a session and exact Origin', async () => {
  assert.equal((await app.inject('/healthz')).statusCode, 200);
  assert.equal((await app.inject('/api/session')).json().member, null);
  const profile = (await app.inject('/api/members/elin')).json();
  assert.equal(profile.username, 'elin');
  assert.equal(profile.password_hash, undefined);
  for (const supplied of [undefined, 'http://evil.invalid'])
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: '/api/posts',
          headers: supplied ? { origin: supplied } : {},
          payload: { body: 'hello' },
        })
      ).statusCode,
      403,
    );
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: '/api/posts',
        headers: { origin },
        payload: { body: 'hello' },
      })
    ).statusCode,
    401,
  );
});
test('members authenticate separately and sessions are stored only as hashes', async () => {
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: '/api/login',
        headers: { origin },
        payload: { username: 'elin', password: 'wrong' },
      })
    ).statusCode,
    401,
  );
  cookie = await login('elin');
  otherCookie = await login('jonas');
  assert.equal(
    (await app.inject({ url: '/api/session', headers: { cookie } })).json().member.id,
    elin,
  );
  const token = cookie.split('=')[1];
  assert.equal(
    (await pool.query('SELECT token_hash FROM sessions WHERE token_hash=$1', [tokenHash(token)]))
      .rowCount,
    1,
  );
  assert.equal(
    (await pool.query('SELECT token_hash FROM sessions WHERE token_hash=$1', [token])).rowCount,
    0,
  );
});
test('publishing and a second member reply persist with authorship and plain text', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/posts',
    headers: { origin, cookie },
    payload: { body: '  <script>plain text</script>  ' },
  });
  assert.equal(response.statusCode, 201);
  id = response.json().id;
  assert.equal(response.json().body, '<script>plain text</script>');
  assert.equal(response.json().authorId, elin);
  const reply = await app.inject({
    method: 'POST',
    url: `/api/posts/${id}/replies`,
    headers: { origin, cookie: otherCookie },
    payload: { body: 'A thoughtful reply.' },
  });
  assert.equal(reply.statusCode, 201);
  assert.equal(reply.json().authorId, jonas);
  assert.equal((await app.inject(`/api/posts/${id}`)).json().replyCount, 1);
  assert.equal(
    (await app.inject(`/api/posts/${id}/replies`)).json().items[0].body,
    'A thoughtful reply.',
  );
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: `/api/posts/${reply.json().id}/replies`,
        headers: { origin, cookie },
        payload: { body: 'Nested' },
      })
    ).statusCode,
    409,
  );
});
test('only the author can edit or delete, and stale edits do not overwrite changes', async () => {
  for (const method of ['PUT', 'DELETE'] as const)
    assert.equal(
      (
        await app.inject({
          method,
          url: `/api/posts/${id}`,
          headers: { origin, cookie: otherCookie },
          payload: method === 'PUT' ? { body: 'Stolen', version: 1 } : { version: 1 },
        })
      ).statusCode,
      403,
    );
  assert.equal(
    (
      await app.inject({
        method: 'PUT',
        url: `/api/posts/${id}`,
        headers: { origin, cookie },
        payload: { body: 'Edited by Elin', version: 1 },
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (
      await app.inject({
        method: 'PUT',
        url: `/api/posts/${id}`,
        headers: { origin, cookie },
        payload: { body: 'Old edit', version: 1 },
      })
    ).statusCode,
    409,
  );
  assert.equal(
    (
      await app.inject({
        method: 'DELETE',
        url: `/api/posts/${id}`,
        headers: { origin, cookie },
        payload: { version: 2 },
      })
    ).statusCode,
    200,
  );
  const post = (await app.inject(`/api/posts/${id}`)).json();
  assert.equal(post.deleted, true);
  assert.equal(post.body, '');
  assert.equal(post.replyCount, 1);
  assert.equal((await pool.query('SELECT body FROM posts WHERE id=$1', [id])).rows[0].body, '');
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: `/api/posts/${id}/replies`,
        headers: { origin, cookie },
        payload: { body: 'Late reply' },
      })
    ).statusCode,
    409,
  );
});
test('strict validation rejects invalid IDs, oversized/blank posts and forged authorship', async () => {
  for (const payload of [
    { body: '  ' },
    { body: 'x'.repeat(2001) },
    { body: 'hello', authorId: jonas },
  ])
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: '/api/posts',
          headers: { origin, cookie },
          payload,
        })
      ).statusCode,
      400,
    );
  assert.equal((await app.inject('/api/posts/invalid')).statusCode, 400);
  assert.equal((await app.inject('/api/posts?cursor=wrong')).statusCode, 400);
  assert.equal((await app.inject('/api/posts?limit=51')).statusCode, 400);
  assert.equal((await app.inject(`/api/posts/${randomUUID()}`)).statusCode, 404);
});
test('cursor pagination preserves all timestamp ties and filters profiles before paging', async () => {
  await pool.query(
    `INSERT INTO posts(id,author_id,body,created_at) SELECT gen_random_uuid(),$1,'Paging '||n,'2025-01-01T12:00:00.123456Z' FROM generate_series(1,57) n`,
    [jonas],
  );
  const ids: string[] = [];
  let cursor: string | null = null;
  do {
    const response: {
      json(): { items: { id: string; authorId: string }[]; nextCursor: string | null };
    } = await app.inject(`/api/posts?author=jonas&limit=7${cursor ? `&cursor=${cursor}` : ''}`);
    const page = response.json();
    ids.push(...page.items.map((p) => p.id));
    assert.ok(page.items.every((p) => p.authorId === jonas));
    cursor = page.nextCursor;
  } while (cursor);
  assert.equal(ids.length, 57);
  assert.equal(new Set(ids).size, 57);
});
test('expired sessions and logout revoke access', async () => {
  await pool.query("UPDATE sessions SET expires_at=now()-interval '1 second' WHERE member_id=$1", [
    elin,
  ]);
  assert.equal(
    (await app.inject({ url: '/api/session', headers: { cookie } })).json().member,
    null,
  );
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: '/api/logout',
        headers: { origin, cookie: otherCookie },
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (await app.inject({ url: '/api/session', headers: { cookie: otherCookie } })).json().member,
    null,
  );
});
test('non-local HTTP configuration is rejected', () => {
  assert.throws(
    () => loadConfig({ DATABASE_URL: 'test', APP_ORIGIN: 'http://example.org' }),
    /HTTPS/,
  );
});
