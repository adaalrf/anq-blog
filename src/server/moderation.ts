import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { z } from 'zod';
import { fail } from './posts.js';
import type { ReportPage } from '../shared/model.js';

export async function hidePost(pool: pg.Pool, memberId: string, postId: string, hidden: boolean) {
  const post = (await pool.query('SELECT id FROM posts WHERE id=$1', [postId])).rows[0];
  if (!post) fail(404, 'Post not found.');
  if (hidden)
    await pool.query(
      'INSERT INTO hidden_posts(member_id,post_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [memberId, postId],
    );
  else
    await pool.query('DELETE FROM hidden_posts WHERE member_id=$1 AND post_id=$2', [
      memberId,
      postId,
    ]);
  return { hidden };
}

export async function reportPost(
  pool: pg.Pool,
  memberId: string,
  postId: string,
  input: { reason: string; details: string },
) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const post = (
      await client.query('SELECT body,author_id,deleted,removed FROM posts WHERE id=$1 FOR SHARE', [
        postId,
      ])
    ).rows[0];
    if (!post) fail(404, 'Post not found.');
    if (post.author_id === memberId) fail(400, 'You cannot report your own post.');
    if (post.deleted || post.removed) fail(409, 'This post is no longer available to report.');
    await client.query(
      `INSERT INTO reports(id,post_id,reporter_id,reason,details,body_snapshot) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT(post_id,reporter_id) DO NOTHING`,
      [randomUUID(), postId, memberId, input.reason, input.details, post.body],
    );
    const report = (
      await client.query('SELECT id,state FROM reports WHERE post_id=$1 AND reporter_id=$2', [
        postId,
        memberId,
      ])
    ).rows[0];
    await client.query('COMMIT');
    return report;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function listReports(pool: pg.Pool, raw: unknown): Promise<ReportPage> {
  const input = z
    .object({
      state: z.enum(['open', 'dismissed', 'removed']).default('open'),
      limit: z.coerce.number().int().min(1).max(50).default(20),
      cursor: z.string().max(1000).optional(),
    })
    .strict()
    .parse(raw);
  const values: unknown[] = [input.state];
  let after = '';
  if (input.cursor) {
    let cursor: { at: string; id: string };
    try {
      cursor = z
        .object({ at: z.iso.datetime({ offset: true }), id: z.uuid() })
        .strict()
        .parse(JSON.parse(Buffer.from(input.cursor, 'base64url').toString()));
    } catch {
      return fail(400, 'Invalid report cursor. Return to the first page.');
    }
    values.push(cursor.at, cursor.id);
    after = 'AND (r.created_at,r.id)<($2::timestamptz,$3::uuid)';
  }
  values.push(input.limit + 1);
  const rows = (
    await pool.query(
      `SELECT r.id,r.post_id AS "postId",COALESCE(p.parent_id,p.id) AS "threadId",r.reason,r.details,r.body_snapshot AS "bodySnapshot",r.state,r.decision_note AS "decisionNote",r.created_at AS "createdAt",r.reviewed_at AS "reviewedAt",a.display_name AS "authorName",m.username AS "reporterUsername",reviewer.username AS "reviewerUsername",
    json_build_object('at',r.created_at,'id',r.id) AS cursor
    FROM reports r JOIN posts p ON p.id=r.post_id JOIN members a ON a.id=p.author_id JOIN members m ON m.id=r.reporter_id LEFT JOIN members reviewer ON reviewer.id=r.reviewed_by
    WHERE r.state=$1 ${after} ORDER BY r.created_at DESC,r.id DESC LIMIT $${values.length}`,
      values,
    )
  ).rows;
  const items = rows.slice(0, input.limit);
  return {
    items: items.map(({ cursor: _, ...report }) => report),
    nextCursor:
      rows.length > input.limit
        ? Buffer.from(JSON.stringify(items.at(-1)!.cursor)).toString('base64url')
        : null,
  };
}

export async function decideReport(
  pool: pg.Pool,
  moderatorId: string,
  reportId: string,
  action: 'dismiss' | 'remove',
  note: string,
) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const report = (
      await client.query('SELECT post_id,state FROM reports WHERE id=$1 FOR UPDATE', [reportId])
    ).rows[0];
    if (!report) fail(404, 'Report not found.');
    if (report.state !== 'open')
      fail(409, 'This report has already been reviewed. Reload the queue.');
    if (action === 'remove')
      await client.query(
        'UPDATE posts SET removed=true,version=version+1,updated_at=clock_timestamp() WHERE id=$1 AND NOT removed',
        [report.post_id],
      );
    const state = action === 'remove' ? 'removed' : 'dismissed';
    await client.query(
      'UPDATE reports SET state=$2,decision_note=$3,reviewed_by=$4,reviewed_at=clock_timestamp() WHERE id=$1',
      [reportId, state, note, moderatorId],
    );
    await client.query('COMMIT');
    return { state };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
