# Developing anq-blog

## First run

Use Linux, Node.js 24+, npm and rootless Podman. Run from the repository root:

```sh
npm ci
npm run setup:local
npm run dev
```

Open http://localhost:5175. Setup starts a loopback-only PostgreSQL container,
applies ordered migrations, and creates fictional local data and credentials.
Read `.local/member-credentials.json` privately to sign in. Repeat setup is designed to
preserve existing data and credentials; it refuses custom `.env` configurations.
Ctrl-C stops the API and Vite, leaving the database and its named volume intact.
No production credentials or remote service is needed.

`npm run dev:local` is the same combined workflow. `dev:server` loads `.env` and
watches only the API; `dev:client` runs Vite separately for manual configurations.
If a local port is occupied, stop the process you own or follow the README's
manual configuration route. Setup/dev do not stop someone else's process or
replace its configuration. Do not copy a production `.env` into local setup.

## Where changes belong

| Task                                 | Files                                           |
| ------------------------------------ | ----------------------------------------------- |
| Page structure and navigation        | `src/client/pages/`, `src/client/App.tsx`       |
| Reusable UI and forms                | `src/client/components/`                        |
| Header/sidebar and shared page frame | `src/client/layouts/`                           |
| Colours, spacing and layout          | `src/client/tokens.css`, `src/client/style.css` |
| HTTP routes and authorization        | `src/server/app.ts`                             |
| Credentials and session rules        | `src/server/auth.ts`, `src/server/config.ts`    |
| Validation and domain rules          | `src/shared/`                                   |
| Database changes                     | New numbered SQL file in `migrations/`          |
| Local startup/setup                  | `scripts/`                                      |
| API and browser regressions          | `tests/`                                        |

`App.tsx` coordinates session/data loading and mutations. Pages own their views;
components own reusable presentation. Keep this direct structure rather than
adding a second routing framework or generic repository/service layers.

The built application serves its client and API from one process. Development
uses Vite's API proxy. `dist/` and `node_modules/` are generated, not source.
Use ordered additive migrations; never edit a migration already applied to a real
database. Enforce permissions in the API even when buttons are disabled in the UI.

## Checks

The API tests create and remove random schemas. Use disposable local PostgreSQL,
never a production database. The default development server can host those test
schemas:

```sh
TEST_DATABASE_URL=postgres://postgres:local-development-only@127.0.0.1:55434/anq_blog npm run check
npx playwright install chromium
TEST_DATABASE_URL=postgres://postgres:local-development-only@127.0.0.1:55434/anq_blog npm run test:browser
```

`check` runs type checks, API/domain tests and the production build. Build before
running browser checks so they use current client assets. On NixOS, set
`CHROMIUM_EXECUTABLE=/absolute/path/to/chromium` instead of installing a browser.
Browser tests use fictional records and isolated schemas; their screenshots must
never contain private content.

With the local workspace running, `npm run test:local` checks the actual Vite
proxy and owner/member login without modifying saved application content. It
reads the generated local credentials privately. Do not point it at production.

## Making a change

Keep the change focused, update its documentation and run the relevant checks.
For a bug, cover the user-visible failure rather than only duplicating the code.
Describe the trigger, resulting behaviour, validation and remaining limits in the
change description. Do not add credentials, `.env`, `.local/`, database dumps or
runtime images to Git. Preserve existing signing settings.

Local sample members and the moderator have independent generated passwords.
Public demo visitors can browse; publishing requires a provisioned member.
Keep post text escaped through React and check ownership/moderator authority on
the server. Read [design](DESIGN.md) and the README scope before expanding it.

For visual changes, use the local CSS tokens and preserve contrast, visible
keyboard focus, readable errors and text labels for status. Colour alone must
not convey state. Keep screenshots fictional.
