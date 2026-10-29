import { useEffect, useState } from 'react';
import type { Member, PostPage } from '../../shared/model.js';
import { api } from '../api.js';
import { PostCard } from '../components/PostCard.js';
import { Pagination } from '../components/Pagination.js';
export function HiddenPosts({ member }: { member: Member }) {
  const [page, setPage] = useState<PostPage | null>(null),
    [cursors, setCursors] = useState<(string | null)[]>([null]),
    [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(true),
    [error, setError] = useState('');
  const cursor = cursors.at(-1);
  useEffect(() => {
    let current = true;
    setBusy(true);
    setError('');
    void api<PostPage>(`/hidden-posts${cursor ? `?cursor=${cursor}` : ''}`)
      .then((result) => {
        if (current) setPage(result);
      })
      .catch((e) => {
        if (current) setError(e.message);
      })
      .finally(() => {
        if (current) setBusy(false);
      });
    return () => {
      current = false;
    };
  }, [cursor, revision, member.id]);
  const refresh = () => {
    setCursors([null]);
    setRevision((value) => value + 1);
  };
  return (
    <>
      {error ? (
        <div className="panel" role="alert">
          <p className="error">{error}</p>
          <button onClick={refresh}>Try again</button>
        </div>
      ) : busy && !page ? (
        <p role="status">Loading hidden posts…</p>
      ) : (
        page && (
          <>
            {!page.items.length && (
              <p className="status">You have no hidden posts. Hiding only affects your view.</p>
            )}
            {page.items.map((post) => (
              <PostCard key={post.id} post={post} member={member} refresh={refresh} />
            ))}
            <Pagination
              cursors={cursors}
              nextCursor={page.nextCursor}
              onChange={setCursors}
              label="Hidden post pages"
              busy={busy}
            />
          </>
        )
      )}
    </>
  );
}
