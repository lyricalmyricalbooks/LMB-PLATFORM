// The page a team member lands on after Google's Allow page for their busy times (service.js personSignedIn). They are
// usually on their own phone and not signed in to the shop's admin, so the platform answers with this short page itself:
// plain words, inline style only (the web server's page rules allow nothing else), the Colophon look.

const escape = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const WORDS = Object.freeze({
  linked: {
    title: "Your calendar is linked",
    body: (shop) => `When your Google Calendar shows you as busy, clients can't book you at ${shop} then. Only busy or free is shared, never what your events are.`,
    tone: "#a8e6c6",
  },
  denied: {
    title: "Nothing was linked",
    body: (shop) => `You didn't allow Colophon to see when you're busy, so ${shop} books you by its own hours only. Ask for a new link if you change your mind.`,
    tone: "#efece6",
  },
  failed: {
    title: "That didn't work",
    body: (shop) => `Google didn't finish linking your calendar. Ask ${shop} for a new link and try again in a minute.`,
    tone: "#f6d7c8",
  },
});

/** The answer for one outcome: "linked", "denied" or "failed". */
export function teamCalendarPage(outcome, shopName) {
  const w = WORDS[outcome] ?? WORDS.failed;
  const shop = escape(shopName || "the shop");
  return {
    status: 200,
    body: { calendar: Object.hasOwn(WORDS, outcome) ? outcome : "failed" },
    html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escape(w.title)}</title></head>`
      + `<body style="margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;box-sizing:border-box;background:#f4f1ea;color:#161513;font:16px/1.55 system-ui,-apple-system,'Segoe UI',sans-serif">`
      + `<main style="max-width:440px;width:100%;padding:32px 28px;border-radius:28px;background:${w.tone}">`
      + `<p style="margin:0 0 10px;font:600 12px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;text-transform:uppercase">${shop}</p>`
      + `<h1 style="margin:0 0 12px;font-size:28px;line-height:1.15;letter-spacing:-.01em">${escape(w.title)}</h1>`
      + `<p style="margin:0">${w.body(shop)}</p>`
      + `<p style="margin:20px 0 0;font-size:14px;opacity:.75">You can close this page.</p>`
      + `</main></body></html>`,
  };
}
