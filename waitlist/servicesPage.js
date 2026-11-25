// The services page (/services, Services plan phase 7): the front door for salons, studios, tutors and teachers.
// Until the platform says both sign-up and services shops are open (`/api/plans` › `signupOpen` and `servicesOpen`,
// the control room's two switches), every button leads to the front page's waitlist. Once both are on, the buttons
// start a free trial on the front door with the Services card already picked (`/join/?type=services`).
// Plain ES module with no imports, so the page loads it as is. Words here are customer-facing: never a rival, never a price.

/** Whether the page may start a services trial, from the `/api/plans` answer. Anything odd means "not yet". */
export function servicesView(answer) {
  if (!answer || answer.ok === false) return { open: false, trialDays: null };
  const open = answer.signupOpen === true && answer.servicesOpen === true;
  const trialDays = Number.isInteger(answer.trialDays) && answer.trialDays > 0 ? answer.trialDays : null;
  return { open, trialDays };
}

/** What the buttons say and where they go. */
export function servicesWords({ open = false, trialDays = null } = {}, { signupUrl = "" } = {}) {
  if (!open || !signupUrl) {
    return { cta: "Join the waitlist", ctaShort: "Join", href: "/#start", note: "Free setup · no card" };
  }
  const join = signupUrl.includes("?") ? `${signupUrl}&type=services` : `${signupUrl}?type=services`;
  return {
    cta: "Start free trial",
    ctaShort: "Start trial",
    href: join,
    note: trialDays ? `Free setup · no card · ${trialDays} days free from today` : "Free setup · no card",
  };
}

/** Asks the platform whether services sign-up is open. Any failure keeps the waitlist. */
export async function loadServices({ fetch, url }) {
  if (!url) return servicesView(null);
  try {
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    return servicesView(response.ok ? await response.json() : null);
  } catch {
    return servicesView(null);
  }
}

/** Puts the words on every button marked `data-start` and the note under the last one. */
export function showServices(doc, words) {
  for (const link of doc.querySelectorAll("[data-start]")) {
    link.href = words.href;
    const long = link.querySelector("[data-long]");
    const short = link.querySelector("[data-short]");
    if (long) long.textContent = words.cta;
    if (short) short.textContent = words.ctaShort;
    if (!long && !short) link.firstChild.textContent = `${words.cta} `;
  }
  const note = doc.getElementById("services-note");
  if (note) note.textContent = words.note;
}
