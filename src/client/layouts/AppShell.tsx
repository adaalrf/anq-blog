import { NavigationShell, BackToTop } from '../components/NavigationControls.js';
import type { ReactNode, Dispatch, SetStateAction } from 'react';
import type { SessionMember as Member } from '../../shared/model.js';

type Props = {
  member: Member | null;
  sessionReady: boolean;
  demoNotice: boolean;
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
  demoNotice,
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
      <NavigationShell
        brand={
          <a className="brand" href="/">
            ANQ Blog<small>A little space to share</small>
          </a>
        }
      >
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
      </NavigationShell>
      <BackToTop />
      <div className="workspace">
        <header className="topbar">
          <span>
            Community /{' '}
            {!hidden && !moderating && !searching && !postId && username ? (
              'Profile'
            ) : (
              <h1 tabIndex={-1}>
                {hidden
                  ? 'Hidden posts'
                  : moderating
                    ? 'Moderation'
                    : searching
                      ? 'Search'
                      : postId
                        ? 'Conversation'
                        : following
                          ? 'Following'
                          : 'Latest posts'}
              </h1>
            )}
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
          {demoNotice && (
            <aside className="demo-notice" aria-label="About this demo">
              <p>Fictional sample community; publishing needs an account.</p>
              <a href="https://adaalrf.dev/work/anq-blog/">
                A project by Martin Røed Flyum
                <svg
                  className="link-arrow"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M4 12 12 4M4 4h8v8" />
                </svg>
              </a>
            </aside>
          )}
          {children}
        </main>
        <footer className="site-footer">
          <p>Notes. Ideas. Conversations. A slower corner of the web.</p>
        </footer>
      </div>
    </div>
  );
}
