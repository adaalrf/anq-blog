import type pg from 'pg';
import type { Profile } from '../shared/model.js';
import { fail } from './posts.js';

export async function getProfile(
  pool: pg.Pool,
  username: string,
  viewerId?: string,
): Promise<Profile> {
  const result = await pool.query<Profile>(
    `SELECT m.id,m.username,m.display_name AS "displayName",m.bio,
      (SELECT count(*)::int FROM follows WHERE followed_id=m.id) AS "followerCount",
      (SELECT count(*)::int FROM follows WHERE follower_id=m.id) AS "followingCount",
      EXISTS(SELECT 1 FROM follows WHERE follower_id=$2::uuid AND followed_id=m.id) AS following
     FROM members m WHERE m.username=$1`,
    [username, viewerId ?? null],
  );
  if (!result.rows[0]) fail(404, 'Member not found.');
  return result.rows[0];
}

export async function setFollowing(
  pool: pg.Pool,
  followerId: string,
  username: string,
  follow: boolean,
) {
  const profile = await getProfile(pool, username, followerId);
  if (profile.id === followerId) fail(400, 'You cannot follow yourself.');
  if (follow) {
    await pool.query(
      'INSERT INTO follows(follower_id,followed_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [followerId, profile.id],
    );
  } else {
    await pool.query('DELETE FROM follows WHERE follower_id=$1 AND followed_id=$2', [
      followerId,
      profile.id,
    ]);
  }
  return getProfile(pool, username, followerId);
}
