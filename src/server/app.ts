import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import staticFiles from '@fastify/static';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type pg from 'pg';
import { z } from 'zod';
import type { Config } from './config.js';
import { newToken, tokenHash, verifyPassword, hashPassword } from './auth.js';
import {
  bodyInput,
  editInput,
  reportInput,
  decisionInput,
  type SessionMember,
} from '../shared/model.js';
import { changePost, fail, getPost, listPosts, publish } from './posts.js';
import { getProfile, setFollowing } from './follows.js';
import { searchMembers } from './search.js';
import { hidePost, reportPost, listReports, decideReport } from './moderation.js';
const params = z.object({ id: z.uuid() });
const memberParams = z.object({ username: z.string().regex(/^[a-z][a-z0-9_]{2,29}$/) });
export async function createApp(pool: pg.Pool, config: Config) {
  const app = Fastify({ trustProxy: config.trustProxy, bodyLimit: 16_384, requestTimeout: 15_000 });
  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  const dummyHash = await hashPassword('unused-comparison-password');
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof z.ZodError)
      return reply.code(400).send({ message: error.issues.map((i) => i.message).join(' ') });
    const status = (error as { statusCode?: number }).statusCode || 500;
    if (status >= 500) request.log.error(error);
    return reply.code(status).send({
      message: status >= 500 ? 'Something went wrong. Please try again.' : (error as Error).message,
    });
  });
  app.addHook('onSend', async (request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff').header('Referrer-Policy', 'no-referrer');
    reply.header(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    );
    if (request.url.startsWith('/api/')) reply.header('Cache-Control', 'no-store');
  });
  async function member(request: {
    cookies: Record<string, string | undefined>;
  }): Promise<SessionMember | null> {
    const token = request.cookies.blog_session;
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    return (
      (
        await pool.query(
          `SELECT m.id,m.username,m.display_name AS "displayName",m.bio,m.is_moderator AS "isModerator" FROM sessions s JOIN members m ON m.id=s.member_id WHERE s.token_hash=$1 AND s.expires_at>now()`,
          [tokenHash(token)],
        )
      ).rows[0] || null
    );
  }
  app.addHook('preHandler', async (request) => {
    if (
      request.url.startsWith('/api/') &&
      !['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
      request.headers.origin !== config.origin
    )
      fail(403, 'Request origin is not allowed.');
  });
  const requireMember = async (request: { cookies: Record<string, string | undefined> }) => {
    const user = await member(request);
    if (!user) fail(401, 'Sign in to continue.');
    return user;
  };
  const requireModerator = async (request: { cookies: Record<string, string | undefined> }) => {
    const user = await requireMember(request);
    if (!user.isModerator) fail(403, 'Moderator access is required.');
    return user;
  };
  app.get('/healthz', async (_, reply) => {
    try {
      await pool.query('SELECT id FROM members LIMIT 1');
      return { status: 'ok' };
    } catch {
      return reply.code(503).send({ status: 'unavailable' });
    }
  });
  app.get('/api/session', async (request) => ({ member: await member(request) }));
  app.get('/api/search/members', async (request) => searchMembers(pool, request.query));
  app.post(
    '/api/login',
    { config: { rateLimit: { max: 8, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const input = z
        .object({ username: z.string().max(30), password: z.string().min(1).max(256) })
        .strict()
        .parse(request.body);
      const row = (
        await pool.query('SELECT id,password_hash FROM members WHERE username=$1', [input.username])
      ).rows[0];
      const valid = await verifyPassword(input.password, row?.password_hash || dummyHash);
      if (!row || !valid) fail(401, 'Incorrect username or password.');
      const token = newToken();
      await pool.query('DELETE FROM sessions WHERE expires_at<=now()');
      await pool.query(
        "INSERT INTO sessions(token_hash,member_id,expires_at) VALUES ($1,$2,now()+interval '12 hours')",
        [tokenHash(token), row.id],
      );
      reply.setCookie('blog_session', token, {
        httpOnly: true,
        sameSite: 'strict',
        secure: config.secureCookie,
        path: '/',
        maxAge: 43_200,
      });
      return { member: await member({ cookies: { blog_session: token } }) };
    },
  );
  app.post('/api/logout', async (request, reply) => {
    if (request.cookies.blog_session)
      await pool.query('DELETE FROM sessions WHERE token_hash=$1', [
        tokenHash(request.cookies.blog_session),
      ]);
    reply.clearCookie('blog_session', {
      path: '/',
      httpOnly: true,
      sameSite: 'strict',
      secure: config.secureCookie,
    });
    return { member: null };
  });
  app.get('/api/members/:username', async (request) => {
    const { username } = memberParams.parse(request.params);
    return getProfile(pool, username, (await member(request))?.id);
  });
  const followingLimit = { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } };
  for (const method of ['PUT', 'DELETE'] as const) {
    app.route({
      method,
      url: '/api/members/:username/follow',
      ...followingLimit,
      handler: async (request) => {
        const user = await requireMember(request);
        const { username } = memberParams.parse(request.params);
        z.object({})
          .strict()
          .parse(request.body ?? {});
        return setFollowing(pool, user.id, username, method === 'PUT');
      },
    });
  }
  app.get('/api/posts', async (request) =>
    listPosts(pool, request.query, undefined, (await member(request))?.id),
  );
  app.get('/api/posts/:id', async (request) =>
    getPost(pool, params.parse(request.params).id, (await member(request))?.id),
  );
  app.get('/api/posts/:id/replies', async (request) => {
    const id = params.parse(request.params).id;
    await getPost(pool, id);
    return listPosts(pool, request.query, id, (await member(request))?.id);
  });
  const writing = { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } };
  app.get('/api/hidden-posts', async (request) => {
    const user = await requireMember(request);
    return listPosts(pool, request.query, undefined, user.id, true);
  });
  for (const method of ['PUT', 'DELETE'] as const)
    app.route({
      method,
      url: '/api/posts/:id/hide',
      ...writing,
      handler: async (request) => {
        const user = await requireMember(request);
        const { id } = params.parse(request.params);
        z.object({})
          .strict()
          .parse(request.body ?? {});
        return hidePost(pool, user.id, id, method === 'PUT');
      },
    });
  app.post('/api/posts/:id/reports', writing, async (request) => {
    const user = await requireMember(request);
    return reportPost(
      pool,
      user.id,
      params.parse(request.params).id,
      reportInput.parse(request.body),
    );
  });
  app.get('/api/moderation/reports', async (request) => {
    await requireModerator(request);
    return listReports(pool, request.query);
  });
  app.post('/api/moderation/reports/:id/decision', writing, async (request) => {
    const user = await requireModerator(request);
    const input = decisionInput.parse(request.body);
    return decideReport(pool, user.id, params.parse(request.params).id, input.action, input.note);
  });
  app.post('/api/posts', writing, async (request, reply) => {
    const user = await requireMember(request);
    const { body } = bodyInput.parse(request.body);
    return reply.code(201).send(await publish(pool, user.id, body));
  });
  app.post('/api/posts/:id/replies', writing, async (request, reply) => {
    const user = await requireMember(request);
    const id = params.parse(request.params).id;
    const { body } = bodyInput.parse(request.body);
    return reply.code(201).send(await publish(pool, user.id, body, id));
  });
  app.put('/api/posts/:id', writing, async (request) => {
    const user = await requireMember(request);
    const id = params.parse(request.params).id;
    const input = editInput.parse(request.body);
    return changePost(pool, id, user.id, input.version, input.body);
  });
  app.delete('/api/posts/:id', writing, async (request) => {
    const user = await requireMember(request);
    const id = params.parse(request.params).id;
    const { version } = z
      .object({ version: z.number().int().positive() })
      .strict()
      .parse(request.body);
    return changePost(pool, id, user.id, version);
  });
  const root = resolve('dist/client');
  if (existsSync(root)) {
    await app.register(staticFiles, { root });
    app.setNotFoundHandler((request, reply) =>
      request.method === 'GET' &&
      !request.url.startsWith('/api/') &&
      request.headers.accept?.includes('text/html')
        ? reply.sendFile('index.html')
        : reply.code(404).send({ message: 'Not found.' }),
    );
  }
  return app;
}
