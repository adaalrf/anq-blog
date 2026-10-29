import { useState } from 'react';
import type { Member, Profile } from '../../shared/model.js';
import { api } from '../api.js';

export function ProfileActions({
  profile,
  member,
  onChange,
}: {
  profile: Profile;
  member: Member | null;
  onChange: (profile: Profile) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function toggle() {
    setBusy(true);
    setError('');
    try {
      onChange(
        await api<Profile>(
          `/members/${profile.username}/follow`,
          profile.following ? 'DELETE' : 'PUT',
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="profile-actions">
      <p className="muted" role="status">
        {profile.followerCount} {profile.followerCount === 1 ? 'follower' : 'followers'} ·{' '}
        {profile.followingCount} following
      </p>
      {member && member.id !== profile.id && (
        <button
          className={profile.following ? undefined : 'primary'}
          aria-label={`${profile.following ? 'Unfollow' : 'Follow'} ${profile.displayName}`}
          disabled={busy}
          onClick={() => void toggle()}
        >
          {busy ? 'Saving…' : profile.following ? 'Unfollow' : 'Follow'}
        </button>
      )}
      {!member && <p className="muted">Sign in to follow this member.</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
