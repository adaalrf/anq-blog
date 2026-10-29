import { parseArgs } from 'node:util';
import pg from 'pg';
import { z } from 'zod';
import { createMember } from './members.js';
try {
  const { values } = parseArgs({
    options: {
      username: { type: 'string' },
      name: { type: 'string' },
      bio: { type: 'string' },
      moderator: { type: 'boolean', default: false },
    },
    strict: true,
    allowPositionals: false,
  });
  if (!process.env.DATABASE_URL)
    throw new Error('DATABASE_URL is required. Apply migrations before provisioning a member.');
  if (process.stdin.isTTY)
    throw new Error(
      'Supply the password on standard input; do not put it in command arguments. See README.md.',
    );
  let password = '';
  for await (const chunk of process.stdin) {
    password += chunk.toString();
    if (Buffer.byteLength(password) > 1024) throw new Error('Password input is too large.');
  }
  password = password.replace(/\r?\n$/, '');
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const member = await createMember(pool, {
      username: values.username,
      displayName: values.name,
      bio: values.bio ?? '',
      password,
      moderator: values.moderator,
    });
    console.log(`Created ${values.moderator ? 'moderator' : 'member'} @${member.username}.`);
  } finally {
    await pool.end();
  }
} catch (error) {
  console.error(
    error instanceof z.ZodError
      ? error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('\n')
      : (error as Error).message,
  );
  process.exitCode = 1;
}
