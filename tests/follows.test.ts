import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { createApp } from '../src/server/app.js';
import { loadConfig } from '../src/server/config.js';
import { hashPassword, newToken, tokenHash } from '../src/server/auth.js';
import { migrate } from '../src/server/migrate.js';
import type { PostPage, Profile } from '../src/shared/model.js';
if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL is required');
const schema = `follows_${randomUUID().replaceAll('-', '')}`;
const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
const pool = new pg.Pool({
  connectionString: process.env.TEST_DATABASE_URL,
  options: `-c search_path=${schema}`,
});
const origin = 'http://localhost:5175';
const elin = randomUUID(),
  jonas = randomUUID(),
  mira = randomUUID();
let app: Awaited<ReturnType<typeof createApp>>;
let cookie = '',
  otherCookie = '';
before(async () => {
  await admin.query(`CREATE SCHEMA ${schema}`);
  await migrate(pool);
  const hash = await hashPassword('fictional-test-password');
  for (const [id, username] of [
    [elin, 'elin'],
    [jonas, 'jonas'],
    [mira, 'mira'],
  ])
    await pool.query(
      'INSERT INTO members(id,username,display_name,password_hash) VALUES ($1,$2,$2,$3)',
      [id, username, hash],
    );
  for (const id of [elin, jonas]) {
    const token = newToken();
    await pool.query(
      "INSERT INTO sessions(token_hash,member_id,expires_at) VALUES ($1,$2,now()+interval '1 hour')",
      [tokenHash(token), id],
    );
    if (id === elin) cookie = `blog_session=${token}`;
    else otherCookie = `blog_session=${token}`;
  }
  await pool.query(
    `INSERT INTO posts(id,author_id,body,created_at) SELECT gen_random_uuid(),$1,'Followed note '||n,'2026-10-01T12:00:00.123456Z' FROM generate_series(1,43) n`,
    [jonas],
  );
  const root = randomUUID();
  await pool.query('INSERT INTO posts(id,author_id,body) VALUES ($1,$2,$3),($4,$5,$6)', [
    root,
    elin,
    'Own post',
    randomUUID(),
    mira,
    'Unfollowed member',
  ]);
  await pool.query('INSERT INTO posts(id,author_id,parent_id,body) VALUES ($1,$2,$3,$4)', [
    randomUUID(),
    jonas,
    root,
    'Reply, not a feed item',
  ]);
  app = await createApp(pool, loadConfig({ DATABASE_URL: 'test', APP_ORIGIN: origin }));
});
after(async () => {
  if (app) await app.close();
  await pool.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.end();
});
const follow = (username: string, method: 'PUT' | 'DELETE' = 'PUT') =>
  app.inject({ method, url: `/api/members/${username}/follow`, headers: { origin, cookie } });
test('following is private to an authenticated session; writes require exact Origin', async () => {
  assert.equal((await app.inject('/api/posts?feed=following')).statusCode, 401);
  assert.equal(
    (await app.inject({ method: 'PUT', url: '/api/members/jonas/follow', headers: { origin } }))
      .statusCode,
    401,
  );
  assert.equal(
    (await app.inject({ method: 'PUT', url: '/api/members/jonas/follow', headers: { cookie } }))
      .statusCode,
    403,
  );
  assert.equal(
    (
      await app.inject({
        method: 'DELETE',
        url: '/api/members/jonas/follow',
        headers: { cookie, origin: 'http://evil.invalid' },
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (await app.inject({ url: '/api/posts?feed=following', headers: { cookie } })).json().items
      .length,
    0,
  );
});
test('self-follow, missing members and client-supplied follower identities are rejected', async () => {
  assert.equal((await follow('elin')).statusCode, 400);
  assert.equal((await follow('missing')).statusCode, 404);
  assert.equal((await follow('BAD!')).statusCode, 400);
  assert.equal(
    (
      await app.inject({
        method: 'PUT',
        url: '/api/members/jonas/follow',
        headers: { origin, cookie },
        payload: { followerId: mira },
      })
    ).statusCode,
    400,
  );
  assert.equal((await pool.query('SELECT * FROM follows')).rowCount, 0);
});
test('following twice is idempotent and profiles show accurate counts and viewer relationships', async () => {
  for (let i = 0; i < 2; i++) {
    const response = await follow('jonas');
    assert.equal(response.statusCode, 200);
    const profile: Profile = response.json();
    assert.equal(profile.following, true);
    assert.equal(profile.followerCount, 1);
  }
  assert.equal((await pool.query('SELECT * FROM follows')).rowCount, 1);
  const own = (await app.inject({ url: '/api/members/elin', headers: { cookie } })).json();
  assert.equal(own.followingCount, 1);
  assert.equal(own.following, false);
  assert.equal((await app.inject('/api/members/jonas')).json().following, false);
  assert.equal(
    (await app.inject({ url: '/api/members/jonas', headers: { cookie: otherCookie } })).json()
      .following,
    false,
  );
  assert.equal(
    (await app.inject({ url: '/api/members/jonas', headers: { cookie } })).json().following,
    true,
  );
});
test('following is applied before cursor pagination and excludes own posts, strangers and replies', async () => {
  const ids: string[] = [];
  let cursor: string | null = null;
  do {
    const response: { statusCode: number; json(): PostPage } = await app.inject({
      url: `/api/posts?feed=following&limit=7${cursor ? `&cursor=${cursor}` : ''}`,
      headers: { cookie },
    });
    assert.equal(response.statusCode, 200);
    const page = response.json();
    assert.ok(page.items.every((p) => p.authorId === jonas && p.parentId === null));
    ids.push(...page.items.map((p) => p.id));
    cursor = page.nextCursor;
  } while (cursor);
  assert.equal(ids.length, 43);
  assert.equal(new Set(ids).size, 43);
  assert.equal(
    (await app.inject({ url: '/api/posts?feed=following&author=mira', headers: { cookie } })).json()
      .items.length,
    0,
  );
  assert.equal(
    (
      await app.inject({ url: '/api/posts?feed=following', headers: { cookie: otherCookie } })
    ).json().items.length,
    0,
  );
  assert.equal(
    (await app.inject({ url: '/api/posts?feed=following&viewerId=' + elin, headers: { cookie } }))
      .statusCode,
    400,
  );
  const first = (await app.inject('/api/posts?limit=50')).json();
  assert.equal(first.items.length, 45);
});
test('unfollow twice is idempotent and empties only this member’s following feed', async () => {
  await app.inject({
    method: 'PUT',
    url: '/api/members/elin/follow',
    headers: { origin, cookie: otherCookie },
  });
  for (let i = 0; i < 2; i++) {
    const response = await follow('jonas', 'DELETE');
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().following, false);
    assert.equal(response.json().followerCount, 0);
  }
  assert.equal(
    (await app.inject({ url: '/api/posts?feed=following', headers: { cookie } })).json().items
      .length,
    0,
  );
  assert.equal(
    (
      await app.inject({ url: '/api/posts?feed=following', headers: { cookie: otherCookie } })
    ).json().items[0].body,
    'Own post',
  );
  assert.equal((await app.inject('/api/members/elin')).json().followingCount, 0);
});
