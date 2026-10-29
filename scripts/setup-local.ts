import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { chmod, mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import pg from 'pg';
import { hashPassword, verifyPassword } from '../src/server/auth.js';
import { migrate } from '../src/server/migrate.js';
process.chdir(resolve(import.meta.dirname, '..'));
const container = 'anq-blog-dev-db';
const databaseUrl = 'postgres://postgres:local-development-only@127.0.0.1:55434/anq_blog';
const envText = `DATABASE_URL=${databaseUrl}\nAPP_ORIGIN=http://localhost:5175\nHOST=127.0.0.1\nPORT=8082\n`;
if (existsSync('.env')) {
  const env = parseEnv(await readFile('.env', 'utf8'));
  if (
    env.DATABASE_URL !== databaseUrl ||
    env.APP_ORIGIN !== 'http://localhost:5175' ||
    env.PORT !== '8082' ||
    env.HOST !== '127.0.0.1'
  )
    throw new Error('Existing .env has custom settings and was preserved. Use its setup commands.');
}
const podman = (...args: string[]) =>
  execFileSync('podman', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
const present = spawnSync('podman', ['container', 'exists', container]);
if (present.error || ![0, 1].includes(present.status!))
  throw new Error('Rootless Podman is unavailable.');
if (present.status === 1)
  podman(
    'run',
    '-d',
    '--name',
    container,
    '-e',
    'POSTGRES_PASSWORD=local-development-only',
    '-e',
    'POSTGRES_DB=anq_blog',
    '-p',
    '127.0.0.1:55434:5432',
    '-v',
    'anq-blog-development-data:/var/lib/postgresql/data',
    'docker.io/library/postgres:17-alpine',
  );
else {
  const info = JSON.parse(podman('inspect', container))[0];
  const ports = info.HostConfig.PortBindings?.['5432/tcp'];
  if (ports?.length !== 1 || ports[0].HostIp !== '127.0.0.1' || ports[0].HostPort !== '55434')
    throw new Error('Existing container uses different port bindings; it was preserved.');
  if (!info.State.Running) podman('start', container);
}
let ready = false;
for (let i = 0; i < 30; i++) {
  if (
    spawnSync('podman', ['exec', container, 'pg_isready', '-U', 'postgres', '-d', 'anq_blog'])
      .status === 0
  ) {
    ready = true;
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
if (!ready) throw new Error('PostgreSQL did not become ready. No data was reset.');
await mkdir('.local', { recursive: true, mode: 0o700 });
await chmod('.local', 0o700);
type Credential = { username: string; password: string };
let credentials: Credential[];
const path = '.local/member-credentials.json';
if (existsSync(path)) credentials = JSON.parse(await readFile(path, 'utf8'));
else {
  credentials = ['elin', 'jonas'].map((username) => ({
    username,
    password: randomBytes(24).toString('base64url'),
  }));
  await writeFile(path, JSON.stringify(credentials, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
}
if (
  ![2, 3].includes(credentials.length) ||
  credentials[0].username !== 'elin' ||
  credentials[1].username !== 'jonas' ||
  credentials.some((c) => typeof c.password !== 'string' || c.password.length < 12)
)
  throw new Error('Invalid existing credential file; it was preserved.');
if (credentials.length === 2) {
  credentials.push({ username: 'moderator', password: randomBytes(24).toString('base64url') });
  // Preserve the existing member passwords; only append the local moderator.
  const temporary = `.local/credentials-${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(credentials, null, 2) + '\n', {
    mode: 0o600,
    flag: 'wx',
  });
  await rename(temporary, path);
}
if (credentials[2].username !== 'moderator')
  throw new Error('Unexpected moderator credential; preserved.');
const pool = new pg.Pool({ connectionString: databaseUrl });
try {
  await migrate(pool);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(72941802)');
    if (!(await client.query('SELECT id FROM members LIMIT 1')).rowCount) {
      const ids = [randomUUID(), randomUUID()];
      for (const [i, c] of credentials.slice(0, 2).entries())
        await client.query(
          'INSERT INTO members(id,username,display_name,bio,password_hash) VALUES ($1,$2,$3,$4,$5)',
          [
            ids[i],
            c.username,
            i === 0 ? 'Elin Berg' : 'Jonas Lund',
            i === 0
              ? 'Collecting small ideas about design, code, and everyday life.'
              : 'Making things, asking questions, and learning along the way.',
            await hashPassword(c.password),
          ],
        );
      const first = randomUUID();
      await client.query(
        "INSERT INTO posts(id,author_id,body,created_at) VALUES ($1,$2,$3,now()-interval '2 hours')",
        [
          first,
          ids[0],
          'A small beginning. I wanted somewhere to share the things I am making, without having to turn every thought into a finished article. What are you working on?',
        ],
      );
      await client.query('INSERT INTO posts(id,author_id,parent_id,body) VALUES ($1,$2,$3,$4)', [
        randomUUID(),
        ids[1],
        first,
        'A little reading corner in my workshop. Sometimes the best project is the one you will use every day.',
      ]);
      await client.query('INSERT INTO posts(id,author_id,body) VALUES ($1,$2,$3)', [
        randomUUID(),
        ids[1],
        'Today’s reminder: leave the next person a clear place to start. A good README counts.',
      ]);
    }
    await client.query(
      'INSERT INTO members(id,username,display_name,bio,password_hash,is_moderator) VALUES ($1,$2,$3,$4,$5,true) ON CONFLICT(username) DO NOTHING',
      [
        randomUUID(),
        'moderator',
        'Community Moderator',
        'Fictional local moderator.',
        await hashPassword(credentials[2].password),
      ],
    );
    const moderator = (
      await client.query(
        "SELECT password_hash,is_moderator FROM members WHERE username='moderator'",
      )
    ).rows[0];
    if (
      !moderator.is_moderator ||
      !(await verifyPassword(credentials[2].password, moderator.password_hash))
    )
      throw new Error('Existing moderator account differs; it was preserved.');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  for (const c of credentials) {
    const row = (
      await pool.query('SELECT password_hash FROM members WHERE username=$1', [c.username])
    ).rows[0];
    if (!row || !(await verifyPassword(c.password, row.password_hash)))
      throw new Error(
        'Stored credentials no longer match the database. Records and passwords were preserved.',
      );
  }
} finally {
  await pool.end();
}
if (!existsSync('.env')) await writeFile('.env', envText, { mode: 0o600, flag: 'wx' });
await chmod('.env', 0o600);
await chmod(path, 0o600);
console.log(
  'ANQ Blog ready at http://localhost:5175\nMembers: elin, jonas and moderator (fictional). Passwords: .local/member-credentials.json\nRun npm run dev. Repeated setup preserves existing records and credentials.',
);
