// Style › Cart drawer › Order note box (off by default): a Shopify-style "Add a note to your order"
// box in the bag. The note is kept for this tab only and checkout puts it in its own order-note box,
// where the shopper sees it again before paying; it reaches the order exactly like a note typed there.
const KEY = "lm_bag_note";
export const ORDER_NOTE_MAX = 500;

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem"> | undefined;
const session = (): Store => (typeof sessionStorage === "undefined" ? undefined : sessionStorage);

export function bagNote(storage: Store = session()): string {
  try {
    return String(storage?.getItem(KEY) || "").slice(0, ORDER_NOTE_MAX);
  } catch {
    return "";
  }
}

/** Saves the note as typed (cut to 500 characters); a blank note removes it. Returns what was kept. */
export function rememberBagNote(raw: string, storage: Store = session()): string {
  const note = String(raw ?? "").slice(0, ORDER_NOTE_MAX);
  try {
    if (note.trim()) storage?.setItem(KEY, note);
    else storage?.removeItem(KEY);
  } catch { /* storage blocked: the note simply stays in the box */ }
  return note;
}

export function clearBagNote(storage: Store = session()) {
  try { storage?.removeItem(KEY); } catch { /* nothing to clear */ }
}

/** Checkout shows its order-note box when it is switched on, or when the bag asks shoppers for a note. */
export function orderNoteBoxOn(design: any): boolean {
  return Boolean(design?.showOrderNote) || design?.cartDrawerShowOrderNote === true;
}
