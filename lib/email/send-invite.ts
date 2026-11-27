import "server-only";
import { getAccount } from "@/lib/account";
import { inviteEmail } from "@/lib/email/invite";
import { sendEmail } from "@/lib/email/resend";
import { siteUrl } from "@/lib/site-url";

export type EmailStatus = { sent: true } | { sent: false; error: string };

/** Emails an invitation (or "you've been added") on behalf of the signed-in user's company. */
export async function sendInviteEmail(p: {
  kind: "invited" | "added";
  role: "manufacturer" | "exporter";
  companyName: string;
  email: string;
  extra?: string;
}): Promise<EmailStatus> {
  const [account, base] = await Promise.all([getAccount(), siteUrl()]);
  const invitedBy = account?.org?.name ?? "The CuraLex team";
  const { subject, html, text } = inviteEmail({
    ...p,
    invitedBy,
    inviterName: account?.name,
    loginUrl: `${base}/login/${p.role}`,
  });
  const res = await sendEmail({ to: p.email, subject, html, text, replyTo: account?.email || undefined });
  return res.ok ? { sent: true } : { sent: false, error: res.error };
}
