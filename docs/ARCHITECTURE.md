# Architecture

## Posts and threads

The public feed and member profiles are chronological, with cursor pagination at
six posts per page. Replies are one level deep. Posts are plain text, up to 2,000
characters, and are never rendered as HTML.

Authors can edit and delete their own posts. A stale edit is rejected rather than
overwriting newer text. Deleting erases the text and leaves a placeholder, so
replies keep their context.

## Following

Following and unfollowing happen from profiles, with follower and following counts.
Repeating either action is safe, and following yourself is rejected.

The following feed needs sign-in. It holds top-level posts from followed members,
newest first; your own posts and replies stay in their community and thread views.
An empty feed links back to the community to find people.

## Search

Search matches text in top-level posts, or usernames, names and bios in the Members
category. Matching is literal and case-insensitive, with no fuzzy matching or
relevance ranking. Post results are newest first; members are ordered by username.
Replies, personally hidden posts, and deleted or removed post text are excluded.
Queries are limited to 120 characters.

The query and category stay in the URL for refresh, sharing and Back navigation.
Pagination restarts on refresh.

## Reports and moderation

Hide for me affects only your view; unhide from **Hidden posts**. Reporting is a
separate action: it neither hides the post nor removes it automatically. One report
per member and post is retained, with a snapshot of the reported text.

Moderators review open reports. Dismiss leaves the post unchanged. Remove redacts it
for everyone, preserves its thread placeholder, and blocks author edits and new
replies; existing replies remain. Each decision requires a note and records the
reviewer and time. Reviewed decisions can't be overwritten, and multiple reports on
a post are reviewed individually.

Report evidence is available only through moderator routes, not ordinary member or
public APIs. Author deletion clears the post body, but existing reports retain their
text snapshot for moderators. Moderator removal hides a post while preserving its
stored text for review.

## Navigation and loading

Internal links and search forms update browser history without reloading the
document. Back, Forward and direct links still work, and modified clicks and new
tabs keep normal browser behaviour. Session state is rechecked on navigation.

Pagination keeps the displayed posts while loading the next result and disables
page controls until it finishes; a new route or query starts at page one. There is
no live polling loop.

## Security

Sessions use random opaque tokens stored as SHA-256 hashes, expire after 12 hours,
and use HttpOnly, SameSite cookies. Passwords use scrypt. Mutations require the
configured Origin, and non-local configuration requires HTTPS. Login and write
routes are rate limited. SQL uses bound parameters.

Account creation is an administrative command, never a public endpoint, and there
is no public role-changing endpoint.

## Reliability

Migrations are explicit and never run on server startup. Production writes
structured server errors to the service log. PostgreSQL connections have a 5-second
acquisition timeout and queries a 10-second statement timeout; Fastify's request
timeout applies to receiving requests.
