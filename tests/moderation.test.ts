import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { createApp } from '../src/server/app.js';
import { loadConfig } from '../src/server/config.js';
import { migrate } from '../src/server/migrate.js';
import { newToken, tokenHash } from '../src/server/auth.js';
import type { ReportPage } from '../src/shared/model.js';
if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL is required');
const schema = `moderation_${randomUUID().replaceAll('-', '')}`;
const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
const pool = new pg.Pool({
  connectionString: process.env.TEST_DATABASE_URL,
  options: `-c search_path=${schema}`,
});
const author = randomUUID(),
  reader = randomUUID(),
  moderator = randomUUID(),
  first = randomUUID(),
  second = randomUUID(),
  reply = randomUUID();
const origin = 'http://localhost:5175';
let app: Awaited<ReturnType<typeof createApp>>,
  authorCookie = '',
  readerCookie = '',
  moderatorCookie = '',
  dismissId = '',
  removeId = '';
before(async () => {
  await admin.query(`CREATE SCHEMA ${schema}`);
  await migrate(pool);
  for (const [id, username, staff] of [
    [author, 'elin', false],
    [reader, 'jonas', false],
    [moderator, 'moderator', true],
  ] as const) {
    await pool.query(
      'INSERT INTO members(id,username,display_name,password_hash,is_moderator) VALUES ($1,$2,$2,$3,$4)',
      [id, username, 'unused', staff],
    );
    const token = newToken();
    await pool.query(
      "INSERT INTO sessions(token_hash,member_id,expires_at) VALUES ($1,$2,now()+interval '1 hour')",
      [tokenHash(token), id],
    );
    if (id === author) authorCookie = `blog_session=${token}`;
    else if (id === reader) readerCookie = `blog_session=${token}`;
    else moderatorCookie = `blog_session=${token}`;
  }
  await pool.query('INSERT INTO posts(id,author_id,body) VALUES ($1,$2,$3),($4,$2,$5)', [
    first,
    author,
    'A questionable note',
    second,
    'Remove this needle content',
  ]);
  await pool.query('INSERT INTO posts(id,author_id,parent_id,body) VALUES ($1,$2,$3,$4)', [
    reply,
    reader,
    second,
    'A reply with useful context',
  ]);
  await pool.query('INSERT INTO follows(follower_id,followed_id) VALUES ($1,$2)', [reader, author]);
  app = await createApp(pool, loadConfig({ DATABASE_URL: 'test', APP_ORIGIN: origin }));
});
after(async () => {
  if (app) await app.close();
  await pool.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.end();
});
const request = (
  method: 'POST' | 'PUT' | 'DELETE',
  url: string,
  cookie: string,
  payload?: Record<string, unknown>,
) =>
  app.inject({
    method,
    url,
    headers: { origin, cookie },
    ...(payload === undefined ? {} : { payload }),
  });
