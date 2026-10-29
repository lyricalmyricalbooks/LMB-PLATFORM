// The control room page (control-room/index.html): every shop with its plan, version, health and switches, an
// "Act as this shop" button, a switch for each feature, and the support requests to answer. Plain browser JavaScript with no framework, like the
// sign-up page. The server (control-room/routes.js) checks that the person is a platform admin, and asks for a reason
// that goes in the shop's log.
//
// It wears the website admin's look (Pressroom, control-room/look/): the ink side menu, one page at a time (`#today`,
// `#shops`…, any element id opens the page it is on), ledger figures, sheets, tables and pills, drawn with the same
// class names the website admin's React pieces use (apps/shop/src/app/admin/riso/components.tsx).
import { API_BASE, FIREBASE_SDK, PLATFORM_FIREBASE } from "../signup/config.js";
import { deviceId } from "../signup/device.js";

const { initializeApp } = await import(`${FIREBASE_SDK}/firebase-app.js`);
const {
  getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, getMultiFactorResolver, multiFactor, TotpMultiFactorGenerator,
} = await import(`${FIREBASE_SDK}/firebase-auth.js`);

const auth = getAuth(initializeApp(PLATFORM_FIREBASE));
const $ = (selector) => document.querySelector(selector);
const status = $("#status");

function el(tag, { dataset, ...props } = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  Object.assign(node.dataset, dataset);
  node.append(...children.filter((child) => child !== null && child !== undefined && child !== false && child !== ""));
  return node;
}

async function api(method, path, body) {
  const token = auth.currentUser ? await auth.currentUser.getIdToken() : "";
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}`, "X-Device-Id": deviceId() } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const answer = await response.json().catch(() => ({ ok: false, message: "The platform didn't answer. Try again." }));
  if (!response.ok || answer.ok === false) throw new Error(answer.message || "Something went wrong.");
  return answer;
}

const askWhy = (what) => (window.prompt(`${what}\n\nWhy? This goes in the shop's log (at least 10 characters).`) ?? "").trim();
const LEVEL = { problem: "Problem", watch: "Look", ok: "OK" };
const SWITCH_WORDS = {
  legacyStockroomSignIn: "Old stockroom sign-in",
  githubPagesForwarding: "Forward the old GitHub Pages address",
  gmailReceiptFinder: "Find receipts in Gmail",
  gmailOrderScan: "Scan Gmail for order receipts",
  oldShopSync: "Old shop system tab and missing-orders check",
};

// ── The admin's pieces, in plain JavaScript (same markup as admin/riso/components.tsx). ──
// Status never relies on colour alone: every pill carries a glyph and a word.
const GLYPH = { neutral: "○", primary: "●", info: "●", success: "✓", warning: "⚠", danger: "✕" };
const TONE = { problem: "danger", watch: "warning", ok: "success" };
const pill = (tone, words) => el("span", { className: "rp-badge", dataset: { tone } }, el("span", { ariaHidden: "true", textContent: GLYPH[tone] }), words);
const button = (words, variant = "secondary", props = {}) => el("button", { type: "button", className: `rp-btn rp-btn-${variant} rp-btn-sm`, textContent: words, ...props });
const emptyState = (title, words) => el("div", { className: "rp-state", dataset: { inline: "" } },
  el("p", { className: "rp-state-title", textContent: title }), words ? el("p", { className: "rp-state-desc", textContent: words }) : null);
const meta = (...parts) => el("p", { className: "cr-meta" }, ...parts.filter(Boolean).map((part) => el("span", { textContent: part })));
const history = (lines) => (lines.length ? el("ul", { className: "cr-history" }, ...lines.map((line) => el("li", { textContent: line }))) : null);

/** A sheet: a title with its pill, a meta line, then the body. */
function sheet({ title, tone, pillWords, metaParts = [], body = [], actions = null }) {
  return el("article", { className: "rp-card" },
    el("div", { className: "rp-card-body", style: "padding-top: 16px" },
      el("div", { className: "cr-row" }, el("h3", { className: "cr-title cr-grow", textContent: title }), pillWords ? pill(tone ?? "neutral", pillWords) : null),
      metaParts.length ? meta(...metaParts) : null,
      ...body,
      actions && actions.childElementCount ? actions : null));
}

/** A table on a sheet; on phones each row stacks as a small card. `open(row)` makes a row open on click. */
function table({ caption, columns, rows, open }) {
  const head = el("tr", {}, ...columns.map((c) => el("th", { scope: "col", textContent: c.header, className: c.end ? "cr-end" : "" })));
  const body = rows.map((row) => {
    const tr = el("tr", {}, ...columns.map((c) => el("td", { className: [c.lead && "rp-lead", c.end && "cr-end"].filter(Boolean).join(" "), dataset: c.header ? { label: c.header } : {} }, c.render(row))));
    if (open) {
      tr.dataset.clickable = "true";
      tr.addEventListener("click", (event) => { if (!event.target.closest("a,button,input,select,textarea,label")) open(row); });
    }
    return tr;
  });
  const wrap = el("div", { className: "rp-table-wrap", tabIndex: 0, role: "region", ariaLabel: caption, dataset: { stack: "phone" } },
    el("table", { className: "rp-table" }, el("caption", { className: "rp-sr-only", textContent: caption }), el("thead", {}, head), el("tbody", {}, ...body)));
  return wrap;
}

/** Chips that pick one filter: the website admin's boxed tabs. */
function filterChips(selector, onPick) {
  const buttons = [...document.querySelectorAll(`${selector} button`)];
  for (const chip of buttons) {
    chip.addEventListener("click", () => {
      for (const other of buttons) {
        other.setAttribute("aria-pressed", String(other === chip));
        other.setAttribute("aria-selected", String(other === chip));
      }
      onPick(chip.dataset.status);
    });
  }
}

// ── The drawer (the website admin's Drawer): one shop's record and everything you can do for it. ──
let drawer = null;
function closeDrawer() {
  if (!drawer) return;
  const { root, opener } = drawer;
  drawer = null;
  root.remove();
  opener?.focus?.();
}
function openDrawer(title, description, body) {
  closeDrawer();
  const titleId = "drawer-title";
  const close = el("button", { type: "button", className: "rp-icon-btn", ariaLabel: "Close", title: "Close", textContent: "✕" });
  close.addEventListener("click", closeDrawer);
  const panel = el("div", { className: "rp-dialog", role: "dialog", ariaModal: "true", tabIndex: -1 },
    el("div", { className: "rp-dialog-head" },
      el("div", {}, el("h2", { className: "rp-dialog-title", id: titleId, textContent: title }), description ? el("p", { className: "rp-card-desc", textContent: description }) : null),
      close),
    el("div", { className: "rp-dialog-body" }, ...body));
  panel.setAttribute("aria-labelledby", titleId);
  const scrim = el("div", { className: "rp-dialog-scrim", ariaHidden: "true" });
  scrim.addEventListener("click", closeDrawer);
  const root = el("div", { className: "rp-dialog-root", dataset: { variant: "drawer" } }, scrim, panel);
  root.addEventListener("keydown", (event) => { if (event.key === "Escape") closeDrawer(); });
  drawer = { root, opener: document.activeElement };
  $("#room").append(root);
  panel.focus();
  return panel;
}

async function load() {
  status.textContent = "Loading…";
  // The backup person (plan 8.7) sees only the run book; a platform admin sees it in the menu with everything else.
  let role = null;
  try {
    role = (await loadEmergency()).role;
  } catch {
    // Neither an admin nor the backup person: the shops call below says so.
  }
  if (role === "backup") {
    status.textContent = "";
    showShell("backup");
    return;
  }
  try {
    await loadToday();
    await loadTestShop();
    const { shops } = await api("GET", "/control/shops");
    allShops = shops;
    showShops();
    status.textContent = "";
    showShell("admin");
    await loadRepairs();
    await loadTickets();
    await loadRecoveries();
    await loadBreaches();
    await loadWaitlist();
    await loadEverySwitch();
    await loadSettings();
    await loadActivity();
  } catch (failure) {
    status.textContent = failure.message;
    // A listed admin without two-step sign-in yet (plan 9.1): offer to set up the authenticator app.
    if (/two-step/.test(failure.message) && auth.currentUser && !multiFactor(auth.currentUser).enrolledFactors.length) await startTwoStepSetup();
  }
}

