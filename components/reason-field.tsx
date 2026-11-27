"use client";

/** Required "reason for change" input; the value is stored in the audit trail. */
export function ReasonField({
  value,
  onChange,
  placeholder = "e.g. Superseded by a new batch CoA",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="field-label mt-4">
      Reason
      <textarea
        required
        maxLength={500}
        rows={2}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="text-field h-auto py-2"
      />
      <span className="field-helper">Recorded in the audit trail with your name and the time.</span>
    </label>
  );
}
