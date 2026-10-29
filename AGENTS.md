# Working on ANQ Blog

Read README.md and DESIGN.md. This is a clean remake; archive/anq-blog remains
unchanged. Keep React/TypeScript/PostgreSQL and the current simple separation of
client, HTTP/authentication and database queries. Do not add abstraction layers
or infrastructure features without an actual product need.

Use app-local CSS tokens in src/client/tokens.css. Shared components should keep
feed/profile/thread behavior aligned. Keep plain text escaped through React;
do not add raw HTML rendering. Enforce ownership on the server, never just in UI.
New database changes are ordered SQL migrations; never edit applied migrations.

Before handoff run typecheck/build and relevant tests against disposable
PostgreSQL. Use isolated schemas, preserve local member content and credentials,
and update documentation for changed behavior. Do not print .env or credentials.
Do not publish to GitHub or the actual domain without user instruction. Preserve
Git signing preferences; do not disable signing to work around a locked key.