// ── Shops: search and filters (plan 9.3), over the list already loaded. ──
let allShops = [];
const BILLING_TONE = { trialing: "info", active: "success", past_due: "danger", paused: "warning", unpaid: "warning", incomplete: "warning", canceled: "neutral", incomplete_expired: "neutral" };
const PLAN_WORDS = { shop: "Shop", stockroom: "Stockroom", both: "Shop and stockroom" };
function showShops() {
  const form = $("#shop-filters");
  const words = form.q.value.trim().toLowerCase();
  const shown = allShops.filter((shop) => (!words || [shop.pressName, shop.shopId, shop.ownerEmail].some((v) => String(v ?? "").toLowerCase().includes(words)))
    && (!form.health.value || shop.health.level === form.health.value)
    && (!form.plan.value || shop.plan === form.plan.value)
    && (!form.billing.value || shop.billingStatus === form.billing.value));
  const problems = allShops.filter((s) => s.health.level === "problem").length;
  $("#summary").textContent = `${allShops.length} shop${allShops.length === 1 ? "" : "s"} · ${problems} with a problem${shown.length !== allShops.length ? ` · showing ${shown.length}` : ""}`;
  if (!shown.length) {
    $("#shops").replaceChildren(allShops.length ? emptyState("No shop matches.", "Clear the search or the filters to see every shop.") : emptyState("No shops yet.", "A press's shop shows here as soon as it is made."));
    return;
  }
  $("#shops").replaceChildren(table({
    caption: "Shops",
    rows: shown,
    open: (shop) => openShop(shop),
    columns: [
      { header: "Press", lead: true, render: (shop) => el("div", {}, el("p", { className: "cr-title", textContent: shop.pressName ?? shop.shopId }), meta(shop.shopId, shop.ownerEmail, shop.testShop ? "test shop" : null)) },
      { header: "Plan", render: (shop) => PLAN_WORDS[shop.plan] ?? shop.plan ?? "?" },
      { header: "Billing", render: (shop) => (shop.billingStatus ? pill(BILLING_TONE[shop.billingStatus] ?? "neutral", BILLING_WORDS[shop.billingStatus] ?? shop.billingStatus) : el("span", { className: "rp-hint", textContent: shop.access ?? "none" })) },
      { header: "Health", render: (shop) => el("div", {}, pill(TONE[shop.health.level], LEVEL[shop.health.level]), shop.health.reasons[0] ? meta(shop.health.reasons[0]) : null) },
      { header: "Version", render: (shop) => el("span", { className: "rp-mono", style: "white-space: nowrap", textContent: shop.version ?? "none yet" }) },
      { header: "", end: true, render: (shop) => { const open = button("Open", "secondary"); open.addEventListener("click", () => openShop(shop)); return open; } },
    ],
  }));
}
$("#shop-filters").addEventListener("input", showShops);
$("#shop-filters").addEventListener("submit", (event) => event.preventDefault());

// ── One shop's record (plan 9.3) and its per-order fee (plan 9.6). ──
const BILLING_WORDS = { trialing: "free trial", active: "paying", past_due: "payment failing, being retried", paused: "paused", unpaid: "paused, unpaid", incomplete: "waiting for a first payment", canceled: "ended", incomplete_expired: "ended" };
const percent = (basisPoints) => `${basisPoints / 100}%`;
const dateOnly = (at) => (at ? new Date(at).toLocaleDateString(undefined, { dateStyle: "medium" }) : "");

function feeForm(record) {
  const form = el("form", { className: "cr-form" },
    el("p", { className: "rp-hint", textContent: `Fee on each order now: ${percent(record.fee.basisPoints)}, ${record.fee.refunded ? "given back with a refund" : "kept on a refund"}. The platform's normal fee: ${percent(record.fee.defaults.basisPoints)}.${record.fee.next ? ` Changing to ${percent(record.fee.next.basisPoints)} on ${dateOnly(record.fee.next.from)} (the press was emailed).` : ""}` }),
    el("label", { className: "rp-field" }, el("span", { className: "rp-label", textContent: "New fee on each order (%)" }), el("input", { className: "rp-input", type: "number", name: "percent", min: "0", max: "100", step: "0.01", required: true, value: String((record.fee.next ?? record.fee).basisPoints / 100), inputMode: "decimal" })),
    el("label", { className: "rp-check" }, el("input", { type: "checkbox", name: "refunded", checked: (record.fee.next ?? record.fee).refunded }), "Give the fee back when an order is refunded"),
    el("label", { className: "rp-field" }, el("span", { className: "rp-label", textContent: "Why? (goes in the shop's log)" }), el("input", { className: "rp-input", name: "reason", required: true, minLength: 10, maxLength: 500 })),
    el("p", { className: "rp-hint", textContent: "The press is emailed now and the new fee starts in 30 days. Setting today's fee again cancels a change that hasn't started." }),
    el("div", {}, el("button", { type: "submit", className: "rp-btn rp-btn-secondary", textContent: "Change the fee" })));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = form.querySelector("button");
    submit.disabled = true;
    try {
      const done = await api("POST", "/control/fee", { shopId: record.shopId, basisPoints: Math.round(Number(form.percent.value) * 100), refunded: form.refunded.checked, reason: form.reason.value });
      status.textContent = !done.changed ? "That's already the fee, so nothing changed."
        : done.cancelled ? `${record.pressName}: the waiting fee change is cancelled.`
          : `${record.pressName}: emailed. The new fee starts on ${dateOnly(done.next.from)}.`;
      form.replaceWith(feeForm(await api("POST", "/control/shop", { shopId: record.shopId })));
    } catch (failure) {
      status.textContent = failure.message;
      submit.disabled = false;
    }
  });
  return form;
}

// Closing a shop (6.8): where it is, and the dates the press was told.
const CLOSING_WORDS = { paused: "paused", closed: "closed, download open", deleted: "deleted" };
function closingView(closing) {
  if (!closing) return [];
  const dates = [
    closing.closedAt && `closed ${dateOnly(closing.closedAt)}`,
    closing.downloadUntil && `download until ${dateOnly(closing.downloadUntil)}`,
    closing.deleteAfter && `deleted after ${dateOnly(closing.deleteAfter)}`,
    closing.warned30At && "30-day warning sent",
    closing.warned7At && "7-day warning sent",
    closing.problem && `problem: ${closing.problem}`,
  ].filter(Boolean);
  return [el("h3", { className: "cr-section", textContent: "Closing" }), el("p", { textContent: `${CLOSING_WORDS[closing.stage] ?? closing.stage}${dates.length ? ` · ${dates.join(" · ")}` : ""}` })];
}

// The shop's Google steps (6.20, google/status.js), each with Run again when it failed or waits.
const GOOGLE_STATE = { done: "done", failed: "failed", waiting: "waiting" };
const GOOGLE_TONE = { done: "success", failed: "danger", waiting: "warning" };
function googleView(record) {
  const google = record.google;
  if (!google) return el("p", { className: "rp-hint", textContent: "Not connected to Google." });
  const list = el("ul", { className: "cr-steps" }, ...google.steps.map((step) => {
    const item = el("li", {}, `${step.step} `, pill(GOOGLE_TONE[step.state] ?? "neutral", GOOGLE_STATE[step.state] ?? step.state), step.detail ? ` ${step.detail} ` : " ");
    if (step.canRunAgain) {
      const again = button("Run again", "secondary");
      again.addEventListener("click", async () => {
        again.disabled = true;
        try {
          const { outcome } = await api("POST", "/control/google-run-again", { shopId: record.shopId, step: step.step });
          status.textContent = `${record.pressName}: ${step.step} ${GOOGLE_STATE[outcome.state] ?? outcome.state}.`;
          list.closest(".record")?.replaceWith(recordView(await api("POST", "/control/shop", { shopId: record.shopId })));
        } catch (failure) {
          status.textContent = failure.message;
          again.disabled = false;
        }
      });
      item.append(again);
    }
    return item;
  }));
  return el("div", { className: "cr-list" },
    el("p", { className: "rp-hint", textContent: `${google.stage}${google.accountEmail ? ` as ${google.accountEmail}` : ""}${google.connectedAt ? ` since ${dateOnly(google.connectedAt)}` : ""}.` }),
    google.steps.length ? list : el("p", { className: "rp-hint", textContent: "No Google steps yet." }));
}

