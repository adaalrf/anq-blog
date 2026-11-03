import type { SessionMember as Member, Profile } from '../../shared/model.js';
import { ProfileActions } from './ProfileActions.js';
type Props = {
  profile: Profile | null;
  member: Member | null;
  setProfile: (profile: Profile) => void;
};
// Only a member's profile has a heading of its own; every other view is named in the top bar.
export function PageHeading({ profile, member, setProfile }: Props) {
  return (
    <header className="page-heading">
      <h1 tabIndex={-1}>{profile ? profile.displayName : 'Member profile'}</h1>
      {profile && <p className="muted">{profile.bio}</p>}
      {profile && <ProfileActions profile={profile} member={member} onChange={setProfile} />}
    </header>
  );
}
