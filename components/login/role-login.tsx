import Link from "next/link";
import { Suspense } from "react";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { ErrorAlert, GoogleNotice, LoginLayout } from "@/components/login/login-layout";
import { ORG_TYPE_LABEL, type OrgType } from "@/lib/account";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const COPY: Record<OrgType, { title: string; description: string }> = {
  manufacturer: {
    title: "Manufacturer sign in",
    description:
      "Keep your CoAs, CoPPs, GMP certificates and dossiers in one place, and control which exporters can see them.",
  },
  exporter: {
    title: "Exporter sign in",
    description:
      "Access the documents your manufacturers have shared with you, always the current version, without chasing email or WhatsApp.",
  },
};

const OTHER: Record<OrgType, OrgType> = { manufacturer: "exporter", exporter: "manufacturer" };

/** /login/manufacturer and /login/exporter. */
export function RoleLogin({ role, searchParams }: { role: OrgType; searchParams: SearchParams }) {
  const other = OTHER[role];
  return (
    <LoginLayout eyebrow={`${ORG_TYPE_LABEL[role]} access`} title={COPY[role].title} description={COPY[role].description}>
      <Suspense fallback={<GoogleSignInButton role={role} />}>
        <RoleSignInForm role={role} searchParams={searchParams} />
      </Suspense>
      <p className="mt-3 text-center text-xs text-slate-500">
        CuraLex is invite-only. Use the Google account your invitation was sent to.
      </p>
      <GoogleNotice />
      <p className="mt-6 text-center text-sm text-slate-500">
        Not {role === "exporter" ? "an" : "a"} {role}?{" "}
        <Link href={`/login/${other}`} className="font-medium text-blue-700 hover:underline">
          {ORG_TYPE_LABEL[other]} sign in
        </Link>
      </p>
    </LoginLayout>
  );
}

async function RoleSignInForm({ role, searchParams }: { role: OrgType; searchParams: SearchParams }) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  const error = typeof params.error === "string" ? params.error : undefined;
  const actual = params.actual === "manufacturer" || params.actual === "exporter" ? params.actual : undefined;

  return (
    <>
      {error === "wrong_role" && actual ? (
        <ErrorAlert>
          This Google account is invited as {actual === "exporter" ? "an" : "a"} {actual}.{" "}
          <Link href={`/login/${actual}`} className="font-semibold underline">
            Use the {actual} sign in
          </Link>
          .
        </ErrorAlert>
      ) : error === "not_invited" ? (
        <ErrorAlert>
          This Google account hasn&apos;t been invited as {role === "exporter" ? "an" : "a"} {role}. Sign in with the
          email your invitation was sent to.
        </ErrorAlert>
      ) : error === "deactivated" ? (
        <ErrorAlert>Your access has been deactivated by your company admin. Contact them if you need access again.</ErrorAlert>
      ) : error ? (
        <ErrorAlert>We couldn&apos;t complete sign-in with Google. Please try again.</ErrorAlert>
      ) : null}
      <GoogleSignInButton role={role} next={next} />
    </>
  );
}
