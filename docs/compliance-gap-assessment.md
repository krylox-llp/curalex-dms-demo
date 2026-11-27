# CuraLex - DMS: Regulatory compliance gap assessment

**Scope:** CSV, GxP, 21 CFR Part 11, EU GMP Annex 11, GAMP 5, ALCOA+, Validation V-Model
**Status:** Draft for discussion, not a QA-approved document
**Prepared:** 2026-11-27, against the codebase at that date (migrations up to `20261127060000_remove_exporter.sql`)

---

## 1. Summary

**CuraLex - DMS is not currently compliant**, and compliance cannot be achieved by software alone. 21 CFR Part 11 and EU Annex 11 compliance is a property of a *validated computerised system operated under controlled procedures* by a regulated company. CSV, GAMP 5 and the V-Model describe *how* a system is validated. They are not product features.

What the product can do is:

1. Provide the **technical controls** the regulations expect (audit trail, electronic signatures, access control, record retention, data integrity).
2. Provide **validation evidence** (specifications, risk assessment, traceability, test evidence) that customers and QA can rely on.

### Decision needed first: intended use

| Intended use | Consequence |
|---|---|
| **Controlled distribution channel**: copies of documents whose *originals* live in the manufacturer's QMS | Lighter validation scope; focus on access control, integrity of transfer, audit of access |
| **System of record** for CoAs, CoPPs, GMP certificates, dossiers | Full Part 11 / Annex 11 controls apply (everything in section 3) |

This decision sets the URS, the GAMP category rationale, the risk assessment and the validation effort.

---

## 2. What exists today (relevant controls)

| Area | Implemented |
|---|---|
| Identity | Unique users via Google sign-in (Supabase Auth); invite-only; email must be confirmed |
| Company roles | Platform admin, manufacturer, exporter (company-level); role comes from server-side invitation |
| Access control | Postgres row-level security; all writes through `SECURITY DEFINER` functions that check the caller; private storage bucket |
| Document versioning | Every upload of an existing name creates a new version (v1, v2, …); version numbers never reused |
| Sharing | Version-specific shares with expiry, revocation (single, selected, all), remove-exporter |
| Exporter access | Only via server route with a live-share check; 60-second signed URLs; exporters cannot read storage directly |
| Access log | `access_events` (append-only, RLS read-only): who viewed/downloaded which shared version, when |
| Deletion | Tombstones (`deleted_at`) in DB; shares revoked; **files physically removed from storage** |
| Timestamps | Database server time (`now()`), UTC |
| Tests | Automated SQL/API permission tests (~110 checks) and browser end-to-end runs against a local Supabase stack, not under formal change control |

---

## 3. Gap analysis

### 3.1 21 CFR Part 11 / EU Annex 11 controls

| Requirement | Reference | Status | Gap |
|---|---|---|---|
| Audit trail of record creation, modification, deletion: who, what, when, (why) | Part 11 §11.10(e); Annex 11 §9 | ✓ Implemented (pending validation) | `audit_log` covers all GxP tables and access events with old/new values; reasons mandatory for delete, revoke and remove-exporter (see 4.1). Still needs validation evidence and a QA decision on reasons for other changes |
| Audit trail tamper-evident, retained, reviewable | §11.10(e); Annex 11 §9 | ✓ / ⚠ | Append-only (writes blocked for all roles), SHA-256 hash chain with admin integrity check, review UI and CSV export. Retention period and periodic audit-trail review procedure still to be defined |
| Electronic signatures: printed name, date/time, meaning | §11.50 | ✗ | No e-signatures |
| Signature/record linking | §11.70 | ✗ | No binding of signature to a record hash |
| Two distinct identification components; re-authentication at signing | §11.200, §11.300 | ✗ | Google SSO only; no signing re-auth, no MFA requirement |
| Unique user accounts; no shared accounts | §11.100(a), §11.300 | ✓ / ⚠ | Unique Google identities; no policy against shared mailboxes; no periodic access review |
| Authority checks (who may sign, approve, alter) | §11.10(g); Annex 11 §12 | ⚠ Partial | Company-level roles only; no intra-company roles (author, reviewer, QA approver, viewer); one user per company today |
| Operational/sequence checks (workflow) | §11.10(f) | ✗ | No draft → review → approve → effective → obsolete lifecycle |
| Accurate and complete copies for inspection (human-readable and electronic) | §11.10(b); Annex 11 §8 | ✗ | No inspector export / record package |
| Record protection and retrieval throughout retention period | §11.10(c); Annex 11 §7, §17 | ✗ | Physical file deletion; no retention policies, legal hold, archive; backup/restore not tested |
| Limiting system access to authorised individuals | §11.10(d); Annex 11 §12 | ✓ / ⚠ | Invite-only + RLS; no session inactivity timeout; no account deactivation workflow |
| Device / location checks where appropriate | §11.10(h) | ✗ (likely N/A) | Not assessed |
| Training of users, developers | §11.10(i); Annex 11 §2 | ✗ | No training records |
| Written policies for e-signature accountability | §11.10(j) | ✗ | No SOP |
| System documentation control | §11.10(k) | ✗ | No controlled documentation |
| Certification to FDA of e-signature use | §11.100(c) | ✗ | Customer obligation; system must support it |
| Risk management across the lifecycle | Annex 11 §1 | ✗ | No documented risk assessment |
| Suppliers and service providers | Annex 11 §3 | ✗ | No supplier assessments/agreements for Supabase, Vercel, Google, Resend |
| Data accuracy checks; data transfer integrity | Annex 11 §5, §6 | ⚠ | No checksum (hash) of files at upload/download |
| Printouts | Annex 11 §8 | ✗ | No printable records with audit info |
| Change and configuration management | Annex 11 §10 | ✗ | Git history exists; no formal change control, release approval, environments |
| Periodic evaluation | Annex 11 §11 | ✗ | No process |
| Security | Annex 11 §12 | ⚠ | RLS, signed URLs, least-privilege keys; no formal security assessment, pen test, incident process |
| Incident management | Annex 11 §13 | ✗ | No process |
| Batch release | Annex 11 §15 | N/A | Not a batch release system |
| Business continuity | Annex 11 §16 | ✗ | No documented BCP / DR; PITR not enabled |

