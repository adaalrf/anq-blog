import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { SessionMember as Member } from '../../shared/model.js';
import { api } from '../api.js';
export function Login({ signedIn }: { signedIn: (member: Member) => void }) {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const usernameInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    usernameInput.current?.focus();
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    const data = new FormData(event.currentTarget);
    try {
      const result = await api<{ member: Member }>('/login', 'POST', {
        username: data.get('username'),
        password: data.get('password'),
      });
      signedIn(result.member);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section id="sign-in" className="panel login" aria-labelledby="sign-in-title">
      <h2 id="sign-in-title">Welcome back</h2>
      <p className="muted">Sign in to publish and join the conversation.</p>
      <p className="muted">
        Accounts are provided by the administrator. You can browse the community without signing in.
      </p>
      <form onSubmit={submit}>
        <label>
          Username
          <input
            ref={usernameInput}
            name="username"
            autoComplete="username"
            required
            maxLength={30}
            disabled={busy}
          />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            disabled={busy}
            autoComplete="current-password"
            required
            maxLength={256}
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </section>
  );
}
