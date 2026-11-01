import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api } from '../src/client/api.js';
test('proxy HTML failures show a useful error; API validation messages survive', async (t) => {
  const fetch = t.mock.method(
    globalThis,
    'fetch',
    async () => new Response('<html>Bad gateway</html>', { status: 502 }),
  );
  await assert.rejects(api('/posts'), { message: 'Request failed. Please try again.' });
  fetch.mock.mockImplementation(
    async () => new Response(JSON.stringify({ message: 'Reload before saving.' }), { status: 409 }),
  );
  await assert.rejects(api('/posts'), { message: 'Reload before saving.' });
  fetch.mock.mockImplementation(async () => new Response('not JSON', { status: 200 }));
  await assert.rejects(api('/posts'), /unreadable response/);
});