function recordView(record) {
  const billing = record.billing;
  const connections = record.connections;
  const facts = [
    ["Owner", record.ownerEmail],
    ["Started", dateOnly(record.createdAt)],
    ["Address", record.siteUrl],
    ["Plan", billing ? `${billing.plan ?? record.plan} · ${BILLING_WORDS[billing.status] ?? billing.status}${billing.trialEnd ? ` · trial ends ${dateOnly(billing.trialEnd)}` : ""}${billing.currentPeriodEnd ? ` · next payment ${dateOnly(billing.currentPeriodEnd)}` : ""} · ${billing.hasCard ? "card on file" : "no card yet"}${billing.cancelAtPeriodEnd ? " · cancelling" : ""}` : record.plan],
    ["Payments", connections.payments ? `${connections.payments.provider ?? "?"}${connections.payments.connected ? ", connected" : ", not connected yet"}` : "not set up yet"],
    ["Web address", Array.isArray(connections.domains) && connections.domains.length ? connections.domains.map((d) => `${d.name} (${d.state})`).join(", ") : "the shop's own .web.app address"],
    ["Version", record.version ?? "none yet"],
  ].filter(([, value]) => value);
  return el("div", { className: "record" },
    el("dl", { className: "cr-facts" }, ...facts.flatMap(([label, value]) => [el("dt", { textContent: label }), el("dd", { textContent: value })])),
    el("h3", { className: "cr-section", textContent: "Setup" }),
    record.setup.length ? el("ol", { className: "cr-steps" }, ...record.setup.map((step) => el("li", {}, `${step.name ?? `Step ${step.step}`} `, step.ok ? pill("success", "done") : pill("danger", `stopped: ${step.error}`)))) : el("p", { className: "rp-hint", textContent: "No setup steps yet." }),
    ...closingView(record.closing),
    el("h3", { className: "cr-section", textContent: "Google" }),
    googleView(record),
    el("h3", { className: "cr-section", textContent: "Fee on each order" }),
    feeForm(record),
    el("h3", { className: "cr-section", textContent: "Control-room history" }),
    record.history.length ? history(record.history.map((e) => `${when(e.at)} · ${e.by ?? "the platform"} ${ACTIVITY_WORDS[e.what] ?? e.what}${e.detail?.reason ? ` (${e.detail.reason})` : ""}`)) : el("p", { className: "rp-hint", textContent: "Nothing yet." }));
}

// ── Today (plan 9.2): the numbers, then what needs you, each linking to its page. ──
const money = (cents, currency) => new Intl.NumberFormat(undefined, { style: "currency", currency, currencyDisplay: "narrowSymbol" }).format(cents / 100);

// Your test shop (plan 9.10): the platform's own shop, only for you. Its storefront is behind the pause page.
async function loadTestShop() {
  const { testShop: shop } = await api("GET", "/control/test-shop");
  const box = $("#test-shop");
  if (!shop) {
    box.replaceChildren(el("div", { className: "rp-card-body", style: "padding-top: 16px" }, el("p", { className: "rp-hint", textContent: "Your test shop isn't made yet. Until it is, run the demo on your computer to try everything." })));
    return;
  }
  const check = shop.lastCheck
    ? `Last release check: ${shop.lastCheck.ok ? "passed" : `failed${shop.lastCheck.failedCheck ? ` at check ${shop.lastCheck.failedCheck}` : ""}`}, ${new Date(shop.lastCheck.at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}.`
    : "No release check yet.";
  const link = (href, words, variant) => (href ? el("a", { href, target: "_blank", rel: "noopener", className: `rp-btn rp-btn-${variant} rp-btn-sm`, textContent: words }) : null);
  const reset = button("Reset the sample books", "ghost", { disabled: shop.status !== "live" });
  reset.addEventListener("click", async () => {
    if (!window.confirm("Put the test shop's sample books back to 5 copies each? Its orders and settings stay as they are.")) return;
    reset.disabled = true;
    try {
      await api("POST", "/control/test-shop/reset", { shopId: shop.shopId });
      status.textContent = "The sample books are back to 5 copies each.";
    } catch (failure) {
      status.textContent = failure.message;
    }
    reset.disabled = false;
  });
  box.replaceChildren(el("div", { className: "rp-card-body", style: "padding-top: 16px" },
    el("div", { className: "cr-row" }, el("h3", { className: "cr-title cr-grow", textContent: shop.pressName }), pill(TONE[shop.health.level], LEVEL[shop.health.level])),
    meta(shop.shopId, "only you can open it", check),
    el("div", { className: "cr-actions" }, link(shop.storefrontUrl, "Open the storefront", "primary"), link(shop.adminUrl, "Open its admin", "secondary"), reset)));
}

async function loadToday() {
  const { counts, monthlyIncome, currency, needs } = await api("GET", "/control/today");
  const figure = (label, value, foot, tone) => el("div", { className: "rp-card rp-metric" },
    el("div", { className: "rp-metric-label", textContent: label }),
    el("div", { className: "rp-metric-value", textContent: String(value), dataset: tone ? { tone } : {} }),
    foot ? el("div", { className: "rp-metric-foot", textContent: foot }) : null);
  $("#today-numbers").replaceChildren(
    figure("Monthly income", money(monthlyIncome, currency), `${counts.paying} paying`),
    figure("Shops live", counts.live, `${counts.shops} in all`),
    figure("On a free trial", counts.trial, `${counts.signupsThisWeek} signed up this week`),
    figure("Failed payments", counts.failedPayments, "being retried", counts.failedPayments ? "danger" : null),
    figure("Paused", counts.paused, `${counts.closed} closed`, counts.paused ? "warn" : null),
  );
  $("#needs").replaceChildren(needs.length
    ? el("div", { className: "rp-alerts" }, ...needs.map((need) => {
      const tone = need.kind === "shop" || need.kind === "payment" ? "danger" : "warning";
      return el("a", { className: "rp-alert", href: need.go, dataset: { tone } },
        el("span", { className: "rp-alert-glyph", ariaHidden: "true", textContent: tone === "danger" ? "✕" : "!" }),
        el("span", { className: "rp-alert-text" }, el("strong", { className: "rp-alert-title", textContent: need.words })),
        el("span", { className: "rp-alert-actions" }, el("span", { className: "rp-btn rp-btn-sm", textContent: "Open" })));
    }))
    : emptyState("Nothing needs you right now.", "Shops, payments, repairs, support and sign-ups are all in order."));
  // The side menu's counts come from the same list.
  const count = (kinds) => needs.filter((n) => kinds.includes(n.kind)).reduce((sum, n) => sum + (n.count ?? 1), 0);
  const shopsNeeding = new Set(needs.filter((n) => n.shopId).map((n) => n.shopId)).size;
  setBadge("shops", shopsNeeding);
  setBadge("signups", count(["signup"]));
  setBadge("support", count(["support"]));
  setBadge("repairs", count(["repairs"]));
  setBadge("recovery", count(["recovery"]));
}

function setBadge(page, n) {
  const badge = document.querySelector(`[data-badge="${page}"]`);
  if (!badge) return;
  badge.hidden = !n;
  badge.textContent = n > 99 ? "99+" : String(n);
  badge.setAttribute("aria-label", `${n} need attention`);
}

function openShop(shop) {
  const panel = openDrawer(shop.pressName ?? shop.shopId, `${shop.shopId} · ${PLAN_WORDS[shop.plan] ?? shop.plan ?? "?"} · version ${shop.version ?? "none yet"}`, card(shop));
  panel.dataset.shop = shop.shopId;
}

