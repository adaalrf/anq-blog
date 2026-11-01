# ANQ Blog

[![Checks](https://github.com/adaalrf/anq-blog/actions/workflows/check.yml/badge.svg)](https://github.com/adaalrf/anq-blog/actions/workflows/check.yml)

A small social publishing app: share a note, reply to someone, and return to the
conversation. Built with React, TypeScript, Fastify and PostgreSQL.

Navigation keeps the desktop sidebar and uses a labelled, keyboard-accessible mobile
menu with a return-to-top control. Colours follow the device’s light/dark preference
until the navigation’s appearance switch is used; that choice is saved in the browser.
The browser suite checks both themes and mobile navigation with fictional data.

## Run locally

Requires Linux, Node 24+, npm and rootless Podman. From this directory:

```sh
npm ci
npm run setup:local
npm run dev
```

Open **http://localhost:5175**. The API runs on loopback port 8082; PostgreSQL uses 55434. Setup creates three fictional accounts, **elin**, **jonas** and **moderator**, with separate
random passwords in `.local/member-credentials.json`. Read that file locally to
sign in; never publish it. No GitHub OAuth or external account is needed.

Repeat setup to apply migrations without resetting records or credentials.
Ctrl-C stops the development servers; the named PostgreSQL volume persists.
Custom existing configuration or conflicting ports are preserved and reported.
The development-only database password is not suitable for a public database.

## v1 features

- Public chronological feed and member profiles, with cursor pagination (three posts per page).
- Public post/member search with literal, case-insensitive matching and cursor pagination.
- Follow/unfollow from profiles, with follower/following counts and a private
  following feed. Repeating a follow or unfollow is safe; self-follow is rejected.
- Member sign-in, separate sessions, publishing and one-level replies.
- Author-only editing and deletion with stale-edit conflict detection.
- Deleted posts erase their text and leave a placeholder so replies retain context.
- Personal hide/unhide and reports with moderator-only review, dismissal/removal and decision history.
- Plain-text content, 2,000-character limit, responsive layouts and keyboard focus.
- Consistent portfolio-family styling through [design tokens](src/client/tokens.css).

The following feed includes top-level posts from followed members, newest first;
your own posts and replies stay in their community/thread views. An empty feed
links back to the community to find people. Viewing it requires sign-in.

Search matches text in top-level posts, or usernames, names and bios in the
Members category. Post results are newest first; members are ordered by username.
Replies, personally hidden posts, and deleted/removed post text are excluded. Queries are limited to 120 characters;
there is no fuzzy matching or relevance ranking. The query and category stay in
the URL for refresh, sharing and Back navigation. Pagination restarts on refresh.

This is a small v1 with administrator-created accounts. Registration, password
reset, uploads, notifications, nested reply trees and third-party sign-in are
outside its scope. Do not deploy the local credentials as a shared writable
public demo.

## Reports and moderation

Hide for me affects only your view. Unhide from **Hidden posts**. Reporting is a
separate action: it neither hides the post nor removes it automatically. One
report per member/post is retained, with a snapshot of the reported text.

Sign in as **moderator** locally to review open reports. Dismiss leaves the post
unchanged; Remove redacts it for everyone, preserves its thread placeholder, and
blocks author edits/new replies. Existing replies remain. Each decision requires
a note and records the reviewer/time. The original body and report snapshot are
retained in the database for review. Report evidence is available only through
moderator routes, not ordinary member or public APIs. Reviewed decisions cannot
be overwritten; multiple reports on a post are reviewed individually.

## Create an account

Account creation is an administrative command, never a public endpoint. After
configuring .env and applying migrations, use Bash to keep the password out of
history and process arguments:

```sh
read -rs -p 'New member password (12+ characters): ' blog_password
printf '%s' "$blog_password" | npm run --silent member:create -- --username membername --name 'Member Name'
unset blog_password
```

Append `--moderator` only for a trusted reviewer. Existing accounts are never
overwritten or promoted by this command. In a built container the equivalent
command is `node dist/server/provision.js --username membername --name 'Member Name'`,
with the protected application environment and password on stdin. There is no
public role-changing endpoint.

## Container

```sh
podman build -t localhost/anq-blog:v1 .
```

The pinned multi-stage image runs as the Node user, serves port 8080, and excludes
.env, credentials, tests and development dependencies. Set DATABASE_URL and the
exact HTTPS APP_ORIGIN in the protected environment. Run
`node dist/server/migrate.js` explicitly before startup (or configure that as
the anq-publish migration command). Use PostgreSQL backups through anq-publish.
No uploads or persistent application filesystem are required. The image supports
a read-only filesystem with a writable /tmp. Route the app at /; prefix hosting
is not supported by its current absolute links.

See [contributing](CONTRIBUTING.md) for the source map and
[design conventions](DESIGN.md) for visual changes.

## Verify

```sh
npm run typecheck
npm run build
npm run format:check
TEST_DATABASE_URL=postgres://postgres:local-development-only@127.0.0.1:55434/anq_blog npm test
TEST_DATABASE_URL=postgres://postgres:local-development-only@127.0.0.1:55434/anq_blog npm run test:browser
npm run test:local
TEST_DATABASE_URL=postgres://postgres:local-development-only@127.0.0.1:55434/anq_blog npm run test:container
```

The container check requires the locally built image and free loopback port 18086.
It uses host networking only for the isolated local PostgreSQL check, runs as the
Node user with a read-only filesystem, and removes its test container afterward.

API, browser and container checks create and remove isolated random schemas, never reset the
local member workspace. Install a Playwright Chromium build for your OS; on
NixOS set `CHROMIUM_EXECUTABLE` to a working Nix Chromium binary. `test:local`
requires the running development servers and uses generated passwords privately;
it signs in/out without modifying posts.

Database tests cover cross-member authorization, sessions, stale edits, validation,
replies, moderator authorization, report concurrency/snapshots, personal hides,
administrative provisioning, follow isolation/idempotency and cursor ordering with PostgreSQL microsecond ties. Browser checks
exercise two separate member sessions, persistence after refresh, editing,
deletion, profiles, follow/unfollow, following-feed sign-out/re-entry, paging,
mobile overflow and automated accessibility scans.
That scan is not a complete manual accessibility audit.

Sessions use random opaque tokens stored as SHA-256 hashes, expire after 12 hours,
and use HttpOnly/SameSite cookies. Passwords use scrypt. Mutations require the
configured Origin; non-local configuration requires HTTPS. Login and write routes
are rate limited. SQL uses bound parameters. Migrations are explicit, not run on
server startup. Production build serves UI and API together via `npm start`.

Try the [public demo](https://blog.demo.adaalrf.dev) with fictional content.
See [deployment](docs/DEPLOYMENT.md) for hosting configuration.

## Navigation and loading

Internal links and search forms update browser history without reloading the
document. Back/Forward and direct links still work; modified clicks/new tabs
retain normal browser behaviour. Session state is rechecked on navigation.
Pagination retains the displayed posts while loading the next result and disables
page controls until it finishes; a new route/query starts at page one. There is
no live polling loop. The desktop sidebar stays fixed while its background spans
the complete document, including long-page screenshots.

## Working on the project

See [contributing and development](CONTRIBUTING.md) for the source map, everyday
commands, test prerequisites and troubleshooting. `npm run dev` starts both the
API and Vite after local setup; `dev:local` remains an alias. For a custom manual
configuration, run `npm run dev:server` and `npm run dev:client` separately.
