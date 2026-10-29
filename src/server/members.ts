import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { z } from 'zod';
import { hashPassword } from './auth.js';
import { fail } from './posts.js';

// Administrative provisioning only: never exposed as a public HTTP route.
export async function createMember(pool: pg.Pool, raw: unknown) {
  const input = z
    .object({
      username: z
        .string()
        .regex(
          /^[a-z][a-z0-9_]{2,29}$/,
          'Use 3–30 lowercase letters, digits or underscores, starting with a letter.',
        ),
      displayName: z.string().trim().min(1).max(80),
      bio: z.string().trim().max(300).default(''),
      password: z.string().min(12).max(256),
      moderator: z.boolean().default(false),
    })
    .strict()
    .parse(raw);
  const result = await pool.query(
    `INSERT INTO members(id,username,display_name,bio,password_hash,is_moderator) VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT(username) DO NOTHING RETURNING id,username`,
    [
      randomUUID(),
      input.username,
      input.displayName,
      input.bio,
      await hashPassword(input.password),
      input.moderator,
    ],
  );
  if (!result.rowCount)
    fail(409, 'That username already exists. Its password and role were preserved.');
  return result.rows[0] as { id: string; username: string };
}