// Everything you can do for one shop, in its drawer.
function card(shop) {
  // "View this shop" looks only (plan 9.8); "Make changes" asks a second time, because it can change the press's shop.
  const actAs = (mode) => async (event) => {
    const clicked = event.currentTarget;
    const what = mode === "edit"
      ? `Open ${shop.pressName}'s admin for 30 minutes WITH the power to change their shop.`
      : `Open ${shop.pressName}'s admin for 30 minutes, looking only.`;
    const reason = askWhy(what);
    if (!reason) return;
    if (mode === "edit" && !window.confirm(`Anything you change is changed in ${shop.pressName}'s real shop, and the press sees it in their log. Go on?`)) return;
    clicked.disabled = true;
    try {
      const { url } = await api("POST", "/control/act-as", { shopId: shop.shopId, reason, mode });
      window.open(url, "_blank", "noopener");
      status.textContent = `Logged. ${shop.pressName}'s admin opened in a new tab${mode === "edit" ? ", able to make changes" : ", looking only"}.`;
    } catch (failure) {
      status.textContent = failure.message;
    }
    clicked.disabled = false;
  };
  const act = button("View this shop", "primary", { disabled: shop.status !== "live" });
  act.addEventListener("click", actAs("view"));
  const change = button("Make changes", "secondary", { disabled: shop.status !== "live" });
  change.addEventListener("click", actAs("edit"));

  // Self-checks now (2.11): what's off goes to the repair queue.
  const check = button("Check now", "secondary", { disabled: shop.status !== "live" });
  check.addEventListener("click", async () => {
    check.disabled = true;
    try {
      const { ok, results } = await api("POST", "/control/check", { shopId: shop.shopId });
      const fixed = results.filter((r) => r.fixed).length;
      const failing = results.filter((r) => !r.ok).length;
      closeDrawer();
      await load();
      status.textContent = ok
        ? `${shop.pressName}: every self-check passes${fixed ? ` (${fixed} fixed itself)` : ""}.`
        : `${shop.pressName}: ${failing} problem${failing === 1 ? "" : "s"} sent to the repair queue.`;
    } catch (failure) {
      status.textContent = failure.message;
    }
    check.disabled = false;
  });

  // Close for abuse (plan 8.4): checkout and pages close; the shop's pause page shows instead. Reversible.
  const closing = button(shop.closed ? "Open this shop again" : "Close this shop", shop.closed ? "secondary" : "danger");
  closing.addEventListener("click", async () => {
    const reason = askWhy(shop.closed
      ? `Open ${shop.pressName}'s checkout and pages again.`
      : `Close ${shop.pressName}'s checkout and pages for abuse. Shoppers see the shop's pause page until you open it again.`);
    if (!reason) return;
    closing.disabled = true;
    try {
      await api("POST", shop.closed ? "/control/reopen" : "/control/close", { shopId: shop.shopId, reason });
      closeDrawer();
      await load();
      status.textContent = `${shop.pressName} is ${shop.closed ? "open again" : "closed"}. It's in the shop's log.`;
    } catch (failure) {
      status.textContent = failure.message;
      closing.disabled = false;
    }
  });

  const switches = shop.switches
    ? el("div", { className: "cr-switches" }, ...Object.entries(shop.switches).map(([name, on]) => {
      const box = el("input", { type: "checkbox", checked: on });
      box.addEventListener("change", async () => {
        const reason = askWhy(`Turn "${SWITCH_WORDS[name] ?? name}" ${box.checked ? "on" : "off"} for ${shop.pressName}. Its pages are deployed again.`);
        if (!reason) { box.checked = !box.checked; return; }
        box.disabled = true;
        try {
          await api("POST", "/control/switch", { shopId: shop.shopId, name, on: box.checked, reason });
          status.textContent = `${SWITCH_WORDS[name] ?? name} is ${box.checked ? "on" : "off"} for ${shop.pressName}.`;
        } catch (failure) {
          box.checked = !box.checked;
          status.textContent = failure.message;
        }
        box.disabled = false;
      });
      return el("label", { className: "rp-check" }, box, SWITCH_WORDS[name] ?? name);
    }))
    : null;

  const recordSlot = el("div", {}, el("p", { className: "rp-hint", textContent: "Opening the record…" }));
  api("POST", "/control/shop", { shopId: shop.shopId })
    .then((record) => recordSlot.replaceChildren(recordView(record)))
    .catch((failure) => recordSlot.replaceChildren(el("p", { className: "rp-hint", textContent: failure.message })));

  return [
    el("div", { className: "cr-row" }, pill(TONE[shop.health.level], LEVEL[shop.health.level]),
      shop.billingStatus ? pill(BILLING_TONE[shop.billingStatus] ?? "neutral", BILLING_WORDS[shop.billingStatus] ?? shop.billingStatus) : null,
      shop.testShop ? pill("info", "test shop") : null,
      shop.closed ? pill("danger", `closed by ${shop.closed.by}`) : null),
    meta(`status: ${shop.status ?? "?"}`, shop.access ? `billing: ${shop.access}` : null, shop.paymentsMoved ? `cards: ${PAYMENT_WORDS[shop.paymentsMoved.to]}` : null),
    shop.health.reasons.length ? el("ul", { className: "cr-steps", style: "margin-top: 12px" }, ...shop.health.reasons.map((reason) => el("li", { textContent: reason }))) : null,
    el("div", { className: "cr-actions" }, act, change, check, closing),
    switches ? el("h3", { className: "cr-section", textContent: "Switches for this shop" }) : null,
    switches,
    shop.status === "live" ? el("h3", { className: "cr-section", textContent: "Card payments" }) : null,
    shop.status === "live" ? paymentsMenu(shop.paymentsMoved?.to ?? "platform", { shopId: shop.shopId }, shop.pressName) : null,
    el("h3", { className: "cr-section", textContent: "The record" }),
    recordSlot,
  ].filter(Boolean);
}

// ── The emergency payments switch (plan 8.5): if the platform's Stripe is paused, move a shop, or every shop. ──
const PAYMENT_WORDS = { platform: "through the platform (normal)", own: "the press's own Stripe keys", square: "Square" };

function paymentsMenu(current, target, name) {
  const choice = el("select", { className: "rp-select" }, ...Object.entries(PAYMENT_WORDS).map(([value, words]) => el("option", { value, textContent: words, selected: value === current })));
  choice.setAttribute("aria-label", `Card payments for ${name}`);
  const move = button("Move card payments", "secondary");
  move.addEventListener("click", async () => {
    const to = choice.value;
    const reason = askWhy(`Move card payments for ${name} to ${PAYMENT_WORDS[to]}. The press is emailed at once, and the shop's server and pages are deployed again.`);
    if (!reason) return;
    move.disabled = true;
    try {
      const { shops } = await api("POST", "/control/payments", { ...target, to, reason });
      closeDrawer();
      await load();
      const failed = shops.filter((s) => s.error);
      const moved = shops.filter((s) => !s.error && !s.skipped).length;
      status.textContent = `${moved} shop${moved === 1 ? "" : "s"} on ${PAYMENT_WORDS[to]}.${failed.length ? ` Not moved: ${failed.map((s) => `${s.shopId} (${s.error})`).join("; ")}` : ""}`;
    } catch (failure) {
      status.textContent = failure.message;
    }
    move.disabled = false;
  });
  return el("div", { className: "cr-toolbar", style: "margin: 0" }, el("label", { className: "rp-field cr-grow" }, el("span", { className: "rp-label", textContent: "Card payments go" }), choice), move);
}

$("#all-payments").append(paymentsMenu("platform", { all: true }, "every live shop"));

// ── The repair queue (control-room/repairs.js): mark an item fixed once a person has dealt with it. ──
let repairStatus = "open";
filterChips(".repair-filters", (picked) => { repairStatus = picked; loadRepairs(); });

async function loadRepairs() {
  try {
    const { repairs } = await api("POST", "/control/repairs", { status: repairStatus });
    const empty = repairStatus === "open" ? emptyState("Nothing to fix.", "When a self-check finds something it can't fix itself, it shows here.") : emptyState("Nothing fixed yet.");
    $("#repairs").replaceChildren(...(repairs.length ? repairs.map(repairCard) : [empty]));
  } catch (failure) {
    status.textContent = failure.message;
  }
}

