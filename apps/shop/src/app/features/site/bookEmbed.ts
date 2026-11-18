// The booking page inside another website (Bookings plan 4, 2.6): public/book-button.js opens /book?embed=1 in a frame
// on top of the owner's other site. The page then leaves out the shop's header and footer and its back link, asks the
// other site to close the frame on Escape, and goes to the card page in the whole window (card pages refuse frames).

const FLAG = "fm-book-embed";

/** True when the address asks for the framed booking page. */
export function embedFromSearch(search: string): boolean {
  return new URLSearchParams(search).get("embed") === "1";
}

function framed(): boolean {
  try { return typeof window !== "undefined" && window.self !== window.top; } catch { return true; }
}

/**
 * Whether this booking page is shown framed on another site. The first address carries `embed=1`; the page's own links
 * drop it, so the tab remembers it (session storage is kept per frame and per site). Never in Studio's preview, which
 * frames the page on the shop's own address and says `preview=true`.
 */
export function bookEmbedded(search: string): boolean {
  if (!framed() || new URLSearchParams(search).get("preview") === "true") return false;
  try {
    if (embedFromSearch(search)) sessionStorage.setItem(FLAG, "1");
    return sessionStorage.getItem(FLAG) === "1";
  } catch {
    return embedFromSearch(search);
  }
}

/** Ask the page around the frame to close it (public/book-button.js listens for this). */
export function closeEmbed(): void {
  try { window.parent.postMessage({ type: "fm-book-close" }, "*"); } catch { /* nothing to close */ }
}

/**
 * Go to a card page. Framed, the whole window goes (the click that got here lets a frame do that); if the browser
 * refuses, a new tab opens instead. Not framed, the page simply goes there.
 */
export function goToPayment(url: string, embedded: boolean): void {
  if (embedded) {
    try { window.top!.location.href = url; return; } catch { /* refused: a new tab instead */ }
    if (window.open(url, "_blank", "noopener")) return;
  }
  window.location.href = url;
}

const FROM = "fm-book-from";

/**
 * Where this visit came from (plan 4, 2.7): the Share dialog's ready links carry `from=instagram` and the like. The
 * booking page's own links drop it, so the tab keeps it until the booking is made. Inside the Book now button's frame
 * it is the button. The server keeps only the channels it knows (`bookingChannel`).
 */
export function bookingFrom(search: string, embedded: boolean): string {
  const said = new URLSearchParams(search).get("from") || "";
  try {
    if (said) sessionStorage.setItem(FROM, said);
    return sessionStorage.getItem(FROM) || (embedded ? "button" : "");
  } catch {
    return said || (embedded ? "button" : "");
  }
}
