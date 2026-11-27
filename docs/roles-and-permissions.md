# CuraLex - DMS: Roles and permissions

**Status:** Decided 2026-11-27. **Step 1 implemented** (multi-user companies, roles, permission checks, Team page) in `supabase/migrations/20261127090000_roles.sql`. Not yet built: approval workflow, e-signatures, "Superseded" badges, retire instead of delete, per-share view-only.
**Basis:** Revised Schedule M, Drugs Rules 1945, G.S.R. 922(E) dated 28 Dec 2023, Part I (Good Manufacturing Practices), read from the Gazette extract (pages 149–272)
**Related:** [`compliance-gap-assessment.md`](./compliance-gap-assessment.md) (workstreams 4.2 and 4.3), [`how-the-app-works.md`](./how-the-app-works.md)

---

## 1. Why these roles

Schedule M does not name software roles; it assigns **responsibilities**. The roles below map those responsibilities onto CuraLex.

| Clause | Requirement (paraphrased; key wording quoted) | Consequence |
|---|---|---|
| §11.3.1 | Key personnel are the heads of production, heads of quality units (QA/QC) and the **authorised person**; production and quality heads "shall be independent of each other" | Separate creator and approver roles |
| §11.3.3(a) | Heads of production and quality jointly handle "authorisation of written procedures and other documents, including amendments" | Document approval is a quality-unit function |
| §11.3.5(d) | Heads of quality approve specifications, test methods and QC procedures | QA approves quality documents |
| §11.3.6, §9.5.2 | The authorised person approves release and issues the **certificate of analysis** | CoAs approved by QA / authorised person before distribution |
| §17.2.1 | Documents shall be "designed, prepared, reviewed and **distributed** with care" | Distribution (sharing) is a separate controlled permission |
| §17.2.2 | "Documents shall be approved, signed and dated by the responsible persons. No document shall be changed without authorisation and approval." | Approval step with signature before a version is effective or shareable |
| §17.2.4 | On revision, "a system shall exist to prevent inadvertent use of the superseded version. Superseded documents shall be retained for a specific period of time." | Only the current approved version is shareable; superseded versions flagged and kept |
| §17.2.6 | Alterations signed and dated, original readable; "where appropriate, the reason for the alteration shall be recorded" | Audit trail with reasons (implemented); no overwriting |
| §17.2.7 | "Records shall be retained for at least one year after the expiry date of the finished product." | Retire, don't delete, approved records during retention |
| §17.2.8 | "Only authorised persons shall be able to enter or modify data… there shall be a record of changes and deletions; access shall be restricted by passwords or other means and the entry of critical data shall be independently checked." | Role-based permissions, audit trail, maker-checker |
| §20.4 | Controls against unauthorised access or changes; record of "the previous entry, the person who made the change and when" | Permissions plus audit trail (old/new values) |
| §20.6 | Critical data entered manually needs "an additional check… by a second operator or by the system itself" | Uploader cannot approve their own upload |
| §17.3.9 | Responsible person "clearly identified by signature or electronic password" | E-signature by re-authentication acceptable |
| §8.3 | Changes "reviewed and approved by the quality units" | QA approves new versions |
| §9.3.3, §9.5.6 | Loan licensee / contract giver reviews outsourced records; records "shall be kept by, or be available to" them | Exporters who are loan licensees need a quality/regulatory user who can download |

Scope note: Schedule M binds **licensed manufacturers**. Merchant exporters are covered only when acting as **loan licensees / contract givers** (§9); otherwise distribution-practice rules apply.

---

## 2. Manufacturer roles

A user may hold **several roles** (MSME teams are small). **Maker-checker is enforced by the system regardless of roles:** nobody can approve a version they uploaded (§20.6, §11.3.1).

| Role | Typical holder | Basis |
|---|---|---|
| **Company admin** | Owner / director | Organisation (not a GMP authority) |
| **Document author** | Production, QC, regulatory staff | Originators |
| **QA approver** | Head of QA/QC, authorised person | §11.3.3(a), §11.3.5, §11.3.6, §17.2.2 |
| **Document controller** | QA document cell / regulatory affairs | §17.2.1 controlled distribution |
| **Viewer** | Management, internal auditor | §11.3.5(j) self-inspection |

