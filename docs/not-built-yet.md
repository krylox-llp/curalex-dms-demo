# CuraLex - DMS: Not built yet

**As of:** 2026-11-28 (code up to migration `20261128000000_document_details.sql`)
**Related:** [`roles-and-permissions.md`](./roles-and-permissions.md), [`compliance-gap-assessment.md`](./compliance-gap-assessment.md), [`how-the-app-works.md`](./how-the-app-works.md)

Everything discussed or planned that does not exist in the app yet, grouped by area. "Basis" points to where the requirement or decision comes from.

---

## 1. Document control (Schedule M / GxP)

| Item | What it means | Basis | Size |
|---|---|---|---|
| **Document lifecycle** | Versions move Draft → Submitted → **Approved (effective)** → Superseded / Retired; only Approved versions can be shared | Schedule M §17.2.2, §17.2.4; roles doc §6 | L |
| **QA approval with e-signature** | QA approver approves or rejects a version; signature with printed name, date/time, meaning, re-authentication, bound to the file's SHA-256; approval queue | Schedule M §17.2.2, §17.3.9; Part 11 Subpart C; compliance 4.3 | L |
| **Maker-checker for approvals** | The uploader of a version cannot approve it (enforced in the database) | Schedule M §20.6, §11.3.1 | S (with approvals) |
| **"Superseded" badges for exporters** | When a newer approved version exists, exporters see "Superseded by vN" on the old one; manufacturer decides whether to revoke and share the new one | Schedule M §17.2.4; roles doc decision 2 | S |
| **Retire instead of delete** | Approved records are retired (kept, hidden by default) by a QA approver with reason; only never-approved drafts can be deleted by their author; files no longer removed from storage | Schedule M §17.2.6–17.2.7; compliance 4.2 | M |
| **Retention rules and legal hold** | Retention period per document type (at least 1 year after product expiry); legal hold; controlled destruction after retention | Schedule M §17.2.7; compliance 4.2 | M |
| **Server-side file hashing** | SHA-256 of each uploaded file computed and stored by the server (needed for signatures and integrity checks) | Annex 11 §5; compliance 4.3 | S |

## 2. Sharing and access

