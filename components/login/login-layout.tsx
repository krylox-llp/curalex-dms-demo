import { Logo } from "@/components/logo";
import Image from "next/image";
import pharmacyPhoto from "@/public/images/login-pharmacy.jpg";

const FEATURES = [
  { label: "Permissioned sharing you can revoke at any time", icon: ShieldIcon },
  { label: "Expiry reminders for CoPP and GMP certificates", icon: CheckCircleIcon },
  { label: "Audit trail on every view and download", icon: DocumentIcon },
];

/** Shared frame for the sign-in pages: form column on the left, photo panel on the right. */
export function LoginLayout({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <main className="grid min-h-screen flex-1 bg-white lg:grid-cols-[45fr_55fr]">
      {/* Sign-in panel */}
      <section className="relative flex flex-col overflow-hidden px-6 py-8 sm:px-11">
        <div className="pointer-events-none absolute -left-40 -top-40 size-[520px] rounded-full bg-blue-100/60 blur-3xl" />

        <Logo />

        <div className="relative mx-auto my-auto w-full max-w-[384px] py-16">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-blue-700">{eyebrow}</p>
          <h1 className="mt-3 text-[28px] font-bold leading-tight tracking-tight text-slate-900">{title}</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-slate-500">{description}</p>
          <div className="mt-8">{children}</div>
        </div>

        <p className="relative text-xs text-slate-400">
          CuraLex DMS · For authorised manufacturer and exporter personnel
        </p>
      </section>

      {/* Image panel */}
      <section className="relative hidden overflow-hidden lg:block">
        <Image
          src={pharmacyPhoto}
          alt=""
          fill
          priority
          placeholder="blur"
          sizes="55vw"
          className="scale-110 object-cover blur-[6px]"
        />
        {/* Blue wash: light at the top, deep navy where the copy sits */}
        <div className="absolute inset-0 bg-gradient-to-b from-sky-100/70 via-blue-300/40 to-blue-950/90" />
        <div className="absolute inset-0 bg-blue-900/15" />

        {/* Decorative corner arc and molecule */}
        <div className="absolute -left-40 -top-56 size-72 rounded-full bg-sky-400/60" />
        <Molecule className="absolute right-0 top-0 w-56 text-white/40" />

        <div className="absolute inset-x-0 bottom-0 p-12 text-white">
          <span className="inline-block rounded-full border border-white/40 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] backdrop-blur-sm">
            Manufacturer–exporter document sharing
          </span>
          <h2 className="mt-5 max-w-md text-[32px] font-bold leading-[1.2] tracking-tight">
            Share export and quality documents without losing control of them.
          </h2>
          <ul className="mt-7 space-y-3">
            {FEATURES.map(({ label, icon: Icon }) => (
              <li key={label} className="flex items-center gap-3 text-[15px] text-white/90">
                <span className="grid size-8 place-items-center rounded-lg border border-white/20 bg-white/10 backdrop-blur-sm">
                  <Icon className="size-4" />
                </span>
                {label}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}

export function GoogleNotice() {
  return (
    <div className="mt-6 flex gap-3 rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-3.5 text-[13px] leading-relaxed text-slate-700">
      <ShieldIcon className="mt-0.5 size-4 shrink-0 text-slate-600" />
      <span>Authentication is handled by Google. We never see or store your password.</span>
    </div>
  );
}

export function ErrorAlert({ children }: { children: React.ReactNode }) {
  return (
    <div role="alert" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
      {children}
    </div>
  );
}


type IconProps = { className?: string };

export function ShieldIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M12 3l7 2.6v5.6c0 4.4-3 8.2-7 9.3-4-1.1-7-4.9-7-9.3V5.6z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

function CheckCircleIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8.5 12.2l2.4 2.4 4.6-4.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DocumentIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M7 3h7l4 4v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M14 3v4h4M9 12h6M9 16h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function Molecule({ className }: IconProps) {
  return (
    <svg viewBox="0 0 220 160" fill="none" className={className} aria-hidden="true">
      <g stroke="currentColor" strokeWidth="2">
        <path d="M60 20l40 25 45-15 50 20M100 45l5 50M105 95l50 20M105 95l-45 25M145 30l10 85" />
      </g>
      <g fill="currentColor">
        <circle cx="60" cy="20" r="6" />
        <circle cx="100" cy="45" r="7" />
        <circle cx="145" cy="30" r="8" />
        <circle cx="195" cy="50" r="10" />
        <circle cx="105" cy="95" r="6" />
        <circle cx="155" cy="115" r="7" />
        <circle cx="60" cy="120" r="5" />
      </g>
    </svg>
  );
}
