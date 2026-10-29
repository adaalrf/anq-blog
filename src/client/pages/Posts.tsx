import type { Dispatch, SetStateAction } from 'react';
import type { SessionMember as Member, Post, PostPage } from '../../shared/model.js';
import { api } from '../api.js';
import { Composer } from '../components/Composer.js';
import { PostCard } from '../components/PostCard.js';
import { Pagination } from '../components/Pagination.js';
type Props = {
  postId: string | null;
  username: string | null;
  following: boolean;
  special: boolean;
  member: Member | null;
  page: PostPage | null;
  post: Post | null;
  cursors: (string | null)[];
  busy: boolean;
  refresh: () => void;
  setCursors: Dispatch<SetStateAction<(string | null)[]>>;
};
export function PostsPage({
  postId,
  username,
  following,
  special,
  member,
  page,
  post,
  cursors,
  busy,
  refresh,
  setCursors,
}: Props) {
  return (
    <>
      {!postId && !username && !following && !special && member && (
        <section className="panel" aria-label="New post">
          <Composer
            label={`What’s on your mind, ${member.displayName.split(' ')[0]}?`}
            submitLabel="Publish post"
            onSave={async (body) => {
              await api('/posts', 'POST', { body });
              setCursors([null]);
              refresh();
            }}
          />
        </section>
      )}
      {page && (
        <>
          {post && (
            <>
              <PostCard post={post} member={member} refresh={refresh} />
              {member && !post.deleted && !post.removed && !post.hidden && !post.parentId && (
                <section className="panel">
                  <Composer
                    label="Your reply"
                    submitLabel="Publish reply"
                    onSave={async (body) => {
                      await api(`/posts/${post.id}/replies`, 'POST', { body });
                      setCursors([null]);
                      refresh();
                    }}
                  />
                </section>
              )}
              <h2 className="section-heading">
                Replies <span className="muted">· newest first</span>
              </h2>
            </>
          )}
          {!member && post && !post.deleted && !post.removed && (
            <p className="status">Sign in to add your reply.</p>
          )}
          {page.items.length ? (
            page.items.map((item) => (
              <PostCard key={item.id} post={item} member={member} refresh={refresh} />
            ))
          ) : (
            <section className="panel">
              <p>
                {post
                  ? 'No replies yet. Start the conversation.'
                  : following
                    ? 'No posts from people you follow yet.'
                    : 'No posts here yet.'}
              </p>
              {following && (
                <p>
                  <a href="/">Explore the community</a> and follow a member from their profile.
                </p>
              )}
            </section>
          )}
          <Pagination
            cursors={cursors}
            nextCursor={page.nextCursor}
            onChange={setCursors}
            previousLabel="Newer posts"
            nextLabel="Older posts"
            busy={busy}
          />
        </>
      )}
    </>
  );
}
