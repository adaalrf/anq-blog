export function Pagination({
  cursors,
  nextCursor,
  onChange,
  label = 'Post pages',
  previousLabel = 'Previous page',
  nextLabel = 'Next page',
  busy = false,
}: {
  cursors: (string | null)[];
  nextCursor: string | null;
  onChange: (cursors: (string | null)[]) => void;
  label?: string;
  previousLabel?: string;
  nextLabel?: string;
  busy?: boolean;
}) {
  function change(next: (string | null)[]) {
    onChange(next);
    window.scrollTo(0, 0);
    document.querySelector<HTMLElement>('main h1')?.focus({ preventScroll: true });
  }
  return (
    <nav className="pagination" aria-label={label}>
      <button disabled={busy || cursors.length === 1} onClick={() => change(cursors.slice(0, -1))}>
        {previousLabel}
      </button>
      <small>Page {cursors.length}</small>
      <button disabled={busy || !nextCursor} onClick={() => change([...cursors, nextCursor])}>
        {nextLabel}
      </button>
    </nav>
  );
}
