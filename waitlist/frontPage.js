// The front page's two states (design handoff "Colophon front page", 9 November 2026). Until the platform says sign-up
// is open (waitlist/pricing.js), the email pill joins the waitlist. Once it is open, the same pill starts a free trial:
// the email is handed to the front door (join/), which fills it in, and the buttons say "Start free trial". Plain ES
// module with no imports, so the page loads it as is. Words here are customer-facing: never a rival, never a price.

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Where the typed email waits for the front door. Session storage keeps it out of the address bar and the logs. */
export const HANDOFF_KEY = "colophon:join-email";

/** What the page says in each state. `trialDays` comes only from the platform's plans answer. */
export function frontPageWords({ open = false, trialDays = null } = {}) {
  if (!open) {
    return {
      cta: "Join the waitlist",
      ctaShort: "Join",
      go: "Join the waitlist",
      build: "Join the waitlist",
      submit: "Join the waitlist",
      note: "Free setup · no card · we're starting in Canada",
      consent: true,
    };
  }
  return {
    cta: "Start free trial",
    ctaShort: "Start trial",
    go: "Start your shop",
    build: "Build your shop",
    submit: "Start free trial",
    // The trial starts the day the shop is made (signup.js begin), so the words count from today, not from opening.
    note: Number.isInteger(trialDays) && trialDays > 0 ? `Free setup · no card · ${trialDays} days free from today` : "Free setup · no card",
    consent: false,
  };
}

/** Puts one state's words and links on the page. */
export function showFrontPage(doc, words, { signupUrl = "" } = {}) {
  const $ = (id) => doc.getElementById(id);
  $("cta-long").textContent = words.cta;
  $("cta-short").textContent = words.ctaShort;
  $("cta").href = signupUrl || "#start";
  $("start-submit").textContent = words.submit;
  $("start-note").textContent = words.note;
  $("start-consent").hidden = !words.consent;
  // Only the buttons that start (they point at the email box) change; "See Colophon for services" stays as it is.
  // The hero's and the starters card's buttons say what they do: join the waitlist, or start a shop (25 November 2026:
  // "Start your shop" used to lead to the waitlist form).
  for (const [selector, text] of [['.cp-fp-go[href="#start"]', words.go], ['.cp-fp-arrow[href="#start"]', words.build]]) {
    for (const link of doc.querySelectorAll?.(selector) ?? []) {
      const words = [...link.childNodes].find((node) => node.nodeType === 3);
      if (words) words.textContent = `${text} `;
    }
  }
}

/** Leaves the email for the front door. Storage can be off (private windows): the front door then just asks again. */
export function handOff(storage, email) {
  try {
    storage?.setItem(HANDOFF_KEY, email);
  } catch {
    // Nothing to do: the email box on the front door starts empty.
  }
}

/** The front door's side: the email the front page left, once, then forgotten. */
export function takeHandOff(storage) {
  try {
    const email = storage?.getItem(HANDOFF_KEY) ?? "";
    storage?.removeItem(HANDOFF_KEY);
    return EMAIL.test(email) ? email : "";
  } catch {
    return "";
  }
}
