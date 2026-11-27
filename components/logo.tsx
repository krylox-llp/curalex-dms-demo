export function Logo({ size = "md" }: { size?: "sm" | "md" }) {
  return (
    <div className="relative flex items-center gap-2.5">
      <svg viewBox="0 0 24 24" className={size === "sm" ? "size-7 text-primary" : "size-8 text-primary"} aria-hidden="true">
        <path d="M12 2l8.5 3.2v6.3c0 5.2-3.6 9.6-8.5 10.5-4.9-.9-8.5-5.3-8.5-10.5V5.2z" fill="currentColor" />
        <path d="M10.6 7.5h2.8v3.1h3.1v2.8h-3.1v3.1h-2.8v-3.1H7.5v-2.8h3.1z" fill="#fff" />
      </svg>
      <span className={`${size === "sm" ? "text-lg" : "text-xl"} flex items-center font-semibold tracking-tight text-header`}>
        <span>
          Cura<span className="text-primary-text">Lex</span>
        </span>
        {/* Product name: CuraLex - DMS */}
        <span className="ml-2.5 border-l border-contrast-20 pl-2.5 font-medium text-secondary">DMS</span>
        <span className="sr-only"> - Document Management System</span>
      </span>
    </div>
  );
}
