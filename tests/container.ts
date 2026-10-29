import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import pg from 'pg';
if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL is required');
const schema = `container_${randomUUID().replaceAll('-', '')}`;
const name = `anq-blog-check-${randomUUID()}`;
const image = process.env.CONTAINER_IMAGE || 'localhost/anq-blog:v1';
const origin = 'http://127.0.0.1:18086';
const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
const url = new URL(process.env.TEST_DATABASE_URL);
url.searchParams.set('options', `-c search_path=${schema}`);
const runtime = [
  '--network',
  'host',
  '--read-only',
  '--cap-drop=ALL',
  '--security-opt=no-new-privileges',
  '--tmpfs',
  '/tmp:rw,noexec,nosuid,size=64m',
  '-e',
  `DATABASE_URL=${url}`,
];
const podman = (args: string[], input?: string) =>
  execFileSync('podman', args, { encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'] });
let started = false;
try {
  await new Promise<void>((resolve, reject) => {
    const probe = createServer();
    probe.once('error', () =>
      reject(new Error('Loopback port 18086 is occupied; its owner was left running.')),
    );
    probe.listen(18086, '127.0.0.1', () => probe.close(() => resolve()));
  });
  await admin.query(`CREATE SCHEMA ${schema}`);
  podman(['run', '--rm', ...runtime, image, 'node', 'dist/server/migrate.js']);
  const password = randomBytes(24).toString('base64url');
  const provision = podman(
    [
      'run',
      '--rm',
      '-i',
      ...runtime,
      image,
      'node',
      'dist/server/provision.js',
      '--username',
      'container_member',
      '--name',
      'Container Member',
    ],
    password,
  );
  assert.match(provision, /Created member @container_member/);
  assert.ok(!provision.includes(password));
  podman([
    'run',
    '-d',
    '--name',
    name,
    ...runtime,
    '-e',
    'HOST=127.0.0.1',
    '-e',
    'PORT=18086',
    '-e',
    `APP_ORIGIN=${origin}`,
    image,
  ]);
  started = true;
  let ready = false;
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(origin + '/healthz')).status === 200) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.ok(ready, 'Container did not become healthy');
  const info = JSON.parse(podman(['inspect', name]))[0];
  assert.equal(info.Config.User, 'node');
  assert.equal(info.HostConfig.ReadonlyRootfs, true);
  assert.ok((await fetch(origin)).status === 200);
  const login = await fetch(origin + '/api/login', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'container_member', password }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie')!.split(';')[0];
  const created = await fetch(origin + '/api/posts', {
    method: 'POST',
    headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: 'Fictional container smoke-test post.' }),
  });
  assert.equal(created.status, 201);
  assert.equal(
    (await (await fetch(origin + '/api/posts')).json()).items[0].body,
    'Fictional container smoke-test post.',
  );
  const sensitive = podman([
    'exec',
    name,
    'node',
    '--input-type=module',
    '-e',
    "import fs from 'node:fs'; for (const path of ['/app/.env','/app/.local','/app/node_modules/tsx','/app/tests']) if (fs.existsSync(path)) process.exit(1); console.log('Private/dev files absent');",
  ]);
  assert.match(sensitive, /absent/);
  console.log(
    'Production container passed: migrations, stdin provisioning, unprivileged/read-only runtime, health, static UI, login/publishing and credential/dev-file exclusion. Test schema removed afterward.',
  );
} finally {
  if (started) spawnSync('podman', ['rm', '-f', name], { stdio: 'pipe' });
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.end();
}
