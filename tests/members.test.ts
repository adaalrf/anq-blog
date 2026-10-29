import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import pg from 'pg';
import { migrate } from '../src/server/migrate.js';
import { createMember } from '../src/server/members.js';
import { verifyPassword } from '../src/server/auth.js';
if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL is required');
const schema = `members_${randomUUID().replaceAll('-', '')}`;
const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
const pool = new pg.Pool({
  connectionString: process.env.TEST_DATABASE_URL,
  options: `-c search_path=${schema}`,
});
before(async () => {
  await admin.query(`CREATE SCHEMA ${schema}`);
  await migrate(pool);
});
after(async () => {
  await pool.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.end();
});
test('administrative provisioning hashes passwords, validates inputs and preserves existing accounts', async () => {
  const input = {
    username: 'member',
    displayName: 'Fictional Member',
    password: 'test-member-password',
  };
  await createMember(pool, input);
  const row = (await pool.query("SELECT * FROM members WHERE username='member'")).rows[0];
  assert.equal(row.is_moderator, false);
  assert.notEqual(row.password_hash, input.password);
  assert.equal(await verifyPassword(input.password, row.password_hash), true);
  await assert.rejects(
    () => createMember(pool, { ...input, password: 'replacement-password', moderator: true }),
    /already exists/,
  );
  const unchanged = (
    await pool.query("SELECT password_hash,is_moderator FROM members WHERE username='member'")
  ).rows[0];
  assert.equal(unchanged.password_hash, row.password_hash);
  assert.equal(unchanged.is_moderator, false);
  await createMember(pool, {
    username: 'staff',
    displayName: 'Moderator',
    password: 'test-staff-password',
    moderator: true,
  });
  assert.equal(
    (await pool.query("SELECT is_moderator FROM members WHERE username='staff'")).rows[0]
      .is_moderator,
    true,
  );
  for (const values of [
    { ...input, username: 'BAD!' },
    { ...input, password: 'short' },
    { ...input, displayName: ' ' },
    { ...input, moderator: 'true' },
  ])
    await assert.rejects(() => createMember(pool, values));
});
test('the provisioning command accepts passwords on stdin without exposing them', async () => {
  const url = new URL(process.env.TEST_DATABASE_URL!);
  url.searchParams.set('options', `-c search_path=${schema}`);
  const password = 'fictional-cli-password';
  const output = execFileSync(
    process.execPath,
    [
      '--import',
      'tsx',
      'src/server/provision.ts',
      '--username',
      'from_cli',
      '--name',
      'CLI Member',
    ],
    {
      input: password + '\n',
      encoding: 'utf8',
      env: { ...process.env, DATABASE_URL: url.toString() },
    },
  );
  assert.match(output, /Created member @from_cli/);
  assert.ok(!output.includes(password));
  const row = (await pool.query("SELECT password_hash FROM members WHERE username='from_cli'"))
    .rows[0];
  assert.equal(await verifyPassword(password, row.password_hash), true);
});