### 3.2 ALCOA+

| Principle | Status | Notes |
|---|---|---|
| **Attributable** | ⚠ | `uploaded_by`, `created_by`, access log user/email exist; changes are not all attributed (no full audit trail) |
| **Legible** | ✓ | Files stored as uploaded; metadata readable |
| **Contemporaneous** | ✓ / ⚠ | DB server timestamps; no clock-sync evidence documented |
| **Original** | ✗ | Deleting a file removes the stored original |
| **Accurate** | ⚠ | No hash verification of stored files |
| **Complete** | ✗ | Deletions remove content; incomplete audit trail |
| **Consistent** | ⚠ | Ordered versions and timestamps; no sequence/workflow controls |
| **Enduring** | ✗ | Physical deletion; no retention/archival policy |
| **Available** | ⚠ | Available online; no inspector export; backup/restore untested |

### 3.3 CSV / GAMP 5 / V-Model

| Deliverable | Status |
|---|---|
| Intended use / GxP impact assessment | ✗ |
| GAMP category rationale (likely **Category 5**, custom application; Supabase/Vercel/Google as infrastructure) | ✗ |
| Validation Plan | ✗ |
| User Requirements Specification (URS) | ✗ |
| Risk assessment (e.g. FMEA per requirement) | ✗ |
| Supplier assessments (SOC 2 / ISO 27001 reports, DPAs, SLAs, data residency, India DPDP) | ✗ |
| Functional / Design / Configuration Specifications | ✗ |
| Traceability matrix (URS → FS/DS → test) | ✗ |
| IQ (environment installation/configuration) | ✗ |
| OQ (functional test scripts with evidence) | ✗ (automated tests exist; can become OQ evidence under change control) |
| PQ / UAT against URS | ✗ |
| Validation Summary Report | ✗ |
| SOPs: user management, change control, backup/restore, incident/deviation, e-signatures, periodic review, training | ✗ |
| Separate dev / test / prod environments | ✗ |

**Known infrastructure observation (record as deviation):** the local `supabase/postgres 17.12.0.000` image segfaulted on any "permission denied for function" error. The code avoids that path (functions granted to `anon`/`authenticated` and checking callers internally). Verify behaviour on the hosted Supabase version.

---

## 4. Implementation plan (the five workstreams)

> Order per the V-Model: decide intended use and write the URS **first**; build items 1–4 under change control; execute IQ/OQ/PQ last. Effort figures are rough, for one developer plus assistance.

### 4.1 Full audit trail (≈ 1–2 weeks): **IMPLEMENTED 2026-11-27** (`20261127080000_audit_trail.sql`)

> Done: append-only `audit_log` via triggers on all GxP tables (incl. access events); old/new values + changed fields; SHA-256 hash chain + `verify_audit_chain()`; UPDATE/DELETE/TRUNCATE blocked for everyone; mandatory reason for delete, revoke and remove-exporter (base64 `x-audit-reason` header); Audit trail pages (manufacturer, exporter, admin with integrity check), per-document history, CSV export. Remaining: reasons for other changes if QA requires; audit review/sign-off workflow; retention of audit data defined in the URS.

