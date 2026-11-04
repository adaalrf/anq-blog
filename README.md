# ANQ Blog

[![Checks](https://github.com/adaalrf/anq-blog/actions/workflows/check.yml/badge.svg)](https://github.com/adaalrf/anq-blog/actions/workflows/check.yml)

A small community where people post, reply and follow each other, and where a
conversation stays whole.

[Browse the demo](https://blog.demo.adaalrf.dev) · [Read the case study](https://adaalrf.dev/work/anq-blog/)

![The community feed, with fictional members and posts](docs/screenshots/community-desktop.png)

The demo is open to browse and holds fictional conversations. Publishing needs an
account.

## The problem

A small group doesn't need a large social network, but it does need the things
those networks quietly get right. People want to read a conversation from start
to finish, come back to it later, and trust that it hasn't changed or fallen
apart in the meantime.

Those are the details that break in simple software. An edit in one tab overwrites
a newer one in another. A deleted post leaves its replies with nothing to answer.
A moderator removes something, and no one can tell what happened or why.

## The solution

ANQ Blog keeps a conversation in one piece, wherever it's read:

- **Read without an account.** The feed, profiles, threads and search are public.
- **Publish and reply.** Members write short plain-text posts and answer each other.
- **Follow people.** A personal feed shows the latest posts from members you follow.
- **Edit safely.** If a post changed since you opened it, your edit is stopped, so
  nothing newer gets overwritten.
- **Delete without breaking threads.** A deleted post leaves a placeholder, so the
  replies keep their context.
- **Moderate in the open.** Members can hide a post for themselves or report it.
  Moderators review each report and record a reason for every decision.

## How it works

The feed, a profile and a thread all use the same post component, so a post looks
and behaves the same everywhere it appears. Each post carries a version number,
and the server refuses any write based on an older one. That one rule is what
stops two open tabs from overwriting each other.

Ownership and moderator rights are checked on the server, never only in the
interface. Links, search and paging update the browser's history, so Back, Forward
and shared links all work as you'd expect.

## Try it yourself

You'll need Linux, Node.js 26 or newer, npm and rootless Podman. Then, from this
directory:

```sh
npm ci
npm run setup:local
npm run dev
```

Open <http://localhost:5175>. Setup starts a local PostgreSQL database and creates
three fictional accounts: **elin**, **jonas** and **moderator**. Their generated
passwords are in `.local/member-credentials.json`. Press Ctrl-C to stop; your data
stays, and running setup again keeps it.

## Under the hood

Built with React, TypeScript, Fastify and PostgreSQL. In production, one process
serves both the interface and the API.

| Worth reading                                        | Why                                         |
| ---------------------------------------------------- | ------------------------------------------- |
| [`PostCard.tsx`](src/client/components/PostCard.tsx) | One component for feed, profile and thread  |
| [`posts.ts`](src/server/posts.ts)                    | Ownership and version checks on every write |
| [`moderation.ts`](src/server/moderation.ts)          | Reports, decisions and their history        |
| [`browser.ts`](tests/browser.ts)                     | Two members working through the app at once |

## What it leaves out

This is a deliberately small project. Accounts are created by an administrator, so
there's no public registration or password reset. There are also no uploads,
notifications, nested reply trees or third-party sign-in.

## Going further

- [Architecture](docs/ARCHITECTURE.md): how search, moderation, navigation and
  security behave
- [Deployment](docs/DEPLOYMENT.md): containers, accounts and sample data
- [Contributing](CONTRIBUTING.md): where things live and how to run the tests
- [Design](DESIGN.md): the visual rules

The [first public commit](https://github.com/adaalrf/anq-blog/commit/6cc9203) is a
squashed snapshot of earlier work; changes since then are recorded one by one.
