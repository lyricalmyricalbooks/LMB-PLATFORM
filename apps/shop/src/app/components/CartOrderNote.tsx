import { useId, useState } from "react";
import { getCopy } from "../features/site/storeCopy";
import { bagNote, rememberBagNote, ORDER_NOTE_MAX } from "../features/site/bagNote";

// Style › Cart drawer › Total & checkout button › Order note box (off by default).
// Like a Shopify cart note: saved for this tab as the shopper types, then shown again in
// checkout's order-note box (which turns on with it) and sent with the order from there.
export function CartOrderNote({ design }: { design: any }) {
  const id = useId();
  const [note, setNote] = useState(() => bagNote());
  const c = (key: string, vars?: Record<string, string | number>) => getCopy(design, key, vars);
  return <section data-studio-target="style:cartDrawer|copy:Cart" data-studio-label="Bag order note" className="fm-bag-pad fm-bag-rule border-t py-4">
    <details open={note.trim() ? true : undefined}>
      <summary className="fm-bag-meta cursor-pointer min-h-[44px] flex items-center">{c("cartNoteToggle")}</summary>
      <label className="block fm-bag-meta mt-2" htmlFor={`${id}-note`}>{c("cartNoteLabel")}</label>
      <textarea id={`${id}-note`} className="fm-bag-input w-full mt-2" rows={3} maxLength={ORDER_NOTE_MAX}
        aria-describedby={`${id}-help`} value={note}
        onChange={event => setNote(rememberBagNote(event.target.value))} />
      <p id={`${id}-help`} className="fm-bag-meta mt-2" style={{ textTransform: "none", letterSpacing: "0.02em" }}>{c("cartNoteHelp", { max: ORDER_NOTE_MAX })}</p>
    </details>
  </section>;
}