- **DB:** append-only `audit_log` (`at` from DB clock, actor user/email/company, action, entity type/id, `old`/`new` JSONB, `reason`, request metadata).
- Populated by **triggers** on all GxP tables (documents, versions, folders, shares, products/FPPs, memberships, invitations, relationships). All writes already go through functions, so nothing bypasses it.
- **Mandatory reason** parameter for critical actions (retire/delete, revoke, duration change, remove exporter, rename); passed via function argument / `set_config` and captured by the trigger.
- **Tamper evidence:** block UPDATE/DELETE; each row stores `prev_hash` and `row_hash` (SHA-256 chain); verification function.
- **App:** reason field in confirmation dialogs; Audit trail views (per document, per exporter, company-wide) with filters; CSV/PDF export.
- **Decision:** which actions require a reason.

### 4.2 Retire instead of delete; retention (≈ 3–5 days)
- **DB:** lifecycle states (active, superseded, retired); keep files; remove the storage delete policy; `retention_policies` per document type; legal hold flag.
- **App:** "Delete" becomes "Retire"; retired items hidden by default ("Show retired"); permanent destruction only after retention, by an authorised role, with reason (optionally second approver), audited.
- **Decisions:** retention period per document type; whether destruction is ever allowed.

### 4.3 Intra-company roles, approval workflow, e-signatures (≈ 3–5 weeks)
- **Multiple users per company:** invite colleagues; member management; roles: company admin, author, reviewer, QA approver, viewer (manufacturer); admin, viewer (exporter). Rework memberships/invitations (today one member per company) and RLS.
- **Lifecycle:** Draft → In review → Approved (effective) → Superseded → Retired. Only approved versions shareable. Assigned reviewers/approvers; comments; reject with reason.
- **E-signatures (Part 11 Subpart C):** signature record (signer, printed name, timestamp, meaning: Authored/Reviewed/Approved, SHA-256 of the exact file); re-authentication at signing (fresh Google sign-in with recent auth time, or signing PIN + MFA; must satisfy §11.200 two components); signature manifestation in UI and exports.
- **File hashing:** compute SHA-256 server-side; move upload completion from the browser to a server route.
- **Non-code:** e-signature SOP; customers' §11.100(c) FDA certification.
- **Decisions:** role list; signing matrix; re-auth method; whether exporters ever sign.

### 4.4 Sessions, access reviews, inspector exports (≈ 1–2 weeks)
- **Sessions:** idle timeout (e.g. 15–30 min) in the app; Supabase inactivity timeout / time-boxed sessions (**Supabase Pro**).
- **Authentication:** optional/required TOTP MFA via Supabase Auth (aal2 for signing and admin actions); mirror sign-in and failed sign-in events into the audit trail.
- **Access reviews:** periodic review screen (members, roles, last sign-in) with signed attestation; reminder emails (Resend + pg_cron / Vercel Cron).
- **Offboarding:** deactivate users without deleting history.
- **Inspector exports:** per-document record package (versions, signatures, audit trail, share/access history) as human-readable PDF plus CSV/JSON; optional read-only, time-limited inspector role.

### 4.5 Validation package (≈ 4–8 weeks QA/CSV effort, in parallel)
- Owned by a QA/CSV specialist; drafts can be prepared with assistance.
- Intended use & GxP impact assessment → GAMP category → Validation Plan → **URS**.
- Risk assessment; supplier assessments (Supabase, Vercel, Google, Resend).
- FS/DS/configuration spec → **traceability matrix**.
- **IQ** (environment), **OQ** (test scripts + evidence; reuse automated tests under change control), **PQ/UAT** (against URS) → **Validation Summary Report**.
- Operational controls: dev/test/prod Supabase projects; git-based change control (reviewed PRs, tagged releases, CI with retained evidence); tested backup/restore (Supabase PITR add-on); monitoring; incident/deviation handling; periodic review; SOPs and training records.

**Rough total:** ~2–3 months to a validated release (items 4.1–4.4 ≈ 6–9 weeks of build; 4.5 in parallel).

---

## 5. Open decisions

1. Intended use: system of record vs controlled distribution channel.
2. Retention periods per document type; whether destruction is allowed.
3. Roles and signing matrix (who authors, reviews, approves, signs).
4. Re-authentication / MFA approach for signatures.
5. Supabase plan (Pro needed for session controls and PITR) and hosting region / data residency.
6. Which actions require a mandatory reason in the audit trail.

## 6. Suggested next step

Either (a) draft the **URS** and finalise this gap assessment with QA, or (b) start **4.1 audit trail**, which does not depend on the open decisions and benefits every later workstream.
