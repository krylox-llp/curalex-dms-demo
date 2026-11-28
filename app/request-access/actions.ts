"use server";

import { sendEmail } from "@/lib/email/resend";
import { siteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";

export type RequestAccessState =
  | { status: "idle" }
  | { status: "sent"; name: string }
  | { status: "error"; message: string; field?: "name" | "email" | "company" | "company_type"; values: Record<string, string> };

const TYPES = ["manufacturer", "exporter", "other"] as const;
const TYPE_LABEL: Record<(typeof TYPES)[number], string> = { manufacturer: "Manufacturer", exporter: "Exporter", other: "Other" };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * Landing page "Request access" form. Validates again on the server, stores the request
 * (submit_access_request throttles per email and overall) and notifies the CuraLex team.
 * Works without JavaScript (plain form POST to this action).
 */
export async function requestAccess(_prev: RequestAccessState, form: FormData): Promise<RequestAccessState> {
  const get = (k: string) => String(form.get(k) ?? "").trim();
  const values = {
    name: get("name"),
    email: get("email").toLowerCase(),
    company: get("company"),
    company_type: get("company_type"),
    phone: get("phone"),
    message: get("message"),
  };
  const fail = (message: string, field?: "name" | "email" | "company" | "company_type"): RequestAccessState => ({ status: "error", message, field, values });

  // Honeypot: real people never see or fill this field. Pretend success so bots learn nothing.
  if (get("website")) return { status: "sent", name: values.name };

  if (!values.name || values.name.length > 100) return fail("Enter your name.", "name");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(values.email) || values.email.length > 254) return fail("Enter a valid work email, like you@company.com.", "email");
  if (!values.company || values.company.length > 200) return fail("Enter your company name.", "company");
  if (!TYPES.includes(values.company_type as (typeof TYPES)[number])) return fail("Choose whether you are a manufacturer, an exporter or other.", "company_type");
  if (values.phone.length > 30) return fail("Enter a shorter phone number.");
  if (values.message.length > 2000) return fail("Keep the message under 2,000 characters.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_access_request", {
    p_name: values.name,
    p_email: values.email,
    p_company: values.company,
    p_company_type: values.company_type,
    p_phone: values.phone,
    p_message: values.message,
  });
  if (error) {
    if (error.message.includes("too_many_requests")) return fail("We've already received your request. We'll be in touch soon.");
    if (error.message.includes("invalid_input")) return fail("Please check the form and try again.");
    return fail("Something went wrong. Please try again, or email hello@krylox.ai.");
  }

  // Notify the team (internal only; no email is sent to the address typed into the form).
  const notifyTo = process.env.ACCESS_REQUEST_NOTIFY_EMAIL || "hello@krylox.ai";
  const type = TYPE_LABEL[values.company_type as (typeof TYPES)[number]];
  const lines = [
    `Name: ${values.name}`,
    `Email: ${values.email}`,
    `Company: ${values.company} (${type})`,
    values.phone && `Phone: ${values.phone}`,
    values.message && `Message:\n${values.message}`,
  ].filter(Boolean) as string[];
  await sendEmail({
    to: notifyTo,
    replyTo: values.email,
    subject: `Access request: ${values.company} (${type})`,
    text: [...lines, "", `Review: ${await siteUrl()}/admin/requests`].join("\n"),
    html: `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1f2a37">
<h2 style="margin:0 0 12px;font-size:18px">New access request</h2>
${lines.map((l) => `<p style="margin:0 0 6px;white-space:pre-line">${esc(l)}</p>`).join("")}
<p style="margin:16px 0 0"><a href="${esc(await siteUrl())}/admin/requests">Review requests</a></p></div>`,
  }).catch(() => null); // The request is saved even if the notification fails.

  return { status: "sent", name: values.name };
}