| Permission | Admin | Author | QA approver | Doc controller | Viewer |
|---|:-:|:-:|:-:|:-:|:-:|
| View documents, versions, history | ✓ | ✓ | ✓ | ✓ | ✓ |
| Download own company's documents | ✓ | ✓ | ✓ | ✓ | ✓ |
| Create folders; upload drafts / new versions | – | ✓ | – | – | – |
| Rename folders / files | – | ✓ | ✓ | – | – |
| Submit version for approval | – | ✓ | – | – | – |
| Delete own **draft** (never approved) | – | ✓ | – | – | – |
| Approve / reject version (e-signature) | – | – | ✓ (not own upload) | – | – |
| Retire approved / superseded document (reason) | – | – | ✓ | – | – |
| Share **approved** versions; set duration | – | – | – | ✓ | – |
| Revoke access (reason) | ✓ | – | ✓ | ✓ | – |
| Invite exporters | ✓ | – | – | ✓ | – |
| Remove exporter (reason) | ✓ | – | – | – | – |
| See exporter activity (views / downloads) | ✓ | – | ✓ | ✓ | ✓ |
| Audit trail + CSV export | ✓ | – | ✓ | ✓ | ✓ |
| Manage users and roles | ✓ | – | – | – | – |

Notes:

- The Company admin holds no GMP authority by default; to approve documents they must also be given the QA approver role.
- A QA approver who also needs to distribute documents can additionally hold the Document controller role.

## 3. Exporter roles

| Role | Typical holder | Basis |
|---|---|---|
| **Company admin** | Owner / director | Organisation |
| **Regulatory / quality** | RA / documentation executive; loan-licensee quality person | §9.3.3, §9.5.6 |
| **Viewer** | Sales, logistics / customs desk | Least privilege |

| Permission | Admin | Regulatory / quality | Viewer |
|---|:-:|:-:|:-:|
| See manufacturers and shared documents | ✓ | ✓ | ✓ |
| View in browser | ✓ | ✓ | ✓ |
| Download (within the manufacturer's per-share setting) | ✓ | ✓ | – (default) |
| Create / edit / delete products; add manufacturers and documents | ✓ | ✓ | – |
| Activity / received-documents history | ✓ | ✓ | – |
| Manage users | ✓ | – | – |

Download is always also capped by the **manufacturer's choice per share** (view-only or download allowed; to be built).

## 4. Platform (CuraLex) roles

| Role | Can | Document access |
|---|---|---|
| **Super admin** | Invite / suspend companies, manage platform admins, audit integrity check | **None** |
| **Support** (later) | Read companies, users and audit metadata | **None** |

---

## 5. Decisions on the open questions

| # | Question | Decision | Basis |
|---|---|---|---|
| 1 | Separate sharing role? | **Yes: Document controller.** Authors don't share. | §17.2.1 |
| 2 | Only approved versions shareable? | **Yes.** Exporters see "Superseded by vN" on outdated versions; the manufacturer decides whether to revoke and share the new version. | §17.2.2, §17.2.4, §11.3.6 |
| 3 | Who removes exporters? | **Company admin only**, with reason. | Distribution control, §17.2.6 |
| 4 | Exporter viewers download? | **No by default**; capped by the manufacturer's per-share setting. Regulatory / quality users download. | Least privilege; §9.5.6 |
| 5 | Restrict exporter users by product / manufacturer? | **Not now.** | Not required by Schedule M |
| 6 | Platform support role? | **Later**; platform staff never get document access. | Confidentiality |

## 6. Consequences beyond roles

1. **Document lifecycle:** Draft → Submitted → **Approved (effective)** → Superseded / Retired. Only Approved versions can be shared (§17.2.2, §17.2.4).
2. **No physical deletion of approved records** (§17.2.6, §17.2.7). Drafts that were never approved may be deleted by their author. Approved versions are **retired** by a QA approver with a reason and kept for at least one year after the product's expiry (retention configurable per document type). This replaces today's delete.
3. **Electronic signature on approval:** printed name, date and time, meaning ("Approved" / "Rejected"), re-authentication, bound to the SHA-256 of the file (§17.2.2, §17.3.9).
4. **Maker-checker** enforced in the database: approver ≠ uploader (§20.6).
5. **Audit trail** already records who, what, when, old/new values and reasons (§17.2.6, §17.2.8, §20.4).

## 7. Implementation outline (when scheduled)

- **Multi-user companies:** invite colleagues, member list, assign roles (many per user), deactivate users. Today each company has exactly one user.
- **Database:** `member_roles` table; a single `has_permission(permission)` check used by every function; updated row-level security; audit entries for role changes.
- **Lifecycle and approvals:** version `status` (draft, submitted, approved, superseded, retired); approve/reject functions with e-signature records; share functions accept approved versions only.
- **Retire instead of delete:** keep files; retention policies; destruction only after retention by an authorised role with reason.
- **UI:** actions shown according to the user's permissions; approval queue for QA approvers; "Superseded" badges for exporters.
- **Migration of existing data:** current single users become Company admin + all manufacturer roles (or Company admin + Regulatory for exporters); existing versions become Approved.

Rough effort: roles and multi-user ≈ 1–1½ weeks; lifecycle, approvals and e-signatures ≈ 2–3 weeks; retire / retention ≈ 3–5 days.
