import type { SessionMember as Member, Profile } from '../../shared/model.js';
import { ProfileActions } from './ProfileActions.js';
type Props = {
  hidden: boolean;
  moderating: boolean;
  searching: boolean;
  following: boolean;
  postId: string | null;
  username: string | null;
  profile: Profile | null;
  member: Member | null;
  setProfile: (profile: Profile) => void;
};
export function PageHeading({
  hidden,
  moderating,
  searching,
  following,
  postId,
  username,
  profile,
  member,
  setProfile,
}: Props) {
  return (
    <header className="page-heading">
      <p className="eyebrow">
        {hidden
          ? 'Your reading preferences'
          : moderating
            ? 'Community care'
            : searching
              ? 'Explore the community'
              : postId
                ? 'Keep the conversation going'
                : username
                  ? 'Meet the community'
                  : 'From the community'}
      </p>
      <h1 tabIndex={-1}>
        {hidden
          ? 'Hidden posts.'
          : moderating
            ? 'Moderation queue.'
            : searching
              ? 'Find your next conversation.'
              : postId
                ? 'Conversation'
                : profile
                  ? profile.displayName
                  : username
                    ? 'Member profile'
                    : following
                      ? 'People you follow.'
                      : 'A place for your ideas.'}
      </h1>
      <p className="muted">
        {hidden
          ? 'Posts hidden only from your view. Unhide them whenever you like.'
          : moderating
            ? 'Review reports and record clear decisions.'
            : searching
              ? 'Search for a note, an idea, or someone in the community.'
              : profile
                ? profile.bio
                : postId
                  ? 'A note, and the thoughts it started.'
                  : following
                    ? 'The latest notes from members you follow, newest first.'
                    : 'Small updates, thoughtful notes, and conversations worth keeping.'}
      </p>
      {profile && <ProfileActions profile={profile} member={member} onChange={setProfile} />}
    </header>
  );
}
