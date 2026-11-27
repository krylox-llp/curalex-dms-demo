"use client";

import { useEffect, useRef } from "react";

/** Header search: a plain GET form to the workspace's search page; Ctrl/⌘+K focuses it. */
export function GlobalSearch({ action, placeholder }: { action: string; placeholder: string }) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        ref.current?.focus();
        ref.current?.select();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <form action={action} role="search" className="min-w-0 flex-1 md:max-w-lg">
      <label className="flex h-9 items-center gap-2 rounded-lumo-m bg-contrast-5 px-3 text-secondary focus-within:ring-2 focus-within:ring-primary-50">
        <svg viewBox="0 0 24 24" fill="none" className="size-4 shrink-0" aria-hidden="true">
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
          <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <span className="sr-only">Search</span>
        <input
          ref={ref}
          type="search"
          name="q"
          required
          maxLength={100}
          placeholder={placeholder}
          aria-keyshortcuts="Control+K Meta+K"
          className="min-w-0 flex-1 bg-transparent text-sm text-header outline-none placeholder:text-secondary"
        />
        <kbd className="hidden rounded border border-contrast-20 bg-base px-1.5 py-0.5 font-sans text-[0.6875rem] font-medium text-secondary sm:inline">
          Ctrl K
        </kbd>
      </label>
    </form>
  );
}
