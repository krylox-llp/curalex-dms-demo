# CuraLex - DMS: Codebase guide

**For:** developers joining the project. **Describes:** the code at 2026-11-28.
**Read next:** [`how-the-app-works.md`](./how-the-app-works.md) (features and flows), [`db-schema.md`](./db-schema.md) (data model and SQL functions), [`roles-and-permissions.md`](./roles-and-permissions.md), [`../tests/README.md`](../tests/README.md).

This guide explains **what each file does and where to look** when you need to change something.

---

## Contents

1. [The big picture](#1-the-big-picture)
2. [Top-level layout](#2-top-level-layout)
3. [How a request flows](#3-how-a-request-flows)
4. [`app/`: routes and server actions](#4-app-routes-and-server-actions)
5. [`components/`: UI](#5-components-ui)
6. [`lib/`: data access and helpers](#6-lib-data-access-and-helpers)
7. [`supabase/`: database](#7-supabase-database)
8. [`tests/`](#8-tests)
9. [`docs/`](#9-docs)
10. [Root config files](#10-root-config-files)
11. ["Where do I change…?"](#11-where-do-i-change)
12. [Conventions and gotchas](#12-conventions-and-gotchas)

---

## 1. The big picture

- **Stack:** Next.js 16 (App Router, React 19, `cacheComponents` on) + Supabase (Postgres, Auth with Google, Storage) + Tailwind CSS 4, deployed on Vercel. Emails via Resend.
- **The database enforces the rules.** The browser and the Next.js server only **read** tables through row-level security. **Every write is a Postgres function** (`SECURITY DEFINER`) that checks who is calling, their role/permission and the state. Next.js server actions are thin wrappers that call those functions and translate error codes into messages.
- **Audit trail is in the database** too: triggers write every change to an append-only, hash-chained `audit_log`.
- **Three workspaces:** `/manufacturer`, `/exporter`, `/admin`. A user sees only the workspace of their company type (admins see `/admin`).
- **UI style:** Vaadin Lumo design tokens and component classes in `app/globals.css`, Inter font, used through Tailwind utilities (`text-secondary`, `bg-primary-10`…) and classes like `.btn-primary`, `.data-grid`, `.badge`.

```
Browser ── page request ──▶ proxy.ts (refresh Supabase session, redirect if signed out)
                              │
                              ▼
                     app/**/page.tsx  (server component: requireAccount → load data from lib/* → render)
                              │                     ▲
             client components (components/**)     │ reads (RLS)
                              │ user action         │
                              ▼                     │
                     app/**/actions.ts  ── rpc() ──▶ Postgres function ──▶ tables ──▶ audit triggers
```

---

## 2. Top-level layout

| Path | What it is |
|---|---|
| `app/` | Routes (pages, route handlers) and server actions |
| `components/` | React components; `manufacturer/`, `exporter/`, `login/` for area-specific ones |
| `lib/` | Server-side data loaders, Supabase clients, email, roles, helpers |
| `supabase/` | Local Supabase config and SQL migrations (schema, functions, policies) |
| `tests/` | Database/permission suites and the headless-browser smoke test |
| `docs/` | Project documentation (this file and others) |
| `public/` | Static images (login page artwork) |
| `proxy.ts` | Next.js 16 "proxy" (formerly middleware) |

---

## 3. How a request flows

### Viewing a page (example: `/manufacturer/documents?folder=…&doc=…`)

1. `proxy.ts` → `lib/supabase/proxy.ts` refreshes the auth cookie and redirects signed-out users to `/login`.
2. `app/manufacturer/documents/page.tsx` renders a `<Suspense>` with `AppShellSkeleton`, then the async inner component:
   - `requireAccount("manufacturer")` (`lib/account.ts`) loads the user, company, roles and permissions via the `my_account()` SQL function, and redirects anyone who doesn't belong.
   - Loads data through `lib/documents.ts` (`getFolders`, `getDocuments`), which query tables with the user's session, so RLS limits rows to their company.
   - Renders `AppShell` (`components/app-shell.tsx`: header, sidebar) with the table (`FileRow`, `FolderRow`), filters and the details panel.
3. Client components get permissions from `PermissionsProvider` (`components/permissions.tsx`) via `useCan("documents.edit")` to show or hide controls.

### Changing data (example: editing document details)

1. `components/manufacturer/details-dialog.tsx` (client) calls the server action `setDocumentDetails` from `app/manufacturer/actions.ts`.
2. The action calls `supabase.rpc("set_document_details", …)`; the SQL function checks `documents.edit`, validates, updates `documents`.
3. The `audit_documents` trigger writes an `audit_log` row (old/new values).
4. The action maps any error code to a message (`ERRORS` table in the action file) and calls `refresh()` so the page re-renders with new data.

### Actions that need a reason (delete, revoke, remove exporter)

The client collects a reason (`components/reason-field.tsx`); the server action wraps the Supabase client with `withReason()` (`lib/audit-reason.ts`), which sends it base64-encoded in the `x-audit-reason` header; the SQL function requires it and the audit trigger stores it.

### Exporter opening a document

`/documents/<shareId>/view|download` (`app/documents/[shareId]/[action]/route.ts`): calls `record_document_access()` (checks the share is live, logs the access, returns the storage path), then creates a 60-second signed URL with the service-role client (`lib/supabase/admin.ts`) and redirects to it. Exporters never touch Storage directly.

### Uploading

`components/manufacturer/upload.tsx` (client): `reserve_upload` RPC → upload straight to the reserved Storage path with the browser client → `complete_upload` RPC → `router.refresh()`.

### Signing in

`components/google-sign-in-button.tsx` starts Google OAuth → `app/auth/callback/route.ts` exchanges the code, calls `accept_invitation()`, sends the user home or back to the login page with an error (`not_invited`, `wrong_role`, `deactivated`, `auth_failed`).

---

## 4. `app/`: routes and server actions

### Root

| File | Purpose |
|---|---|
| `app/layout.tsx` | Root HTML layout, Inter font, global metadata |
| `app/globals.css` | Tailwind import, **Lumo tokens** (colours, spacing, radii, shadows) mapped to Tailwind theme names, and component classes: buttons, text fields, checkbox, data grid, badges, document-type tag, tabs, overlay/menu, popover panel, dialog, notices, card |
| `app/page.tsx` | `/`: redirects to the user's home (`/admin`, `/manufacturer`, `/exporter`) or `/login` |
| `app/actions.ts` | Server actions `inviteCompany` (admin) and `inviteExporter` (manufacturer); send invitation emails |
| `app/favicon.ico` | Icon |

### Sign-in

| File | Purpose |
|---|---|
| `app/login/page.tsx` | `/login`: chooser (Manufacturer / Exporter) and "CuraLex team sign in" for admins; error messages |
| `app/login/manufacturer/page.tsx`, `app/login/exporter/page.tsx` | Role-specific sign-in pages (render `RoleLogin`) |
| `app/auth/callback/route.ts` | OAuth callback: session exchange, `accept_invitation()`, role check, safe `next` redirect |
| `app/auth/signout/route.ts` | POST: sign out and go to `/login` |

### Manufacturer workspace (`app/manufacturer/`)

| File | Route / purpose |
|---|---|
| `page.tsx` | `/manufacturer`: **Overview**: key figures, Needs attention, recent exporter activity, exporters table |
| `documents/page.tsx` | `/manufacturer/documents`: folders and files, filters (`q`, `type`, `product`, `expiry`), details panel (`?doc=`), share-target banner (`?to=`) |
| `share/page.tsx` | `/manufacturer/share?v=<versionIds>&to=<exporter>`: choose exporter (or invite a new one) and durations, then share |
| `shared/page.tsx` | `/manufacturer/shared`: "Shared with": list of exporters, invite exporter |
| `shared/[exporterId]/page.tsx` | One exporter: documents shared with them, durations, revoke, activity, remove exporter |
| `audit/page.tsx` | Audit trail (needs `audit.view`) |
| `team/page.tsx` | Team management (needs `users.manage`) |
| `search/page.tsx` | Header search results: documents, folders, exporters |
| `actions.ts` | Server actions: `createFolder`, `setDocumentDetails`, `shareFiles`, `setShareDuration`, `revokeShares`, `getDeleteImpact`, `deleteItems` (also removes files from Storage), `removeExporter`; `ERRORS` map of SQL codes → messages |

### Exporter workspace (`app/exporter/`)

| File | Route / purpose |
|---|---|
| `page.tsx` | `/exporter`: **Overview**: key figures, product readiness, needs attention, recently received |
| `products/page.tsx` | `/exporter/products`: product list, New product |
| `fpps/[fppId]/page.tsx` | One product: its manufacturers and attached documents |
| `shared/page.tsx` | `/exporter/shared`: "Shared with me" by manufacturer |
| `shared/[manufacturerId]/page.tsx` | Documents shared by one manufacturer |
| `audit/page.tsx`, `team/page.tsx`, `search/page.tsx` | As for manufacturers |
| `actions.ts` | Server actions for products: `createFpp`, `updateFpp`, `deleteFpp`, `addFppManufacturer`, `removeFppManufacturer`, `addFppDocuments`, `removeFppDocument` |

### Admin and shared routes

| File | Purpose |
|---|---|
| `app/admin/page.tsx` | `/admin`: invite companies, list companies with status |
| `app/admin/audit/page.tsx` | Platform-wide audit trail and **integrity check** (`verify_audit_chain`) |
| `app/team/actions.ts` | Team server actions (both company types): `inviteColleague` (sends email), `setMemberRoles`, `setMemberActive`, `cancelInvitation` |
| `app/documents/[shareId]/[action]/route.ts` | Exporter view/download: access check, log, signed URL redirect |
| `app/audit/export/route.ts` | CSV export of the audit trail with the current filters |

> Naming note: "FPP" (finished pharmaceutical product) is the database/route name; the UI calls them **Products**.

---

## 5. `components/`: UI

### Layout and shared building blocks

| File | Purpose |
|---|---|
| `app-shell.tsx` | `AppShell` (header with logo, search, avatar menu; sidebar; main area), `AppShellSkeleton`, `PageHeader`, `Section`, `StatusBadge`, `EmptyRow`, `dateFormat` |
| `sidebar.tsx` | Left navigation (client): sections, counts, folder shortcuts, current-page highlighting, company card. Data comes from `lib/nav.ts` |
| `global-search.tsx` | Header search box (GET form to `/<type>/search`), Ctrl/⌘+K shortcut |
| `user-menu.tsx` | Avatar button and account popover (name, email, company, Sign out) |
| `logo.tsx` | CuraLex - DMS logo |
| `permissions.tsx` | `PermissionsProvider` and `useCan(permission)` for client components |
| `dialog.tsx` | Modal dialog on native `<dialog>` (`showModal`, Esc/click-outside close, `data-autofocus`) |
| `popover-support.ts` | Helpers for Popover API menus: trigger wiring, anchor-positioning fallback, browsers without popover support |
| `breadcrumbs.tsx` | Breadcrumb trail (used instead of "← back" links) |
| `overview.tsx` | Overview building blocks: `Kpi` tile, `Panel`, `Attention` list |
| `search-results.tsx` | Grouped search results and the `hit()` matcher |
| `access-badge.tsx` | `AccessUntil`: share expiry text/badge |
| `reason-field.tsx` | Required "reason" textarea for audited actions |
| `invite-form.tsx` | Company invitation form (admin and manufacturer "invite exporter") |
| `audit-view.tsx` | Audit trail table, filters, paging, CSV link (used by all three audit pages) |
| `team.tsx` | Team UI: `InviteColleagueButton`, `MembersTable` (edit roles, deactivate), `InvitationsTable` |
| `team-page.tsx` | Team page body shared by manufacturer and exporter routes |
| `google-sign-in-button.tsx` | Starts Google OAuth with `role` and `next` |
| `login/login-layout.tsx` | Login page layout (artwork panel), `ErrorAlert`, `GoogleNotice` |
| `login/role-login.tsx` | Manufacturer/exporter sign-in page body and error messages |

### Manufacturer (`components/manufacturer/`)

| File | Purpose |
|---|---|
| `file-row.tsx` | One document row: select checkbox, name (opens details), type, product, version picker, expiry badge, shared-with avatars, upload/download icons, ⋯ menu, inline version history |
| `folder-row.tsx` | Folder row with link and delete menu |
| `document-filters.tsx` | Filter toolbar (search, type, product, expiry); writes filters to the URL |
| `document-panel.tsx` | Details panel: Details / Versions / Access / Activity tabs, Share, New version, Edit details |
| `details-dialog.tsx` | "Edit details" dialog (type, product, market, issuer, reference, dates) |
| `exporter-avatars.tsx` | Exporter initials stack; `initialsOf`, `toneFor` (stable colour per company) |
| `upload.tsx` | Upload button (multi-file, or single "new version"); reserve → upload → complete |
| `new-folder.tsx` | Inline "New folder" form |
| `selection.ts` | Cross-folder selection store (`useSelection`) and the "share with this exporter" target (`useShareTarget`) |
| `selection-bar.tsx` | Floating bar when files are selected: Clear, Delete, Share → |
| `share-target.tsx` | Banner when choosing files for a specific exporter (`?to=`) |
| `share-form.tsx` | Share page form: recipient (existing or new exporter), per-file duration |
| `shares-table.tsx` | Shares on an exporter's page: duration menu, revoke (single/bulk/all) with reason, activity |
| `delete-dialog.tsx` | Delete confirmation with impact counts and reason |
| `remove-exporter.tsx` | `ExporterMenu`: remove exporter with impact and reason |
| `invite-exporter-dialog.tsx` | "Invite exporter" button and dialog |
| `row-menu.tsx` | ⋯ menu (Popover API, keyboard support) used by rows |
| `icons.tsx` | Small inline SVG icons (file, folder, upload, download) |

### Exporter (`components/exporter/`)

| File | Purpose |
|---|---|
| `docs-table.tsx` | Shared-documents table: type, version ("Superseded by vN"), expiry, access until, View/Download, remove from product |
| `fpp-controls.tsx` | Product controls: `NewFppButton`, `FppMenu` (edit details, delete), `AddManufacturerButton`, `ManufacturerMenu` (change role, remove), `AddDocumentsButton` |

---

## 6. `lib/`: data access and helpers

Files importing `"server-only"` can't be used in client components; their `*-shared.ts` siblings hold the client-safe types and pure helpers.

| File | Purpose |
|---|---|
| `account.ts` | `getAccount()` (cached per request, via `my_account()`), `requireAccount(area)` page guard, `requirePermission()`, `can()`, `homeFor()`, `ORG_TYPE_LABEL` |
| `roles.ts` | `Permission` type, role labels/descriptions per company type, `roleLabel()` |
| `nav.ts` | Sidebar sections and counts for the current user (`getNavSections`) |
| `documents.ts` | Server loaders: `getFolders`, `getDocuments(folder | null | "all")` (details, ready versions, live shares), `getLiveShares` |
| `documents-shared.ts` | Client-safe: types (`DocumentWithVersions`, `DocDetails`, `DocShare`…), `DOC_TYPES`, `docType()`, `expiryBadge()`, `daysUntil()`, `formatDate()`, `todayInIndia()`, `requestTime()`, `folderTrail()`, `formatBytes()`, `DURATIONS`, `isUuid()` |
| `exporter/data.ts` | Server loaders: `getSharedDocuments`, `getManufacturerOptions`, `getFpps`, `getFpp` |
| `exporter/shared.ts` | Client-safe exporter types (`SharedDoc`, `FppRole`…), `FPP_ROLES`, `isExpiringSoon` |
| `audit.ts` | Audit labels (`ACTION_LABEL`), filter categories, `parseFilters`, `getAuditEntries` (with setup-error handling), `describeChange`, `formatUtc` |
| `audit-reason.ts` | `withReason(client, reason)`: attaches the base64 `x-audit-reason` header |
| `email/resend.ts` | `sendEmail()`: Resend REST call (no SDK); "not configured" when `RESEND_API_KEY` is missing |
| `email/invite.ts` | Email templates (HTML + text): company invitation, "you've been added", colleague invitation |
| `email/send-invite.ts` | `sendInviteEmail()`: builds the right template and sends it; returns an `EmailStatus` the UI shows |
| `site-url.ts` | Absolute site URL for links in emails (`NEXT_PUBLIC_SITE_URL` or request host) |
| `supabase/server.ts` | Supabase client for server components/actions (user's cookies) |
| `supabase/client.ts` | Browser Supabase client (uploads, signed downloads for manufacturers) |
| `supabase/proxy.ts` | `updateSession()` used by `proxy.ts` |
| `supabase/admin.ts` | **Service-role** client, server-only: used only for signed URLs after an access check and for Storage deletes after a database delete. Never use it to read data on behalf of a user |

---

## 7. `supabase/`: database

| Path | Purpose |
|---|---|
| `supabase/config.toml` | Local Supabase stack settings (`supabase start`) |
| `supabase/migrations/*.sql` | The schema, run in filename order. Each file is one feature: companies & invitations → admin guard → documents & shares → delete → exporter access → products → remove exporter → audit trail → roles → document details |

Everything about tables, functions, policies and triggers is in [`db-schema.md`](./db-schema.md). To change the database, **add a new migration** (never edit an applied one), then update `db-schema.md` and add tests in `tests/db/`.

---

## 8. `tests/`

| Path | Purpose |
|---|---|
| `tests/README.md` | How to run and add tests |
| `tests/db/lib.mjs` | Shared setup: reads the local Supabase URL/keys, refuses non-local URLs, service-role client for setup, random tag |
| `tests/db/run.mjs` | Runs all suites (`pnpm test:db [filter]`), prints totals, sets the exit code |
| `tests/db/01-…07-*.test.mjs` | Permission/behaviour suites: documents & sharing, exporter access, products, remove exporter, audit trail, roles, document details |
| `tests/e2e/browser.mjs` | Minimal headless-Chrome driver over the DevTools protocol |
| `tests/e2e/seed.mjs` | Seeds 2 manufacturers, 1 exporter, 5 shared files, 1 product; saves sessions |
| `tests/e2e/smoke.test.mjs` | Browser smoke test (overview, sidebar, documents, filters, panel, search, menus, dialogs, secure download) |
| `tests/e2e/run.mjs` | Seed → build → start on port 3125 → smoke test → stop (`pnpm test:e2e`) |

---

## 9. `docs/`

| File | Purpose |
|---|---|
| `how-the-app-works.md` | Features, screens, flows, architecture, setup and deployment |
| `codebase-guide.md` | This file |
| `db-schema.md` | Full data model and SQL function reference; mapping to the planned Spring Boot rebuild |
| `roles-and-permissions.md` | Roles based on Revised Schedule M and the permission matrix |
| `compliance-gap-assessment.md` | CSV / GxP / Part 11 / Annex 11 / GAMP 5 / ALCOA+ gap analysis and workstreams |
| `not-built-yet.md` | Everything planned but not built, with sizes and suggested order |
| `agents/*.md` | Configuration for AI agent skills (issue tracker, triage labels, domain docs) |

---

## 10. Root config files

| File | Purpose |
|---|---|
| `package.json` | Scripts: `dev`, `build`, `start`, `lint`, `test`, `test:db`, `test:e2e` |
| `next.config.ts` | Next.js config (`cacheComponents` enabled) |
| `proxy.ts` | Session refresh for every non-static request |
| `tsconfig.json` | TypeScript (strict), `@/*` path alias to the repo root |
| `eslint.config.mjs` | ESLint (Next core-web-vitals + TypeScript); ignores build output and e2e state |
| `.env.example` | Required environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `NEXT_PUBLIC_SITE_URL` |
| `AGENTS.md` | Notes for AI coding agents (Next.js 16 differences, agent-skill config) |
| `pnpm-workspace.yaml` | pnpm settings (ignored build scripts), not a monorepo |

---

## 11. "Where do I change…?"

| I want to… | Look at |
|---|---|
| Add a page to a workspace | New `app/<area>/<route>/page.tsx` (copy the Suspense + `requireAccount` pattern), add it to `lib/nav.ts` |
| Change who may do something | Role→permission map in the latest roles migration (`_roles_for`, via a new migration) **and** `lib/roles.ts`; UI gating via `useCan` / `can` |
| Add a new write operation | New SQL function in a migration (call `_require_permission` first; `_require_reason` if audited with reason) → server action in the area's `actions.ts` with error messages → client component → test in `tests/db/` |
| Change an error message | The `ERRORS` map in the relevant `actions.ts` |
| Change the documents table or details panel | `components/manufacturer/file-row.tsx`, `document-panel.tsx`, `app/manufacturer/documents/page.tsx` |
| Change the Overview | `app/manufacturer/page.tsx`, `app/exporter/page.tsx`, `components/overview.tsx` |
| Change the sidebar or header | `lib/nav.ts`, `components/sidebar.tsx`, `components/app-shell.tsx`, `components/user-menu.tsx` |
| Change styles / design tokens | `app/globals.css` (Lumo tokens and component classes) |
| Change an email | `lib/email/invite.ts` (templates), `lib/email/send-invite.ts` (which template) |
| Add an audit action label | `_audit_trigger()` in a new migration and `ACTION_LABEL`/`CATEGORIES` in `lib/audit.ts` |
| Change how exporters open documents | `app/documents/[shareId]/[action]/route.ts` and `record_document_access()` |
| Change login behaviour | `app/auth/callback/route.ts`, `components/login/*`, `app/login/*` |

---

## 12. Conventions and gotchas

- **Next.js 16 is different** from older versions: `proxy.ts` replaces middleware; with `cacheComponents`, request-time data (cookies, `searchParams`, `Date.now()`) must be read inside a `<Suspense>` boundary, which is why every page is `Suspense` + an async inner component. Read `node_modules/next/dist/docs/` before using unfamiliar APIs.
- **Server actions must be `export async function`** (not `const` arrows), or the build fails.
- **After a mutation, call `refresh()`** (`next/cache`) in the server action, or `router.refresh()` on the client.
- **Never write to tables directly** from the app; add or use a SQL function. Never use the service-role client to read data for a user.
- **SQL functions are granted to `anon, authenticated`** and check the caller themselves; never `revoke execute` (the local Postgres image crashes on "permission denied for function").
- **Client vs server modules:** anything importing `server-only` can't be imported by a `"use client"` file; put shared types/helpers in a `*-shared.ts` file. Constants exported from a `"use client"` file arrive on the server as client references, not values.
- **Hidden pages stay mounted:** Next keeps recently visited pages in the DOM (hidden), so tests and DOM queries must target visible elements.
- **Dates:** expiry dates are calendar dates compared with `todayInIndia()`; timestamps are shown in IST, the audit trail in UTC.
- **Folder names** are displayed with a trailing "/" (`Quality/`).
- **Menus and dialogs** use the Popover API and native `<dialog>`; follow the existing `row-menu.tsx` / `dialog.tsx` patterns for keyboard support and focus.
- **Before committing:** `pnpm build`, `pnpm lint`, `npx tsc --noEmit`, and `pnpm test` (with `supabase start`).
