import type pg from 'pg';
import { z } from 'zod';
import type { Member, MemberPage } from '../shared/model.js';
import { fail } from './posts.js';

const usernameSchema = z.string().regex(/^[a-z][a-z0-9_]{2,29}$/);
export async function searchMembers(pool: pg.Pool, raw: unknown): Promise<MemberPage> {
  const input = z
    .object({
      q: z.string().trim().min(1, 'Enter a search term.').max(120),
      limit: z.coerce.number().int().min(1).max(50).default(20),
      cursor: z.string().max(200).optional(),
    })
    .strict()
    .parse(raw);
  const values: unknown[] = [input.q];
  let after = '';
  if (input.cursor) {
    let username: string;
    try {
      username = usernameSchema.parse(
        JSON.parse(Buffer.from(input.cursor, 'base64url').toString()),
      );
    } catch {
      return fail(400, 'Invalid member cursor. Return to the first page.');
    }
    values.push(username);
    after = 'AND username>$2';
  }
  values.push(input.limit + 1);
  const rows = (
    await pool.query<Member>(
      `SELECT id,username,display_name AS "displayName",bio FROM members
     WHERE strpos(lower(concat_ws(' ',username,display_name,bio)),lower($1))>0 ${after}
     ORDER BY username LIMIT $${values.length}`,
      values,
    )
  ).rows;
  const items = rows.slice(0, input.limit);
  return {
    items,
    nextCursor:
      rows.length > input.limit
        ? Buffer.from(JSON.stringify(items.at(-1)!.username)).toString('base64url')
        : null,
  };
}
