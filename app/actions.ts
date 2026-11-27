"use server";

import { refresh } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type InviteResult =
  | { ok: true; kind: "invited"; email: string; loginPath: string }
  | { ok: true; kind: "linked"; orgName: string }
  | { ok: false; message: string; values: Record<string, string> };

const ERROR_MESSAGES: Record<string, string> = {
  invalid_input: "Enter a company name and a valid email address.",
  already_member: "That email already belongs to a company on CuraLex.",
  already_invited: "That email already has a pending invitation.",
  already_linked: "That exporter is already in your list.",
  not_an_exporter: "That email belongs to a manufacturer, not an exporter.",
  not_allowed: "You don't have permission to do that.",
  admin_email: "That email belongs to a CuraLex admin and can't be invited to a company.",
};

function errorMessage(raw: string) {
  const key = Object.keys(ERROR_MESSAGES).find((k) => raw.includes(k));
  return key ? ERROR_MESSAGES[key] : "Something went wrong. Please try again.";
}

function field(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

/** Platform admin invites a manufacturer or exporter. */
export async function inviteCompany(_prev: InviteResult | null, formData: FormData): Promise<InviteResult> {
  const values = {
    company: field(formData, "company"),
    email: field(formData, "email"),
    type: field(formData, "type"),
  };
  if (values.type !== "manufacturer" && values.type !== "exporter") {
    return { ok: false, message: "Choose manufacturer or exporter.", values };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_invite_company", {
    p_name: values.company,
    p_email: values.email,
    p_type: values.type,
  });
  if (error) return { ok: false, message: errorMessage(error.message), values };

  refresh();
  return { ok: true, kind: "invited", email: (data as { email: string }).email, loginPath: `/login/${values.type}` };
}

/** Manufacturer invites an exporter they work with. */
export async function inviteExporter(_prev: InviteResult | null, formData: FormData): Promise<InviteResult> {
  const values = { company: field(formData, "company"), email: field(formData, "email") };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("invite_exporter", {
    p_company: values.company,
    p_email: values.email,
  });
  if (error) return { ok: false, message: errorMessage(error.message), values };

  refresh();
  const result = data as { status: "invited" | "linked_existing"; email: string; org_name: string };
  return result.status === "invited"
    ? { ok: true, kind: "invited", email: result.email, loginPath: "/login/exporter" }
    : { ok: true, kind: "linked", orgName: result.org_name };
}
