import { AppShell } from './layouts/AppShell.js';
import { PageHeading } from './components/PageHeading.js';
import { PostsPage } from './pages/Posts.js';
import { Login } from './pages/SignIn.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SessionMember as Member, Post, PostPage, Profile } from '../shared/model.js';
import { api } from './api.js';
import { Search } from './pages/Search.js';
import { HiddenPosts } from './pages/HiddenPosts.js';
import { Moderation } from './pages/Moderation.js';
import { useNavigation } from './navigation.js';
export function App() {
  const [search, setSearch] = useState(location.search);
  const [viewRevision, setViewRevision] = useState(0);
  const authRevision = useRef(0);
  const params = new URLSearchParams(search),
    postId = params.get('post'),
    username = params.get('profile');
  const searching = !postId && !username && params.get('view') === 'search';
  const hidden = !postId && !username && params.get('view') === 'hidden';
  const moderating = !postId && !username && params.get('view') === 'moderation';
  const special = searching || hidden || moderating;
  const following = !postId && !username && !special && params.get('feed') === 'following';
  const [demoNotice, setDemoNotice] = useState(false);
  const [member, setMember] = useState<Member | null>(null),
    [sessionReady, setSessionReady] = useState(false),
    [login, setLogin] = useState(false);
  const [post, setPost] = useState<Post | null>(null),
    [profile, setProfile] = useState<Profile | null>(null),
    [page, setPage] = useState<PostPage | null>(null);
  const [cursors, setCursors] = useState<(string | null)[]>([null]),
    [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(true),
    [error, setError] = useState('');
  const cursor = cursors.at(-1);
  const navigate = useCallback((search: string) => {
    setSearch(search);
    setViewRevision((value) => value + 1);
    setCursors([null]);
    setPage(null);
    setPost(null);
    setProfile(null);
    setError('');
    setLogin(false);
    setBusy(true);
    setRevision((value) => value + 1);
  }, []);
  useNavigation(navigate);
  useEffect(() => {
    let current = true;
    const observedAuth = authRevision.current;
    void api<{ member: Member | null; demoNotice: boolean }>('/session')
      .then((result) => {
        if (current && observedAuth === authRevision.current) {
          setMember(result.member);
          setDemoNotice(result.demoNotice);
        }
      })
      .catch((e) => {
        if (current && observedAuth === authRevision.current) setError(e.message);
      })
      .finally(() => {
        if (current) setSessionReady(true);
      });
    return () => {
      current = false;
    };
  }, [viewRevision]);
  useEffect(() => {
    let current = true;
    setBusy(true);
    setError('');
    if (!sessionReady) return;
    if (special) {
      setPage(null);
      setBusy(false);
      return;
    }
    if (following && !member) {
      setPage(null);
      setBusy(false);
      return;
    }
    const query = new URLSearchParams();
    if (cursor) query.set('cursor', cursor);
    if (username) query.set('author', username);
    if (following) query.set('feed', 'following');
    void Promise.all([
      api<PostPage>(`${postId ? `/posts/${postId}/replies` : '/posts'}?${query}`),
      postId ? api<Post>(`/posts/${postId}`) : Promise.resolve(null),
      username ? api<Profile>(`/members/${username}`) : Promise.resolve(null),
    ])
      .then(([result, parent, user]) => {
        if (current) {
          setPage(result);
          setPost(parent);
          setProfile(user);
        }
      })
      .catch((e) => {
        if (current) {
          setError(e.message);
          setPage(null);
        }
      })
      .finally(() => {
        if (current) setBusy(false);
      });
    return () => {
      current = false;
    };
  }, [postId, username, following, special, cursor, revision, sessionReady, member?.id]);
  useEffect(() => {
    const title = hidden
      ? 'Hidden posts'
      : moderating
        ? 'Moderation'
        : searching
          ? 'Search'
          : postId
            ? 'Conversation'
            : username
              ? profile?.displayName || 'Member profile'
              : following
                ? 'Following'
                : 'Community';
    document.title = `${title} · ANQ Blog`;
  }, [hidden, moderating, searching, postId, username, profile?.displayName, following]);
  function refresh() {
    setRevision((value) => value + 1);
  }
  async function logout() {
    try {
      await api('/logout', 'POST');
      authRevision.current++;
      setCursors([null]);
      setPage(null);
      setPost(null);
      setProfile(null);
      setMember(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <AppShell
      {...{
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
      }}
    >
      <PageHeading
        {...{
          hidden,
          moderating,
          searching,
          following,
          postId,
          username,
          profile,
          member,
          setProfile,
        }}
      />
      {(postId || username) && (
        <a className="back" href="/">
          ← Back to community
        </a>
      )}
      {!sessionReady && <p role="status">Connecting…</p>}
      {(login || following || hidden || moderating) && sessionReady && !member && (
        <Login
          signedIn={(user) => {
            authRevision.current++;
            setMember(user);
            setCursors([null]);
            setLogin(false);
          }}
        />
      )}
      {error && (
        <div className="panel" role="alert">
          <p className="error">{error}</p>
          <button onClick={refresh}>Try again</button>
        </div>
      )}
      {searching && sessionReady && <Search key={viewRevision} member={member} />}
      {hidden && member && <HiddenPosts key={viewRevision} member={member} />}
      {moderating && member && <Moderation key={viewRevision} member={member} />}
      {busy && <p role="status">Loading posts…</p>}
      <PostsPage
        {...{
          postId,
          username,
          following,
          special,
          member,
          page,
          post,
          cursors,
          busy,
          refresh,
          setCursors,
        }}
      />
    </AppShell>
  );
}
