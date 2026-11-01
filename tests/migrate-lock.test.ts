import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { migrate } from '../src/server/migrate.js';
if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL is required');
test('Blog migrations do not block behind another app’s advisory lock in the same database', async () => {
  const schema = 'lock_' + randomUUID().replaceAll('-', '');
  const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const pool = new pg.Pool({
    connectionString: process.env.TEST_DATABASE_URL,
    options: `-c search_path=${schema} -c statement_timeout=1000`,
  });
  const other = await admin.connect();
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    await other.query('BEGIN');
    await other.query('SELECT pg_advisory_xact_lock(72941801)');
    await migrate(pool);
    assert.ok((await pool.query('SELECT count(*)::int AS n FROM schema_migrations')).rows[0].n > 0);
  } finally {
    await other.query('ROLLBACK');
    other.release();
    await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  }
});
