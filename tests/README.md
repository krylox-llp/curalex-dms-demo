# Tests

All tests run against the **local** Supabase stack only. The helper refuses any URL that isn't `localhost` / `127.0.0.1`, so a hosted project can't be touched by mistake.

## Prerequisites

- Docker + the Supabase CLI
- Google Chrome (for the browser test; set `CHROME_BIN` if it isn't `google-chrome`)

```sh
supabase start        # local stack; connection details are read with `supabase status -o env`
supabase db reset     # optional: apply all migrations to a clean database
```

## Commands

| Command | What it runs |
|---|---|
| `pnpm test:db` | Database / permission suites in `tests/db/` (about 190 checks) |
| `pnpm test:db roles` | Only suites whose file name contains "roles" |
| `VERBOSE=1 pnpm test:db` | Print every PASS line, not just failures and totals |
| `pnpm test:e2e` | Seeds data, builds and starts the app on port 3125, runs the browser smoke test, stops the app |
| `E2E_BASE_URL=http://localhost:3000 pnpm test:e2e` | Same, against an app you already started |
| `pnpm test` | Both |

Each command exits non-zero if any check fails, so it can be used in CI.

Suites create users with random suffixes, so they can run repeatedly against the same database without a reset. Emails are never sent (`RESEND_API_KEY` is blanked).

## Layout

```
tests/
  db/
    lib.mjs                         shared setup: local env, service-role client for setup, random tag
    run.mjs                         runs every *.test.mjs, prints totals, sets the exit code
    01-documents-and-sharing.test.mjs  folders, uploads, versions, shares, storage access, delete
    02-exporter-access.test.mjs     exporter can see only active shares; secure view/download logging
    03-products.test.mjs            exporter products, manufacturers and documents
    04-remove-exporter.test.mjs     removing an exporter revokes everything
    05-audit-trail.test.mjs         append-only log, hash chain, reasons, visibility
    06-roles.test.mjs               roles, permissions, team management, deactivation
  e2e/
    browser.mjs                     tiny headless-Chrome driver (DevTools protocol, no dependencies)
    seed.mjs                        2 manufacturers, 1 exporter, 5 shared files, 1 product
    smoke.test.mjs                  main screens, menus, dialogs, secure download route
    run.mjs                         seed → build → start → smoke test → stop
    .state/                         sessions and screenshots (git-ignored)
```

## Adding a test

- **Database:** add `NN-name.test.mjs` in `tests/db/`, import from `./lib.mjs`, print `PASS`/`FAIL` lines and finish with `` console.log(`${pass} passed, ${fail} failed`) `` and `process.exitCode`. Use the service-role `admin` client only for setup (creating users, platform admins), never to check behaviour.
- **New write functions** must have a permission test in `06-roles.test.mjs` (allowed role succeeds, other roles get `not_allowed`).
- **Browser:** add checks to `smoke.test.mjs`, or a new `*.test.mjs` started from `e2e/run.mjs`. Use `visible(...)` selectors, since Next keeps hidden copies of recently visited pages in the DOM.

## Validation note

These tests are developer verification, not formal OQ evidence yet. To use them as validation evidence they need to be traced to requirements, run on a controlled environment, and their output retained (see `docs/compliance-gap-assessment.md`, workstream 4.5).
