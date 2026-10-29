import { useId, useState, type FormEvent } from 'react';
export function Composer({
  label,
  submitLabel,
  initial = '',
  onSave,
  onCancel,
}: {
  label: string;
  submitLabel: string;
  initial?: string;
  onSave: (body: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const [body, setBody] = useState(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const id = useId();
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await onSave(body);
      setBody('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} aria-busy={busy}>
      <label htmlFor={id}>{label}</label>
      <textarea
        id={id}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={2000}
        required
        disabled={busy}
        aria-describedby={`${id}-limit`}
      />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <small id={`${id}-limit`}>{body.length.toLocaleString()} / 2,000 characters</small>
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        )}
        <button className="primary" disabled={busy || !body.trim()}>
          {busy ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
