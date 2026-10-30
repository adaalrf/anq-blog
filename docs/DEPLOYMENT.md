# Deploying ANQ Blog

## Runtime

Build with `podman build -t localhost/anq-blog:release .`.
The image serves the built interface and API on port 8080 as an unprivileged user.
It supports a read-only filesystem with writable `/tmp` and requires PostgreSQL 17.
Container replacement must preserve the database volume; application containers
are disposable.

Supply `DATABASE_URL` and the exact HTTPS `APP_ORIGIN` through a protected host
environment file. Keep the database off the public network and terminate TLS at
the reverse proxy. `/healthz` checks database access and the initial schema;
it does not verify a backup or every migration.

## Database and access

Run `node dist/server/migrate.js` explicitly before startup. Startup does not
migrate or seed automatically. Back up existing data before applying migrations.
A previous image is usable for rollback only while its schema remains compatible;
image rollback does not undo database changes.

Provision members with `node dist/server/provision.js`; pass the password on
stdin, not in command arguments. Add `--moderator` only for trusted reviewers.
There is no public registration or password-reset endpoint.

## ANQ Publish

Enable PostgreSQL and encrypted off-host backups, and configure:

```sh
MIGRATION_COMMAND=(node dist/server/migrate.js)
```

Keep each deployment's Unix account, database and secrets separate. Verify HTTPS,
sign-in, saved-record persistence after container replacement, and an isolated
restore before storing valuable data. Follow your host backup and recovery procedures for recovery.
