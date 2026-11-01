import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { migrate } from '../src/server/migrate.js';
import { seedDemo } from '../src/server/demo.js';
import { listPosts, getPost } from '../src/server/posts.js';
import { getProfile } from '../src/server/follows.js';
if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL is required');
test('demo additions are repeatable and preserve existing content, credentials and edited samples', async () => {
  const schema = `demo_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const pool = new pg.Pool({
    connectionString: process.env.TEST_DATABASE_URL,
    options: `-c search_path=${schema}`,
  });
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    await migrate(pool);
    const member = randomUUID(),
      post = randomUUID();
    await pool.query(
      "INSERT INTO members(id,username,display_name,password_hash) VALUES ($1,'existing_member','Existing member','existing-secret-hash')",
      [member],
    );
    await pool.query("INSERT INTO posts(id,author_id,body) VALUES ($1,$2,'Existing post')", [
      post,
      member,
    ]);
    await seedDemo(pool);
    assert.equal(
      (await pool.query('SELECT count(*)::int AS n FROM posts WHERE parent_id IS NULL')).rows[0].n,
      19,
    );
    const first = await listPosts(pool, {});
    assert.ok(first.nextCursor);
    const second = await listPosts(pool, { cursor: first.nextCursor });
    assert.ok(second.items.every((p) => !first.items.some((previous) => previous.id === p.id)));
    const search = await listPosts(pool, { q: 'keyboard-only' });
    assert.equal(search.items.length, 1);
    const replies = await listPosts(pool, {}, search.items[0].id);
    assert.equal(replies.items.length, 2);
    const removed = (await pool.query('SELECT id FROM posts WHERE removed')).rows[0].id;
    assert.equal((await getPost(pool, removed)).body, '');
    assert.equal((await listPosts(pool, {}, removed)).items.length, 1);
    const profile = await getProfile(pool, 'demo_elin');
    assert.ok(profile);
    const counts = (await pool.query('SELECT count(*)::int AS n FROM follows')).rows[0].n;
    assert.equal(counts, 8);
    const before = (await pool.query('SELECT id,password_hash FROM members ORDER BY id')).rows;
    const total = (await pool.query('SELECT count(*)::int AS n FROM posts')).rows[0].n;
    await pool.query("UPDATE posts SET body='Edited sample' WHERE id=$1", [search.items[0].id]);
    await seedDemo(pool);
    assert.deepEqual(
      (await pool.query('SELECT id,password_hash FROM members ORDER BY id')).rows,
      before,
    );
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM posts')).rows[0].n, total);
    assert.equal((await getPost(pool, post)).body, 'Existing post');
    assert.equal((await getPost(pool, search.items[0].id)).body, 'Edited sample');
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM follows')).rows[0].n, counts);
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  }
});
