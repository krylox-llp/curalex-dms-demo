import Image from "next/image";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { RequestAccessForm } from "@/components/landing/request-access-form";

/** Public landing page shown at "/" to signed-out visitors (dms.krylox.ai). */
export function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-base text-body">
      <SiteHeader />
      <main id="main">
        <Hero />
        <Problems />
        <HowItWorks />
        <ForExporters />
        <Security />
        <Pricing />
        <Faq />
        <RequestAccess />
      </main>
      <SiteFooter />
    </div>
  );
}

const NAV = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#exporters", label: "For exporters" },
  { href: "#security", label: "Security" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
];

function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-contrast-10 bg-base/90 backdrop-blur supports-[backdrop-filter]:bg-base/80">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-5 md:px-8">
        <Link href="/" aria-label="CuraLex - DMS home" className="shrink-0 rounded-lumo-m focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-50">
          <Logo size="sm" />
        </Link>
        <nav aria-label="Page sections" className="hidden items-center gap-1 lg:flex">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className="rounded-lumo-m px-3 py-2 text-[0.9375rem] font-medium text-secondary hover:bg-contrast-5 hover:text-header">
              {n.label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/login" className="btn-tertiary">Sign in</Link>
          <a href="#request-access" className="btn-primary hidden sm:inline-flex">Request access</a>
        </div>
      </div>
    </header>
  );
}

/** A screenshot in a light browser frame. */
function Screenshot({ src, alt, eager = false, className = "" }: { src: string; alt: string; eager?: boolean; className?: string }) {
  return (
    <figure className={`overflow-hidden rounded-xl bg-base shadow-[0_0_0_1px_var(--lumo-contrast-10pct),0_24px_60px_-20px_hsla(214,60%,25%,0.35)] ${className}`}>
      <div className="flex h-8 items-center gap-1.5 border-b border-contrast-10 bg-contrast-5 px-3" aria-hidden="true">
        <span className="size-2.5 rounded-full bg-contrast-20" />
        <span className="size-2.5 rounded-full bg-contrast-20" />
        <span className="size-2.5 rounded-full bg-contrast-20" />
        <span className="ml-3 hidden h-4 w-56 rounded bg-base text-[0.625rem] leading-4 text-secondary sm:block">&nbsp;dms.krylox.ai</span>
      </div>
      <Image
        src={src}
        alt={alt}
        width={2880}
        height={1800}
        sizes="(min-width: 1280px) 1100px, 100vw"
        loading={eager ? "eager" : "lazy"}
        fetchPriority={eager ? "high" : "auto"}
        className="block h-auto w-full"
      />
    </figure>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-primary-10/60 to-base">
      <div className="mx-auto max-w-7xl px-5 pb-16 pt-14 md:px-8 md:pt-20">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-primary-text">Document control for pharma exports</p>
          <h1 className="mt-4 text-balance text-4xl font-bold leading-[1.1] tracking-tight text-header md:text-[3.5rem]">
            Share regulatory documents with your exporters, without losing control.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-secondary">
            One place for your CoAs, CoPPs, GMP certificates and dossiers. Share the right version with each exporter for as
            long as you choose, see every view and download, and get warned before certificates expire. No more email
            attachments and WhatsApp forwards.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a href="#request-access" className="btn-primary h-12 px-6 text-[1rem]">Request access</a>
            <a href="#how-it-works" className="btn-secondary h-12 px-6 text-[1rem]">See how it works</a>
          </div>
          <ul className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-secondary">
            {["Invite-only", "Sign in with Google", "Tamper-evident audit trail", "Built for MSME manufacturers"].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <Check /> {t}
              </li>
            ))}
          </ul>
        </div>
        <Screenshot
          eager
          className="mx-auto mt-14 max-w-6xl"
          src="/landing/manufacturer-overview.png"
          alt="Manufacturer overview: key figures, documents expiring soon, exporter access ending, and recent exporter downloads"
        />
      </div>
    </section>
  );
}

