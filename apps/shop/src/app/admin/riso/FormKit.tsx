import { useId, type ReactNode } from "react";

/*
 * The v4 form kit (Julian's mockups, 12 Nov 2026): every form page reads the same way. Sections are named on the
 * left, their fields sit in one card on the right, anything with money shows its total in a rail beside the form,
 * and one status bar at the bottom says what is left to do and holds the one main button.
 */

/** The page: the sections, with an optional summary rail on the right (it wraps below on narrow panes). */
export function FormPage({ rail, children }: { rail?: ReactNode; children: ReactNode }) {
  return (
    <div className="rp-fk" data-rail={rail ? "" : undefined}>
      <div className="rp-fk-sections">{children}</div>
      {rail && <aside className="rp-fk-rail">{rail}</aside>}
    </div>
  );
}

/** One section: its title and one plain line on the left, its fields in one card on the right. */
export function FormSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  const id = useId();
  return (
    <section className="rp-fk-section" aria-labelledby={id}>
      <div className="rp-fk-section-head">
        <h2 id={id} className="rp-fk-section-title">{title}</h2>
        {description && <p className="rp-fk-section-desc">{description}</p>}
      </div>
      <div className="rp-fk-card">{children}</div>
    </section>
  );
}

/** Related short fields share a row (they wrap on a phone). */
export function FormRow({ children }: { children: ReactNode }) {
  return <div className="rp-fk-row">{children}</div>;
}

/**
 * A field: label above, hint below. `required` writes "Required" at the label's right; while `empty` is true too
 * the word and the input's ring turn amber, so the eye finds what is left.
 */
export function FormField({ label, hint, error, required, empty, prefix, suffix, children }: {
  label: string; hint?: string; error?: string; required?: boolean; empty?: boolean; prefix?: string; suffix?: string;
  children: (props: { id: string; "aria-describedby"?: string; "aria-required"?: boolean; "aria-invalid"?: boolean }) => ReactNode;
}) {
  const id = useId();
  const missing = !!(required && empty) || !!error;
  const note = error || hint;
  return (
    <div className="rp-fk-field" data-missing={missing ? "" : undefined}>
      <div className="rp-fk-label-row">
        <label htmlFor={id} className="rp-fk-label">{label}</label>
        {required && <span className="rp-fk-required">Required</span>}
      </div>
      <div className="rp-fk-control" data-prefix={prefix ? "" : undefined} data-suffix={suffix ? "" : undefined}>
        {prefix && <span className="rp-fk-affix" aria-hidden>{prefix}</span>}
        {children({ id, "aria-describedby": note ? `${id}-hint` : undefined, "aria-required": required || undefined, "aria-invalid": missing || undefined })}
        {suffix && <span className="rp-fk-affix" aria-hidden>{suffix}</span>}
      </div>
      {note && <span id={`${id}-hint`} className="rp-fk-hint" data-error={error ? "" : undefined} role={error ? "alert" : undefined}>{note}</span>}
    </div>
  );
}

/** Up to four short choices as pill buttons (long lists use a select instead). */
export function FormChoice<T extends string>({ label, options, value, onChange }: {
  label: string; options: { value: T; label: string }[]; value: T; onChange: (v: T) => void;
}) {
  const id = useId();
  return (
    <div className="rp-fk-field">
      <span id={id} className="rp-fk-label">{label}</span>
      <div className="rp-fk-choice" role="radiogroup" aria-labelledby={id}>
        {options.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>
        ))}
      </div>
    </div>
  );
}

/** A switch on its own row, with a bold label and a short hint. */
export function FormToggle({ label, hint, checked, onChange, disabled }: {
  label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="rp-fk-toggle">
      <span className="rp-fk-toggle-text">
        <span id={id} className="rp-fk-toggle-label">{label}</span>
        {hint && <span className="rp-fk-hint">{hint}</span>}
      </span>
      <button type="button" role="switch" aria-checked={checked} aria-labelledby={id} disabled={disabled}
        className="rp-fk-switch" onClick={() => onChange(!checked)} />
    </div>
  );
}

/** A value that is changed somewhere else, with a link there. */
export function FormReadOnly({ label, value, action }: { label: string; value: ReactNode; action?: ReactNode }) {
  return (
    <div className="rp-fk-field">
      <span className="rp-fk-label">{label}</span>
      <div className="rp-fk-readonly"><span>{value}</span>{action}</div>
    </div>
  );
}

export type RailTone = "mint" | "sky" | "white";
/** What the form adds up to: a title, one big value (optional), a short line, then a few rows and a note. */
export function SummaryRail({ tone = "white", title, value, sub, rows, note }: {
  tone?: RailTone; title: string; value?: ReactNode; sub?: ReactNode; rows?: { label: string; value: ReactNode }[]; note?: ReactNode;
}) {
  return (
    <div className="rp-fk-summary" data-tone={tone} aria-live="polite">
      <div className="rp-fk-summary-title">{title}</div>
      {value != null && value !== "" && <div className="rp-fk-summary-value">{value}</div>}
      {sub && <div className="rp-fk-summary-sub">{sub}</div>}
      {rows && rows.length > 0 && (
        <dl className="rp-fk-summary-rows">
          {rows.map((r) => <div key={r.label}><dt>{r.label}</dt><dd>{r.value}</dd></div>)}
        </dl>
      )}
      {note && <p className="rp-fk-summary-note">{note}</p>}
    </div>
  );
}

export type FormStatus = { tone: "good" | "warn"; text: string };
/**
 * The status bar's words, in the kit's order: missing required fields first, then a create form's "Ready to …",
 * then "Unsaved changes", then "All saved".
 */
export function formStatus({ missing, create, verb = "create", dirty }: { missing: number; create?: boolean; verb?: string; dirty?: boolean }): FormStatus {
  if (missing > 0) return { tone: "warn", text: missing === 1 ? "1 required field to fill in" : `${missing} required fields to fill in` };
  if (create) return { tone: "good", text: `Ready to ${verb}` };
  if (dirty) return { tone: "warn", text: "Unsaved changes" };
  return { tone: "good", text: "All saved" };
}

/**
 * The one status bar at the end of a form page: a dot and what is left on the left, Cancel / Discard and one main
 * button on the right. The main button is dimmed while something required is missing; pressing it anyway calls
 * `onBlocked` (the page shows "Fill in the highlighted fields").
 */
export function StatusBar({ status, primaryLabel, onPrimary, busy, blocked, onBlocked, cancelLabel, onCancel }: {
  status: FormStatus; primaryLabel: string; onPrimary: () => void; busy?: boolean; blocked?: boolean; onBlocked?: () => void;
  cancelLabel?: string; onCancel?: () => void;
}) {
  return (
    <div className="rp-fk-status" role="region" aria-label="Form status">
      <span className="rp-fk-status-text" role="status"><span className="rp-fk-dot" data-tone={status.tone} aria-hidden />{status.text}</span>
      <span className="rp-fk-status-actions">
        {onCancel && <button type="button" className="rp-fk-cancel" onClick={onCancel} disabled={busy}>{cancelLabel || "Cancel"}</button>}
        <button type="button" className="rp-fk-primary" aria-disabled={blocked || busy || undefined}
          onClick={() => { if (busy) return; if (blocked) { onBlocked?.(); return; } onPrimary(); }}>
          {busy ? "Saving…" : primaryLabel}
        </button>
      </span>
    </div>
  );
}
