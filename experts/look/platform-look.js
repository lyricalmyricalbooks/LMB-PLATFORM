// GENERATED from shared/admin-look/platform-look.js by shared/admin-look/sync.mjs. Edit the source, never this copy.
// The platform pages always wear the light (day) look, as in the Colophon mockup (owner's choice, 10 November 2026).
// Loaded in <head> so the page never flashes the wrong one.
(() => {
  document.documentElement.setAttribute("data-rp-appearance", "light");

  // The top bar's button follows sign-up (the control room's "Anyone can sign up", read from /api/plans). Each page
  // ships it as "Join the waitlist", the closed state and the default; only a clear "open" answer turns it into
  // "Start free trial". Unreachable or closed, it stays the waitlist, like the front page (waitlist/frontPage.js).
  const openTrialButtons = () => {
    const buttons = document.querySelectorAll("a[data-signup-cta]");
    if (!buttons.length || typeof fetch !== "function") return;
    fetch("/api/plans")
      .then((response) => (response.ok ? response.json() : null))
      .then((answer) => {
        if (!answer || answer.signupOpen !== true) return;
        for (const button of buttons) {
          button.textContent = "Start free trial";
          button.setAttribute("href", "/join/");
        }
      })
      .catch(() => { /* stays the waitlist */ });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", openTrialButtons);
  else openTrialButtons();
})();