test('moderator role comes from the database; report queues and decisions are not public', async () => {
  assert.equal((await app.inject('/api/moderation/reports')).statusCode, 401);
  assert.equal(
    (await app.inject({ url: '/api/moderation/reports', headers: { cookie: readerCookie } }))
      .statusCode,
    403,
  );
  assert.equal(
    (
      await request('POST', `/api/moderation/reports/${randomUUID()}/decision`, authorCookie, {
        action: 'remove',
        note: 'Forged',
      })
    ).statusCode,
    403,
  );
  assert.equal((await app.inject('/api/hidden-posts')).statusCode, 401);
  assert.equal(
    (await app.inject({ url: '/api/session', headers: { cookie: moderatorCookie } })).json().member
      .isModerator,
    true,
  );
  assert.equal(
    (await app.inject({ url: '/api/session', headers: { cookie: authorCookie } })).json().member
      .isModerator,
    false,
  );
  assert.equal(
    (
      await app.inject({
        method: 'PUT',
        url: `/api/posts/${first}/hide`,
        headers: { cookie: readerCookie },
        payload: {},
      })
    ).statusCode,
    403,
  );
});
test('hide/unhide is idempotent, personal, and enforced in feed, profile, search and direct reads', async () => {
  for (let i = 0; i < 2; i++)
    assert.equal((await request('PUT', `/api/posts/${first}/hide`, readerCookie)).statusCode, 200);
  for (const url of [
    '/api/posts',
    '/api/posts?author=elin',
    '/api/posts?feed=following',
    '/api/posts?q=questionable',
  ]) {
    const result = await app.inject({ url, headers: { cookie: readerCookie } });
    assert.equal(result.statusCode, 200);
    assert.ok(!result.json().items.some((p: { id: string }) => p.id === first));
  }
  const hidden = (
    await app.inject({ url: `/api/posts/${first}`, headers: { cookie: readerCookie } })
  ).json();
  assert.equal(hidden.hidden, true);
  assert.equal(hidden.body, '');
  assert.equal((await app.inject(`/api/posts/${first}`)).json().body, 'A questionable note');
  assert.equal(
    (await app.inject({ url: '/api/hidden-posts', headers: { cookie: readerCookie } })).json()
      .items[0].id,
    first,
  );
  assert.equal(
    (await app.inject({ url: '/api/hidden-posts', headers: { cookie: authorCookie } })).json().items
      .length,
    0,
  );
  for (let i = 0; i < 2; i++)
    assert.equal(
      (await request('DELETE', `/api/posts/${first}/hide`, readerCookie)).statusCode,
      200,
    );
  assert.equal(
    (await app.inject({ url: `/api/posts/${first}`, headers: { cookie: readerCookie } })).json()
      .body,
    'A questionable note',
  );
});
test('reporting is idempotent, snapshots the text, and does not hide or remove it', async () => {
  for (let i = 0; i < 2; i++) {
    const result = await request('POST', `/api/posts/${first}/reports`, readerCookie, {
      reason: 'other',
      details: 'Please review the context.',
    });
    assert.equal(result.statusCode, 200);
    if (i === 0) dismissId = result.json().id;
    else assert.equal(result.json().id, dismissId);
  }
  assert.equal((await pool.query('SELECT id FROM reports WHERE post_id=$1', [first])).rowCount, 1);
  assert.equal(
    (await app.inject({ url: `/api/posts/${first}`, headers: { cookie: readerCookie } })).json()
      .body,
    'A questionable note',
  );
  await request('PUT', `/api/posts/${first}`, authorCookie, { version: 1, body: 'An edited note' });
  const page = (
    await app.inject({ url: '/api/moderation/reports', headers: { cookie: moderatorCookie } })
  ).json();
  assert.equal(page.items[0].bodySnapshot, 'A questionable note');
});
test('dismissal records its reviewer/note and leaves the post unchanged', async () => {
  const result = await request(
    'POST',
    `/api/moderation/reports/${dismissId}/decision`,
    moderatorCookie,
    { action: 'dismiss', note: 'Context does not require removal.' },
  );
  assert.equal(result.statusCode, 200);
  assert.equal((await app.inject(`/api/posts/${first}`)).json().body, 'An edited note');
  const page = (
    await app.inject({
      url: '/api/moderation/reports?state=dismissed',
      headers: { cookie: moderatorCookie },
    })
  ).json();
  assert.equal(page.items[0].reviewerUsername, 'moderator');
  assert.equal(page.items[0].decisionNote, 'Context does not require removal.');
  assert.equal(
    (
      await request('POST', `/api/moderation/reports/${dismissId}/decision`, moderatorCookie, {
        action: 'remove',
        note: 'Overwriting a decision',
      })
    ).statusCode,
    409,
  );
});
test('removal redacts all public surfaces, preserves replies, and prevents author edits or new replies', async () => {
  removeId = (
    await request('POST', `/api/posts/${second}/reports`, readerCookie, { reason: 'abuse' })
  ).json().id;
  assert.equal(
    (
      await request('POST', `/api/moderation/reports/${removeId}/decision`, moderatorCookie, {
        action: 'remove',
        note: 'Removed after review.',
      })
    ).statusCode,
    200,
  );
  for (const cookie of ['', authorCookie, readerCookie, moderatorCookie]) {
    const post = (await app.inject({ url: `/api/posts/${second}`, headers: { cookie } })).json();
    assert.equal(post.removed, true);
    assert.equal(post.body, '');
    for (const url of ['/api/posts', '/api/posts?author=elin']) {
      const row = (await app.inject({ url, headers: { cookie } }))
        .json()
        .items.find((p: { id: string }) => p.id === second);
      assert.equal(row.body, '');
    }
    assert.equal(
      (await app.inject({ url: '/api/posts?q=needle', headers: { cookie } })).json().items.length,
      0,
    );
  }
  assert.equal(
    (await app.inject(`/api/posts/${second}/replies`)).json().items[0].body,
    'A reply with useful context',
  );
  assert.equal(
    (
      await request('PUT', `/api/posts/${second}`, authorCookie, {
        body: 'Bring it back',
        version: 2,
      })
    ).statusCode,
    409,
  );
  assert.equal(
    (await request('POST', `/api/posts/${second}/replies`, readerCookie, { body: 'New reply' }))
      .statusCode,
    409,
  );
  assert.equal(
    (await request('POST', `/api/posts/${second}/reports`, readerCookie, { reason: 'spam' }))
      .statusCode,
    409,
  );
});
test('invalid input, self-report and forged privilege/reporter fields fail closed', async () => {
  assert.equal(
    (await request('POST', `/api/posts/${first}/reports`, authorCookie, { reason: 'spam' }))
      .statusCode,
    400,
  );
  for (const payload of [
    { reason: 'invalid' },
    { reason: 'spam', details: 'x'.repeat(1001) },
    { reason: 'spam', reporterId: moderator },
  ])
    assert.equal(
      (await request('POST', `/api/posts/${first}/reports`, readerCookie, payload)).statusCode,
      400,
    );
  assert.equal(
    (
      await request('POST', `/api/moderation/reports/${randomUUID()}/decision`, moderatorCookie, {
        action: 'remove',
        note: ' ',
      })
    ).statusCode,
    400,
  );
  assert.equal(
    (
      await request('POST', `/api/moderation/reports/${randomUUID()}/decision`, moderatorCookie, {
        action: 'remove',
        note: 'Reason',
      })
    ).statusCode,
    404,
  );
  assert.equal(
    (await request('PUT', `/api/posts/${randomUUID()}/hide`, readerCookie)).statusCode,
    404,
  );
});
test('simultaneous reviews allow exactly one decision; permissions are rechecked each request', async () => {
  const post = randomUUID();
  await pool.query('INSERT INTO posts(id,author_id,body) VALUES ($1,$2,$3)', [
    post,
    author,
    'Concurrent review',
  ]);
  const id = (
    await request('POST', `/api/posts/${post}/reports`, readerCookie, { reason: 'spam' })
  ).json().id;
  const responses = await Promise.all(
    ['dismiss', 'remove'].map((action) =>
      request('POST', `/api/moderation/reports/${id}/decision`, moderatorCookie, {
        action,
        note: 'Reviewed once.',
      }),
    ),
  );
  assert.deepEqual(responses.map((r) => r.statusCode).sort(), [200, 409]);
  await pool.query('UPDATE members SET is_moderator=false WHERE id=$1', [moderator]);
  assert.equal(
    (await app.inject({ url: '/api/moderation/reports', headers: { cookie: moderatorCookie } }))
      .statusCode,
    403,
  );
  await pool.query('UPDATE members SET is_moderator=true WHERE id=$1', [moderator]);
});
test('report queues are paginated without losing timestamp ties', async () => {
  await pool.query(
    `INSERT INTO posts(id,author_id,body) SELECT gen_random_uuid(),$1,'Queue item '||n FROM generate_series(1,27) n`,
    [author],
  );
  await pool.query(
    `INSERT INTO reports(id,post_id,reporter_id,reason,body_snapshot,created_at) SELECT gen_random_uuid(),id,$1,'spam',body,'2026-10-01T12:00:00.123456Z' FROM posts WHERE body LIKE 'Queue item %'`,
    [reader],
  );
  const ids: string[] = [];
  let cursor: string | null = null;
  do {
    const response: { json(): ReportPage } = await app.inject({
      url: `/api/moderation/reports?limit=6${cursor ? `&cursor=${cursor}` : ''}`,
      headers: { cookie: moderatorCookie },
    });
    const page = response.json();
    ids.push(...page.items.map((r) => r.id));
    cursor = page.nextCursor;
  } while (cursor);
  assert.equal(ids.length, 27);
  assert.equal(new Set(ids).size, 27);
  for (const query of ['cursor=bad', 'state=bad', 'limit=51'])
    assert.equal(
      (
        await app.inject({
          url: `/api/moderation/reports?${query}`,
          headers: { cookie: moderatorCookie },
        })
      ).statusCode,
      400,
    );
});
test('a reported reply opens its parent thread and can be removed without changing the parent', async () => {
  const response = await request('POST', `/api/posts/${first}/replies`, readerCookie, {
    body: 'A reply for separate review.',
  });
  assert.equal(response.statusCode, 201);
  const replyId = response.json().id;
  const report = await request('POST', `/api/posts/${replyId}/reports`, authorCookie, {
    reason: 'other',
  });
  const reportId = report.json().id;
  const queue = (
    await app.inject({ url: '/api/moderation/reports', headers: { cookie: moderatorCookie } })
  ).json();
  assert.equal(queue.items.find((item: { id: string }) => item.id === reportId).threadId, first);
  assert.equal(
    (
      await request('POST', `/api/moderation/reports/${reportId}/decision`, moderatorCookie, {
        action: 'remove',
        note: 'Reply reviewed separately.',
      })
    ).statusCode,
    200,
  );
  assert.equal((await app.inject(`/api/posts/${first}`)).json().body, 'An edited note');
  const reply = (await app.inject(`/api/posts/${replyId}`)).json();
  assert.equal(reply.removed, true);
  assert.equal(reply.body, '');
});
