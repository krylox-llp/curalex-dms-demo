import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { ErrorAlert, LoginLayout } from "@/components/login/login-layout";

export const metadata: Metadata = { title: "Sign in · CuraLex - DMS" };

const CHOICES = [
  {
    href: "/login/manufacturer",
    title: "Manufacturer",
    body: "Share documents with your exporters and control who sees what.",
    icon: FactoryIcon,
  },
  {
    href: "/login/exporter",
    title: "Exporter",
    body: "Get documents from all your manufacturers in one place.",
    icon: GlobeIcon,
  },
];

/** Chooser: sends people to the manufacturer or exporter sign-in. CuraLex admins sign in from here. */
export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <LoginLayout
      eyebrow="Secure access"
      title="Sign in to your workspace"
      description="Share CoAs, CoPPs, GMP certificates and dossiers between manufacturers and exporters, with controlled access and a full audit trail instead of email and WhatsApp."
    >
      <Suspense>
        <ChooserError searchParams={searchParams} />
      </Suspense>
      <p className="mb-3 text-sm font-semibold text-slate-800">Sign in as</p>
      <div className="grid gap-3">
        {CHOICES.map(({ href, title, body, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="group flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 transition hover:border-blue-400 hover:bg-blue-50/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700 group-hover:bg-blue-600 group-hover:text-white">
              <Icon className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold text-slate-900">{title}</span>
              <span className="block text-xs leading-snug text-slate-500">{body}</span>
            </span>
            <svg viewBox="0 0 20 20" fill="none" className="size-4 text-slate-400 group-hover:text-blue-700" aria-hidden="true">
              <path d="M7.5 4.5L13 10l-5.5 5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        ))}
      </div>
      <div className="mt-8 text-center">
        <GoogleSignInButton variant="link" label="CuraLex team sign in" />
      </div>
    </LoginLayout>
  );
}

async function ChooserError({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const { error } = await searchParams;
  if (!error) return null;
  return (
    <ErrorAlert>
      {error === "not_invited"
        ? "This Google account hasn't been invited to CuraLex. Sign in with the email your invitation was sent to."
        : "We couldn't complete sign-in with Google. Please try again."}
    </ErrorAlert>
  );
}

function FactoryIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M3 20.5V10l5 3V10l5 3V10l5 3V4h3v16.5z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M7 17h2M12 17h2M17 17h1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3.5 12h17M12 3.5c2.3 2.4 3.5 5.2 3.5 8.5s-1.2 6.1-3.5 8.5c-2.3-2.4-3.5-5.2-3.5-8.5S9.7 5.9 12 3.5z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}
