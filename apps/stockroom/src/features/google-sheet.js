// Settings › Google Sheet on a Colophon shop: the stockroom's Stock and Sales in a sheet in the press's own Google
// Drive, through the shop's one Google sign-in (lib/google-sheet.js, docs/plans/stockroom-google-sheet.md). The shop's
// server holds the link (apps/shop/functions/googleConnect.js); this page asks it, sends the sales, and links to the
// sheet. Nothing here touches the older sheet route (sheetsUrl), which these shops never show.
import { callShopFunction, shopFunctionUrl } from '../lib/publisher-access.js';
import { sentWords, salesSheetLines, sheetCardState, sheetDue, sheetUrl } from '../lib/google-sheet.js';
import { escapeHtml } from '../lib/html.js';

// Where the shop admin keeps the Google link. The stockroom opens inside that admin, so the top page goes there.
const GOOGLE_SETTINGS = '/admin#settings/google';

let _status;
let _sending = false;
let _note = '';
let _autoTried = false;

/**
 * `deps`: { profile, getIdToken, books, states, isPractice, toast, now, fetchFn, win }. Paints `#settings-sec-google`,
 * asks the shop for the Google link's state, and sends by itself when the sheet is due (once per page load).
 */
async function openGoogleSheet(deps) {
  const el = (deps.win || window).document.getElementById('google-sheet-card');
  if (!el) return;
  paint(el, deps);
  _status = await ask(deps, { step: 'status' });
  paint(el, deps);
  if (!_autoTried && sheetDue(_status, (deps.now || Date.now)())) {
    _autoTried = true;
    await sendGoogleSheet(deps, { quiet: true });
  }
}

/**
 * At start-up: when the sheet was last sent over six hours ago, send it again quietly. Asks the shop once per page
 * load, and only on a shop where the sheet applies (main.js checks).
 */
async function refreshGoogleSheetIfDue(deps) {
  if (_autoTried) return false;
  _autoTried = true;
  if (_status === undefined) _status = await ask(deps, { step: 'status' });
  if (!sheetDue(_status, (deps.now || Date.now)())) return false;
  await sendGoogleSheet(deps, { quiet: true });
  return true;
}

/** Sends Stock (read by the shop's server) and Sales (from this stockroom) to the sheet. */
async function sendGoogleSheet(deps, { quiet = false } = {}) {
  const el = (deps.win || window).document.getElementById('google-sheet-card');
  if (_sending) return;
  _sending = true;
  _note = '';
  if (el) paint(el, deps);
  const sales = salesSheetLines(deps.books(), deps.states(), { isPractice: deps.isPractice });
  const answer = await ask(deps, { step: 'sheetSync', sales });
  _sending = false;
  if (answer?.error) {
    _note = answer.error;
    if (!quiet) deps.toast?.(answer.error, 'warn');
  } else if (answer?.available === false) {
    _note = 'Switch on Google Drive in Settings › Google first.';
  } else if (answer?.gone) {
    // The press deleted the sheet in Drive: the next send makes a new one.
    _note = 'Your sheet was deleted in Google Drive. Send again to make a new one.';
  } else if (answer) {
    _status = { ..._status, sheet: { url: answer.url, writtenAt: answer.writtenAt, rows: answer.rows, sales: answer.sales ?? null } };
    if (!quiet) deps.toast?.('Your Google Sheet is up to date', 'success');
  }
  if (el) paint(el, deps);
}

async function ask(deps, body) {
  const url = shopFunctionUrl(deps.profile, 'createStripeCheckoutSession');
  const user = { getIdToken: deps.getIdToken };
  try {
    return await callShopFunction(user, url, { action: 'googleConnect', ...body }, deps.fetchFn ? { fetchFn: deps.fetchFn } : {});
  } catch (_) {
    return { error: 'No connection. Try again when you are back online.' };
  }
}

function paint(el, deps) {
  const state = sheetCardState(_status);
  const url = sheetUrl(_status);
  const sent = sentWords(_status?.sheet?.writtenAt, (deps.now || Date.now)());
  const counts = _status?.sheet ? `${_status.sheet.rows ?? 0} products · ${_status.sheet.sales ?? 0} sales` : '';
  const goGoogle = `<a class="btn" href="${GOOGLE_SETTINGS}" target="_top">Open Google settings</a>`;
  let line = '';
  let actions = '';
  if (state === 'loading') line = 'Checking your Google link…';
  else if (state === 'error') { line = escapeHtml(_status?.error || 'Couldn\'t check your Google link.'); actions = '<button type="button" class="btn" data-gs="retry">Try again</button>'; }
  else if (state === 'off') { line = 'Connect Google once and your stock and sales go into a sheet in your own Drive.'; actions = goGoogle; }
  else if (state === 'nodrive') { line = 'Switch on Google Drive in Settings › Google to get your sheet.'; actions = goGoogle; }
  else {
    line = url ? `${escapeHtml(sent)}${counts ? ` · ${escapeHtml(counts)}` : ''}` : 'Your stock and sales, in a sheet in your own Drive.';
    actions = `<button type="button" class="btn gold" data-gs="send"${_sending ? ' disabled' : ''}>${_sending ? 'Sending…' : url ? 'Send now' : 'Make my sheet'}</button>`
      + (url ? `<a class="btn" href="${escapeHtml(url)}" target="_blank" rel="noopener">Open sheet</a>` : '');
  }
  el.dataset.state = state;
  el.innerHTML = `
    <div class="gsheet-head">
      <div class="section-hed">Google Sheet</div>
      <p class="section-subcopy" data-gs-line>${line}</p>
      ${_note ? `<p class="gsheet-note" role="status">${escapeHtml(_note)}</p>` : ''}
    </div>
    <div class="gsheet-actions">${actions}</div>
    ${state === 'ready' ? '<p class="gsheet-foot">One way only: typing in the sheet never changes your stock.</p>' : ''}`;
  el.querySelector('[data-gs="send"]')?.addEventListener('click', () => sendGoogleSheet(deps));
  el.querySelector('[data-gs="retry"]')?.addEventListener('click', () => openGoogleSheet(deps));
}

/** Test hook. */
function __resetGoogleSheet() { _status = undefined; _sending = false; _note = ''; _autoTried = false; }

export { openGoogleSheet, refreshGoogleSheetIfDue, sendGoogleSheet, __resetGoogleSheet };
