import { useId, useState } from "react";
import { getCopy } from "../features/site/storeCopy";
import { clearSharedDiscount, rememberDiscountCode, sharedDiscount } from "../features/site/sharedDiscount";

// Style › Cart drawer › Total & checkout button › Discount code box (off by default).
// Like a Shopify cart's code field, but it only remembers the code for this tab: checkout fills it
// into its own discount box and checks it with the server like a typed code, so the bag never
// shows a saving it can't promise and nothing here changes a price.
export function CartDiscountCode({ design }: { design: any }) {
  const id = useId();
  const [saved, setSaved] = useState(() => sharedDiscount());
  const [draft, setDraft] = useState("");
  const [invalid, setInvalid] = useState(false);
  const c = (key: string, vars?: Record<string, string | number>) => getCopy(design, key, vars);
  const save = () => {
    const code = rememberDiscountCode(draft);
    if (!code) { setInvalid(true); return; }
    setSaved(code); setDraft(""); setInvalid(false);
  };
  return <section data-studio-target="style:cartDrawer|copy:Cart" data-studio-label="Bag discount code" className="fm-bag-pad fm-bag-rule border-t py-4">
    {saved ? (
      <div className="fm-bag-row fm-bag-meta gap-3" role="status">
        <span style={{ textTransform: "none", letterSpacing: "0.02em" }}>{c("cartCodeSaved", { code: saved })}</span>
        <button type="button" className="underline min-h-[44px] shrink-0" onClick={() => { clearSharedDiscount(); setSaved(""); }}>{c("cartCodeRemove")}</button>
      </div>
    ) : (
      <details>
        <summary className="fm-bag-meta cursor-pointer min-h-[44px] flex items-center">{c("cartCodeToggle")}</summary>
        <form className="flex flex-wrap items-end gap-2 mt-2" onSubmit={event => { event.preventDefault(); save(); }}>
          <div className="flex-1 min-w-[10rem]">
            <label className="block fm-bag-meta" htmlFor={`${id}-code`}>{c("cartCodeLabel")}</label>
            <input id={`${id}-code`} className="fm-bag-input w-full mt-2" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={32}
              value={draft} aria-invalid={invalid || undefined} aria-describedby={invalid ? `${id}-error` : undefined}
              onChange={event => { setDraft(event.target.value.toUpperCase()); setInvalid(false); }} />
          </div>
          <button type="submit" className="fm-bag-upsell-btn min-h-[44px] px-4" disabled={!draft.trim()}>{c("cartCodeSave")}</button>
        </form>
        {invalid && <p id={`${id}-error`} role="alert" className="fm-bag-meta fm-bag-warn mt-2">{c("cartCodeInvalid")}</p>}
      </details>
    )}
  </section>;
}
