import "server-only";

/**
 * Minimal Resend client (https://resend.com/docs/api-reference/emails/send-email).
 * Needs RESEND_API_KEY (a send-only key is enough). Sends from RESEND_FROM_EMAIL, defaulting to
 * hello@krylox.ai; the krylox.ai domain must be verified in Resend.
 */
export type SendResult = { ok: true; id: string } | { ok: false; error: string };

const DEFAULT_FROM = "CuraLex - DMS <hello@krylox.ai>";

export async function sendEmail(email: {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "Email isn't configured (RESEND_API_KEY is missing)." };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || DEFAULT_FROM,
        to: [email.to],
        subject: email.subject,
        html: email.html,
        text: email.text,
        ...(email.replyTo ? { reply_to: email.replyTo } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok || !body.id) return { ok: false, error: body.message ?? `Resend returned ${res.status}` };
    return { ok: true, id: body.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not reach Resend" };
  }
}
