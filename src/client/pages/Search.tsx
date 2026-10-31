import { useEffect, useState } from 'react';
import type { Member, MemberPage, PostPage } from '../../shared/model.js';
import { api } from '../api.js';
import { PostCard } from '../components/PostCard.js';
import { Pagination } from '../components/Pagination.js';

export function Search({ member }: { member: Member | null }) {
  const params = new URLSearchParams(location.search);
  const q = (params.get('q') || '').trim();
  const [query, setQuery] = useState(q);
  const type = params.get('type') === 'members' ? 'members' : 'posts';
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [posts, setPosts] = useState<PostPage | null>(null);
  const [members, setMembers] = useState<MemberPage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const cursor = cursors.at(-1);
  useEffect(() => {
    if (!q) return;
    let current = true;
    setBusy(true);
    setError('');
    const query = new URLSearchParams({ q });
    if (cursor) query.set('cursor', cursor);
    const request =
      type === 'members'
        ? api<MemberPage>(`/search/members?${query}`).then((result) => {
            if (current) setMembers(result);
          })
        : api<PostPage>(`/posts?${query}`).then((result) => {
            if (current) setPosts(result);
          });
    void request
      .catch((e) => {
        if (current) {
          setError(e.message);
          setPosts(null);
          setMembers(null);
        }
      })
      .finally(() => {
        if (current) setBusy(false);
      });
    return () => {
      current = false;
    };
  }, [q, type, cursor, revision, member?.id]);
  function tab(target: string) {
    return `?${new URLSearchParams({ view: 'search', q, type: target })}`;
  }
  const result = type === 'members' ? members : posts;
  return (
    <>
      <section className="panel">
        <form method="get" role="search">
          <input type="hidden" name="view" value="search" />
          <input type="hidden" name="type" value={type} />
          <label htmlFor="search-query">Search the community</label>
          <div className="search-input">
            <input
              id="search-query"
              name="q"
              value={query}
              // Native history restoration can bypass React's change tracking.
              onInput={(event) => setQuery(event.currentTarget.value)}
              onChange={(event) => setQuery(event.target.value)}
              maxLength={120}
              placeholder="A phrase, name, or topic…"
            />
            <button className="primary">Search</button>
          </div>
        </form>
        <nav className="search-tabs" aria-label="Search categories">
          <a href={tab('posts')} aria-current={type === 'posts' ? 'page' : undefined}>
            Posts
          </a>
          <a href={tab('members')} aria-current={type === 'members' ? 'page' : undefined}>
            Members
          </a>
        </nav>
        <p className="muted">
          {type === 'members'
            ? 'Match usernames, names, or bios. Members are listed by username.'
            : 'Match text in top-level posts, newest first. Replies stay in their threads.'}
        </p>
      </section>
      {!q ? (
        <p className="status">Enter a word or phrase to find posts and members.</p>
      ) : busy && !result ? (
        <p role="status">Searching…</p>
      ) : error ? (
        <div className="panel" role="alert">
          <p className="error">{error}</p>
          <button onClick={() => setRevision((value) => value + 1)}>Try again</button>
        </div>
      ) : (
        result && (
          <>
            <p className="muted" role="status">
              {result.items.length
                ? `${result.items.length} ${type} on this page`
                : `No ${type} found`}{' '}
              for “{q}”.
            </p>
            {type === 'posts'
              ? posts?.items.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    member={member}
                    refresh={() => setRevision((value) => value + 1)}
                  />
                ))
              : members?.items.map((user) => (
                  <article
                    className="panel"
                    key={user.id}
                    aria-label={`Member ${user.displayName}`}
                  >
                    <header className="post-header">
                      <span className="avatar" aria-hidden="true">
                        {user.displayName[0]}
                      </span>
                      <div>
                        <a href={`?profile=${user.username}`}>{user.displayName}</a>
                        <small>@{user.username}</small>
                      </div>
                    </header>
                    <p className="post-body">{user.bio}</p>
                    <a href={`?profile=${user.username}`}>View profile</a>
                  </article>
                ))}
            {!result.items.length && <p>Try a different phrase or switch search categories.</p>}
            <Pagination
              cursors={cursors}
              nextCursor={result.nextCursor}
              onChange={setCursors}
              label="Search pages"
              busy={busy}
            />
          </>
        )
      )}
    </>
  );
}