function repairCard(item) {
  const done = button("Mark fixed", "primary", { hidden: item.status !== "open" });
  done.addEventListener("click", async () => {
    const note = (window.prompt("What did you do? It goes in the shop's log.") ?? "").trim();
    if (!note) return;
    done.disabled = true;
    try {
      await api("POST", "/control/repairs/fixed", { id: item.id, note });
      await load();
      status.textContent = "Marked fixed.";
    } catch (failure) {
      status.textContent = failure.message;
      done.disabled = false;
    }
  });
  // A newsletter that paused itself (services/email/reputation.js): turn it back on once the press has cleaned its list.
  const resume = button("Turn the newsletter back on", "secondary", { hidden: item.status !== "open" || item.check !== "newsletter-reputation" });
  resume.addEventListener("click", async () => {
    const reason = askWhy(`Turn ${item.shopId}'s newsletter back on?`);
    if (!reason) return;
    resume.disabled = true;
    try {
      await api("POST", "/control/newsletter/resume", { shopId: item.shopId, reason });
      await api("POST", "/control/repairs/fixed", { id: item.id, note: `Newsletter back on: ${reason}` });
      await load();
      status.textContent = "The newsletter is back on.";
    } catch (failure) {
      status.textContent = failure.message;
      resume.disabled = false;
    }
  });
  return sheet({
    title: item.problem,
    tone: item.status === "open" ? "danger" : "success",
    pillWords: item.status === "open" ? "To fix" : "Fixed",
    metaParts: [item.shopId, item.check, `seen ${item.count} time${item.count === 1 ? "" : "s"}, last ${when(item.lastSeenAt)}`, item.fixedAt ? `fixed ${when(item.fixedAt)} by ${item.fixedBy}` : null],
    body: [item.detail ? el("p", { className: "cr-body", textContent: item.detail }) : null, item.note ? el("p", { className: "cr-quote", textContent: `Note: ${item.note}` }) : null].filter(Boolean),
    actions: el("div", { className: "cr-actions" }, ...[resume, done].filter((b) => !b.hidden)),
  });
}

// ── Support requests (services/support): answer, and the press gets it by email; close when done. ──
let ticketStatus = "open";
filterChips("#ticket-filters", (picked) => { ticketStatus = picked; loadTickets(); });
const TICKET_WORDS = { open: ["warning", "Waiting"], answered: ["info", "Answered"], closed: ["neutral", "Closed"] };

async function loadTickets() {
  try {
    const { tickets } = await api("POST", "/control/support", { status: ticketStatus });
    $("#tickets").replaceChildren(...(tickets.length ? tickets.map(ticketCard) : [emptyState("Nothing here.", ticketStatus === "open" ? "Every press's question has an answer." : null)]));
  } catch (failure) {
    status.textContent = failure.message;
  }
}

function ticketCard(ticket) {
  const answer = el("textarea", { className: "rp-textarea", maxLength: 5000, placeholder: "Your answer, emailed to the press" });
  answer.setAttribute("aria-label", `Answer to ${ticket.email}`);
  const send = button("Send the answer", "primary");
  send.addEventListener("click", async () => {
    send.disabled = true;
    try {
      await api("POST", "/control/support/answer", { id: ticket.id, body: answer.value });
      status.textContent = `Answer emailed to ${ticket.email}.`;
      await loadTickets();
    } catch (failure) {
      status.textContent = failure.message;
      send.disabled = false;
    }
  });
  const close = button("Close", "ghost", { disabled: ticket.status === "closed" });
  close.addEventListener("click", async () => {
    close.disabled = true;
    try {
      await api("POST", "/control/support/close", { id: ticket.id });
      status.textContent = `Request ${ticket.id} closed.`;
      await loadTickets();
    } catch (failure) {
      status.textContent = failure.message;
      close.disabled = false;
    }
  });
  const [tone, words] = TICKET_WORDS[ticket.status] ?? ["neutral", ticket.status];
  return sheet({
    title: ticket.subject,
    tone, pillWords: words,
    metaParts: [ticket.pressName ? `${ticket.pressName} (${ticket.shopId})` : null, ticket.email, `opened ${when(ticket.openedAt)}`, ticket.id],
    body: ticket.messages.map((m) => el("div", { className: "cr-quote", dataset: { from: m.from } },
      el("p", { className: "cr-meta", textContent: `${m.from === "press" ? ticket.email : m.by} · ${when(m.at)}` }),
      el("div", { textContent: m.body }))),
    actions: el("div", { className: "cr-actions" }, ticket.status === "closed" ? null : answer, ticket.status === "closed" ? null : send, close),
  });
}

// ── Account recovery (accounts/recovery.js): check, approve or deny; after the wait, move it by hand and record it. ──
let recoveryStatus = "waiting";
filterChips("#recovery-filters", (picked) => { recoveryStatus = picked; loadRecoveries(); });
const RECOVERY_WORDS = { waiting: ["warning", "To check"], approved: ["info", "Approved, waiting"], applied: ["success", "Moved"], denied: ["neutral", "Denied"], cancelled: ["neutral", "Stopped"], withdrawn: ["neutral", "Withdrawn"] };

async function loadRecoveries() {
  try {
    const { requests } = await api("POST", "/control/recovery", { status: recoveryStatus });
    $("#recoveries").replaceChildren(...(requests.length ? requests.map(recoveryCard) : [emptyState("Nothing here.")]));
  } catch (failure) {
    status.textContent = failure.message;
  }
}

function recoveryCard(request) {
  const decide = async (clicked, path, body, done) => {
    clicked.disabled = true;
    try {
      await api("POST", path, { id: request.id, ...body });
      status.textContent = done;
      await loadRecoveries();
    } catch (failure) {
      status.textContent = failure.message;
      clicked.disabled = false;
    }
  };
  const words = el("textarea", { className: "rp-textarea", maxLength: 2000, placeholder: "How you checked it's them, or the reason they're sent" });
  words.setAttribute("aria-label", `Note or reason for request ${request.id}`);
  const actions = el("div", { className: "cr-actions" });
  if (request.status === "waiting") {
    const approve = button("Approve (note how you checked)", "primary");
    approve.addEventListener("click", () => decide(approve, "/control/recovery/approve", { note: words.value }, `Approved. Both addresses are told; it can be moved after three days.`));
    actions.append(approve);
  }
  if (request.status === "waiting" || request.status === "approved") {
    const deny = button("Deny (the reason is emailed)", "danger");
    deny.addEventListener("click", () => decide(deny, "/control/recovery/deny", { reason: words.value }, `Denied, and ${request.requesterEmail} is told why.`));
    actions.append(deny);
  }
  let byHand = null;
  if (request.status === "approved") {
    byHand = el("input", { type: "checkbox" });
    const apply = button("Record as moved", "primary", { disabled: Date.now() < Date.parse(request.holdUntil) });
    apply.addEventListener("click", () => decide(apply, "/control/recovery/apply", { doneByHand: byHand.checked }, `Recorded. Both addresses are told the account has moved.`));
    actions.append(el("label", { className: "rp-check" }, byHand, "I've moved it by hand"), apply);
  }
  if (actions.childElementCount) actions.prepend(words);
  const [tone, label] = RECOVERY_WORDS[request.status] ?? ["neutral", request.status];
  return sheet({
    title: `${request.oldEmail} → ${request.requesterEmail}`,
    tone, pillWords: label,
    metaParts: [request.accountId ? "the old address has an account" : "no account uses the old address", `shops: ${(request.shops ?? []).join(", ") || "none"}`, `asked ${when(request.askedAt)}`, request.holdUntil ? `can move after ${when(request.holdUntil)}` : null, request.id],
    body: [el("p", { className: "cr-quote", textContent: request.details }),
      history((request.history ?? []).map((h) => `${when(h.at)} · ${h.what}${h.by ? ` · ${h.by}` : ""}${h.note ? ` · ${h.note}` : ""}${h.reason ? ` · ${h.reason}` : ""}`))].filter(Boolean),
    actions,
  });
}

// ── The breach register (control-room/breaches.js, plan 8.6): written down, marked reported or told, never deleted. ──
async function loadBreaches() {
  try {
    const { breaches, privacyContact } = await api("POST", "/control/breaches");
    $("#privacy-contact").textContent = privacyContact ? `Privacy contact: ${privacyContact}.` : "";
    $("#breaches").replaceChildren(...(breaches.length ? breaches.map(breachCard) : [emptyState("Nothing in the register.", "Write one down below as soon as a breach is found.")]));
  } catch (failure) {
    status.textContent = failure.message;
  }
}

