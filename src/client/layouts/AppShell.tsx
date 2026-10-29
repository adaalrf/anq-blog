import type { ReactNode, Dispatch, SetStateAction } from 'react';
import type { SessionMember as Member } from '../../shared/model.js';

type Props = {
  member: Member | null;
  sessionReady: boolean;
  login: boolean;
  setLogin: Dispatch<SetStateAction<boolean>>;
  logout: () => Promise<void>;
  busy: boolean;
  postId: string | null;
  username: string | null;
  hidden: boolean;
  moderating: boolean;
  searching: boolean;
  following: boolean;
  special: boolean;
  children: ReactNode;
};
export function AppShell({
  member,
  sessionReady,
  login,
  setLogin,
  logout,
  busy,
  postId,
  username,
  hidden,
  moderating,
  searching,
  following,
  special,
  children,
}: Props) {
  return (
    <div className="app-shell">
      <a className="skip" href="#content">
        Skip to content
      </a>
      <div className="sidebar">
        <a className="brand" href="/">
          ANQ Blog<small>A little space to share</small>
        </a>
        <nav aria-label="Main navigation">
          <a
            href="/"
            aria-current={!postId && !username && !following && !special ? 'page' : undefined}
          >
            Community
          </a>
          <a href="?feed=following" aria-current={following ? 'page' : undefined}>
            Following
          </a>
          <a href="?view=search" aria-current={searching ? 'page' : undefined}>
            Search
          </a>
          {member && (
            <a
              href={`?profile=${member.username}`}
              aria-current={username === member.username ? 'page' : undefined}
            >
              Your profile
            </a>
          )}
          {member && (
            <a href="?view=hidden" aria-current={hidden ? 'page' : undefined}>
              Hidden posts
            </a>
          )}
          {member?.isModerator && (
            <a href="?view=moderation" aria-current={moderating ? 'page' : undefined}>
              Moderation
            </a>
          )}
        </nav>
        <div className="sidebar-footer">
          <p>Notes. Ideas. Conversations.</p>
          <p>A slower corner of the web.</p>
        </div>
      </div>
      <div className="workspace">
        <header className="topbar">
          <span>
            Community /{' '}
            {hidden
              ? 'Hidden posts'
              : moderating
                ? 'Moderation'
                : searching
                  ? 'Search'
                  : postId
                    ? 'Conversation'
                    : username
                      ? 'Profile'
                      : following
                        ? 'Following'
                        : 'Latest posts'}
          </span>
          {sessionReady &&
            (member ? (
              <div className="actions">
                <span>@{member.username}</span>
                <button onClick={() => void logout()}>Sign out</button>
              </div>
            ) : following || hidden || moderating ? (
              <span>Member sign-in</span>
            ) : (
              <button
                aria-expanded={login}
                aria-controls={login ? 'sign-in' : undefined}
                onClick={() => setLogin((value) => !value)}
              >
                {login ? 'Close sign in' : 'Sign in'}
              </button>
            ))}
        </header>
        <main id="content" tabIndex={-1} aria-busy={busy}>
          {children}
        </main>
      </div>
    </div>
  );
}
