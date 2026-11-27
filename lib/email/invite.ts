import "server-only";

type Role = "manufacturer" | "exporter";

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const ROLE_COPY: Record<Role, { label: string; what: string }> = {
  manufacturer: {
    label: "manufacturer",
    what: "keep your CoAs, CoPPs, GMP certificates and dossiers in one place and share them with your exporters, with access you control.",
  },
  exporter: {
    label: "exporter",
    what: "access the documents your manufacturers share with you, always the current version, without chasing email or WhatsApp.",
  },
};

/**
 * Invitation (new account) or "you've been added" (already on CuraLex) email.
 * All user-provided text is HTML-escaped.
 */
export function inviteEmail(p: {
  kind: "invited" | "added" | "colleague";
  role: Role;
  /** Recipient's company as entered by the inviter (or their existing company). */
  companyName: string;
  /** Who invited them, e.g. "Sarovan Lifesciences Pvt Ltd" or "The CuraLex team". */
  invitedBy: string;
  inviterName?: string | null;
  email: string;
  loginUrl: string;
  /** Optional extra line, e.g. "3 documents have been shared with you." */
  extra?: string;
}) {
  const role = ROLE_COPY[p.role];
  if (p.kind === "colleague") return colleagueEmail(p);
  const subject =
    p.kind === "invited"
      ? `${p.invitedBy} invited you to CuraLex - DMS`
      : `${p.invitedBy} added you as an ${role.label} on CuraLex - DMS`;
  const intro =
    p.kind === "invited"
      ? `${p.inviterName ? `${p.inviterName} from ` : ""}${p.invitedBy} has invited ${p.companyName} to CuraLex - DMS as ${p.role === "exporter" ? "an" : "a"} ${role.label}.`
      : `${p.invitedBy} has added ${p.companyName} as one of their exporters on CuraLex - DMS.`;
  const cta = p.kind === "invited" ? "Accept invitation" : "Open CuraLex - DMS";

  const text = [
    intro,
    "",
    `With CuraLex - DMS you can ${role.what}`,
    ...(p.extra ? ["", p.extra] : []),
    "",
    `${cta}: ${p.loginUrl}`,
    "",
    `Sign in with Google using this email address: ${p.email}`,
    "",
    "If you weren't expecting this, you can ignore this email.",
  ].join("\n");

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f6f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2a37;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;box-shadow:0 0 0 1px rgba(26,57,96,0.1);">
<tr><td style="padding:24px 32px 0;">
  <span style="font-size:18px;font-weight:600;color:#1a2a3c;">Cura<span style="color:#0062db;">Lex</span></span>
  <span style="font-size:18px;color:#5b6b7f;border-left:1px solid #d3dae3;margin-left:10px;padding-left:10px;">DMS</span>
</td></tr>
<tr><td style="padding:24px 32px 8px;">
  <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;font-weight:600;color:#1a2a3c;">${esc(subject)}</h1>
  <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">${esc(intro)}</p>
  <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#3d4d61;">With CuraLex - DMS you can ${esc(role.what)}</p>
  ${p.extra ? `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;">${esc(p.extra)}</p>` : ""}
</td></tr>
<tr><td style="padding:12px 32px 8px;">
  <a href="${esc(p.loginUrl)}" style="display:inline-block;background:#0062f5;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:11px 20px;border-radius:4px;">${esc(cta)}</a>
</td></tr>
<tr><td style="padding:12px 32px 24px;">
  <p style="margin:0;font-size:13px;line-height:1.6;color:#5b6b7f;">Sign in with Google using <strong style="color:#1f2a37;">${esc(p.email)}</strong>. CuraLex is invite-only, so other addresses won't have access.</p>
</td></tr>
<tr><td style="padding:16px 32px;border-top:1px solid #e8ecf1;">
  <p style="margin:0;font-size:12px;line-height:1.6;color:#7b8a9b;">If you weren't expecting this invitation, you can ignore this email. Link not working? Copy this into your browser:<br><span style="color:#3d4d61;word-break:break-all;">${esc(p.loginUrl)}</span></p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;

  return { subject, html, text };
}

/** A company admin invites a colleague into their own company. `extra` lists the roles. */
function colleagueEmail(p: { companyName: string; inviterName?: string | null; email: string; loginUrl: string; extra?: string }) {
  const subject = `${p.inviterName ?? p.companyName} invited you to join ${p.companyName} on CuraLex - DMS`;
  const lead = p.inviterName ? `${p.inviterName} has invited you` : "You have been invited";
  const intro = `${lead} to join ${p.companyName} on CuraLex - DMS, the platform your company uses to manage and share export and quality documents.`;
  const text = [intro, ...(p.extra ? ["", p.extra] : []), "", `Accept invitation: ${p.loginUrl}`, "", `Sign in with Google using this email address: ${p.email}`].join("\n");
  const html = `<!doctype html><html><body style="margin:0;padding:32px 16px;background:#f4f6f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2a37;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;box-shadow:0 0 0 1px rgba(26,57,96,0.1);">
<tr><td style="padding:24px 32px 0;"><span style="font-size:18px;font-weight:600;color:#1a2a3c;">Cura<span style="color:#0062db;">Lex</span></span><span style="font-size:18px;color:#5b6b7f;border-left:1px solid #d3dae3;margin-left:10px;padding-left:10px;">DMS</span></td></tr>
<tr><td style="padding:24px 32px 8px;"><h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;font-weight:600;color:#1a2a3c;">${esc(subject)}</h1>
<p style="margin:0 0 12px;font-size:15px;line-height:1.6;">${esc(intro)}</p>${p.extra ? `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;">${esc(p.extra)}</p>` : ""}</td></tr>
<tr><td style="padding:12px 32px 8px;"><a href="${esc(p.loginUrl)}" style="display:inline-block;background:#0062f5;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:11px 20px;border-radius:4px;">Accept invitation</a></td></tr>
<tr><td style="padding:12px 32px 24px;"><p style="margin:0;font-size:13px;line-height:1.6;color:#5b6b7f;">Sign in with Google using <strong style="color:#1f2a37;">${esc(p.email)}</strong>.</p></td></tr>
</table></body></html>`;
  return { subject, html, text };
}
