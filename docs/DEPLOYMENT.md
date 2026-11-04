# Deploying ANQ Blog

## Runtime

Build with `podman build -t localhost/anq-blog:release .`.
The pinned multi-stage image serves the built interface and API on port 8080 as an
unprivileged user, and excludes `.env`, credentials, tests and development
dependencies. It supports a read-only filesystem with writable `/tmp` and requires
PostgreSQL 17. No uploads or persistent application filesystem are needed. Container
replacement must preserve the database volume; application containers are disposable.

Route the app at `/`; prefix hosting isn't supported by its current absolute links.

Supply `DATABASE_URL` and the exact HTTPS `APP_ORIGIN` through a protected host
environment file. Keep the database off the public network and terminate TLS at
the reverse proxy. `/healthz` checks database access and the initial schema;
it does not verify a backup or every migration.

Forwarded-IP headers are ignored by default. Set `TRUST_PROXY_IPS` to exact
sanitizing-proxy addresses to keep client rate-limit budgets separate. `self`
resolves current container addresses for verified rootless port forwarding;
use it only with loopback-only published ports and a proxy that discards
client-supplied forwarding headers. Limits are per client IP and process.

## Database and access

Run `node dist/server/migrate.js` explicitly before startup. Startup does not
migrate or seed automatically. Back up existing data before applying migrations.
A previous image is usable for rollback only while its schema remains compatible;
image rollback does not undo database changes.

There is no public registration or password-reset endpoint. Accounts are created
with an administrative command, after configuring `.env` and applying migrations.
Use Bash to keep the password out of history and process arguments:

```sh
read -rs -p 'New member password (12+ characters): ' blog_password
printf '%s' "$blog_password" | npm run --silent member:create -- --username membername --name 'Member Name'
unset blog_password
```

In a built container, use `node dist/server/provision.js --username membername --name 'Member Name'`
with the protected application environment and the password on stdin. Add
`--moderator` only for trusted reviewers. Existing accounts are never overwritten
or promoted by this command.

Keep encrypted PostgreSQL backups and verify recovery with an isolated restore. The
development-only database password isn't suitable for a public database, and local
credentials must not be used for a shared writable demo.

## Sample data

To add the fictional sample community after migrations, run
`SEED_DEMO=true DATABASE_URL=… npm run seed` against your intended demo database.
It adds 18 conversations with replies, profiles, follows and a removed-post example.
Repeating the command preserves existing posts, edits, passwords and roles. Sample
accounts have discarded random passwords, so this doesn't create a public login.
Set `DEMO_NOTICE=true` to show the sample-content notice and case-study link;
permissions are unchanged.

## ANQ Publish

Enable PostgreSQL and encrypted off-host backups, and configure:

```sh
MIGRATION_COMMAND=(node dist/server/migrate.js)
```

Keep each deployment's Unix account, database and secrets separate. Verify HTTPS,
sign-in, saved-record persistence after container replacement, and an isolated
restore before storing valuable data. Follow your host backup and recovery procedures for recovery.
