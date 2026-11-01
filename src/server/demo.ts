import { createHash, randomBytes } from 'node:crypto';
import type pg from 'pg';
import { hashPassword } from './auth.js';

// Reserved IDs make repeated additions safe; existing rows are never updated.
function id(key: string) {
  const hex = createHash('sha256').update(`anq-blog-fictional-community-v1:${key}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
const members = [
  [
    'demo_elin',
    'Elin Berg',
    'Fictional member. Interested in accessible interfaces and clear writing.',
  ],
  ['demo_jonas', 'Jonas Lund', 'Fictional member. Builds small web tools and keeps a notebook.'],
  ['demo_sara', 'Sara Holm', 'Fictional member. Walks, photographs and notices the small details.'],
  [
    'demo_omar',
    'Omar Dahl',
    'Fictional member. Enjoys cooking, community projects and learning in public.',
  ],
];
const conversations = [
  [
    'A keyboard-only check found a missing focus outline today. Small change, much easier navigation.',
    'Which part was easiest to miss?',
    'The search clear button. Testing the whole journey helped more than checking individual components.',
  ],
  [
    'What makes a useful project README? I want to understand the problem before I see the installation commands.',
    'A screenshot and a short route through the source help me.',
    'And one example of a decision that changed after testing.',
  ],
  [
    'Rain on the harbour this morning. I left the camera at home and enjoyed the walk anyway.',
    'A good reminder that not everything needs recording.',
  ],
  [
    'Trying a new soup recipe: roast the carrots first, then add ginger. Keeping the ingredient list short.',
    'Would lentils work in this?',
    'Yes! Red lentils make it a little thicker.',
  ],
  [
    'A failed static build should leave yesterday’s working pages in place. I finally tested that failure path.',
    'Did you check a broken link as well?',
    'Yes, and a duplicate heading ID. Both stopped publication without replacing the output.',
  ],
  [
    'One quiet evening, one small repair: the wobbly shelf is finally level.',
    'The best kind of finished project.',
  ],
  [
    'For form errors, I prefer a useful sentence beside the field and keeping everything I already typed.',
    'Especially when the connection drops just before saving.',
    'A retry should not mean starting from a blank form.',
  ],
  [
    'The community garden has room for another herb planter. Mint gets its own pot this time.',
    'That lesson sounds hard-earned.',
  ],
  [
    'Made a backup, restored it into a separate workspace, then checked the records. The restore was the useful part.',
    'Did you keep a note of the steps?',
    'Yes. Enough detail that someone else could repeat the check.',
  ],
  [
    'A book recommendation thread: what have you enjoyed recently? Fiction, reference books, anything.',
    'A collection of short essays about walking. Easy to pick up between tasks.',
  ],
  [
    'Dark mode needs its own contrast check. Swapping the background colour alone left several labels hard to read.',
    'The muted text is where I usually notice it first.',
  ],
  [
    'I shortened the mobile navigation today. The important links are visible without opening another menu.',
    'Did you try it at 200% zoom too?',
    'Yes. It wraps rather than hiding links or shrinking the text.',
  ],
  [
    'Weekend plan: a short trail, a packed lunch and no ambitious schedule.',
    'That sounds like a very good schedule.',
  ],
  [
    'Search is easier to test when the sample data contains several useful topics: accessibility, cooking and backups.',
    'A single perfect result hides a lot of edge cases.',
  ],
  [
    'Two open tabs edited the same note. A clear conflict message saved the second draft instead of overwriting it.',
    'Being able to copy the draft before reloading would help.',
  ],
  [
    'Found an old sketchbook while tidying. Half-finished ideas are sometimes better after a little distance.',
    'I keep one page just for ideas I decided not to build.',
  ],
  [
    'A reminder for this fictional community: replies remain readable when a parent post is removed by moderation.',
    'This reply stays in place so the conversation does not lose its context.',
  ],
  [
    'A useful stopping point: the main workflow works, the limitations are written down, and tomorrow has a clear first task.',
    'Leaving a note for tomorrow is underrated.',
  ],
];
export async function seedDemo(pool: pg.Pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(72941804)');
    // Random discarded secrets: these fixture accounts provide no public login.
    const passwordHash = await hashPassword(randomBytes(32).toString('hex'));
    for (const [username, name, bio] of members) {
      await client.query(
        `INSERT INTO members(id,username,display_name,bio,password_hash) VALUES ($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING`,
        [id(username), username, name, bio, passwordHash],
      );
      const row = (await client.query('SELECT username FROM members WHERE id=$1', [id(username)]))
        .rows[0];
      if (row?.username !== username) throw new Error('Reserved demo member ID is already in use');
    }
    for (const [index, messages] of conversations.entries()) {
      for (const [reply, body] of messages.entries()) {
        const member = members[(index + reply) % members.length][0];
        const key = `post:${index}:${reply}`;
        const time = new Date(
          Date.now() - (conversations.length - index) * 86_400_000 + reply * 3_600_000,
        );
        await client.query(
          `INSERT INTO posts(id,author_id,parent_id,body,removed,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$6) ON CONFLICT(id) DO NOTHING`,
          [
            id(key),
            id(member),
            reply ? id(`post:${index}:0`) : null,
            body,
            index === 16 && reply === 0,
            time,
          ],
        );
      }
    }
    for (let index = 0; index < members.length; index++) {
      for (const offset of [1, 2])
        await client.query(
          'INSERT INTO follows(follower_id,followed_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
          [id(members[index][0]), id(members[(index + offset) % members.length][0])],
        );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