function Problems() {
  const items = [
    { title: "“Which version did we send them?”", body: "CoAs and certificates go out as email attachments. Months later nobody knows which copy an exporter used in a dossier." },
    { title: "“Who forwarded our CoPP?”", body: "Files get forwarded on WhatsApp with no record of who opened or downloaded them, and no way to take access back." },
    { title: "“The GMP certificate expired mid-registration.”", body: "Expiry dates live in someone's spreadsheet, so renewals are noticed when an importer's regulator rejects the file." },
  ];
  return (
    <section aria-labelledby="problems-title" className="border-y border-contrast-10 bg-contrast-5/40">
      <div className="mx-auto max-w-7xl px-5 py-16 md:px-8">
        <h2 id="problems-title" className="text-center text-2xl font-semibold tracking-tight text-header md:text-3xl">Sound familiar?</h2>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {items.map((i) => (
            <div key={i.title} className="card p-6">
              <h3 className="text-lg font-semibold leading-snug text-header">{i.title}</h3>
              <p className="mt-2 text-[0.9375rem] leading-relaxed text-secondary">{i.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const STEPS = [
  {
    title: "Keep every controlled document in one place",
    body: "Upload into your own folder structure. Uploading a file with the same name creates the next version, and every version stays in the history. Record the type, product, target market, issuing authority and expiry date for each document.",
    points: ["Folders, versions and full history", "Type, product, market and expiry for every document", "Filter by type, product or what's expiring"],
    src: "/landing/documents-details.png",
    alt: "Documents page with a folder of certificates and the details panel for CoPP - Kenya: type, product, market, issuer, reference number, issue and expiry dates",
  },
  {
    title: "Share the exact version, for as long as you choose",
    body: "Pick files from any folder, choose the exporter and set access for 7 days, 30 days, a year or with no end date. New exporter? Invite them from the same screen by email.",
    points: ["Choose the version per file", "Per-file access duration", "Invite a new exporter while sharing"],
    src: "/landing/share.png",
    alt: "Share page: two selected files with an access duration each, shared with Tarangini Pharma Exports",
  },
  {
    title: "See who opened what, and take access back",
    body: "Each exporter has a page showing what they hold, until when, and every view and download. Extend access, or revoke one file or everything, with the reason recorded.",
    points: ["Every view and download logged", "Extend or revoke in one click", "Reasons recorded for revocations"],
    src: "/landing/exporter-access.png",
    alt: "Exporter page listing shared documents with access end dates, views and downloads, and revoke actions",
  },
  {
    title: "Exporters always know what's current",
    body: "Exporters see only what you shared with them, with its type and expiry date, and a clear “Superseded” badge when you have a newer version. They open files through secure, short-lived links.",
    points: ["Expiry dates and superseded versions flagged", "View or download through secure links", "Nothing visible that you didn't share"],
    src: "/landing/exporter-documents.png",
    alt: "Exporter view of documents shared by Sarovan Lifesciences, with document types, expiry badges and a superseded version flagged",
  },
];

function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how-title" className="scroll-mt-20">
      <div className="mx-auto max-w-7xl px-5 py-20 md:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-primary-text">How it works</p>
          <h2 id="how-title" className="mt-3 text-3xl font-bold tracking-tight text-header md:text-4xl">From upload to exporter, under your control</h2>
        </div>
        <ol className="mt-16 flex flex-col gap-24">
          {STEPS.map((s, i) => (
            <li key={s.title} className="grid items-center gap-10 lg:grid-cols-12">
              <div className={`lg:col-span-4 ${i % 2 ? "lg:order-2" : ""}`}>
                <span className="grid size-10 place-items-center rounded-full bg-primary text-[1rem] font-semibold text-white" aria-hidden="true">{i + 1}</span>
                <h3 className="mt-4 text-2xl font-semibold leading-snug tracking-tight text-header">
                  <span className="sr-only">Step {i + 1}: </span>{s.title}
                </h3>
                <p className="mt-3 text-[1.0625rem] leading-relaxed text-secondary">{s.body}</p>
                <ul className="mt-5 flex flex-col gap-2.5">
                  {s.points.map((p) => (
                    <li key={p} className="flex items-start gap-2.5 text-[0.9375rem] text-body"><Check className="mt-0.5" /> {p}</li>
                  ))}
                </ul>
              </div>
              <Screenshot className={`lg:col-span-8 ${i % 2 ? "lg:order-1" : ""}`} src={s.src} alt={s.alt} />
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function ForExporters() {
  return (
    <section id="exporters" aria-labelledby="exporters-title" className="scroll-mt-20 bg-gradient-to-b from-contrast-5/60 to-base">
      <div className="mx-auto max-w-7xl px-5 py-20 md:px-8">
        <div className="grid items-center gap-10 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-primary-text">For merchant exporters</p>
            <h2 id="exporters-title" className="mt-3 text-3xl font-bold tracking-tight text-header">Every manufacturer&apos;s documents, organised by product</h2>
            <p className="mt-4 text-[1.0625rem] leading-relaxed text-secondary">
              Manufacturers invite you by email. Group what they share into products, such as “Paracetamol 500 mg Tablets,
              Kenya”, with the finished-product and API manufacturers behind each one, and see at a glance what is missing,
              expiring or out of date before you file a registration or renewal.
            </p>
            <ul className="mt-5 flex flex-col gap-2.5">
              {["Product readiness at a glance", "Certificates expiring and access ending, flagged", "One login for all your manufacturers"].map((p) => (
                <li key={p} className="flex items-start gap-2.5 text-[0.9375rem] text-body"><Check className="mt-0.5" /> {p}</li>
              ))}
            </ul>
          </div>
          <Screenshot
            className="lg:col-span-8"
            src="/landing/exporter-overview.png"
            alt="Exporter overview: product readiness, certificates expiring, access ending soon and recently received documents"
          />
        </div>
      </div>
    </section>
  );
}

function Security() {
  const features = [
    { title: "Invite-only, Google sign-in", body: "Only people you or CuraLex invite can sign in, with their Google account. We never see or store passwords." },
    { title: "Roles from Revised Schedule M", body: "Document author, QA approver, document controller, viewer and company admin. Each person can do only what their role allows." },
    { title: "Each company sees only its own data", body: "Access is enforced in the database. Exporters see only documents shared with them; CuraLex staff can't open your files." },
    { title: "Tamper-evident audit trail", body: "Every upload, share, revocation, view and download is recorded with who, when and why, chained so edits are detectable, and exportable to CSV." },
    { title: "Reasons for critical changes", body: "Deleting a document, revoking access or removing an exporter requires a reason, stored with the change." },
    { title: "Private storage, short-lived links", body: "Files sit in private storage. Each view or download is checked, logged and served through a link that expires in 60 seconds." },
  ];
  return (
    <section id="security" aria-labelledby="security-title" className="scroll-mt-20">
      <div className="mx-auto max-w-7xl px-5 py-20 md:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-primary-text">Security and compliance</p>
          <h2 id="security-title" className="mt-3 text-3xl font-bold tracking-tight text-header md:text-4xl">Built for regulated documents</h2>
          <p className="mt-4 text-[1.0625rem] leading-relaxed text-secondary">
            Designed around the document-control expectations of Revised Schedule M, with the audit trail inspectors ask for.
          </p>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="card p-6">
              <span className="grid size-9 place-items-center rounded-lumo-l bg-primary-10 text-primary-text" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" className="size-5"><path d="M12 3l7 2.6v5.6c0 4.4-3 8.2-7 9.3-4-1.1-7-4.9-7-9.3V5.6z M8.5 12.2l2.4 2.4 4.6-4.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </span>
              <h3 className="mt-4 text-lg font-semibold text-header">{f.title}</h3>
              <p className="mt-2 text-[0.9375rem] leading-relaxed text-secondary">{f.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-14 grid gap-8 lg:grid-cols-2">
          <div>
            <Screenshot src="/landing/audit-trail.png" alt="Audit trail with filters, each entry showing time, user, action, document and reason" />
            <p className="mt-3 text-center text-sm text-secondary">Audit trail with integrity check and CSV export</p>
          </div>
          <div>
            <Screenshot src="/landing/team-roles.png" alt="Team page listing colleagues with their roles: company admin, document author, QA approver, document controller, viewer" />
            <p className="mt-3 text-center text-sm text-secondary">Team members and their roles</p>
          </div>
        </div>
        <p className="mx-auto mt-10 max-w-3xl text-center text-sm text-secondary">
          Electronic signatures and a QA approval workflow aligned with 21 CFR Part 11 and EU Annex 11 are on our roadmap.
        </p>
      </div>
    </section>
  );
}

const INCLUDED = [
  {
    group: "Documents",
    items: ["Folders, versions and full version history", "Document type, product, market and expiry dates", "Filters, search and a details panel for every file", "Files up to 50 MB each"],
  },
  {
    group: "Sharing",
    items: ["Share the exact version with any of your exporters", "Access for 7 days to a year, or no end date", "Extend or revoke any time, with reasons recorded", "Invite exporters by email"],
  },
  {
    group: "Visibility",
    items: ["Every exporter view and download logged", "Overview with expiring certificates and access ending", "Exporter portal organised by product", "Superseded versions flagged to exporters"],
  },
  {
    group: "Control and compliance",
    items: ["Roles based on Revised Schedule M", "Team management and user deactivation", "Tamper-evident audit trail with CSV export", "Invite-only Google sign-in, private storage"],
  },
];

function Pricing() {
  return (
    <section id="pricing" aria-labelledby="pricing-title" className="scroll-mt-20 border-t border-contrast-10">
      <div className="mx-auto max-w-7xl px-5 py-20 md:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-primary-text">Pricing</p>
          <h2 id="pricing-title" className="mt-3 text-3xl font-bold tracking-tight text-header md:text-4xl">
            Enterprise-grade document control, without the enterprise price
          </h2>
          <p className="mt-4 text-[1.0625rem] leading-relaxed text-secondary">
            Built for MSME manufacturers and exporters. Every feature on this page is included, with no modules to unlock.
          </p>
        </div>

        <div className="mx-auto mt-12 max-w-5xl overflow-hidden rounded-2xl bg-base shadow-[0_0_0_1px_var(--lumo-contrast-10pct),0_24px_60px_-24px_hsla(214,60%,25%,0.3)]">
          <div className="flex flex-col gap-6 bg-gradient-to-br from-primary to-[hsl(214,100%,40%)] px-8 py-9 text-white md:flex-row md:items-center md:justify-between md:px-10">
            <div>
              <p className="text-lg font-medium text-white/75 line-through decoration-white/50">Not lakhs a year.</p>
              <p className="mt-1 text-4xl font-bold tracking-tight sm:text-5xl">A few thousand a month.</p>
              <p className="mt-3 max-w-xl text-[0.9375rem] text-white/85">
                Everything below is included: documents, sharing, exporter visibility, roles and the audit trail.
              </p>
            </div>
            <a href="#request-access" className="inline-flex h-12 shrink-0 items-center justify-center rounded-lumo-m bg-white px-6 text-[1rem] font-semibold text-primary-text transition hover:bg-white/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
              Get your price
            </a>
          </div>
          <div className="grid gap-x-10 gap-y-8 px-8 py-9 sm:grid-cols-2 md:px-10 lg:grid-cols-4">
            {INCLUDED.map((g) => (
              <div key={g.group}>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-header">{g.group}</h3>
                <ul className="mt-4 flex flex-col gap-3">
                  {g.items.map((i) => (
                    <li key={i} className="flex items-start gap-2.5 text-[0.9375rem] leading-snug text-body"><Check className="mt-0.5" /> {i}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <p className="mt-6 text-center text-sm text-secondary">
          Tell us about your company in the form below and we&apos;ll send your price. Or write to <a href="mailto:hello@krylox.ai" className="font-medium text-primary-text hover:underline">hello@krylox.ai</a>.
        </p>
      </div>
    </section>
  );
}

const FAQ = [
  { q: "How much does it cost?", a: "A few thousand rupees a month, not the lakhs a year that enterprise document systems cost, with every feature included: documents and versions, sharing, exporter activity, expiry warnings, roles and the audit trail. Request access and we'll send the price for your company." },
  { q: "Who is CuraLex - DMS for?", a: "Pharmaceutical manufacturers, especially MSMEs, who supply merchant exporters, and the exporters who need those manufacturers' documents for registrations and renewals in their target markets." },
  { q: "How do exporters join?", a: "A manufacturer invites them by email from CuraLex. The exporter signs in with that Google account and immediately sees what has been shared with them." },
  { q: "Which documents can I manage?", a: "Any file up to 50 MB: certificates of analysis, CoPPs, GMP and ISO certificates, manufacturing licences, DMFs, stability data, specifications, SOPs and more." },
  { q: "Do I need a Google account?", a: "Yes. Sign-in is with Google, either a Gmail address or your company's Google Workspace account. CuraLex never handles passwords." },
  { q: "Can I take back access?", a: "Yes. Revoke a single document, several, or everything for an exporter at any time, or set an end date when you share. Every change is recorded with a reason." },
  { q: "Does it replace our QMS?", a: "No. CuraLex is a controlled place to keep and share the documents your QMS produces, with access control and an audit trail around the sharing." },
];

function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-title" className="scroll-mt-20 border-t border-contrast-10 bg-contrast-5/40">
      <div className="mx-auto max-w-3xl px-5 py-20 md:px-8">
        <h2 id="faq-title" className="text-center text-3xl font-bold tracking-tight text-header">Questions</h2>
        <div className="mt-10 flex flex-col gap-3">
          {FAQ.map((f) => (
            <details key={f.q} name="faq" className="group card px-5 py-4 open:pb-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[1.0625rem] font-medium text-header marker:content-none">
                {f.q}
                <svg viewBox="0 0 24 24" fill="none" className="size-5 shrink-0 text-secondary transition-transform group-open:rotate-45" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              </summary>
              <p className="mt-3 text-[0.9375rem] leading-relaxed text-secondary">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function RequestAccess() {
  return (
    <section id="request-access" aria-labelledby="request-title" className="scroll-mt-20">
      <div className="mx-auto grid max-w-7xl gap-12 px-5 py-20 md:px-8 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-primary-text">Get started</p>
          <h2 id="request-title" className="mt-3 text-3xl font-bold tracking-tight text-header md:text-4xl">Request access</h2>
          <p className="mt-4 text-[1.0625rem] leading-relaxed text-secondary">
            CuraLex - DMS is invite-only. Tell us about your company and we&apos;ll set up your workspace.
          </p>
          <ol className="mt-8 flex flex-col gap-5">
            {[
              ["We review your request", "Usually within one working day."],
              ["We set up your company", "You get an invitation email for your Google account."],
              ["Invite your exporters or colleagues", "Upload documents and start sharing the same day."],
            ].map(([t, d], i) => (
              <li key={t} className="flex gap-4">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary-10 text-sm font-semibold text-primary-text" aria-hidden="true">{i + 1}</span>
                <span>
                  <span className="block font-medium text-header">{t}</span>
                  <span className="block text-[0.9375rem] text-secondary">{d}</span>
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-8 text-[0.9375rem] text-secondary">
            Prefer email? Write to <a href="mailto:hello@krylox.ai" className="font-medium text-primary-text hover:underline">hello@krylox.ai</a>.
          </p>
        </div>
        <div className="card p-6 md:p-8 lg:col-span-7">
          <RequestAccessForm />
        </div>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-contrast-10">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-5 py-8 text-sm text-secondary md:flex-row md:px-8">
        <Logo size="sm" />
        <p>© Krylox. CuraLex - DMS.</p>
        <div className="flex gap-5">
          <a href="mailto:hello@krylox.ai" className="hover:text-header">hello@krylox.ai</a>
          <Link href="/login" className="hover:text-header">Sign in</Link>
        </div>
      </div>
    </footer>
  );
}

function Check({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`size-4 shrink-0 text-success-text ${className}`} aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
