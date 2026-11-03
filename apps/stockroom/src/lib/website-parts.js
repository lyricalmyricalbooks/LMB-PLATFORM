// The parts of the stockroom that only make sense next to the press's website: the website orders tab and Today card,
// web analytics, the help answers about the website, and the "Website" sales channel as the default. A stockroom-only
// press (the profile's apps.shop is false) doesn't get them; each is marked `data-needs-website` in index.html and
// hidden by one rule in style.css (`html[data-website="off"]`), so a tab script that shows a button again can't bring
// it back. The switcher, the website link and website search check hasWebsite() themselves.
import { hasWebsite } from './shop-profile.js';

/** The channel a hand-entered sale starts on when there is no website. */
export const NO_WEBSITE_CHANNEL = 'In Person';

/** Marks the page for the plan. Safe to call more than once. */
export function applyWebsiteParts(doc = document, on = hasWebsite()) {
  const root = doc?.documentElement;
  if (!root) return on;
  if (on) { delete root.dataset.website; return on; }
  root.dataset.website = 'off';
  // A hand-entered sale starts on "In Person" (and a form reset goes back to it), not on a website it never had.
  for (const id of ['m-chan', 'edit-chan']) {
    const select = doc.getElementById(id);
    const option = select && [...select.options].find((o) => (o.value || o.text) === NO_WEBSITE_CHANNEL);
    if (!option) continue;
    [...select.options].forEach((o) => { o.defaultSelected = o === option; });
    select.value = option.value || option.text;
  }
  // The search box finds books only.
  const search = doc.getElementById('app-search-header-btn');
  if (search) {
    search.title = 'Search books (Ctrl K or /)';
    search.setAttribute('aria-label', 'Search books');
  }
  return on;
}
