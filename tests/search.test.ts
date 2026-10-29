import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { createApp } from '../src/server/app.js';
import { loadConfig } from '../src/server/config.js';
import { migrate } from '../src/server/migrate.js';
import type { PostPage, MemberPage } from '../src/shared/model.js';
if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL is required');
const schema = `search_${randomUUID().replaceAll('-', '')}`;
const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
const pool = new pg.Pool({
  connectionString: process.env.TEST_DATABASE_URL,
  options: `-c search_path=${schema}`,
});
const author = randomUUID(),
  root = randomUUID();
let app: Awaited<ReturnType<typeof createApp>>;
before(async () => {
  await admin.query(`CREATE SCHEMA ${schema}`);
  await migrate(pool);
  await pool.query(
    "INSERT INTO members(id,username,display_name,bio,password_hash) VALUES ($1,'elin','Elin Berg','Design and little tools.','private-search-marker')",
    [author],
  );
  await pool.query(
    `INSERT INTO members(id,username,display_name,bio,password_hash) SELECT gen_random_uuid(),'person_'||lpad(n::text,3,'0'),'Community member '||n,'Fieldnotes and sketches','private-search-marker' FROM generate_series(1,37) n`,
  );
  await pool.query(
    `INSERT INTO posts(id,author_id,body,created_at) SELECT gen_random_uuid(),$1,'Fieldnotes '||n,'2026-10-01T12:00:00.123456Z' FROM generate_series(1,43) n`,
    [author],
  );
  await pool.query('INSERT INTO posts(id,author_id,body) VALUES ($1,$2,$3)', [
    root,
    author,
    'The literal needle_% and <script>plain text</script>.',
  ]);
  await pool.query('INSERT INTO posts(id,author_id,parent_id,body) VALUES ($1,$2,$3,$4)', [
    randomUUID(),
    author,
    root,
    'Fieldnotes reply excluded',
  ]);
  await pool.query("INSERT INTO posts(id,author_id,body,deleted) VALUES ($1,$2,'',true)", [
    randomUUID(),
    author,
  ]);
  app = await createApp(pool, loadConfig({ DATABASE_URL: 'test' }));
});
after(async () => {
  if (app) await app.close();
  await pool.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.end();
});
test('public post search is case-insensitive, literal and excludes replies and deleted posts', async () => {
  const response = await app.inject('/api/posts?q=' + encodeURIComponent(' NEEDLE_% '));
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().items.length, 1);
  assert.match(response.json().items[0].body, /<script>plain text/);
  const page: PostPage = (await app.inject('/api/posts?q=FIELDNOTES&limit=50')).json();
  assert.equal(page.items.length, 43);
  assert.ok(page.items.every((p) => p.parentId === null && !p.deleted));
  assert.equal(
    (await app.inject('/api/posts?q=' + encodeURIComponent("' OR 1=1 --"))).json().items.length,
    0,
  );
  assert.equal(
    (await app.inject('/api/posts?q=Elin')).json().items.length,
    0,
    'Post search matches bodies, not authors',
  );
});
test('post search applies matching before keyset paging without losing timestamp ties', async () => {
  const ids: string[] = [];
  let cursor: string | null = null;
  do {
    const response: { json(): PostPage } = await app.inject(
      `/api/posts?q=fieldnotes&limit=6${cursor ? `&cursor=${cursor}` : ''}`,
    );
    const page = response.json();
    ids.push(...page.items.map((p) => p.id));
    cursor = page.nextCursor;
  } while (cursor);
  assert.equal(ids.length, 43);
  assert.equal(new Set(ids).size, 43);
});
test('member search matches public profile fields and returns only safe fields', async () => {
  for (const q of ['ELIN', 'berg', 'little tools']) {
    const response = await app.inject('/api/search/members?q=' + encodeURIComponent(q));
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().items[0].id, author);
    assert.deepEqual(Object.keys(response.json().items[0]).sort(), [
      'bio',
      'displayName',
      'id',
      'username',
    ]);
  }
  assert.equal(
    (await app.inject('/api/search/members?q=private-search-marker')).json().items.length,
    0,
  );
  assert.equal(
    (await app.inject('/api/search/members?q=%25')).json().items.length,
    0,
    'Percent is literal',
  );
  assert.equal(
    (await app.inject('/api/search/members?q=' + encodeURIComponent("' OR 1=1 --"))).json().items
      .length,
    0,
  );
});
test('member pagination is stable, complete and ordered by username', async () => {
  const usernames: string[] = [];
  let cursor: string | null = null;
  do {
    const response: { json(): MemberPage } = await app.inject(
      `/api/search/members?q=fieldnotes&limit=8${cursor ? `&cursor=${cursor}` : ''}`,
    );
    const page = response.json();
    usernames.push(...page.items.map((m) => m.username));
    cursor = page.nextCursor;
  } while (cursor);
  assert.equal(usernames.length, 37);
  assert.equal(new Set(usernames).size, 37);
  assert.deepEqual(usernames, [...usernames].sort());
});
test('invalid searches return actionable 400s; empty matches return a normal empty page', async () => {
  for (const path of [
    '/api/search/members',
    '/api/search/members?q=%20',
    '/api/search/members?q=x&cursor=wrong',
    '/api/search/members?q=x&limit=51',
    '/api/search/members?q=' + 'x'.repeat(121),
    '/api/posts?q=%20',
    '/api/posts?q=' + 'x'.repeat(121),
    '/api/posts?q=x&cursor=wrong',
  ])
    assert.equal((await app.inject(path)).statusCode, 400, path);
  assert.equal((await app.inject(`/api/posts/${root}/replies?q=fieldnotes`)).statusCode, 400);
  for (const path of ['/api/posts?q=unfindable', '/api/search/members?q=unfindable'])
    assert.deepEqual((await app.inject(path)).json(), { items: [], nextCursor: null });
});
