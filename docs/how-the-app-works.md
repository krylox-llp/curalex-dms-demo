# How CuraLex - DMS works

**Audience:** product owners, developers, QA and anyone onboarding to the project
**Describes:** the code at 2026-11-28 (migrations up to `20261128000000_document_details.sql`)
**Related:** [`db-schema.md`](./db-schema.md) (full data model), [`compliance-gap-assessment.md`](./compliance-gap-assessment.md)

---

## Contents

1. [What the app is for](#1-what-the-app-is-for)
2. [Who uses it](#2-who-uses-it)
3. [Signing in and invitations](#3-signing-in-and-invitations)
4. [The manufacturer workspace](#4-the-manufacturer-workspace)
5. [The exporter workspace](#5-the-exporter-workspace)
6. [The admin workspace](#6-the-admin-workspace)
7. [Audit trail](#7-audit-trail)
8. [Invitation emails](#8-invitation-emails)
9. [Architecture](#9-architecture)
10. [Data model](#10-data-model)
11. [Security model](#11-security-model)
12. [File storage](#12-file-storage)
13. [Key flows, step by step](#13-key-flows-step-by-step)
14. [User interface conventions](#14-user-interface-conventions)
15. [Project structure](#15-project-structure)
16. [Configuration](#16-configuration)
17. [Setting up, running and deploying](#17-setting-up-running-and-deploying)
18. [Testing](#18-testing)
19. [Known limitations and parked work](#19-known-limitations-and-parked-work)

---

## 1. What the app is for

Small and medium Indian pharma manufacturers (MSMEs) sell abroad through **merchant exporters**. Exporters need the manufacturer's export and quality documents: Certificates of Analysis (CoA), Certificates of Pharmaceutical Product (CoPP), WHO-GMP certificates, manufacturing licences, Free Sale Certificates and CTD/ACTD dossiers. They use them for buyer qualification, tenders, product registrations and renewals, and customs filings.

Today these documents travel by email and WhatsApp as loose PDFs. Once sent, the manufacturer loses control of them, nobody knows which version is current, and there is no record of who saw what.

**CuraLex - DMS** replaces that relay with a shared document platform:

- Manufacturers keep their documents in folders, with **versions**.
- They share specific versions with **exporters they invite**, for a **set duration**, and can **revoke** access at any time.
- Exporters see everything shared with them in one place and group it by **product** (finished pharmaceutical product, FPP), across all the manufacturers behind that product.
- Exporters can only open files through the app. **Every view and download is logged**, and the manufacturer sees that activity.
- Every change is recorded in a tamper-evident **audit trail**.

---

## 2. Who uses it

| Role | Who | What they do |
|---|---|---|
| **Platform admin** | CuraLex team (the app owner) | Invites manufacturer and exporter companies; sees all activity and the audit integrity check |
| **Manufacturer** | QA or regulatory staff at a manufacturing company | Uploads and versions documents, invites exporters, shares and revokes access, sees who opened what |
| **Exporter** | Export desk at a merchant exporter | Opens shared documents, groups them into products, sees which manufacturers share with them |

Rules:

- **Access is invite-only.** Nobody can create an account by themselves.
- A user belongs to **one company**, and each company is either a manufacturer or an exporter.
- A company can have **several users**, each with one or more **roles** (section 2.1). The company's first contact gets all "founder" roles; company admins invite colleagues from the **Team** tab.
- Platform admins are listed by email in the `platform_admins` table and are never members of a company.

### 2.1 Roles within a company

Roles follow Revised Schedule M (see [`roles-and-permissions.md`](./roles-and-permissions.md) for the full matrix and clause references).

| Company | Roles |
|---|---|
| Manufacturer | Company admin, Document author, QA approver, Document controller, Viewer |
| Exporter | Company admin, Regulatory / quality, Viewer |

- **Founder roles:** manufacturer contacts get Company admin + Document author + QA approver + Document controller; exporter contacts get Company admin + Regulatory / quality.
- **Every write function checks a permission** in the database (`has_permission()`), e.g. upload needs `documents.edit` (Document author), share needs `sharing.share` (Document controller), delete needs `documents.delete` (QA approver), exporter downloads need `documents.download` (not Viewer).
- **The UI hides what a user can't do** (buttons, menus, tabs, pages). Permissions come from `my_account()` and are passed to client components through `PermissionsProvider` / `useCan()`.
- **Team tab** (Company admin): invite colleagues with roles (emailed), edit roles, deactivate / reactivate users (history kept), cancel invitations. A company always keeps at least one active admin; you can't deactivate yourself.
- **Deactivated users** can't sign in (they see "Your access … has been deactivated").
- Role changes, additions and deactivations are recorded in the audit trail.

---

## 3. Signing in and invitations

### 3.1 Login pages

| Page | Purpose |
|---|---|
| `/login` | Chooser: "Sign in as Manufacturer" or "Exporter", plus a small "CuraLex team sign in" link for admins |
| `/login/manufacturer` | Manufacturer sign-in (Google) |
| `/login/exporter` | Exporter sign-in (Google) |

Sign-in uses **Google OAuth through Supabase Auth**. There are no passwords in the app.

### 3.2 What happens on sign-in

1. The user clicks **Continue with Google**. Supabase redirects to Google and back to `/auth/callback?code=…&role=…`.
2. The callback exchanges the code for a session, then calls the database function `accept_invitation()`:
   - If the user is already a member of a company, nothing changes.
   - Otherwise, it looks for a **pending invitation for the user's confirmed email** and makes them a member of that company.
3. The callback works out where the user belongs:
   - **Admin** → `/admin`
   - **Manufacturer** → `/manufacturer`
   - **Exporter** → `/exporter`
   - **Not invited** → signed out again and returned to the login page with "This Google account hasn't been invited…"
4. If the user signed in on the **wrong role's page** (e.g. an exporter on `/login/manufacturer`), they are signed out and shown "This Google account is invited as an exporter. Use the exporter sign in."

### 3.3 Who invites whom

| Inviter | Can invite | Where |
|---|---|---|
| Platform admin | Manufacturers and exporters | `/admin` → Invite a company (company name, contact email, role) |
| Manufacturer | Exporters | Shared with → **Invite exporter** dialog, or while sharing files ("Invite a new exporter") |

If a manufacturer invites an email that already belongs to (or is invited to) an exporter on CuraLex, the manufacturer is **linked to that existing exporter**, not a duplicate. Admin emails can never be invited into a company.

### 3.4 Sessions and route protection

- `proxy.ts` (Next.js 16's replacement for middleware) refreshes the Supabase session on every request and sends signed-out users to the right login page (e.g. `/manufacturer` → `/login/manufacturer?next=/manufacturer`).
- Each workspace page calls `requireAccount("manufacturer" | "exporter" | "admin")` (`lib/account.ts`), which redirects anyone who doesn't belong there.
- The role and company come from the **database** (`organizations` and `memberships`), never from anything the user can edit.

---

## 4. The manufacturer workspace

**Layout (all workspaces):** a header with the CuraLex - DMS logo (links home), a **search box** (Ctrl/⌘+K) and the avatar menu (name, email, company, Sign out); below it a **left sidebar**: Overview, Documents (with counts and top-level folders), Shared with, and a **Company** section with Audit trail and Team (only for roles allowed to use them). On small screens the sidebar becomes a scrolling bar under the header.

### 4.0 Overview (`/manufacturer`)

- **Key figures:** controlled documents (and new versions in 30 days), active shares and exporters, documents **expiring within 30 days** (from recorded expiry dates), and exporter views/downloads in the last 7 days (roles with `activity.view`; otherwise the number of exporters).
- **Needs attention:** documents expired or expiring within 30 days, shares ending within 7 days, exporters holding an **older version** than the latest (with a one-click "Share vN"), and a nudge when documents have no type or details yet.
- **Recent exporter activity** (views and downloads) and an **Exporters** table (documents shared, last activity, next access end, status).

### 4.0.1 Document details

Each document can carry **type** (CoA, CoPP, GMP, licence, DMF, stability, BE study, specification, SOP, validation, ISO, other), **product**, **target market**, **issued by**, **reference/certificate number**, **issue date** and **expiry date**. They are edited in an **Edit details** dialog (Document author role, `set_document_details()`), apply to the document across versions (update the dates when a renewal is uploaded), and every change is in the audit trail as "File details updated" with old and new values. Exporters see the type, product and expiry date of documents shared with them.

### 4.0.2 Search (`/manufacturer/search`)

The header search finds documents (name, product, reference number, market, issuer, type), folders and exporters.

### 4.1 Documents (`/manufacturer/documents`)

- **Folders and files.** Folders can be nested; folder names show with a trailing "/" (e.g. `Quality/`). Breadcrumbs (Documents › Quality › CoA) appear inside a folder.
- **New folder** and **Upload files** (several at once, up to 50 MB each).
- **Versions.** Uploading a file whose name already exists in that folder (any letter case) creates the **next version**: v1, v2, v3… Each file row also has an **upload icon** to add a new version directly.
- **Version picker.** Each file row shows the latest version by default; a dropdown picks an older one.
- **Row actions:** upload new version, download, and a ⋯ menu with **Version history** (every version with download and delete), **Audit history** and **Delete file**.
- **Columns:** name, type, product, version, **expiry** (red badge within 30 days or expired, amber within 90), **shared with** (exporter initials) and actions.
- **Filters:** name/product/reference search, type, product and expiry (expired, ≤ 30 days, ≤ 90 days, no expiry date). Any filter searches **all folders** and shows each file's folder; filters live in the URL.
- **Details panel:** clicking a file name opens a panel on the right with tabs **Details** (all document details, Edit details), **Versions** (with download), **Access** (which exporters hold which version and until when, flagging older versions) and **Activity** (exporter views/downloads, link to the full audit history), plus **Share** and **New version** buttons.
- **Folder ⋯ menu:** Delete folder (and everything in it).
- **Selecting files to share.** Tick files in any folder and pick a version for each. The selection is kept while moving between folders, and a bar at the bottom shows "3 files selected · across folders · Clear · Delete · Share →".

### 4.2 Deleting

- Every delete opens a confirmation showing exactly what is affected (e.g. "deletes 'CoA.pdf' and all 3 versions"). If exporters currently have access, it warns how many will lose it.
- A **reason is mandatory**; it is stored in the audit trail.
- On delete:
  - All live shares of the affected versions are **revoked**.
  - The files are **removed from storage**.
  - The database rows are kept and marked deleted (`deleted_at`), so share history survives. Version numbers are never reused.
  - Deleting a file's only version deletes the file.
  - A name can be reused after deletion; the new file starts at v1.

> For GxP use this should become "retire" rather than physical deletion. See the compliance document, workstream 4.2.

### 4.3 Sharing (`/manufacturer/share`)

Reached from **Share →** in the selection bar.

1. **Access duration**, per file: 7 days, 30 days, 90 days, 6 months, 1 year or no expiry. An **Apply to all** shortcut sets every row at once; files can be removed from the list.
2. **Share with**: pick an **existing exporter**, or **invite a new exporter** (company name and POC email). A new exporter is invited and shared with in one step, and emailed (section 8).
3. Clicking **Share N files** goes to that exporter's page with a confirmation.

Re-sharing a version that is already shared with the same exporter updates its expiry instead of creating a duplicate.

### 4.4 Shared with (`/manufacturer/shared`)

A list of exporters connected to the manufacturer:

| Column | Meaning |
|---|---|
| Exporter | Company name and POC email |
| Status | Active (has signed in) or Invited |
| Shared files | Number of files shared and not revoked, or "Nothing shared" |
| Needs attention | "N expired" (red) and "N expiring soon" (amber, 7 days or fewer) |
| Last shared | Date of the most recent share |

- **Invite exporter** (header button) opens a dialog: company name and POC email.
- Each row's ⋯ menu has **Remove exporter** (section 4.6).

### 4.5 One exporter's page (`/manufacturer/shared/<exporter>`)

Breadcrumbs: Shared with › Tarangini Pharma Exports LLP.

- **Header:** name, email, status, **Share files** and a ⋯ menu (Remove exporter). If the exporter hasn't signed in yet, a note says the files will be waiting for them.
- **Table** of every file shared with them: file and folder, version, date shared, **Access until** (date plus badge: "30 days left", amber at 7 days or fewer, red "Expired", or "No expiry") and **Activity** from the access log (e.g. "1 download · 2 views, last 27 Nov, 05:22 pm", or "Not opened yet").
- **Row ⋯ menu:** "Access from today": 7 days … No expiry, then **Revoke access**.
- **Bulk actions:** tick rows to show "N selected · Clear · Revoke access"; the ⋯ at the top offers "Revoke all".
- Every revoke opens a confirmation with a **mandatory reason**.
- **Share files** opens Documents with a banner ("Select the files to share with Tarangini…"). The selection bar then reads "Share with Tarangini →", and the share page has that exporter preselected.

### 4.6 Removing an exporter

Remove exporter (with a mandatory reason):

1. Revokes every live share to that exporter.
2. Removes the manufacturer, and its documents, from the exporter's products.
3. Deletes the connection, so neither side lists the other any more.

Share history and the access log are kept. Re-inviting the same email reconnects the same exporter company.

---

## 5. The exporter workspace

Sidebar: **Overview | Products | Shared with me**, then Company: **Audit trail** (Company admin, Regulatory / quality) and **Team** (Company admin). Viewers can view documents in the browser but not download them or edit products.

### 5.0 Overview (`/exporter`)

- **Key figures:** products, documents received (and new this week), certificates expiring within 30 days (the manufacturers' expiry dates) and access ending within 30 days.
- **Product readiness:** each product with its manufacturers, how many attached documents are still available, what needs attention (no longer available, expired, expiring, access ending, newer version exists) and a status (Up to date / Check soon / Action needed / No documents). There is no per-market checklist of required documents yet.
- **Needs attention** and **Recently received** lists.
- Shared-document tables show **type**, **expiry** and **"Superseded by vN"** when the manufacturer has a newer version than the one shared.
- **Search** (`/exporter/search`) finds products, shared documents and manufacturers.

### 5.1 Products (`/exporter/products`)

A "product" is a **finished pharmaceutical product (FPP)** the exporter deals in, such as "Paracetamol 500 mg Tablets – Kenya". The list shows each product with its manufacturers, number of documents and what needs attention (expired, expiring soon, no longer shared).

**New product** asks for a name and optional details (target market, pack, registration number…).

### 5.2 A product (`/exporter/fpps/<product>`)

- **Add manufacturer** picks from the manufacturers who have added this exporter, with an optional **role**: Finished product manufacturer, API manufacturer, Excipient supplier, Packaging supplier or Other.
- **One section per manufacturer** (finished product first, then API, excipient, packaging, other):
  - Name, role badge and document count.
  - **Add documents**: tick from what that manufacturer has shared and isn't in the product yet.
  - ⋯ menu: change role, remove from product.
  - Document table: version, date shared, access badge, **View**, **Download**, and "Remove from product" in the row menu.
  - A warning if documents in the product are no longer shared (revoked or deleted by the manufacturer).
- ⋯ next to the title: **Edit product**, **Delete product**. Deleting removes only the grouping; documents stay under Shared with me.

Products **reference shares**; nothing is copied. If a manufacturer revokes access or a share expires, the product reflects it immediately. Manufacturers never see an exporter's products or which other manufacturers are in them.

### 5.3 Shared with me (`/exporter/shared`)

The manufacturers who have added this exporter, with file counts, expiry warnings and last-shared date. Clicking one (`/exporter/shared/<manufacturer>`) lists every document they share, with View and Download.

### 5.4 Opening a document

**View** (opens in a new tab) and **Download** go to `/documents/<share>/view` or `/download`:

1. The server calls `record_document_access()`, which checks the share belongs to this exporter, isn't revoked or expired, and the file isn't deleted.
2. It **logs the access** (`access_events`, and the audit trail).
3. It returns a **60-second signed storage URL**; the browser is redirected to it.

Anything else gets **403**. Exporters cannot read the storage bucket directly.

---

## 6. The admin workspace

Sidebar with **Companies** and **Audit trail**. The header shows "CuraLex - DMS · Admin".

- **Companies** (`/admin`): invite a company (company name, contact email, role) and see every company with role, contact, who invited it, invitation date and status (Active or Invited).
- **Audit trail** (`/admin/audit`): all activity across the platform, plus an **integrity check** that re-computes the audit hash chain ("Integrity check passed: N entries verified, hash chain intact.").

---

## 7. Audit trail

### 7.1 What is recorded

Every insert, update or delete on the regulated tables writes an entry automatically, via **database triggers**:

| Area | Examples of entries |
|---|---|
| Documents | Folder created / deleted, File created / deleted, Version uploaded / deleted |
| Sharing | Shared, Access duration changed, Access revoked |
| Access | Viewed, Downloaded (by exporters) |
| Companies & users | Company created, Invitation sent / accepted, User joined, Exporter connected / removed, Admin added / removed |
| Products | Product created / updated / deleted, Manufacturer added / removed / role changed, Document added / removed |

Each entry stores: database timestamp (`clock_timestamp()`), user ID and email, the user's company, the owning company and the related company, action, table, operation, record ID, document (for grouping), a snapshot label (e.g. "CoA.pdf v1 → Globex"), old and new values (JSON), changed fields, **reason**, and the hashes.

### 7.2 Reasons

- **Mandatory** for: deleting files, versions or folders; revoking shares; removing an exporter. The database refuses these with `reason_required` if no reason is sent.
- The app sends the reason as the request header `x-audit-reason`, base64-encoded so any language and characters survive HTTP. Use `withReason()` from `lib/audit-reason.ts` on the RPC call. The trigger reads it via PostgREST's `request.headers`.

### 7.3 Tamper evidence

- No one can write the table directly: there are no write policies, and `_audit_append()` refuses any call that doesn't come from a trigger.
- Triggers reject **UPDATE, DELETE and TRUNCATE for everyone**, including the database superuser.
- Each row stores `prev_hash` and `row_hash` = SHA-256 of the previous hash plus the row's content. `verify_audit_chain()` (admins only) recomputes the chain and reports the first broken row.

### 7.4 Who sees what

- **Admins:** everything.
- **Companies:** entries they own, or where they are the related party. An exporter sees shares and access involving them and their own product events; never a manufacturer's internal document activity.

### 7.5 Screens

- **Audit trail** page (sidebar) for manufacturers, exporters and admins, with a category filter (Documents, Sharing, Views & downloads, Companies & users, Products), search (file, user or reason), "Older entries" paging and **Export CSV**.
- **Per-document history:** a file's ⋯ → Audit history (`?document=<id>`).
- **CSV export** (`/audit/export`): full old and new values and hashes, UTF-8 with BOM, protected against spreadsheet formula injection.
- Times are shown in **UTC**.

---

## 8. Invitation emails

Sent through **Resend** (`lib/email/`), with no SDK dependency, from `hello@krylox.ai` by default.

| Trigger | Email |
|---|---|
| Admin invites a company | "The CuraLex team invited you to CuraLex - DMS" → button to `/login/manufacturer` or `/login/exporter` |
| Manufacturer invites an exporter | "Sarovan Lifesciences invited you to CuraLex - DMS" (names the inviting person) |
| …while sharing files | Same, plus "3 documents have been shared with you and will be waiting when you sign in." |
| Exporter already on CuraLex | "Sarovan … added you as an exporter on CuraLex - DMS" |

- Replies go to the inviter's email.
- User-provided text is HTML-escaped.
- If sending fails, the invitation is still created; the screen shows an amber notice with the reason and a **Copy link** fallback.

---

## 9. Architecture

```
Browser ── Next.js 16 (App Router, React 19, Vercel) ──┬── Supabase Auth (Google OAuth)
                                                      ├── Supabase Postgres (RLS, SQL functions, triggers)
                                                      ├── Supabase Storage (private bucket "documents")
                                                      └── Resend (invitation emails)
```

| Layer | Technology | Notes |
|---|---|---|
| Frontend / server | Next.js **16.4**, React **19.3**, TypeScript | App Router; `cacheComponents` on (request-time data inside `<Suspense>`); `proxy.ts` instead of middleware |
| Styling | Tailwind CSS 4 + Lumo-based tokens and classes in `app/globals.css` | Modelled on Vaadin's Lumo theme; font Inter |
| Auth | Supabase Auth with Google | `@supabase/ssr` cookies; sessions refreshed in `proxy.ts` |
| Database | Supabase Postgres 17 | Business rules live in SQL functions; row-level security for reads |
| Files | Supabase Storage | Private bucket; uploads direct from the browser to reserved paths; exporter access via short-lived signed URLs |
| Email | Resend REST API | `RESEND_API_KEY` (send-only key is enough) |

**Design principles**

1. **The database enforces the rules.** Clients only *read* through RLS. Every *write* goes through a `SECURITY DEFINER` SQL function that checks the caller (company, role, ownership) itself. Even a modified client can't bypass the rules.
2. **Server-only privileges.** The service-role key is used only on the server, and only *after* a database permission check: signed URLs for exporter access, and removing deleted files from storage.
3. **Everything is audited** by triggers, not by application code.

---

## 10. Data model

All tables are in the `public` schema (plus Supabase's `auth.users` and `storage.objects`).

### 10.1 Companies and access

| Table | Purpose |
|---|---|
| `organizations` | A company: `name`, `type` (`manufacturer` or `exporter`) |
| `memberships` | User → company (one company per user) |
| `invitations` | Email → company; `invited_by_org_id` set when a manufacturer invited; `accepted_at` / `accepted_by` |
| `org_relationships` | Which exporters a manufacturer works with (manufacturer ↔ exporter) |
| `platform_admins` | Admin emails (not readable by clients) |

### 10.2 Documents and sharing

| Table | Purpose |
|---|---|
| `folders` | Nested folders per manufacturer (`parent_id`), `deleted_at` |
| `documents` | One per file name in a folder; details (`doc_type`, `product`, `market`, `issued_by`, `reference_no`, `issue_date`, `expiry_date`); `deleted_at` |
| `document_versions` | v1, v2… per document: `storage_path`, `status` (`pending` or `ready`), size, MIME type, `deleted_at` |
| `document_shares` | Version → exporter: `expires_at` (null = no expiry), `revoked_at`; at most one live share per version and exporter |
| `access_events` | Exporter view or download of a share (append-only) |

### 10.3 Exporter products

| Table | Purpose |
|---|---|
| `fpps` | Exporter's products: `name`, `details` |
| `fpp_manufacturers` | Product → manufacturer, with optional `role` |
| `fpp_documents` | Product → share (references, not copies) |

### 10.4 Audit

| Table | Purpose |
|---|---|
| `audit_log` | Append-only, hash-chained audit trail (section 7) |

### 10.5 Main SQL functions (called by the app)

| Area | Functions |
|---|---|
| Account | `my_account`, `accept_invitation` |
| Invitations | `admin_invite_company`, `invite_exporter`, `remove_exporter` |
| Lists | `admin_list_companies`, `my_exporters`, `my_manufacturers`, `my_manufacturer_options`, `my_shared_documents` |
| Documents | `create_folder`, `reserve_upload`, `complete_upload`, `delete_impact`, `delete_documents`, `delete_version`, `delete_folder` |
| Sharing | `share_versions`, `set_share_duration`, `revoke_shares`, `record_document_access` |
| Products | `create_fpp`, `update_fpp`, `delete_fpp`, `add_fpp_manufacturer`, `remove_fpp_manufacturer`, `add_fpp_documents`, `remove_fpp_document` |
| Audit | `verify_audit_chain` (admin) |

Internal helpers start with `_` (e.g. `_delete_versions`, `_audit_append`). They are guarded so that calling them directly does nothing harmful.

---

## 11. Security model

| Concern | How it's handled |
|---|---|
| Who can sign in | Google identities with a pending invitation for their **confirmed** email; everyone else is signed out |
| Role and company | Stored server-side in `memberships` / `organizations`; not user-editable |
| Reads | Row-level security: each company sees its own rows and rows of companies it is connected to |
| Writes | Only through `SECURITY DEFINER` functions that check the caller; no table write policies |
| Uploads | Storage insert policy allows only the exact path reserved for that manufacturer by `reserve_upload()`; `complete_upload()` verifies the object exists |
| Manufacturer downloads | Storage read policy limited to the manufacturer's own top-level folder (its company ID) |
| Exporter downloads | Never direct; server route checks the share and logs, then a 60-second signed URL |
| Deleting stored files | Storage delete policy allows only files of versions the manufacturer has already marked deleted |
| Cross-company isolation | Manufacturers never see each other; exporters only see what is shared with them; products are private to the exporter |
| Admin emails | Can't be invited into a company |
| Audit integrity | Append-only plus hash chain (section 7.3) |

**Important implementation note:** the local Supabase Postgres build (`17.12.0.000`) **crashed** whenever Postgres raised "permission denied for function". Every function is therefore granted to `anon` and `authenticated` and checks the caller *inside* the function, instead of relying on `REVOKE EXECUTE`. Keep this pattern for new functions.

---

## 12. File storage

- **Bucket:** `documents` (private), 50 MB per file.
- **Layout:** mirrors the folder tree:

  ```
  <manufacturer company id>/<Folder>/<Sub folder>/<File name>/v<N><.ext>
  e.g. 9f3c…/Quality/CoA & Reports/CoA Paracetamol 500mg.pdf/v2.pdf
  ```

- Characters Supabase Storage doesn't allow in keys are replaced with `_` in the path; the database keeps the real display names.
- Every version of a file sits under the same `<File name>/` folder, using the document's stored name.
- If a path was used before by a deleted item, a short suffix keeps paths unique (e.g. `v1-3f9a2c1b.pdf`).

**Upload flow:** the file goes browser → Storage directly, so large files never pass through the app server.

1. `reserve_upload(folder, file name)` creates the document if it's new, plus a **pending** version, and returns its exact storage path.
2. The browser uploads the file to that path. Storage policy only allows pending paths of the caller's company.
3. `complete_upload(version, size, type)` checks the object exists and marks the version **ready**. Only ready versions are listed or shareable.

---

## 13. Key flows, step by step

### 13.1 Onboarding a manufacturer and an exporter

1. **Admin** → Companies → Invite a company ("Sarovan Lifesciences", contact email, Manufacturer). An invitation email is sent.
2. The manufacturer opens the link and signs in with Google using that email; they join Sarovan and land on Documents.
3. **Manufacturer** → Shared with → Invite exporter ("Tarangini Pharma Exports", POC email). An email is sent.
4. The exporter signs in at `/login/exporter`, joins Tarangini and sees Sarovan under Shared with me.

### 13.2 Sharing documents

1. **Manufacturer** uploads `CoA.pdf` (v1), later uploads it again (v2).
2. Ticks `CoA.pdf` (v2) and `WHO-GMP.pdf` → Share → 90 days and 1 year → Tarangini → Share.
3. **Exporter** sees both under Shared with me › Sarovan, adds them to the product "Paracetamol 500 mg Tablets", and opens one: the access is checked and logged.
4. **Manufacturer** sees "1 view, last …" in the Activity column, and the audit trail shows Shared / Viewed.

### 13.3 Revoking and expiry

- Revoke (with reason): the exporter immediately loses access. The share disappears from their lists; their product shows "1 document is no longer shared by Sarovan".
- Expiry: the share stays listed for the exporter as **Expired** with no View or Download; the manufacturer sees it in red and can extend it from the row menu.

### 13.4 Updating a document

Upload a new version (same name, or the upload icon on the row). Existing shares keep pointing to the **version that was shared**. To give an exporter the new version, share it; re-sharing updates the expiry of an existing share of the same version.

---

## 14. User interface conventions

- **Design system:** Vaadin **Lumo** look (tokens and classes in `app/globals.css`): `.btn`, `.btn-primary`, `.btn-tertiary`, `.btn-error`, `.btn-error-primary`, `.btn-sm`, `.btn-icon`, `.text-field`, `.field-label`, `.checkbox`, `.data-grid`, `.badge-*`, `.tabs` / `.tab`, `.overlay` / `.menu-item`, `.dialog`, `.notice-*`, `.card`. Font: **Inter**, with tabular figures in tables.
- **Pages** use `PageHeader` (optional breadcrumb, title, one-line description, one primary action).
- **Drill-down navigation** uses `Breadcrumbs` (Vaadin pattern), not "← Back" links.
- **Tables:** one toolbar (filter on the left, bulk actions only while rows are ticked), one-line truncated rows, status as badges, row actions in a ⋯ menu.
- **Menus:** native Popover API with CSS anchor positioning, keyboard support (arrow keys, Home/End, Escape, Tab) and fallbacks for older browsers (`components/popover-support.ts`).
- **Dialogs:** native `<dialog>` via `components/dialog.tsx`, labelled by a heading, closed with Esc or a click outside; destructive confirmations focus **Cancel** first.
- **Product name:** "CuraLex - DMS"; the logo reads "CuraLex | DMS".

---

## 15. Project structure

See [`codebase-guide.md`](./codebase-guide.md) for what every folder and file does, how requests flow, and "where do I change…?".

---

## 16. Configuration

| Variable | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | public | Supabase publishable (anon) key |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | Signed URLs for exporter access; never expose to the browser |
| `RESEND_API_KEY` | server only | Sending invitation emails |
| `RESEND_FROM_EMAIL` | server only | Sender; defaults to `CuraLex - DMS <hello@krylox.ai>` (domain must be verified in Resend) |
| `NEXT_PUBLIC_SITE_URL` | public | Base URL for links in emails (falls back to the request host) |

See `.env.example`.

**External setup:**

- **Google OAuth client:** audience **External** (not Internal, which blocks Gmail users), redirect URI `https://<project>.supabase.co/auth/v1/callback`.
- **Supabase:** Authentication → Providers → Google (client ID and secret); URL Configuration → Redirect URLs include `<site>/auth/callback`.
- **Resend:** verify the sending domain (krylox.ai).

---

## 17. Setting up, running and deploying

### 17.1 Database

Run the migrations in `supabase/migrations/` **in order** on the Supabase project (SQL editor, or `supabase link` + `supabase db push`):

1. `20261127000000_organizations_and_invitations.sql`
2. `20261127010000_admin_guard_and_grants.sql`
3. `20261127020000_documents_and_shares.sql` (also creates the storage bucket and policies)
4. `20261127030000_delete_documents.sql`
5. `20261127040000_exporter_access.sql`
6. `20261127050000_exporter_fpps.sql`
7. `20261127060000_remove_exporter.sql`
8. `20261127080000_audit_trail.sql`
9. `20261127090000_roles.sql` (existing users keep full access through founder roles)
10. `20261128000000_document_details.sql` (document details; without it the Documents and Overview pages show an "out of date" error)

Then add yourself as admin:

```sql
insert into public.platform_admins (email) values ('you@example.com');
```

If the API reports "Could not find the function … in the schema cache" after running migrations, run `notify pgrst, 'reload schema';`.

### 17.2 Local development

```bash
pnpm install
cp .env.example .env.local   # fill in values
pnpm dev                     # http://localhost:3000
```

Optional local Supabase (Docker): `supabase start`, then `supabase db reset` to apply all migrations to a fresh local database. `supabase/config.toml` is included.

### 17.3 Deploying (Vercel)

- Connect the GitHub repo; set the environment variables from section 16 in Project → Settings → Environment Variables.
- After deploying, hard-refresh once the deployment shows **Ready**. A stale or in-progress deployment can look unstyled.

---

## 18. Testing

Tests live in `tests/` and run against a **local Supabase stack** (see `tests/README.md`):

- `pnpm test:db`: SQL/API permission suites (about 205 checks): invitations, company isolation, uploads and storage, versioning, sharing, expiry, revocation, deletion, exporter access and logging, products, exporter removal, audit trail, roles and document details.
- `pnpm test:e2e`: seeds data, builds and starts the app and runs a headless-Chrome smoke test (overview, sidebar, documents, filters, details panel, search, menus, dialogs, secure download).

They are not in CI yet (compliance document, workstream 4.5).

Run `pnpm build`, `pnpm lint` and `npx tsc --noEmit` before committing.

---

## 19. Known limitations and parked work

| Item | Status |
|---|---|
| Rename folders and files | Parked in `git stash` ("Rename folders/files (WIP: migration only)") |
| Product page with a manufacturer table and a separate page per manufacturer | Parked in `git stash` ("FPP: per-manufacturer pages"); conflicts expected with the "Products" wording when restored |
| Approval workflow and e-signatures | Roles exist (incl. QA approver); the Draft → Approved lifecycle, approvals and e-signatures are not built yet (workstream 4.3) |
| Physical deletion of files | To become "retire" with retention rules (workstream 4.2) |
| View-only vs download-allowed shares | Every live share allows both today |
| Watermarking downloads | Not built |
| Document requests from exporters | Not built (idea: exporter requests specific documents per product with due dates) |
| Electronic signatures, session timeout, MFA, inspector exports | Not built (workstreams 4.3–4.4) |
| Regulatory validation | Not done; the app is **not** Part 11 / Annex 11 compliant yet (see compliance document) |
