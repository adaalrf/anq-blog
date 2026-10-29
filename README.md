# ANQ Blog

A small social publishing app: share a note, reply to someone, and return to the
conversation. A clean remake of the original ANQ Blog, built with React,
TypeScript, Fastify and PostgreSQL. The old source stays preserved in the archive.

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
public demo. See [v1 scope](docs/V1.md) and [case study](docs/CASE-STUDY.md).

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

## Structure

```text
src/client/
  App.tsx       Session/data coordination and route selection
  pages/        Posts/threads, search, hidden posts, moderation and sign-in
  layouts/      Shared sidebar, navigation, session controls and reading area
  components/   Post cards/actions, composer, profile actions, pagination/headings
  api.ts        HTTP requests and error handling
  navigation.ts Same-document links, search forms and browser history
  *.css         Local design tokens and responsive styles
src/server/     HTTP/authentication, post queries, configuration and migrations
src/shared/     Input schemas and response types
migrations/    Ordered transactional SQL migrations
scripts/       Repeatable local setup and development runner
tests/         PostgreSQL integration, browser and actual-local smoke checks
```

No generic repository layer or shared UI package. Split modules when a concrete
workflow needs it. See [design conventions](DESIGN.md) for visual changes.

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

The current v1 is publicly available at https://blog.demo.adaalrf.dev, with
fictional content and administrator-provided member accounts. Its deployment uses
a dedicated rootless app/database account through ANQ Publish. The interface review described below is deployed and verified over public HTTPS. Earlier disposable deployment and recovery evidence is recorded in
[deployment notes](docs/DEPLOYMENT.md). No GitHub publication has been performed.

## Navigation and loading

Internal links and search forms update browser history without reloading the
document. Back/Forward and direct links still work; modified clicks/new tabs
retain normal browser behaviour. Session state is rechecked on navigation.
Pagination retains the displayed posts while loading the next result and disables
page controls until it finishes; a new route/query starts at page one. There is
no live polling loop. The desktop sidebar stays fixed while its background spans
the complete document, including long-page screenshots.

## Navigation and source organization review

Page views live in `src/client/pages/`, reusable controls in `components/`, and the
shared site shell in `layouts/`. `App.tsx` coordinates session and data loading;
there is no additional router or state-management dependency. Community, Following
and Search stay first in navigation for both guests and members. Browser titles
identify the current view or member. The skip link focuses the main reading area;
opening sign-in focuses the username and explains administrator-provided accounts.
On signed-out member-only views, the required sign-in stays visible instead of
offering a close control that cannot close it. Three-post pagination and retained
posts during loading are preserved. These interface changes are verified locally and deployed to the public demo.

## Working on the project

See [contributing and development](CONTRIBUTING.md) for the source map, everyday
commands, test prerequisites and troubleshooting. `npm run dev` starts both the
API and Vite after local setup; `dev:local` remains an alias. For a custom manual
configuration, run `npm run dev:server` and `npm run dev:client` separately.
