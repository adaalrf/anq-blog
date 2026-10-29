import { useEffect, useState, type FormEvent } from 'react';
import type { SessionMember, Report, ReportPage } from '../../shared/model.js';
import { api } from '../api.js';
import { Pagination } from '../components/Pagination.js';
function ReportReview({ report, onDecision }: { report: Report; onDecision: () => void }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function decide(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (
      form.get('action') === 'remove' &&
      !confirm('Remove this post for everyone? Its place in the thread will remain.')
    )
      return;
    setBusy(true);
    setError('');
    try {
      await api(`/moderation/reports/${report.id}/decision`, 'POST', {
        action: form.get('action'),
        note: form.get('note'),
      });
      onDecision();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="panel" aria-label={`Report of ${report.authorName}'s post`}>
      <h2>
        {report.reason === 'spam' ? 'Spam' : report.reason === 'abuse' ? 'Abuse' : 'Other'} report ·{' '}
        {report.authorName}
      </h2>
      <p className="muted">
        Reported by @{report.reporterUsername} · {new Date(report.createdAt).toLocaleString()}
      </p>
      <p className="eyebrow">Post text when reported</p>
      <p className="post-body">{report.bodySnapshot}</p>
      {report.details && (
        <>
          <h3>Reporter context</h3>
          <p className="post-body">{report.details}</p>
        </>
      )}
      <p>
        <a href={`?post=${report.threadId}`}>Open thread</a>
      </p>
      {report.state === 'open' ? (
        <form onSubmit={decide}>
          <label>
            Decision
            <select name="action" aria-label="Decision" disabled={busy}>
              <option value="dismiss">Dismiss report — leave post unchanged</option>
              <option value="remove">Remove post for everyone</option>
            </select>
          </label>
          <label>
            Decision note
            <textarea name="note" required maxLength={500} disabled={busy} />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save decision'}
          </button>
        </form>
      ) : (
        <p className="status">
          {report.state === 'removed' ? 'Post removed' : 'Report dismissed'} by @
          {report.reviewerUsername}: {report.decisionNote}
        </p>
      )}
    </article>
  );
}
export function Moderation({ member }: { member: SessionMember }) {
  const requested = new URLSearchParams(location.search).get('state');
  const state = requested === 'dismissed' || requested === 'removed' ? requested : 'open';
  const [page, setPage] = useState<ReportPage | null>(null),
    [cursors, setCursors] = useState<(string | null)[]>([null]),
    [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(true),
    [error, setError] = useState('');
  const cursor = cursors.at(-1);
  useEffect(() => {
    if (!member.isModerator) return;
    let current = true;
    setBusy(true);
    setError('');
    void api<ReportPage>(`/moderation/reports?state=${state}${cursor ? `&cursor=${cursor}` : ''}`)
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
  }, [member.id, member.isModerator, state, cursor, revision]);
  const refresh = () => {
    setCursors([null]);
    setRevision((value) => value + 1);
  };
  if (!member.isModerator)
    return (
      <p className="status">
        Moderator access is required. Your account can report posts but cannot review reports.
      </p>
    );
  return (
    <>
      <nav className="search-tabs" aria-label="Report status">
        {['open', 'dismissed', 'removed'].map((item) => (
          <a
            key={item}
            href={`?view=moderation&state=${item}`}
            aria-current={state === item ? 'page' : undefined}
          >
            {item === 'open' ? 'Open' : item === 'dismissed' ? 'Dismissed' : 'Removed'}
          </a>
        ))}
      </nav>
      {error ? (
        <div className="panel" role="alert">
          <p className="error">{error}</p>
          <button onClick={refresh}>Reload queue</button>
        </div>
      ) : busy && !page ? (
        <p role="status">Loading reports…</p>
      ) : (
        page && (
          <>
            {!page.items.length && <p className="status">No {state} reports.</p>}
            {page.items.map((report) => (
              <ReportReview key={report.id} report={report} onDecision={refresh} />
            ))}
            <Pagination
              busy={busy}
              cursors={cursors}
              nextCursor={page.nextCursor}
              onChange={setCursors}
              label="Report pages"
            />
          </>
        )
      )}
    </>
  );
}
