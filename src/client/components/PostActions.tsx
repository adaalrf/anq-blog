import { useId, useState, type FormEvent } from 'react';
import type { Post } from '../../shared/model.js';
import { api } from '../api.js';

export function PostActions({ post, refresh }: { post: Post; refresh: () => void }) {
  const [reporting, setReporting] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [sent, setSent] = useState(false);
  const id = useId();
  async function hide() {
    setBusy(true);
    setError('');
    try {
      await api(`/posts/${post.id}/hide`, post.hidden ? 'DELETE' : 'PUT');
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function report(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      await api(`/posts/${post.id}/reports`, 'POST', {
        reason: form.get('reason'),
        details: form.get('details'),
      });
      setReporting(false);
      setSent(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="post-actions">
      <div className="actions">
        <button className="quiet" onClick={() => void hide()} disabled={busy}>
          {post.hidden ? 'Unhide' : 'Hide for me'}
        </button>
        {!post.deleted && !post.removed && !post.hidden && !sent && (
          <button className="quiet" onClick={() => setReporting((value) => !value)} disabled={busy}>
            {reporting ? 'Cancel report' : 'Report'}
          </button>
        )}
      </div>
      {reporting && (
        <form className="report-form" onSubmit={report}>
          <p className="muted">
            A moderator will review this post. Reporting does not hide or remove it.
          </p>
          <label htmlFor={`${id}-reason`}>Report reason</label>
          <select id={`${id}-reason`} name="reason" disabled={busy}>
            <option value="spam">Spam</option>
            <option value="abuse">Abuse</option>
            <option value="other">Other</option>
          </select>
          <label htmlFor={`${id}-details`}>Additional context (optional)</label>
          <textarea id={`${id}-details`} name="details" maxLength={1000} disabled={busy} />
          <button className="primary" disabled={busy}>
            {busy ? 'Sending…' : 'Send report'}
          </button>
        </form>
      )}
      {sent && (
        <p className="status" role="status">
          Report received. A moderator can review it.
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
