// The stockroom while the shop's plan is paused or closed (the platform's plan 6.7): it opens read-only.
//
// The platform writes `platform/plan` into the stockroom's own database whenever the plan changes ({ access: "open" |
// "paused" | "closed", link: the platform's Plan & billing page, … }; services/billing/shopPlan.js in the platform
// repo). Nobody's browser can write it, and while it says anything but "open" the stockroom's rules refuse every
// change (firestore.rules planOpen). Here the same thing happens before a change is even tried: every function in
// firebase.js that writes is refused at once with a PlanPausedError, saves aren't queued (main.js saveStateNow), and a
// banner says why, with the way back. Reading, searching and downloading work as usual. A stockroom with no plan
// document isn't on a plan and is never locked by it.
import { escapeHtml } from './html.js';

/** True for a paused or closed plan. Anything but a plain "open" counts as paused; no document is open. */
export function planReadOnly(plan) {
  if (!plan || typeof plan !== 'object' || plan.access === undefined) return false;
  return plan.access !== 'open';
}

/** Every function in firebase.js that changes the stored data (tests/plan-pause.test.js keeps this list complete). */
export const PLAN_WRITE_FUNCTIONS = Object.freeze([
  '_fbSaveModeFlags', '_fbAdoptBook', '_fbMarkLinkSwitchedOn', '_fbUploadReceipt', '_fbDeleteReceipt',
  '_fbCommitFoundReceipt', '_fbSave', '_fbSubmitActivity', '_fbDeleteBook', '_fbDeleteSubmission', '_fbSaveSettings',
  '_fbDeleteInboxItem', '_fbWriteAppTodo', '_fbRequestWebsiteLink', '_fbSetShopBookDismissed', '_fbPublishWebsiteLink',
  '_fbSaveCatalog', '_fbSaveBookOwners', '_fbSaveBackupSnapshot', '_fbDeleteBackupSnapshot', '_fbMassMigrate',
]);

export class PlanPausedError extends Error {
  constructor() {
    super('Your plan is paused, so the stockroom is read-only. Nothing was changed.');
    this.name = 'PlanPausedError';
    this.code = 'plan-paused';
  }
}

/**
 * Wraps each write function on `target` (window) so it refuses while `isLocked()` is true and runs as before
 * otherwise. Safe to call twice: a wrapped function isn't wrapped again.
 */
export function lockWrites(target, isLocked, names = PLAN_WRITE_FUNCTIONS) {
  for (const name of names) {
    const fn = target[name];
    if (typeof fn !== 'function' || fn.planLocked) continue;
    const locked = function (...args) {
      if (isLocked()) return Promise.reject(new PlanPausedError());
      return fn.apply(this, args);
    };
    locked.planLocked = true;
    target[name] = locked;
  }
}

// Only an https address is used as a link, whatever the document holds.
const httpsLink = (v) => (typeof v === 'string' && /^https:\/\/[^\s<>"']+$/.test(v) ? v : '');

/** The banner across the top of the stockroom while it is read-only. Plain words: no technical terms. */
export function planPauseBannerHtml(plan) {
  const closed = plan?.access === 'closed';
  const link = httpsLink(plan?.link);
  const title = closed ? 'Your shop is closed, so the stockroom is read-only.' : 'Your plan is paused, so the stockroom is read-only.';
  const detail = closed
    ? 'You can look at everything and download it, but nothing can be changed. Start a plan again to change things.'
    : 'You can look at everything and download it, but nothing can be changed. Add a card and it opens again within a minute.';
  const action = link ? `<a class="btn gold sm" href="${escapeHtml(link)}">${closed ? 'See your plan' : 'Add a card'}</a>` : '';
  return `<div class="plan-pause-banner" role="status" aria-live="polite">
  <div class="plan-pause-text"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(detail)}</span></div>
  ${action}
</div>`;
}
