// The forms a client signed before a visit (Services plan 2, B4; several, plan 4, 3.1), read through the server (op
// clientForm): signed answers are health notes, so no rule lets a browser read them.
import { useEffect, useState } from "react";
import { bookingsAdmin } from "./bookingsApi";
import "./clientCard.css";

export type SignedForm = { signedName: string; signedAt: string; title: string; text: string; answers: Array<{ label: string; answer: string }>; current: boolean; runsOut?: string; ranOut?: boolean };
/** One of the shop's forms (or one no longer asked that this client signed), with their signature or none. */
export type ClientFormRow = { id: string; title: string; on: boolean; signed: SignedForm | null };

/** The client's forms; `asks` is whether the shop asks for any (undefined while loading). */
export function useClientForms(email: string): { forms: ClientFormRow[]; asks: boolean | undefined } {
  const [state, setState] = useState<{ forms: ClientFormRow[]; asks: boolean | undefined }>({ forms: [], asks: undefined });
  useEffect(() => {
    let alive = true;
    setState({ forms: [], asks: undefined });
    if (!email) return;
    bookingsAdmin<{ forms?: ClientFormRow[]; form: SignedForm | null; asks: boolean }>("clientForm", { email })
      .then((a) => { if (alive) setState({ forms: a.forms || (a.form ? [{ id: "main", title: a.form.title, on: a.asks, signed: a.form }] : []), asks: a.asks }); })
      .catch(() => { if (alive) setState({ forms: [], asks: false }); });
    return () => { alive = false; };
  }, [email]);
  return state;
}

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

/** What the owner reads about one form: who signed it and when, whether it still counts, and their answers. */
function FormLine({ row, many }: { row: ClientFormRow; many: boolean }) {
  const f = row.signed;
  if (!f) return <span className="cc-answer">{many ? `${row.title}: ` : ""}Not filled in yet</span>;
  const state = !f.current ? " (an older wording: they'll be asked again)" : f.ranOut ? ` (ran out ${day(f.runsOut!)}: they'll be asked again)` : f.runsOut ? `, until ${day(f.runsOut)}` : "";
  return (
    <>
      <span className="cc-answer">{f.title}: signed by {f.signedName}, {day(f.signedAt)}{state}</span>
      {f.answers.map((a) => <span key={a.label} className="cc-answer"><strong>{/[?:.!]$/.test(a.label.trim()) ? a.label.trim() : `${a.label.trim()}:`}</strong> {a.answer}</span>)}
    </>
  );
}

/** Rows for a description list: each form, who signed it and when, and their answers. Nothing while the shop asks none. */
export function ClientFormFacts({ email, wrap = false }: { email: string; wrap?: boolean }) {
  const { forms, asks } = useClientForms(email);
  if (asks === undefined || (!asks && !forms.some((r) => r.signed))) return null;
  const value = <>{forms.map((row) => <FormLine key={row.id} row={row} many={forms.length > 1} />)}</>;
  const label = forms.length > 1 ? "Forms" : "Form";
  return wrap ? <div><dt>{label}</dt><dd>{value}</dd></div> : <><dt>{label}</dt><dd>{value}</dd></>;
}
