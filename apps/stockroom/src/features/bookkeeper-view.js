// The bookkeeper's screen (plan 7.17): the Tax Centre's business expenses, read only.
//
// Someone the shop's owner gave the "bookkeeper" role on the Team signs in here and sees only this: the expenses by
// year and category, and a spreadsheet of them. It reads the Tax Centre's bookkeeper copy (src/lib/bookkeeper-copy.js)
// and never writes anything, so there is nothing to queue offline: an offline start shows this device's last copy
// (Firestore's own cache) or says it can't load yet.
import { escapeHtml } from '../lib/html.js';
import { registerActions } from '../lib/actions.js';
import { downloadCsv } from '../lib/download.js';
import { BOOKKEEPER_COPY_KEY, copyYears, yearCsv, yearSummary } from '../lib/bookkeeper-copy.js';
import '../styles/bookkeeper-view.css';

let copy = null;
let year = '';
let signOut = () => {};

const money = (n, currency) => `${currency} ${(Math.round(n * 100) / 100).toFixed(2)}`;

function root() {
  let el = document.getElementById('bookkeeper-view');
  if (!el) {
    el = document.createElement('main');
    el.id = 'bookkeeper-view';
    el.className = 'bookkeeper-view';
    document.body.appendChild(el);
  }
  return el;
}

/** The screen's markup for a copy (null: not saved yet) and a year. Pure, so it can be tested. */
function bookkeeperViewHtml(current, chosenYear, email = '') {
  const head = `
    <div class="sec-head">
      <div class="sec-head-titles">
        <div class="sec-kicker"><span class="sec-kicker-dot"></span>Bookkeeper</div>
        <h1 class="section-hed sec-head-title">Tax centre expenses</h1>
        <p class="section-subcopy">Signed in as ${escapeHtml(email || 'your bookkeeper account')}. You can read the press's business expenses here; nothing can be changed.</p>
      </div>
      <button class="btn sm" data-action="bookkeeper.signOut">Sign out</button>
    </div>`;
  if (!current) {
    return `${head}
    <div class="empty-state">
      <div class="e-icon">🧾</div>
      Nothing to show yet. The expenses appear here after the press next opens its stockroom and saves the tax centre.
    </div>`;
  }
  const years = copyYears(current);
  if (!years.length) return `${head}<div class="empty-state"><div class="e-icon">🧾</div>No business expenses recorded yet.</div>`;
  const y = years.includes(chosenYear) ? chosenYear : years[0];
  const sum = yearSummary(current, y);
  const cur = sum.baseCurrency;
  const options = years.map(v => `<option value="${escapeHtml(v)}"${v === y ? ' selected' : ''}>${escapeHtml(v)}</option>`).join('');
  const cats = sum.categories.map(c => `<tr><td>${escapeHtml(c.cat)}</td><td class="r">${escapeHtml(money(c.total, cur))}</td></tr>`).join('');
  const rows = sum.rows.slice(0, 200).map(e => `<tr>
      <td>${escapeHtml(e.date)}</td><td>${escapeHtml(e.desc || '')}</td><td>${escapeHtml(e.vendor || '')}</td><td>${escapeHtml(e.cat || '')}</td>
      <td class="r">${e.amountUnknown ? 'Amount not known yet' : escapeHtml(money(typeof e.baseAmount === 'number' ? e.baseAmount : (e.amount || 0), (typeof e.baseAmount === 'number' ? cur : e.currency) || cur))}</td>
    </tr>`).join('');
  const saved = current.at ? new Date(current.at) : null;
  return `${head}
    <div class="bookkeeper-tools">
      <label class="bookkeeper-label" for="bookkeeper-year">Year</label>
      <select id="bookkeeper-year" data-on-change="bookkeeper.year">${options}</select>
      <button class="btn gold" data-action="bookkeeper.download">Download ${escapeHtml(y)} expenses (CSV)</button>
    </div>
    <div class="kpi-grid">
      <div class="kpi is-lead"><div class="kpi-label">Expenses in ${escapeHtml(y)}</div><div class="kpi-value">${escapeHtml(money(sum.total, cur))}</div></div>
      <div class="kpi"><div class="kpi-label">Entries</div><div class="kpi-value">${sum.rows.length}</div></div>
    </div>
    ${sum.unconverted ? `<p class="bookkeeper-note">${sum.unconverted} expense${sum.unconverted === 1 ? ' is' : 's are'} still waiting for an exchange rate, so ${sum.unconverted === 1 ? 'it is' : 'they are'} not in the total yet.</p>` : ''}
    <div class="sect">By category</div>
    <div class="bookkeeper-table"><table class="tbl"><thead><tr><th>Category</th><th class="r">Total</th></tr></thead><tbody>${cats}</tbody></table></div>
    <div class="sect">Expenses</div>
    <div class="bookkeeper-table"><table class="tbl"><thead><tr><th>Date</th><th>Description</th><th>Vendor</th><th>Category</th><th class="r">Amount</th></tr></thead><tbody>${rows}</tbody></table></div>
    ${sum.rows.length > 200 ? `<p class="bookkeeper-note">The newest 200 are shown. The download has all ${sum.rows.length}.</p>` : ''}
    ${saved && !Number.isNaN(saved.getTime()) ? `<p class="bookkeeper-note">Last saved by the press ${escapeHtml(saved.toLocaleString())}.</p>` : ''}`;
}

function render(email) {
  root().innerHTML = bookkeeperViewHtml(copy, year, email);
}

/** Shows the bookkeeper's screen in place of the app. `loadSettings` is firebase.js _fbLoadSettings. */
async function showBookkeeperView({ email, loadSettings, onSignOut }) {
  signOut = onSignOut;
  for (const id of ['pw-gate', 'pw-app']) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }
  root().innerHTML = '<div class="empty-state"><div class="e-icon">⏳</div>Loading the tax centre…</div>';
  copy = await loadSettings(BOOKKEEPER_COPY_KEY);
  if (copy && !Array.isArray(copy.businessExpenses)) copy = null;
  year = copy ? (copyYears(copy)[0] || '') : '';
  render(email);
  registerBookkeeperActions(email);
}

let registered = false;
function registerBookkeeperActions(email) {
  if (registered) return;
  registered = true;
  registerActions({
    'bookkeeper.year': (el) => { year = el.value; render(email); },
    'bookkeeper.download': () => { if (copy && year) downloadCsv(yearCsv(copy, year), `expenses-${year}.csv`); },
    'bookkeeper.signOut': () => signOut(),
  });
}

export { bookkeeperViewHtml, showBookkeeperView };
