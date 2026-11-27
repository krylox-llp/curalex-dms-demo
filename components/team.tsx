"use client";

import { useState, useTransition } from "react";
import { cancelInvitation, inviteColleague, setMemberActive, setMemberRoles, type TeamResult } from "@/app/team/actions";
import { Dialog } from "@/components/dialog";
import { RowMenu } from "@/components/manufacturer/row-menu";
import { ROLES, roleLabel } from "@/lib/roles";

type OrgType = "manufacturer" | "exporter";
export type Member = {
  user_id: string;
  email: string;
  name: string | null;
  roles: string[];
  active: boolean;
  joined_at: string;
  last_sign_in_at: string | null;
  is_me: boolean;
};
export type Invitation = { id: string; email: string; roles: string[]; invited_at: string };

const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });

function useRun() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<TeamResult | null>(null);
  const run = (fn: () => Promise<TeamResult>, onOk?: () => void) =>
    start(async () => {
      const r = await fn();
      setResult(r);
      if (r.ok) onOk?.();
    });
  return { pending, result, setResult, run };
}

function RoleCheckboxes({ type, value, onChange }: { type: OrgType; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-medium text-secondary">Roles</legend>
      {ROLES[type].map((r) => (
        <label key={r.value} className="flex cursor-pointer items-start gap-3 rounded-lumo-m p-2 hover:bg-contrast-5">
          <input
            type="checkbox"
            className="checkbox mt-0.5"
            checked={value.includes(r.value)}
            onChange={(e) => onChange(e.target.checked ? [...value, r.value] : value.filter((v) => v !== r.value))}
          />
          <span>
            <span className="block font-medium text-header">{r.label}</span>
            <span className="block text-sm text-secondary">{r.description}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

const Note = ({ result }: { result: TeamResult | null }) =>
  result ? (
    <p role="status" className={`notice mt-4 ${result.ok ? (result.emailStatus && !result.emailStatus.sent ? "notice-warning" : "notice-success") : "notice-error"}`}>
      {result.message}
    </p>
  ) : null;

export function InviteColleagueButton({ type }: { type: OrgType }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [roles, setRoles] = useState<string[]>([]);
  const { pending, result, setResult, run } = useRun();
  const close = () => {
    setOpen(false);
    setEmail("");
    setRoles([]);
    setResult(null);
  };
  return (
    <>
      <button type="button" className="btn-primary" onClick={() => setOpen(true)}>Invite colleague</button>
      {open && (
        <Dialog
          title="Invite a colleague"
          onClose={close}
          footer={
            <>
              <button type="button" className="btn-tertiary" onClick={close}>{result?.ok ? "Close" : "Cancel"}</button>
              {!result?.ok && (
                <button
                  type="button"
                  className="btn-primary"
                  disabled={pending || !email.trim() || roles.length === 0}
                  onClick={() => run(() => inviteColleague(email, roles))}
                >
                  {pending ? "Sending…" : "Send invite"}
                </button>
              )}
            </>
          }
        >
          {!result?.ok && (
            <>
              <label className="field-label">
                Work email
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="text-field" data-autofocus placeholder="name@company.com" />
                <span className="field-helper">They sign in with Google using this address.</span>
              </label>
              <div className="mt-4">
                <RoleCheckboxes type={type} value={roles} onChange={setRoles} />
              </div>
            </>
          )}
          <Note result={result} />
        </Dialog>
      )}
    </>
  );
}

function MemberMenu({ type, member }: { type: OrgType; member: Member }) {
  const [mode, setMode] = useState<"roles" | "active" | null>(null);
  const [roles, setRoles] = useState(member.roles);
  const { pending, result, setResult, run } = useRun();
  const close = () => {
    setMode(null);
    setResult(null);
    setRoles(member.roles);
  };
  const items = [
    { label: "Edit roles", onSelect: () => setMode("roles") as void },
    ...(member.is_me
      ? []
      : [{ label: member.active ? "Deactivate user" : "Reactivate user", danger: member.active, separatorBefore: true, onSelect: () => setMode("active") as void }]),
  ];
  return (
    <>
      <RowMenu label={`Actions for ${member.email}`} items={items} />
      {mode === "roles" && (
        <Dialog
          title={`Roles for ${member.name ?? member.email}`}
          onClose={close}
          footer={
            <>
              <button type="button" className="btn-tertiary" onClick={close}>Cancel</button>
              <button type="button" className="btn-primary" disabled={pending || roles.length === 0} onClick={() => run(() => setMemberRoles(member.user_id, roles), close)}>
                {pending ? "Saving…" : "Save roles"}
              </button>
            </>
          }
        >
          <RoleCheckboxes type={type} value={roles} onChange={setRoles} />
          {result && !result.ok && <Note result={result} />}
        </Dialog>
      )}
      {mode === "active" && (
        <Dialog
          title={member.active ? "Deactivate user?" : "Reactivate user?"}
          onClose={close}
          footer={
            <>
              <button type="button" className="btn-tertiary" onClick={close} data-autofocus>Cancel</button>
              <button
                type="button"
                className={member.active ? "btn-error-primary" : "btn-primary"}
                disabled={pending}
                onClick={() => run(() => setMemberActive(member.user_id, !member.active), close)}
              >
                {member.active ? "Deactivate" : "Reactivate"}
              </button>
            </>
          }
        >
          <p className="text-body">
            {member.active
              ? `${member.email} will no longer be able to sign in or see your company's documents. Their history in the audit trail is kept, and you can reactivate them later.`
              : `${member.email} will be able to sign in again with their previous roles.`}
          </p>
          {result && !result.ok && <Note result={result} />}
        </Dialog>
      )}
    </>
  );
}

export function MembersTable({ type, members }: { type: OrgType; members: Member[] }) {
  return (
    <div className="data-grid">
      <table>
        <thead>
          <tr>
            <th>User</th>
            <th>Roles</th>
            <th>Status</th>
            <th>Last sign-in</th>
            <th className="w-px"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.user_id}>
              <td className="max-w-0 w-[30%]">
                <span className="block truncate font-medium text-header">
                  {m.name ?? m.email} {m.is_me && <span className="badge badge-sm badge-contrast ml-1">You</span>}
                </span>
                <span className="block truncate text-[0.8125rem] text-secondary">{m.email}</span>
              </td>
              <td>
                <span className="flex flex-wrap gap-1.5">
                  {m.roles.map((r) => (
                    <span key={r} className="badge">{roleLabel(type, r)}</span>
                  ))}
                </span>
              </td>
              <td>{m.active ? <span className="badge badge-success">Active</span> : <span className="badge badge-error">Deactivated</span>}</td>
              <td className="whitespace-nowrap text-secondary">{m.last_sign_in_at ? dateFmt.format(new Date(m.last_sign_in_at)) : "—"}</td>
              <td className="text-right"><MemberMenu type={type} member={m} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function InvitationsTable({ type, invitations }: { type: OrgType; invitations: Invitation[] }) {
  const { pending, result, run } = useRun();
  if (invitations.length === 0) return null;
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-lg font-semibold text-header">Pending invitations</h2>
      {result && !result.ok && <Note result={result} />}
      <div className="data-grid">
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Roles</th>
              <th>Invited</th>
              <th className="w-px"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {invitations.map((i) => (
              <tr key={i.id}>
                <td className="font-medium text-header">{i.email}</td>
                <td>
                  <span className="flex flex-wrap gap-1.5">
                    {i.roles.map((r) => <span key={r} className="badge badge-contrast">{roleLabel(type, r)}</span>)}
                  </span>
                </td>
                <td className="whitespace-nowrap text-secondary">{dateFmt.format(new Date(i.invited_at))}</td>
                <td className="text-right">
                  <RowMenu
                    label={`Actions for invitation ${i.email}`}
                    items={[{ label: "Cancel invitation", danger: true, onSelect: () => !pending && run(() => cancelInvitation(i.id)) }]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
