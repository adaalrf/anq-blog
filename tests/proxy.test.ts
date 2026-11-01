import { test } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import { createApp } from '../src/server/app.js';
import { loadConfig } from '../src/server/config.js';
import { parseTrustedProxies } from '../src/server/proxy.js';

const origin = 'http://localhost:5173';
// No accounts exist in this isolated fixture; requests must never authenticate.
const pool = { query: async () => ({ rows: [] }) } as unknown as pg.Pool;
async function fixture(trusted?: string) {
  return createApp(
    pool,
    loadConfig({
      DATABASE_URL: 'unused',
      APP_ORIGIN: origin,
      DEMO_MODE: 'true',
      ...(trusted === undefined ? {} : { TRUST_PROXY_IPS: trusted }),
    }),
  );
}
function attempt(app: Awaited<ReturnType<typeof createApp>>, peer: string, forwarded: string) {
  return app.inject({
    method: 'POST',
    url: '/api/login',
    remoteAddress: peer,
    headers: { origin, 'x-forwarded-for': forwarded },
    payload: { username: 'missing_user', password: 'fictional-invalid-password' },
  });
}

test('trusted proxy clients have separate login budgets', async () => {
  const app = await fixture('127.0.0.1');
  try {
    for (let n = 0; n < 8; n++)
      assert.equal((await attempt(app, '127.0.0.1', '198.51.100.10')).statusCode, 401);
    assert.equal((await attempt(app, '127.0.0.1', '198.51.100.10')).statusCode, 429);
    assert.equal((await attempt(app, '127.0.0.1', '198.51.100.11')).statusCode, 401);
  } finally {
    await app.close();
  }
});

test('forwarded headers cannot bypass the default direct-client limit', async () => {
  const app = await fixture();
  try {
    for (let n = 0; n < 8; n++)
      assert.equal((await attempt(app, '203.0.113.20', '198.51.100.' + (n + 1))).statusCode, 401);
    assert.equal((await attempt(app, '203.0.113.20', '198.51.100.99')).statusCode, 429);
  } finally {
    await app.close();
  }
});

test('an untrusted peer cannot rotate forwarded addresses to escape its limit', async () => {
  const app = await fixture('127.0.0.1');
  try {
    for (let n = 0; n < 8; n++)
      assert.equal((await attempt(app, '203.0.113.20', '198.51.100.' + (n + 1))).statusCode, 401);
    assert.equal((await attempt(app, '203.0.113.20', '198.51.100.99')).statusCode, 429);
  } finally {
    await app.close();
  }
});

test('spoofed addresses before the first untrusted client do not change its budget', async () => {
  const app = await fixture('127.0.0.1');
  try {
    for (let n = 0; n < 8; n++)
      assert.equal(
        (await attempt(app, '::ffff:127.0.0.1', '203.0.113.' + (n + 1) + ', 198.51.100.10'))
          .statusCode,
        401,
      );
    assert.equal(
      (await attempt(app, '::ffff:127.0.0.1', '203.0.113.99, 198.51.100.10')).statusCode,
      429,
    );
    assert.equal(
      (await attempt(app, '::ffff:127.0.0.1', '203.0.113.99, 198.51.100.11')).statusCode,
      401,
    );
  } finally {
    await app.close();
  }
});

test('proxy trust defaults off and rejects broad or ambiguous settings', () => {
  assert.equal(
    loadConfig({ DATABASE_URL: 'unused', APP_ORIGIN: origin, DEMO_MODE: 'true' }).trustProxy,
    false,
  );
  for (const value of ['true', '1', '0.0.0.0/0', '127.0.0.1,,::1', 'example.com'])
    assert.throws(
      () =>
        loadConfig({
          DATABASE_URL: 'unused',
          APP_ORIGIN: origin,
          DEMO_MODE: 'true',
          TRUST_PROXY_IPS: value,
        }),
      /TRUST_PROXY_IPS/,
    );
});

test('self resolves current container addresses instead of pinning an old address', () => {
  assert.deepEqual(parseTrustedProxies('self', ['10.89.0.2']), ['10.89.0.2']);
  assert.deepEqual(parseTrustedProxies('self', ['10.89.0.3']), ['10.89.0.3']);
  assert.deepEqual(parseTrustedProxies('127.0.0.1, ::1, self', ['10.89.0.3']), [
    '127.0.0.1',
    '::1',
    '10.89.0.3',
  ]);
  assert.throws(() => parseTrustedProxies('self', []), /TRUST_PROXY_IPS/);
});

test('trusted proxy clients also have independent post-write budgets', async () => {
  const app = await fixture('127.0.0.1');
  const write = (client: string) =>
    app.inject({
      method: 'POST',
      url: '/api/posts',
      remoteAddress: '127.0.0.1',
      headers: { origin, 'x-forwarded-for': client },
      payload: { body: 'Never published: this fixture has no authenticated member.' },
    });
  try {
    for (let n = 0; n < 30; n++) assert.equal((await write('198.51.100.10')).statusCode, 401);
    assert.equal((await write('198.51.100.10')).statusCode, 429);
    assert.equal((await write('198.51.100.11')).statusCode, 401);
  } finally {
    await app.close();
  }
});