| Item | What it means | Basis | Size |
|---|---|---|---|
| **Per-share view-only vs download** | Manufacturer chooses per share whether the exporter may download or only view in the browser | Sharing design; roles doc §3 | S–M |
| **Watermarking** | Downloaded/viewed files stamped with exporter company, user email and time, for traceability of leaks | Sharing design | M |
| **In-browser viewer** | View documents inside the app (needed for genuinely view-only shares) instead of the raw file in a new tab | Sharing design | M |
| **Document requests** | Exporter requests specific documents from a manufacturer for a product (e.g. CoPP for Kenya, due date); tracked as Requested / Shared / Overdue | Discussed for product pages | M |
| **Expiry reminders** | Email/in-app reminders before shares expire and before CoPP / GMP certificates expire (expiry dates and on-screen warnings exist; emails don't) | "Coming next" cards; login page feature list | M |
| **Notifications** | Bell in the header for exporter downloads, shares ending, document requests | Layout mockup | M |
| **Per-market document checklists** | Required documents per product and market, so "Product readiness" can say "Ready to file" / "Missing: stability data" | Layout mockup | M |
| **Restrict exporter users by product / manufacturer** | Limit which products or manufacturers an exporter user can see | Roles doc decision 5 (not now) | M |

## 3. Users, sessions and security

| Item | What it means | Basis | Size |
|---|---|---|---|
| **Session inactivity timeout** | Sign users out after idle time (e.g. 15–30 min); Supabase session time-box / inactivity timeout (Supabase Pro) | Part 11 §11.10(d); compliance 4.4 | S |
| **MFA** | TOTP via Supabase Auth; required for signing and admin actions | Part 11 §11.300; compliance 4.4 | M |
| **Sign-in events in the audit trail** | Successful / failed sign-ins mirrored into `audit_log` | Compliance 4.4 | S |
| **Periodic access reviews** | Admins periodically review members, roles and last sign-in and sign off; reminder emails | Annex 11 §12; compliance 4.4 | M |
| **Platform Support role** | Read-only CuraLex staff role (companies, users, audit metadata; no document access) | Roles doc decision 6 (later) | S |
| **Suspend a company** | Platform admin can suspend a whole company | Roles doc §4 | S |

## 4. Audit trail follow-ups

| Item | What it means | Basis | Size |
|---|---|---|---|
| **Exporter audit trail reframed** | Present exporters' audit as "Received documents history / Activity" (or only per-document History) instead of a compliance-style trail; *decision pending* | Discussion | S |
| **Reasons for other changes** | Decide with QA whether duration changes, renames etc. also need mandatory reasons | Compliance 4.1 | S |
| **Audit trail review procedure** | Periodic review and sign-off of the audit trail; audit-data retention period | Annex 11 §9; compliance 4.1 | S |

## 5. Inspection and records

| Item | What it means | Basis | Size |
|---|---|---|---|
| **Inspector export / record package** | Per-document package (versions, signatures, audit trail, share and access history) as readable PDF + CSV/JSON | Part 11 §11.10(b); Annex 11 §8; compliance 4.4 | M |
| **Read-only inspector access** | Time-limited, read-only role for auditors / inspectors | Compliance 4.4 | S |
| **Printable records** | Print views including audit / signature information | Annex 11 §8 | S |

## 6. Parked work (in `git stash`)

| Stash | Contents | Notes |
|---|---|---|
| "Rename folders/files (WIP: migration only)" | Migration with stored `storage_name`, `rename_folder` / `rename_document`, ownership checks | Still to do: server action that moves storage objects with rollback, Rename in ⋯ menus, tests |
| "FPP: per-manufacturer pages" | Product page as a table of manufacturers + a separate page per manufacturer | Conflicts expected with the "Products" wording and permission gating; merge on restore |

## 7. Validation and operations (mostly non-code)

| Item | What it means | Basis |
|---|---|---|
| **Intended-use decision** | System of record vs controlled distribution channel; sets validation scope | Compliance §1 |
| **Validation package** | Validation plan, URS, risk assessment, supplier assessments (Supabase, Vercel, Google, Resend), FS/DS, traceability matrix, IQ/OQ/PQ, summary report | CSV / GAMP 5 / V-Model; Schedule M §20.1–20.2; compliance 4.5 |
| **SOPs and training** | User management, change control, backup/restore, incidents, e-signatures, periodic review; training records | Schedule M §20.5, §20.7–20.8; compliance 4.5 |
| **CI for the test suites** | Suites are now in `tests/` (`pnpm test`: ~190 database checks + browser smoke test). Still to do: run them in CI on every change, trace them to requirements, retain the output as evidence | Compliance 4.5 |
| **Environments** | Separate dev / test / prod Supabase projects; release tagging | Annex 11 §10; Schedule M §20.8 |
| **Backup and restore** | Point-in-time recovery (Supabase Pro add-on) and a tested restore procedure | Schedule M §20.9; Annex 11 §7 |
| **Hosted Postgres check** | Verify the "permission denied for function" crash seen on local `supabase/postgres 17.12.0.000` on the hosted version; record as a deviation | Compliance §3.3 |

## 8. Setup still to complete outside the code

| Item | Where |
|---|---|
| Google OAuth app set to **External** audience (Internal blocks Gmail users) | Google Cloud Console |
| Verify **krylox.ai** as a sending domain | Resend |
| Set `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `NEXT_PUBLIC_SITE_URL` (and optionally `RESEND_FROM_EMAIL`) | Vercel environment variables |
| Run any migrations not yet applied (latest: `20261127090000_roles.sql`) | Supabase SQL editor / `supabase db push` |

---

### Suggested order

1. Document lifecycle + QA approval + maker-checker (+ server-side hashing), so that only approved versions are shareable.
2. Retire instead of delete + retention.
3. Superseded badges and per-share view-only.
4. Session timeout + MFA + sign-in events.
5. Inspector export.
6. Validation package and CI for the test suites (in parallel throughout).

Sizes: S ≈ up to 2 days, M ≈ 3–5 days, L ≈ 1–2 weeks (one developer with assistance; rough).