$("#breach-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const value = (name) => form.elements.namedItem(name);
  try {
    await api("POST", "/control/breaches/record", {
      foundOn: value("foundOn").value, what: value("what").value, people: value("people").value,
      shops: value("shops").value.split(",").map((id) => id.trim()).filter(Boolean),
      reportedToCommissioner: value("reportedToCommissioner").checked, peopleTold: value("peopleTold").checked,
    });
    form.reset();
    status.textContent = "Written in the breach register.";
    await loadBreaches();
    await loadWaitlist();
    await loadSettings();
    await loadActivity();
  } catch (failure) {
    status.textContent = failure.message;
  }
});

function breachCard(entry) {
  const mark = (label, field) => {
    const marker = button(label, "secondary");
    marker.addEventListener("click", async () => {
      marker.disabled = true;
      try {
        await api("POST", "/control/breaches/update", { id: entry.id, [field]: true });
        await loadBreaches();
      } catch (failure) {
        status.textContent = failure.message;
        marker.disabled = false;
      }
    });
    return marker;
  };
  const settled = entry.reportedToCommissioner && entry.peopleTold;
  return sheet({
    title: `Found ${entry.foundOn}`,
    tone: settled ? "success" : "warning",
    pillWords: settled ? "Reported and told" : entry.peopleTold ? "People told" : "Open",
    metaParts: [`people: ${entry.people}`, `shops: ${entry.shops.join(", ") || "none"}`,
      entry.reportedToCommissioner ? `reported ${when(entry.reportedAt)}` : "not reported to the Commissioner",
      entry.peopleTold ? `people told ${when(entry.toldAt)}` : "people not told", `kept until at least ${entry.keepUntil}`, entry.id],
    body: [el("p", { className: "cr-body", textContent: entry.what }), history(entry.history.map((h) => `${when(h.at)} · ${h.what} · ${h.by}${h.note ? ` · ${h.note}` : ""}`))].filter(Boolean),
    actions: el("div", { className: "cr-actions" },
      entry.reportedToCommissioner ? null : mark("Mark reported to the Commissioner", "reportedToCommissioner"),
      entry.peopleTold ? null : mark("Mark people told", "peopleTold")),
  });
}

// ── The run book (control-room/backupPerson.js, plan 8.7): pause releases, roll back a shop, a status note. ──
async function loadEmergency() {
  const state = await api("GET", "/control/emergency");
  const run = (label, path, body, done, variant = "secondary") => {
    const runButton = button(label, variant);
    runButton.addEventListener("click", async () => {
      const extra = body();
      if (!extra) return;
      runButton.disabled = true;
      try {
        await api("POST", path, extra);
        status.textContent = done;
        await loadEmergency();
      } catch (failure) {
        status.textContent = failure.message;
        runButton.disabled = false;
      }
    });
    return runButton;
  };
  const reason = (what) => {
    const why = (window.prompt(`${what}\n\nWhy? The platform owner is told (at least 10 characters).`) ?? "").trim();
    return why ? { reason: why } : null;
  };
  const sealed = state.role === "backup" && !state.seal;
  const part = (title, ...body) => el("article", { className: "rp-card" }, el("div", { className: "rp-card-body", style: "padding-top: 16px" }, el("h3", { className: "cr-title", textContent: title }), ...body));
  const parts = [];
  if (state.role === "backup") {
    parts.push(part("Emergency access", el("p", { className: "rp-hint", textContent: state.seal ? `Open until ${new Date(state.seal.until).toLocaleString()}. Every use is emailed to the platform owner.` : "Shut. Open it only in an emergency." }),
      sealed ? el("div", { className: "cr-actions" }, run("Open the emergency access", "/control/emergency/open", () => reason("Open the emergency access for 12 hours."), "Open. The platform owner has been emailed.", "primary")) : null));
  }
  if (!sealed) {
    parts.push(part("Releases",
      el("div", { className: "cr-row", style: "margin-top: 8px" }, state.releasesPaused ? pill("warning", "Paused") : pill("success", "Running"),
        el("span", { className: "rp-hint cr-grow", textContent: state.releasesPaused ? `Paused by ${state.releasesPaused.by}: ${state.releasesPaused.reason}` : "Releases go out to shops as normal." })),
      el("div", { className: "cr-actions" }, state.releasesPaused
        ? run("Resume releases", "/control/emergency/resume-releases", () => reason("Let releases go out again."), "Releases can go out again.", "primary")
        : run("Pause releases", "/control/emergency/pause-releases", () => reason("Stop every release; one already running stops before its next shop."), "Releases are paused.", "danger"))));
    const shopId = el("input", { className: "rp-input", placeholder: "shop id" });
    shopId.setAttribute("aria-label", "Shop to roll back");
    const version = el("input", { className: "rp-input", placeholder: "release, like 1.4.0" });
    version.setAttribute("aria-label", "Release to go back to");
    parts.push(part("Roll one shop back",
      el("p", { className: "rp-hint", textContent: "Put one shop back on an earlier release. It's written in the shop's history." }),
      el("div", { className: "cr-toolbar", style: "margin: 12px 0 0" }, el("div", { className: "rp-field cr-grow" }, shopId), el("div", { className: "rp-field cr-grow" }, version),
        run("Roll this shop back", "/control/emergency/roll-back", () => {
          const why = reason(`Put ${shopId.value} back on release ${version.value}.`);
          return why ? { ...why, shopId: shopId.value.trim(), version: version.value.trim() } : null;
        }, "Rolled back. It's in the shop's history."))));
    const note = el("textarea", { className: "rp-textarea", maxLength: 500, value: state.statusNote?.text ?? "" });
    note.setAttribute("aria-label", "Note on the status page");
    parts.push(part("Note on the status page",
      el("p", { className: "rp-hint", textContent: state.statusNote?.text ? "Shown on the status page now." : "Nothing is posted." }),
      el("div", { className: "cr-actions" }, note,
        run("Post on the status page", "/control/emergency/status-note", () => ({ text: note.value }), "The status page shows the note.", "primary"),
        run("Take the note down", "/control/emergency/status-note", () => ({ text: "" }), "The note is down.", "ghost"))));
  }
  $("#emergency").replaceChildren(...parts);
  return state;
}


// ── Sign-ups and the waitlist (plan 9.5): invite someone and they skip the daily line; Try again for a stuck shop. ──
const when = (at) => (at ? new Date(at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "");
const MAKING_TONE = { queued: "info", making: "info", failed: "danger", stopped: "danger" };

async function invite(address, clicked) {
  if (clicked) clicked.disabled = true;
  try {
    const { email, sent } = await api("POST", "/control/invite", { email: address });
    await loadWaitlist();
    status.textContent = sent ? `Invite sent to ${email}.` : `${email} was already invited. Nothing new was sent.`;
  } catch (failure) {
    status.textContent = failure.message;
    if (clicked) clicked.disabled = false;
  }
}

async function loadWaitlist() {
  try {
    const { waiting, people, inTheMaking } = await api("GET", "/control/waitlist");
    $("#waitlist-summary").textContent = `${waiting} waiting on the list · ${inTheMaking.length} shop${inTheMaking.length === 1 ? "" : "s"} being made. Invite someone and they skip the daily line.`;
    $("#making").replaceChildren(...(inTheMaking.length ? inTheMaking.map((shop) => {
      const retry = button("Try again", "primary", { hidden: ["queued", "making"].includes(shop.status) });
      retry.addEventListener("click", async () => {
        const reason = askWhy(`Try making ${shop.pressName} again.`);
        if (!reason) return;
        retry.disabled = true;
        try {
          await api("POST", "/control/retry", { shopId: shop.shopId, reason });
          status.textContent = `${shop.pressName}: trying again.`;
          await loadWaitlist();
        } catch (failure) {
          status.textContent = failure.message;
          retry.disabled = false;
        }
      });
      return sheet({
        title: shop.pressName,
        tone: shop.canRetry ? "danger" : MAKING_TONE[shop.status] ?? "warning",
        pillWords: shop.status,
        metaParts: [shop.shopId, shop.ownerEmail, `started ${when(shop.createdAt)}`],
        body: shop.message ? [el("p", { className: "cr-body", textContent: shop.message })] : [],
        actions: el("div", { className: "cr-actions" }, retry.hidden ? null : retry),
      });
    }) : [emptyState("No shop is being made right now.", "A new press's shop shows here while the shop maker builds it, usually for about a minute.")]));
    $("#waitlist").replaceChildren(people.length ? table({
      caption: "The waitlist",
      rows: people,
      columns: [
        { header: "Press", lead: true, render: (person) => el("div", {}, el("p", { className: "cr-title", textContent: person.press || person.name || person.email }), person.press && person.name ? meta(person.name) : null) },
        { header: "Email", render: (person) => person.email },
        { header: "Wants", render: (person) => PLAN_WORDS[person.plan] ?? person.plan ?? "?" },
        { header: "Joined", render: (person) => el("span", { className: "rp-mono", textContent: when(person.joinedAt) }) },
        { header: "", end: true, render: (person) => {
          if (person.invited) return pill("success", "Invited");
          const send = button("Invite", "secondary");
          send.addEventListener("click", () => invite(person.email, send));
          return send;
        } },
      ],
    }) : emptyState("Nobody is on the waitlist yet.", "People who join from the waitlist page show here, oldest first."));
  } catch (failure) {
    status.textContent = failure.message;
  }
}

$("#invite-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  await invite(form.email.value, form.querySelector("button"));
  form.reset();
});

