// The stockroom read-only while the shop's plan is paused or closed (lib/plan-pause.js has the rules and the words).
// main.js's boot reads the plan once the person is signed in and calls this when it isn't open: from then on every
// write in firebase.js refuses at once and the banner stays across the top. Reopening the plan reloads nothing by
// itself; the banner's button goes to the platform's Plan & billing page, and the next start opens normally.
import { planPauseBannerHtml } from '../lib/plan-pause.js';
import '../styles/plan-pause.css';

/** Locks the stockroom for this session and shows the banner (once, however often it is called). */
function showPlanPause(plan) {
  window.PLAN_READ_ONLY = true;
  document.body.classList.add('plan-read-only');
  let el = document.getElementById('plan-pause-banner');
  if (!el) {
    el = document.createElement('div');
    el.id = 'plan-pause-banner';
    document.body.prepend(el);
  }
  el.innerHTML = planPauseBannerHtml(plan);
}

export { showPlanPause };
