// The form a client signed before their first visit (Services plan 2, B4), read through the server (op clientForm):
// signed answers are health notes, so no rule lets a browser read them.
import { useEffect, useState } from "react";
import { bookingsAdmin } from "./bookingsApi";
import "./clientCard.css";

export type SignedForm = { signedName: string; signedAt: string; title: string; text: string; answers: Array<{ label: string; answer: string }>; current: boolean };

/** The client's signed form, or null; `asks` is whether the shop asks for one at all (undefined while loading). */
export function useClientForm(email: string): { form: SignedForm | null; asks: boolean | undefined } {
  const [state, setState] = useState<{ form: SignedForm | null; asks: boolean | undefined }>({ form: null, asks: undefined });
  useEffect(() => {
    let alive = true;
    setState({ form: null, asks: undefined });
    if (!email) return;
    bookingsAdmin<{ form: SignedForm | null; asks: boolean }>("clientForm", { email })
      .then((a) => { if (alive) setState({ form: a.form, asks: a.asks }); })
      .catch(() => { if (alive) setState({ form: null, asks: false }); });
    return () => { alive = false; };
  }, [email]);
  return state;
}

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

/** Rows for a description list: the form's name, who signed it and when, and their answers. Nothing while the shop asks none. */
export function ClientFormFacts({ email, wrap = false }: { email: string; wrap?: boolean }) {
  const { form, asks } = useClientForm(email);
  if (asks === undefined || (!asks && !form)) return null;
  const value = !form ? "Not filled in yet" : (
    <>
      <span className="cc-answer">{form.title}: signed by {form.signedName}, {day(form.signedAt)}{form.current ? "" : " (an older wording: they'll be asked again)"}</span>
      {form.answers.map((a) => <span key={a.label} className="cc-answer"><strong>{/[?:.!]$/.test(a.label.trim()) ? a.label.trim() : `${a.label.trim()}:`}</strong> {a.answer}</span>)}
    </>
  );
  return wrap ? <div><dt>Form</dt><dd>{value}</dd></div> : <><dt>Form</dt><dd>{value}</dd></>;
}