// ── Platform settings (plan 9.4): sign-up, the daily cap, prices, trial, founding offer, pay as you sell. ──
// Money shows in dollars and the pay-as-you-sell share as a percent; the server keeps cents and hundredths of a percent.
const toShown = (field, value) => (field.kind === "cents" ? (value / 100).toFixed(2) : field.kind === "basisPoints" ? String(value / 100) : String(value));
const fromShown = (field, text) => (field.kind === "cents" || field.kind === "basisPoints" ? Math.round(Number(text) * 100) : Number(text));
let settingsFields = [];

async function loadSettings() {
  try {
    const { fields, values, defaults, updatedAt, updatedBy } = await api("GET", "/control/settings");
    settingsFields = fields;
    $("#settings-fields").replaceChildren(...fields.map((field) => {
      const changed = values[field.path] !== defaults[field.path];
      const note = changed ? el("span", { className: "rp-hint", textContent: `Normally ${field.kind === "yesNo" ? (defaults[field.path] ? "on" : "off") : toShown(field, defaults[field.path])}` }) : null;
      if (field.kind === "yesNo") {
        return el("div", { className: "rp-field" }, el("label", { className: "rp-check" }, el("input", { type: "checkbox", name: field.path, checked: values[field.path] }), field.label), note);
      }
      const unit = field.kind === "cents" ? " ($)" : field.kind === "basisPoints" ? " (%)" : "";
      const step = field.kind === "whole" ? "1" : "0.01";
      const id = `setting-${field.path.replace(/[^\w]+/g, "-")}`;
      return el("div", { className: "rp-field" }, el("label", { className: "rp-label", htmlFor: id, textContent: `${field.label}${unit}` }),
        el("input", { id, className: "rp-input", type: "number", name: field.path, value: toShown(field, values[field.path]), step, min: toShown(field, field.min), max: toShown(field, field.max), required: true, inputMode: "decimal" }),
        note);
    }));
    $("#settings-updated").textContent = updatedAt ? `Last changed ${when(updatedAt)} by ${updatedBy}` : "Nothing changed yet: these are the platform's defaults.";
  } catch (failure) {
    status.textContent = failure.message;
  }
}

$("#settings-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(settingsFields.map((field) => [field.path, field.kind === "yesNo" ? form.elements[field.path].checked : fromShown(field, form.elements[field.path].value)]));
  const save = form.querySelector("button[type=submit]");
  save.disabled = true;
  try {
    const { changed } = await api("POST", "/control/settings", { values, reason: form.reason.value });
    form.reason.value = "";
    await loadSettings();
    await loadActivity();
    status.textContent = changed.length ? `Saved: ${changed.map((c) => settingsFields.find((f) => f.path === c.path)?.label ?? c.path).join("; ")}.` : "Nothing had changed, so nothing was saved.";
  } catch (failure) {
    status.textContent = failure.message;
  }
  save.disabled = false;
});

// ── Activity log (plan 9.9): read only. ──
const ACTIVITY_WORDS = {
  "settings-changed": "changed the platform settings", "waitlist-invite": "invited someone from the waitlist", "switch-set": "set a switch",
  "act-as": "opened the shop's admin as support", "test-shop-reset": "reset the test shop's sample books", "google-run-again": "ran a Google step again", "shop-closed": "closed the shop", "shop-reopened": "opened the shop again",
  "newsletter-resumed": "turned the newsletter back on", "fee-change-scheduled": "changed the fee on each order (starts in 30 days)",
  "fee-change-cancelled": "cancelled a waiting fee change", "new-shop-switch": "changed what new shops start with", "signup-retry": "tried making the shop again",
};

async function loadActivity() {
  try {
    const shopId = $("#activity-form").shopId.value.trim();
    const { entries } = await api("POST", "/control/activity", shopId ? { shopId } : {});
    $("#activity").replaceChildren(entries.length ? table({
      caption: "Activity log",
      rows: entries,
      columns: [
        { header: "When", render: (entry) => el("span", { className: "rp-mono", textContent: when(entry.at) }) },
        { header: "What", lead: true, render: (entry) => el("div", {}, el("p", { className: "cr-title", textContent: `${entry.by ?? "the platform"} ${ACTIVITY_WORDS[entry.what] ?? entry.what}` }),
          meta(entry.detail?.reason ? `why: ${entry.detail.reason}` : null, ...(entry.detail?.changes ?? []).map((c) => `${c.path}: ${c.from} → ${c.to}`), entry.detail?.email ?? null)) },
        { header: "Shop", render: (entry) => (entry.shopId ? el("span", { className: "rp-mono", textContent: entry.shopId }) : el("span", { className: "rp-hint", textContent: "every shop" })) },
      ],
    }) : emptyState("Nothing yet.", shopId ? "Nobody has done anything for this shop in the control room." : "What anyone does in the control room is written here."));
  } catch (failure) {
    status.textContent = failure.message;
  }
}

$("#activity-form").addEventListener("submit", (event) => {
  event.preventDefault();
  loadActivity();
});

// ── The shell: one page at a time, by the address's #. An element's id opens the page it is on. ──
const PAGES = [...document.querySelectorAll("[data-page]")];
let shellRole = null;
function pageFor(hash) {
  const id = decodeURIComponent(hash.slice(1));
  if (!id) return null;
  const page = PAGES.find((p) => p.dataset.page === id) ?? document.getElementById(id)?.closest("[data-page]");
  return page && (shellRole !== "backup" || page.dataset.page === "runbook") ? page : null;
}
function route() {
  if (!shellRole) return;
  const fallback = PAGES.find((p) => p.dataset.page === (shellRole === "backup" ? "runbook" : "today"));
  const page = pageFor(location.hash) ?? fallback;
  for (const p of PAGES) p.hidden = p !== page;
  for (const item of document.querySelectorAll(".rp-nav-item")) {
    if (item.dataset.nav === page.dataset.page) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  }
  $("#topbar-title").textContent = `Colophon · ${page.querySelector(".rp-page-title")?.textContent ?? "control room"}`;
  setMenu(false);
  closeDrawer();
  // A link to something on the page (the test shop, the stuck sign-ups) scrolls to it.
  const id = decodeURIComponent(location.hash.slice(1));
  const target = id === page.dataset.page ? null : document.getElementById(id);
  if (target && target !== page && page.contains(target)) target.scrollIntoView({ block: "start" });
  else $("#rp-main").scrollTop = 0;
}
window.addEventListener("hashchange", route);

function showShell(role) {
  shellRole = role;
  $("#gate").hidden = true;
  $("#shell").hidden = false;
  $("#view-shops").hidden = role === "backup";
  for (const item of document.querySelectorAll("[data-admin]")) item.hidden = role === "backup";
  $("#who").textContent = auth.currentUser?.email ?? "";
  route();
}

