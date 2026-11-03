import { useState } from 'react';
import type { Member, Post } from '../../shared/model.js';
import { api } from '../api.js';
import { Composer } from './Composer.js';
import { PostActions } from './PostActions.js';
export function PostCard({
  post,
  member,
  refresh,
  inThread = false,
}: {
  post: Post;
  member: Member | null;
  refresh: () => void;
  inThread?: boolean;
}) {
  const [editing, setEditing] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function remove() {
    if (!confirm('Delete this post? Its place in the conversation will remain.')) return;
    setBusy(true);
    setError('');
    try {
      await api(`/posts/${post.id}`, 'DELETE', { version: post.version });
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const threadLink = !post.parentId && !inThread,
    ownControls =
      member?.id === post.authorId && !post.deleted && !post.removed && !post.hidden && !editing,
    readerActions = Boolean(member && (member.id !== post.authorId || post.hidden));
  return (
    <article
      className={post.parentId ? 'post reply' : 'post'}
      aria-label={`Post by ${post.displayName}`}
    >
      <header className="post-header">
        <span className="avatar" aria-hidden="true">
          {post.displayName[0]}
        </span>
        <div className="post-byline">
          <a href={`?profile=${post.username}`}>{post.displayName}</a>
          <small>
            @{post.username} ·{' '}
            <time dateTime={post.createdAt}>
              {new Date(post.createdAt).toLocaleString(undefined, {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
              {post.version > 1 && !post.deleted && !post.removed ? ' · edited' : ''}
            </time>
          </small>
        </div>
      </header>
      {editing ? (
        <Composer
          label="Edit your post"
          submitLabel="Save changes"
          initial={post.body}
          onCancel={() => setEditing(false)}
          onSave={async (body) => {
            await api(`/posts/${post.id}`, 'PUT', { body, version: post.version });
            setEditing(false);
            refresh();
          }}
        />
      ) : (
        <p className={`post-body${post.deleted || post.removed || post.hidden ? ' muted' : ''}`}>
          {post.removed
            ? 'This post was removed by a moderator.'
            : post.deleted
              ? 'This post was deleted by its author.'
              : post.hidden
                ? 'You hid this post.'
                : post.body}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {(threadLink || ownControls || readerActions) && (
        <footer className="post-footer">
          {ownControls && (
            <div className="actions">
              <button className="quiet" onClick={() => setEditing(true)}>
                Edit
              </button>
              <button className="quiet danger" disabled={busy} onClick={() => void remove()}>
                Delete
              </button>
            </div>
          )}
          {readerActions && <PostActions post={post} refresh={refresh} />}
          {threadLink && (
            <a className="thread-link" href={`?post=${post.id}`}>
              {post.replyCount} {post.replyCount === 1 ? 'reply' : 'replies'} · Open thread
            </a>
          )}
        </footer>
      )}
    </article>
  );
}
