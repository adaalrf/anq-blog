import type pg from 'pg';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
export function fail(statusCode: number, message: string): never {
  throw Object.assign(new Error(message), { statusCode });
}
const columns = `p.id,p.author_id AS "authorId",m.username,m.display_name AS "displayName",p.parent_id AS "parentId",
 CASE WHEN p.deleted OR p.removed OR EXISTS(SELECT 1 FROM hidden_posts h WHERE h.member_id=$1::uuid AND h.post_id=p.id) THEN '' ELSE p.body END AS body,p.version,p.deleted,p.removed,
 EXISTS(SELECT 1 FROM hidden_posts h WHERE h.member_id=$1::uuid AND h.post_id=p.id) AS hidden,
 p.created_at AS "createdAt",p.updated_at AS "updatedAt",
 (SELECT count(*)::int FROM posts r WHERE r.parent_id=p.id) AS "replyCount"`;
const from = 'FROM posts p JOIN members m ON m.id=p.author_id';
const select = `SELECT ${columns} ${from}`;
export async function getPost(pool: pg.Pool, id: string, viewerId?: string) {
  const row = (await pool.query(`${select} WHERE p.id=$2`, [viewerId ?? null, id])).rows[0];
  if (!row) fail(404, 'Post not found.');
  return row;
}
const cursorSchema = z.object({ at: z.iso.datetime({ offset: true }), id: z.uuid() }).strict();
export async function listPosts(
  pool: pg.Pool,
  raw: unknown,
  parentId?: string,
  viewerId?: string,
  hiddenOnly = false,
) {
  const input = z
    .object({
      cursor: z.string().max(1000).optional(),
      limit: z.coerce.number().int().min(1).max(50).default(6),
      feed: z.enum(['community', 'following']).default('community'),
      q: z.string().trim().min(1, 'Enter a search term.').max(120).optional(),
      author: z
        .string()
        .regex(/^[a-z][a-z0-9_]{2,29}$/)
        .optional(),
    })
    .strict()
    .parse(raw);
  if (input.feed === 'following' && parentId)
    fail(400, 'Following is a feed, not a thread filter.');
  if (input.feed === 'following' && !viewerId)
    fail(401, 'Sign in to see posts from people you follow.');
  if (input.q && parentId) fail(400, 'Search posts from the search page, not a thread.');
  const values: unknown[] = [viewerId ?? null];
  const bind = (v: unknown) => {
    values.push(v);
    return `$${values.length}`;
  };
  const where = hiddenOnly
    ? ['EXISTS(SELECT 1 FROM hidden_posts h WHERE h.member_id=$1::uuid AND h.post_id=p.id)']
    : [
        parentId ? `p.parent_id=${bind(parentId)}` : 'p.parent_id IS NULL',
        'NOT EXISTS(SELECT 1 FROM hidden_posts h WHERE h.member_id=$1::uuid AND h.post_id=p.id)',
      ];
  if (input.author) where.push(`m.username=${bind(input.author)}`);
  if (input.q) {
    where.push('NOT p.deleted AND NOT p.removed');
    where.push(`strpos(lower(p.body),lower(${bind(input.q)}))>0`);
  }
  if (input.feed === 'following') {
    where.push(
      `EXISTS (SELECT 1 FROM follows f WHERE f.follower_id=${bind(viewerId)} AND f.followed_id=p.author_id)`,
    );
  }
  if (input.cursor) {
    let cursor: z.infer<typeof cursorSchema>;
    try {
      cursor = cursorSchema.parse(JSON.parse(Buffer.from(input.cursor, 'base64url').toString()));
    } catch {
      return fail(400, 'Invalid page cursor. Return to the first page.');
    }
    where.push(`(p.created_at,p.id)<(${bind(cursor.at)}::timestamptz,${bind(cursor.id)}::uuid)`);
  }
  // Build cursor JSON in PostgreSQL to preserve microseconds between pages.
  const rows = (
    await pool.query(
      `SELECT ${columns},json_build_object('at',p.created_at,'id',p.id) AS cursor ${from} WHERE ${where.join(' AND ')} ORDER BY p.created_at DESC,p.id DESC LIMIT ${bind(input.limit + 1)}`,
      values,
    )
  ).rows;
  const items = rows.slice(0, input.limit);
  return {
    items: items.map(({ cursor: _, ...post }) => post),
    nextCursor:
      rows.length > input.limit
        ? Buffer.from(JSON.stringify(items.at(-1)!.cursor)).toString('base64url')
        : null,
  };
}
export async function publish(
  pool: pg.Pool,
  authorId: string,
  body: string,
  parentId: string | null = null,
) {
  const id = randomUUID();
  if (parentId) {
    // Only top-level posts have replies in this first slice; no unbounded nesting.
    const result = await pool.query(
      `INSERT INTO posts(id,author_id,body,parent_id) SELECT $1,$2,$3,id FROM posts WHERE id=$4 AND parent_id IS NULL AND NOT deleted AND NOT removed RETURNING id`,
      [id, authorId, body, parentId],
    );
    if (!result.rowCount) fail(409, 'This post is unavailable for replies.');
  } else
    await pool.query('INSERT INTO posts(id,author_id,body) VALUES ($1,$2,$3)', [
      id,
      authorId,
      body,
    ]);
  return getPost(pool, id);
}
export async function changePost(
  pool: pg.Pool,
  id: string,
  authorId: string,
  version: number,
  body?: string,
) {
  const result = await pool.query(
    `UPDATE posts SET body=$4,deleted=$5,version=version+1,updated_at=clock_timestamp() WHERE id=$1 AND author_id=$2 AND version=$3 AND NOT deleted AND NOT removed RETURNING id`,
    [id, authorId, version, body ?? '', body === undefined],
  );
  if (!result.rowCount) {
    const post = await getPost(pool, id);
    if (post.authorId !== authorId) fail(403, 'You can only change your own posts.');
    fail(409, 'This post changed. Reload before saving.');
  }
  return getPost(pool, id);
}
