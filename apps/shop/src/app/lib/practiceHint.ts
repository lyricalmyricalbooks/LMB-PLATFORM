// Practice checkout on a private platform shop (plan 7.6; functions/practiceCheckout.js decides everything). This
// browser only keeps a hint that the owner started practice here, so the storefront can step past the store-status page
// and the checkout knows to ask the server. A hint changes nothing the server does: a visitor who sets it still meets a
// closed checkout, and an expired one makes the checkout refuse instead of taking a real payment.

const HINT_KEY = "fm_practice_until";

export function rememberPractice(until: string): void {
  try { if (until) localStorage.setItem(HINT_KEY, until); else localStorage.removeItem(HINT_KEY); } catch { /* No storage: the shop shows its status page. */ }
}

/** The hint's end time when it is still running in this browser, else "". */
export function practiceHint(now = Date.now()): string {
  let until = "";
  try { until = localStorage.getItem(HINT_KEY) || ""; } catch { return ""; }
  return Date.parse(until) > now ? until : "";
}
