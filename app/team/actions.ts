"use server";

import { refresh } from "next/cache";
import { getAccount } from "@/lib/account";
import { sendInviteEmail, type EmailStatus } from "@/lib/email/send-invite";
import { roleLabel } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export type TeamResult = { ok: true; message?: string; emailStatus?: EmailStatus } | { ok: false; message: string };

const ERRORS: Record<string, string> = {
  not_allowed: "Only company admins can manage the team.",
  invalid_input: "Enter a valid email address.",
  invalid_role: "Choose roles that apply to your company type.",
  roles_required: "Choose at least one role.",
  already_member: "That person already belongs to a company on CuraLex.",
  already_invited: "That email already has a pending invitation.",
  admin_email: "That email belongs to a CuraLex admin.",
  last_admin: "Your company needs at least one active Company admin.",
  cannot_change_self: "You can't deactivate yourself.",
  not_found: "That user or invitation no longer exists.",
};
const message = (raw: string) =>
  ERRORS[Object.keys(ERRORS).find((k) => raw.includes(k)) ?? ""] ?? "Something went wrong. Please try again.";

export async function inviteColleague(email: string, roles: string[]): Promise<TeamResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("invite_colleague", { p_email: email, p_roles: roles });
  if (error) return { ok: false, message: message(error.message) };
  refresh();
  const res = data as { email: string; roles: string[]; org_type: "manufacturer" | "exporter" };
  const account = await getAccount();
  const emailStatus = await sendInviteEmail({
    kind: "colleague",
    role: res.org_type,
    companyName: account?.org?.name ?? "your company",
    email: res.email,
    extra: `Your role${res.roles.length > 1 ? "s" : ""}: ${res.roles.map((r) => roleLabel(res.org_type, r)).join(", ")}.`,
  });
  return {
    ok: true,
    emailStatus,
    message: emailStatus.sent
      ? `Invitation emailed to ${res.email}.`
      : `Invitation created for ${res.email}, but the email couldn't be sent (${emailStatus.error}). Ask them to sign in at /login/${res.org_type} with that email.`,
  };
}

async function call(fn: string, args: Record<string, unknown>, ok?: string): Promise<TeamResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc(fn, args);
  if (error) return { ok: false, message: message(error.message) };
  refresh();
  return { ok: true, message: ok };
}

export async function setMemberRoles(userId: string, roles: string[]) {
  return call("set_member_roles", { p_user: userId, p_roles: roles }, "Roles updated.");
}
export async function setMemberActive(userId: string, active: boolean) {
  return call("set_member_active", { p_user: userId, p_active: active }, active ? "User reactivated." : "User deactivated.");
}
export async function cancelInvitation(invitationId: string) {
  return call("cancel_invitation", { p_invitation: invitationId }, "Invitation cancelled.");
}
