## Interface release — 2026-10-28

Live at https://blog.demo.adaalrf.dev through ANQ Publish, revision 2.
The reviewed page/component organization and navigation changes are deployed.
Readiness and public read-only browser/mobile checks passed. Automated accessibility
scans passed the public homepage. Existing fictional records and authentication
settings were preserved. GitHub publication remains separate.

Image: `localhost/anq-blog@sha256:d243ae697992b132b13da0e07a01f0af4754b2c75cae00d39c174356006ab2e8`

Previous image retained for rollback: `localhost/anq-blog@sha256:0a75ce1bdebc82224d0e7d50b4c22da6d9b81b8abc3cc21ca76bfa1e90541ffe`

## Blog interface and source organization — local, 2026-10-28

Refactored the Blog into pages (posts/threads, sign-in, search, hidden posts,
moderation), reusable components and a shared AppShell layout. App.tsx retains
session/data coordination. No new dependencies, database migrations or API changes.
Stable Community/Following/Search ordering, descriptive per-view browser titles,
focusable skip-link destination, focused Username on opening sign-in and explicit
account-provisioning guidance. Signed-out protected views retain the required
sign-in without presenting a close button that cannot close it. Mobile navigation
gets its own full-width row; short desktop sidebars can scroll. Preserved three-post
pagination, same-document navigation and retained posts during page requests.

Passed typecheck, production build, formatting, all 29 isolated PostgreSQL tests,
member/search/moderation browser workflows with accessibility/responsive checks,
new skip-link/sign-in focus and title assertions, and production-container checks
(migration/provisioning/read-only runtime/login/publishing). Actual local Vite
workspace read-only checks passed; existing content and credentials preserved.
Visual mobile sign-in review passed. Preview http://localhost:5175, development
session 26921. Image localhost/anq-blog:interface-review is local only. Public demo
and production game unchanged; no GitHub writes. Earlier notes below are historical.

# Disposable deployment — 2026-10-27

> Earlier disposable deployment evidence uses the pre-ANQ namespace. The current
> local source has been renamed; this record does not claim a new deployment.

AnqBlog runs on the existing Ubuntu 24.04 disposable VPS as the registered
web-publish app `anq-blog`. It has a dedicated Unix account, a read-only rootless
Node container, a private PostgreSQL 17 network/volume and no host database port.
`https://blog.web-publish.invalid` uses internal Caddy TLS and host-local name
resolution. It is a rehearsal hostname, not a public domain or demo link.

The workstation-built image was uploaded over SSH into the node's loopback-only
registry. Deployment used the restricted node agent's operation interface, with
an immutable digest, pre-migration backup, explicit ordered migrations, durable
operation history and normal local/HTTPS readiness checks. No direct replacement
container or GitHub workflow bypassed that publishing path.

Three fictional accounts were provisioned with fresh random passwords outside
Git. Local development credentials/data were not copied. The opt-in browser test:

```sh
ANQ_BLOG_REHEARSAL=1 REHEARSAL_CREDENTIALS=/protected/members.json npm run test:live
```

requires the disposable credential array for `elin`, `jonas`, `moderator` and
targets only the known disposable VPS. It checks real HTTPS logins, secure
sessions, UI publishing, owner checks, stale-edit rejection, replies, following,
personal hide/unhide, moderator-only report decisions, persistence after refresh,
mobile layout, automated accessibility and logout. Fictional posts/report history
remain for recovery checks. Browser test TLS exceptions do not change server TLS
or disable production certificate verification.

After a VPS reboot, app/database readiness returned before any administrative
SSH login. The fictional data counts remained unchanged.

## Recovery evidence

A post-test encrypted Restic snapshot was exported to the workstation and checked
there. Snapshot
`efaa54da45b0e337e43dd002f742a9f7c8f5460be0f05de7d823d67e97c84176`
was restored into a fresh isolated PostgreSQL container on the workstation.
All recorded counts matched: three members, six posts/replies, one follow, two
reports and four migrations. The matching application image became healthy,
accepted a restored account's password, and successfully wrote/read a new post
in the isolated recovery database. Recovery containers/network were removed.

The running VPS data was not replaced. This proves manual off-host export and
application-level recovery; automatic off-server backups, provider-loss recovery,
public TLS and real operator accounts remain production work. The scheduled test
backup repository is local to the disposable host and is not disaster protection.

## Recorded release

Node registration `anq-blog`, revision `1`, image:

```text
localhost:5000/anq-blog@sha256:53414018f63d14e71306fabdc3acbdc1d4725f25f4ba6893525a7b840915f416
```
