import { test } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import { createApp } from '../src/server/app.js';
import { loadConfig } from '../src/server/config.js';
import { createPool } from '../src/server/database.js';

test('unexpected errors produce a server diagnostic and a generic public response', async () => {
  const lines: string[] = [];
  const pool = {
    query: async () => {
      throw new Error('fictional database failure');
    },
  } as unknown as pg.Pool;
  const app = await createApp(pool, loadConfig({ DATABASE_URL: 'test' }), {
    logger: {
      level: 'error',
      stream: {
        write(line: string) {
          lines.push(line);
        },
      },
    },
  });
  try {
    const response = await app.inject('/api/posts');
    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.json(), { message: 'Something went wrong. Please try again.' });
    const log = lines.map((line) => JSON.parse(line)).find((line) => line.level === 50);
    assert.equal(log.err.message, 'fictional database failure');
    assert.equal((await app.inject('/healthz')).statusCode, 503);
    assert.equal(
      lines.map((line) => JSON.parse(line)).filter((line) => line.level === 50).length,
      2,
    );
  } finally {
    await app.close();
  }
});
if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL is required');
test('production pool cancels a stuck query and remains usable afterwards', async () => {
  const pool = createPool(process.env.TEST_DATABASE_URL!);
  try {
    const started = Date.now();
    await assert.rejects(
      pool.query('SELECT pg_sleep(30)'),
      (error: unknown) => (error as { code?: string }).code === '57014',
    );
    assert.ok(Date.now() - started < 20_000, 'The statement timeout bounds query execution');
    assert.equal((await pool.query('SELECT 1 AS ready')).rows[0].ready, 1);
  } finally {
    await pool.end();
  }
});
