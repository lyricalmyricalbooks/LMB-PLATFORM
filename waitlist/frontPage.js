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
      submit: "Join the waitlist",
      note: "Free setup · no card · we're starting in Canada",
      consent: true,
      founding: { label: "Join the waitlist", href: "#start" },
    };
  }
  return {
    cta: "Start free trial",
    ctaShort: "Start trial",
    submit: "Start free trial",
    note: Number.isInteger(trialDays) && trialDays > 0 ? `Free setup · no card · ${trialDays} days free once you open` : "Free setup · no card",
    consent: false,
    founding: { label: "See plans", href: "#pricing" },
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
  $("founding-go").textContent = words.founding.label;
  $("founding-go").href = words.founding.href;
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
