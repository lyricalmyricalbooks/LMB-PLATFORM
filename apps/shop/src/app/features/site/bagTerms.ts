// Style › Cart drawer › Terms checkbox (off by default): a Shopify-style "I agree to the terms"
// tick above the bag's checkout button. It only gates the bag's button (a reminder, not a contract
// record); the tick is kept for this tab so reopening the bag doesn't ask again.
const KEY = "lm_bag_terms";

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem"> | undefined;
const session = (): Store => (typeof sessionStorage === "undefined" ? undefined : sessionStorage);

export function termsAgreed(storage: Store = session()): boolean {
  try { return storage?.getItem(KEY) === "1"; } catch { return false; }
}

export function rememberTermsAgreed(agreed: boolean, storage: Store = session()): boolean {
  try {
    if (agreed) storage?.setItem(KEY, "1");
    else storage?.removeItem(KEY);
  } catch { /* storage blocked: the tick stays for this visit of the bag only */ }
  return agreed;
}

/** The terms page link exists only when Settings › General › Policies has terms text. */
export function hasTermsPage(policies: any): boolean {
  return typeof policies?.terms === "string" && policies.terms.trim().length > 0;
}

/** Splits "I agree to the {terms}." around the placeholder; no placeholder → the link goes at the end. */
export function splitTermsLabel(text: string): [string, string] {
  const at = text.indexOf("{terms}");
  if (at < 0) return [text.trimEnd() + " ", ""];
  return [text.slice(0, at), text.slice(at + "{terms}".length)];
}