function showGate(id) {
  shellRole = null;
  $("#shell").hidden = true;
  $("#gate").hidden = false;
  for (const view of ["#view-signin", "#view-code", "#view-setup"]) $(view).hidden = view !== id;
}

// The menu is a drawer below desktop widths.
function setMenu(open) {
  $("#sidebar").dataset.open = String(open);
  $("#scrim").hidden = !open;
  $("#menu-open").setAttribute("aria-expanded", String(open));
  if (open) $("#sidebar .rp-nav-item")?.focus();
}
$("#menu-open").addEventListener("click", () => setMenu(true));
$("#menu-close").addEventListener("click", () => { setMenu(false); $("#menu-open").focus(); });
$("#scrim").addEventListener("click", () => setMenu(false));
$("#sidebar").addEventListener("keydown", (event) => { if (event.key === "Escape" && $("#sidebar").dataset.open === "true") { setMenu(false); $("#menu-open").focus(); } });
$("#sign-out").addEventListener("click", () => signOut(auth));

// The look, as in the website admin: Riso Press or Paper, day or night. Kept in this browser only.
const remember = (key, value) => { try { if (value === undefined) return localStorage.getItem(key); localStorage.setItem(key, value); } catch { /* storage blocked */ } return null; };
function applyLook(look, appearance) {
  if (look === "paper") document.documentElement.dataset.adminLook = "paper";
  else delete document.documentElement.dataset.adminLook;
  $("#room").dataset.rpAppearance = appearance;
  for (const choice of document.querySelectorAll("[data-look]")) choice.setAttribute("aria-pressed", String(choice.dataset.look === look));
  $("#appearance").setAttribute("aria-pressed", String(appearance === "dark"));
  $("#appearance").textContent = appearance === "dark" ? "Day" : "Night";
}
let look = remember("colophon-control-look") ?? "riso";
let appearance = remember("colophon-control-appearance") ?? (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light");
applyLook(look, appearance);
for (const choice of document.querySelectorAll("[data-look]")) {
  choice.addEventListener("click", () => { look = choice.dataset.look; remember("colophon-control-look", look); applyLook(look, appearance); });
}
$("#appearance").addEventListener("click", () => {
  appearance = appearance === "dark" ? "light" : "dark";
  remember("colophon-control-appearance", appearance);
  applyLook(look, appearance);
});

// Messages show as a toast, and a quiet one goes after a while.
let statusTimer = null;
new MutationObserver(() => {
  clearTimeout(statusTimer);
  if (status.textContent && status.textContent !== "Loading…") statusTimer = setTimeout(() => { status.textContent = ""; }, 10_000);
}).observe(status, { childList: true, characterData: true, subtree: true });

// ── Signing in (plan 9.1): Google, then a code from the authenticator app. The server refuses a sign-in without it. ──
const showOnly = showGate;
let resolver = null;

$("#google").addEventListener("click", async () => {
  status.textContent = "";
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (error) {
    if (error?.code !== "auth/multi-factor-auth-required") {
      status.textContent = "Sign-in didn't finish.";
      return;
    }
    resolver = getMultiFactorResolver(auth, error);
    showOnly("#view-code");
    $("#code-form").code.focus();
  }
});

$("#code-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const hint = resolver?.hints.find((h) => h.factorId === TotpMultiFactorGenerator.FACTOR_ID);
  if (!hint) {
    status.textContent = "Your account has no authenticator app set up. Ask for help.";
    return;
  }
  form.querySelector("button").disabled = true;
  try {
    await resolver.resolveSignIn(TotpMultiFactorGenerator.assertionForSignIn(hint.uid, form.code.value.replace(/\s+/g, "")));
    form.reset();
    resolver = null;
  } catch {
    status.textContent = "That code didn't work. Codes change every 30 seconds: try the one on screen now.";
  }
  form.querySelector("button").disabled = false;
});

let setupSecret = null;
async function startTwoStepSetup() {
  try {
    setupSecret = await TotpMultiFactorGenerator.generateSecret(await multiFactor(auth.currentUser).getSession());
  } catch (error) {
    status.textContent = error?.code === "auth/requires-recent-login"
      ? "Sign in again, then set up two-step sign-in straight away."
      : "Two-step sign-in can't be set up yet. It has to be turned on for the platform first (see control-room/README.md).";
    return;
  }
  const link = setupSecret.generateQrCodeUrl(auth.currentUser.email, "Colophon control room");
  $("#setup-key").textContent = setupSecret.secretKey.replace(/(.{4})/g, "$1 ").trim();
  $("#setup-link").href = link;
  try {
    // qrcode-generator (loaded by index.html) draws the code as a picture; without it the key and link still work.
    const qr = window.qrcode(0, "M");
    qr.addData(link);
    qr.make();
    $("#setup-qr").replaceChildren(el("img", { src: qr.createDataURL(5, 2), alt: "Code to scan with your authenticator app" }));
  } catch {
    $("#setup-qr").textContent = "";
  }
  status.textContent = "";
  showOnly("#view-setup");
}

$("#setup-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  form.querySelector("button").disabled = true;
  try {
    await multiFactor(auth.currentUser).enroll(TotpMultiFactorGenerator.assertionForEnrollment(setupSecret, form.code.value.replace(/\s+/g, "")), "Authenticator app");
    form.reset();
    await signOut(auth);
    status.textContent = "Two-step sign-in is on. Sign in again with Google, then type the code from the app.";
  } catch {
    status.textContent = "That code didn't work. Codes change every 30 seconds: try the one on screen now.";
  }
  form.querySelector("button").disabled = false;
});

$("#refresh").addEventListener("click", load);
onAuthStateChanged(auth, (user) => {
  if (user) load();
  else showOnly("#view-signin");
});

// ── Switches for every shop (plan 9.7): one switch for every live shop at once, and what new shops start with. ──
async function loadEverySwitch() {
  try {
    const { switches } = await api("GET", "/control/new-shop-switches");
    const entries = Object.entries(switches);
    $("#every-switch").replaceChildren(...(entries.length ? entries.map(([name, startsOn]) => {
      const words = SWITCH_WORDS[name] ?? name;
      const forAll = (on) => {
        const b = button(on ? "On for every shop" : "Off for every shop", on ? "secondary" : "ghost");
        b.addEventListener("click", async () => {
          const reason = askWhy(`Turn "${words}" ${on ? "on" : "off"} for every live shop. Each shop's pages are deployed again.`);
          if (!reason) return;
          b.disabled = true;
          try {
            const { shops } = await api("POST", "/control/switch-all", { name, on, reason });
            const failed = shops.filter((s) => s.error);
            await load();
            status.textContent = `${words}: ${shops.length - failed.length} shop${shops.length - failed.length === 1 ? "" : "s"} done.${failed.length ? ` Not done: ${failed.map((s) => `${s.shopId} (${s.error})`).join("; ")}` : ""}`;
          } catch (failure) {
            status.textContent = failure.message;
          }
          b.disabled = false;
        });
        return b;
      };
      const box = el("input", { type: "checkbox", checked: startsOn });
      box.addEventListener("change", async () => {
        const reason = askWhy(`New shops start with "${words}" ${box.checked ? "on" : "off"}.`);
        if (!reason) {
          box.checked = !box.checked;
          return;
        }
        try {
          await api("POST", "/control/new-shop-switches", { name, on: box.checked, reason });
          status.textContent = `New shops start with ${words} ${box.checked ? "on" : "off"}.`;
        } catch (failure) {
          status.textContent = failure.message;
          box.checked = !box.checked;
        }
      });
      return sheet({
        title: words,
        tone: startsOn ? "success" : "neutral",
        pillWords: startsOn ? "New shops: on" : "New shops: off",
        body: [el("label", { className: "rp-check" }, box, "New shops start with it on")],
        actions: el("div", { className: "cr-actions", style: "margin-top: 8px" }, forAll(true), forAll(false)),
      });
    }) : [emptyState("No switches yet.")]));
  } catch (failure) {
    status.textContent = failure.message;
  }
}
