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
import { shopMatches } from "./shopSearch.js";

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
/** "$1.20 of $10" from a shop's budget notices (plan 15.17), or a dash before the first one. */
function costCell(cost) {
  if (!cost) return el("span", { className: "rp-hint", textContent: "—" });
  const money = (n) => `${cost.currency === "USD" || !cost.currency ? "$" : `${cost.currency} `}${Number(n).toFixed(Number(n) % 1 ? 2 : 0)}`;
  return el("div", {}, el("span", { textContent: money(cost.amount) }), cost.budget ? meta(`of ${money(cost.budget)} alert`) : null);
}

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
/** replaceChildren without the nulls (the DOM would show a null child as the word "null"). */
const fill = (node, ...kids) => node.replaceChildren(...kids.filter((kid) => kid !== null && kid !== undefined && kid !== false));
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
    await loadTaxWatch();
    await loadTestShop();
    await loadShops();
    status.textContent = "";
    showShell("admin");
    await loadRepairs();
    await loadTickets();
    await loadApps();
    await loadRecoveries();
    await loadBreaches();
    await loadWaitlist();
    await loadEverySwitch();
    await loadGoogleReady();
    await loadSettings();
    await loadActivity();
    await loadBusiness();

    await loadTags();
    await loadJobs();
    await loadMessages();
    await loadCosts();
    await loadSetup();
  } catch (failure) {
    status.textContent = failure.message;
    // A listed admin without two-step sign-in yet (plan 9.1): offer to set up the authenticator app.
    if (/two-step/.test(failure.message) && auth.currentUser && !multiFactor(auth.currentUser).enrolledFactors.length) await startTwoStepSetup();
  }
}

// ── Shops: search and filters (plan 9.3), over the list already loaded. ──
let allShops = [];

async function loadShops() {
  allShops = (await api("GET", "/control/shops")).shops;
  showShops();
  loadSocialLost();
}

// Social connections a network stopped accepting (27.8), across the shops: the press reconnects from their Sales
// channels page, so each line opens the shop to see who to tell. Nothing shows while there are none.
async function loadSocialLost() {
  try {
    const { lost } = await api("POST", "/control/social-lost");
    $("#social-lost").replaceChildren(...(lost?.length ? [el("div", { className: "rp-alerts" }, ...lost.map((l) => {
      const open = button("Open", "secondary");
      open.addEventListener("click", () => { const shop = allShops.find((x) => x.shopId === l.shopId); if (shop) openShop(shop); });
      return el("div", { className: "rp-alert", dataset: { tone: "warning" } },
        el("span", { className: "rp-alert-glyph", ariaHidden: "true", textContent: "!" }),
        el("span", { className: "rp-alert-text" },
          el("strong", { className: "rp-alert-title", textContent: `${l.pressName}: ${l.name} stopped working` }),
          el("span", { className: "rp-alert-detail", textContent: `${l.lostAt ? `Since ${dateOnly(l.lostAt)}. ` : ""}The press reconnects it in Sales channels.` })),
        el("span", { className: "rp-alert-actions" }, open));
    }))] : []));
  } catch {
    $("#social-lost").replaceChildren();
  }
}
// Every shop's tags (19.13), for the list's pills and search.
let shopTags = {};
const BILLING_TONE = { trialing: "info", active: "success", past_due: "danger", paused: "warning", unpaid: "warning", incomplete: "warning", canceled: "neutral", incomplete_expired: "neutral" };
const PLAN_WORDS = { shop: "Shop", stockroom: "Stockroom", both: "Shop and stockroom" };
/** " · emails: 2 in French, 1 French then English, 9 in English" over the presses (not the test shop), or "". */
function languageCount(shops) {
  const presses = shops.filter((shop) => !shop.testShop && shop.emailLanguage);
  const count = (language) => presses.filter((shop) => shop.emailLanguage === language).length;
  const parts = [[count("fr"), "in French"], [count("fr+en"), "French then English"], [count("en"), "in English"]].filter(([n]) => n);
  return parts.length ? ` · emails: ${parts.map(([n, words]) => `${n} ${words}`).join(", ")}` : "";
}

// The Shops list's Risk filter: the drift watch's level, the owner's snooze, and a move left part-way.
function riskMatches(shop, risk) {
  const level = shop.drift?.level;
  if (!risk) return true;
  if (risk === "at-risk") return level === "drifting" || level === "watch";
  if (risk === "snoozed") return Boolean(shop.drift?.snoozedUntil);
  if (risk === "moving") return Boolean(shop.moveStuck);
  return level === risk;
}

/** A small pill for a press at risk in the Shops list, or null. */
function riskPill(shop) {
  if (shop.drift?.snoozedUntil) return pill("neutral", `snoozed until ${dateOnly(shop.drift.snoozedUntil)}`);
  if (shop.drift?.level === "drifting") return pill("danger", "drifting");
  if (shop.drift?.level === "watch") return pill("warning", "to watch");
  return null;
}

/** The Sells filter: books answers (or none), everything else, one answer, or a Stripe category that doesn't fit. */
function sellsMatches(shop, wanted) {
  if (!wanted) return true;
  const sells = shop.sells ?? { books: true, answer: null, mismatch: false };
  if (wanted === "books") return sells.books;
  if (wanted === "goods") return !sells.books;
  if (wanted === "mismatch") return sells.mismatch;
  return sells.answer === wanted;
}

function showShops() {
  const form = $("#shop-filters");
  const words = form.q.value.trim().toLowerCase();
  const shown = allShops.filter((shop) => shopMatches(shop, words, shopTags[shop.shopId])
    && (!form.health.value || shop.health.level === form.health.value)
    && (!form.plan.value || shop.plan === form.plan.value)
    && (!form.billing.value || shop.billingStatus === form.billing.value)
    && riskMatches(shop, form.risk.value)
    && sellsMatches(shop, form.sells.value));
  const problems = allShops.filter((s) => s.health.level === "problem").length;
  $("#summary").textContent = `${allShops.length} shop${allShops.length === 1 ? "" : "s"} · ${problems} with a problem${languageCount(allShops)}${shown.length !== allShops.length ? ` · showing ${shown.length}` : ""}`;
  if (!shown.length) {
    $("#shops").replaceChildren(allShops.length ? emptyState("No shop matches.", "Clear the search or the filters to see every shop.") : emptyState("No shops yet.", "A press's shop shows here as soon as it is made."));
    return;
  }
  $("#shops").replaceChildren(table({
    caption: "Shops",
    rows: shown,
    open: (shop) => openShop(shop),
    columns: [
      { header: "Press", lead: true, render: (shop) => el("div", {}, el("p", { className: "cr-title", textContent: shop.pressName ?? shop.shopId }), meta(shop.shopId, shop.ownerEmail, shop.testShop ? "test shop" : null, shop.sells?.answer ? `sells ${shop.sells.words.toLowerCase()}` : null), tagPills(shopTags[shop.shopId]), riskPill(shop), shop.sells?.mismatch ? pill("warning", "Stripe category doesn't match") : null) },
      { header: "Plan", render: (shop) => PLAN_WORDS[shop.plan] ?? shop.plan ?? "?" },
      { header: "Billing", render: (shop) => (shop.billingStatus ? pill(BILLING_TONE[shop.billingStatus] ?? "neutral", BILLING_WORDS[shop.billingStatus] ?? shop.billingStatus) : el("span", { className: "rp-hint", textContent: shop.access ?? "none" })) },
      { header: "Cost this month", render: (shop) => costCell(shop.costThisMonth) },
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
const CLOSING_WORDS = { paused: "paused", closed: "closed, download open", deleted: "deleted", reopening: "opening again" };
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

/** The language of the platform's emails to a press (the record's `emailLanguage`). */
const EMAIL_LANGUAGE_WORDS = { fr: "in French", "fr+en": "in French, then English (billing address in Quebec)", en: "in English" };

/** The press's sample email (the record's `emailSample`): the trial-ending email, as it would get it. Nothing is sent. */
function emailSampleView(sample) {
  if (!sample?.subject) return [];
  return [el("details", { className: "cr-sample" },
    el("summary", { textContent: `See a sample email, ${EMAIL_LANGUAGE_WORDS[sample.language] ?? "as this press gets it"}` }),
    el("p", { className: "rp-hint", textContent: "The reminder a few days before the trial ends, with this press's plan, price and day. Nothing is sent." }),
    el("p", {}, el("strong", { textContent: "Subject: " }), sample.subject),
    el("pre", { style: "white-space: pre-wrap; font: inherit; margin: 0", textContent: sample.text }))];
}

function recordView(record) {
  const billing = record.billing;
  const connections = record.connections;
  const facts = [
    ["Owner", record.ownerEmail],
    ["Started", dateOnly(record.createdAt)],
    ["Address", record.siteUrl],
    ["Plan", billing ? `${billing.plan ?? record.plan} · ${BILLING_WORDS[billing.status] ?? billing.status}${billing.trialEnd ? ` · trial ends ${dateOnly(billing.trialEnd)}` : ""}${billing.currentPeriodEnd ? ` · next payment ${dateOnly(billing.currentPeriodEnd)}` : ""} · ${billing.hasCard ? "card on file" : "no card yet"}${billing.cancelAtPeriodEnd ? " · cancelling" : ""}` : record.plan],
    ["Sells", record.sells?.line ?? ""],
    ["Emails", EMAIL_LANGUAGE_WORDS[record.emailLanguage] ?? ""],
    ["Payments", connections.payments ? `${connections.payments.provider ?? "?"}${connections.payments.connected ? ", connected" : ", not connected yet"}` : "not set up yet"],
    ["Web address", Array.isArray(connections.domains) && connections.domains.length ? connections.domains.map((d) => `${d.name} (${d.brokeAt ? "stopped opening the shop" : d.state}${d.expiresAt ? `, paid up until ${dateOnly(d.expiresAt)}` : ""})`).join(", ") : "the shop's own .web.app address"],
    ["Version", record.version ?? "none yet"],
  ].filter(([, value]) => value);
  return el("div", { className: "record" },
    el("dl", { className: "cr-facts" }, ...facts.flatMap(([label, value]) => [el("dt", { textContent: label }), el("dd", { textContent: value })])),
    ...emailSampleView(record.emailSample),
    ...deliveryView(record.delivery),
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

// ── Tax lines (plan 15.20): amber at 70% of each registration line, "over" at 100%. ──
async function loadTaxWatch() {
  const target = $("#tax-watch");
  try {
    const { lines } = await api("GET", "/control/tax-watch");
    target.replaceChildren(...lines.map((l) => sheet({
      title: l.label, tone: l.state === "ok" ? "success" : l.state === "amber" ? "warning" : "danger",
      pillWords: l.state === "ok" ? "Fine" : l.state === "amber" ? "Close" : "Past the line", body: [el("p", { className: "rp-hint", textContent: l.words })],
    })));
  } catch (failure) {
    target.replaceChildren(emptyState(failure.message));
  }
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
      const glyph = el("span", { className: "rp-alert-glyph", ariaHidden: "true", textContent: tone === "danger" ? "✕" : "!" });
      const text = el("span", { className: "rp-alert-text" }, el("strong", { className: "rp-alert-title", textContent: need.words }));
      // A drifting press can be snoozed from here (a button can't sit inside the alert's link, so this one is a box).
      if (need.kind === "drift") {
        return el("div", { className: "rp-alert", dataset: { tone } }, glyph, text,
          el("span", { className: "rp-alert-actions" }, el("a", { className: "rp-btn rp-btn-sm", href: need.go, textContent: "Open" }), snoozeButton(need.shopId, need.words.split(" may be")[0], 30)));
      }
      return el("a", { className: "rp-alert", href: need.go, dataset: { tone } }, glyph, text,
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
  // Making changes waits for the press's yes (19.6): "Ask the press" emails them; once they approve, "Open their admin".
  const change = button("Ask the press", "secondary", { disabled: shop.status !== "live" });
  const accessSlot = el("div", { className: "cr-access" });
  change.addEventListener("click", () => askThePress(shop, change, accessSlot));
  if (shop.status === "live") showAccess(shop, accessSlot);

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

  // Lost phone AND lost backup codes (plan 22.11): two-step sign-in off for one person, only once you've checked it's them.
  const twoStep = button("Turn off two-step for someone", "secondary", { disabled: shop.status !== "live" });
  twoStep.addEventListener("click", async () => {
    const email = (window.prompt(`Turn off two-step sign-in for one person on ${shop.pressName}.\n\nThe email address they sign in with:`) ?? "").trim();
    if (!email) return;
    const reason = askWhy(`Turn off two-step sign-in for ${email}. Say how you checked it's really them (for example, a reply from the owner's email address on file).`);
    if (!reason) return;
    if (!window.confirm(`After this, Google alone lets ${email} into ${shop.pressName}'s admin until they set up two-step again. Go on?`)) return;
    twoStep.disabled = true;
    try {
      const { removed } = await api("POST", "/control/two-step-reset", { shopId: shop.shopId, email, reason });
      status.textContent = removed
        ? `Two-step sign-in is off for ${email}. Ask them to set it up again under Settings, Security. It's in the shop's log.`
        : `${email} didn't have two-step sign-in on, so nothing changed. It's in the shop's log.`;
    } catch (failure) {
      status.textContent = failure.message;
    }
    twoStep.disabled = false;
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
    el("div", { className: "cr-actions" }, act, change, check, twoStep, closing, exportButton(shop)),
    accessSlot,
    switches ? el("h3", { className: "cr-section", textContent: "Switches for this shop" }) : null,
    switches,
    shop.status === "live" ? el("h3", { className: "cr-section", textContent: "Card payments" }) : null,
    shop.status === "live" ? paymentsMenu(shop.paymentsMoved?.to ?? "platform", { shopId: shop.shopId }, shop.pressName) : null,
    el("h3", { className: "cr-section", textContent: "The record" }),
    recordSlot,
    el("h3", { className: "cr-section", textContent: "Emails to the press" }),
    shopEmailsSection(shop),
    shop.drift ? el("h3", { className: "cr-section", textContent: "Drift watch" }) : null,
    shop.drift ? driftSection(shop) : null,
    shop.status === "live" ? el("h3", { className: "cr-section", textContent: "Sign-in safety" }) : null,
    shop.status === "live" ? signInSafetySection(shop) : null,
    shop.status === "live" ? el("h3", { className: "cr-section", textContent: "Brought over from the old shop" }) : null,
    shop.status === "live" ? broughtOverSection(shop) : null,
    shop.status === "live" ? el("h3", { className: "cr-section", textContent: "Payment links and fair till" }) : null,
    shop.status === "live" ? salesChannelsSection(shop) : null,
    // Social channels post the website's products, so a stockroom-only shop has none.
    shop.status === "live" && shop.plan !== "stockroom" ? el("h3", { className: "cr-section", textContent: "Social channels" }) : null,
    shop.status === "live" && shop.plan !== "stockroom" ? shopSocialSection(shop) : null,
    shop.status === "live" ? el("h3", { className: "cr-section", textContent: "Newsletters, morning emails and changed orders" }) : null,
    shop.status === "live" ? shopFeaturesSection(shop) : null,
    shop.status === "live" ? el("h3", { className: "cr-section", textContent: "Website look" }) : null,
    shop.status === "live" ? shopLookSection(shop) : null,
    ...privateSections(shop),
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

// A request sent from setup mode's Help has no shop yet: the press's name is in its first message
// (apps/shop setupMode/SetupHelp.tsx), so it is labelled as a press setting up.
const SETUP_NOTE = /\(Sent while setting up (.+?)\.\)\s*$/;
function setupNote(ticket) {
  if (ticket.shopId) return null;
  const name = SETUP_NOTE.exec(ticket.messages?.[0]?.body ?? "")?.[1];
  return name ? `setting up ${name}, no shop yet` : null;
}

// ── The app store (code plan 26.1, services/apps/makers.js): outside apps waiting for review, approve or send back,
// and take an app off the store. A failed read leaves the rest of the control room. ──
let appStatus = "in-review";
let appPermissions = {};
let appUse = null;
filterChips("#app-filters", (picked) => { appStatus = picked; loadApps(); });
const APP_WORDS = { "in-review": ["warning", "Waiting for review"], listed: ["success", "On the store"], unlisted: ["neutral", "Taken off"], draft: ["info", "Being made"] };

async function loadApps() {
  try {
    if (!Object.keys(appPermissions).length) {
      const { permissions } = await api("GET", "/apps/permissions");
      appPermissions = Object.fromEntries((permissions ?? []).map((p) => [p.scope, p]));
    }
    const [{ apps }, use] = await Promise.all([api("POST", "/control/apps", { status: appStatus }), api("POST", "/control/app-use").catch(() => null)]);
    appUse = use;
    $("#app-failing").replaceChildren(...(use?.failing?.length ? [failingAlerts(use.failing)] : []));
    // The menu's count: apps waiting for review, plus apps whose alerts are failing.
    const failingCount = use?.failing?.length ?? 0;
    if (appStatus === "in-review") setBadge("apps", apps.length + failingCount);
    else api("POST", "/control/apps", { status: "in-review" }).then((r) => setBadge("apps", r.apps.length + failingCount)).catch(() => {});
    const empty = { "in-review": ["No apps waiting.", "An app shows here as soon as its maker sends it for review."], "on-store": ["No apps on the store yet."], unlisted: ["No apps taken off the store."], draft: ["No apps being made."] }[appStatus];
    $("#apps").replaceChildren(...(apps.length ? apps.map(appCard) : [emptyState(...empty)]));
  } catch (failure) {
    $("#apps").replaceChildren(emptyState("Couldn't read the app store.", failure.message));
  }
}

/** Apps whose alerts gave up in the last week (26.4), each with one "Send again" for once the maker has fixed their end. */
function failingAlerts(failing) {
  return el("div", { className: "rp-alerts" }, ...failing.map((row) => {
    const name = row.appName ?? row.appId;
    const again = button("Send again", "secondary");
    again.addEventListener("click", async () => {
      again.disabled = true;
      try {
        const { resent } = await api("POST", "/control/app-use/resend", { appId: row.appId });
        status.textContent = `${name}: ${plural(resent, "alert")} sent again.`;
        await loadApps();
      } catch (failure) {
        status.textContent = failure.message;
        again.disabled = false;
      }
    });
    return el("div", { className: "rp-alert", dataset: { tone: "warning" } },
      el("span", { className: "rp-alert-glyph", ariaHidden: "true", textContent: "!" }),
      el("span", { className: "rp-alert-text" },
        el("strong", { className: "rp-alert-title", textContent: `${name}'s alerts aren't getting through` }),
        el("span", { className: "rp-alert-detail", textContent: `${plural(row.alerts, "alert")} from ${plural(row.shops, "shop")} gave up this week: the app ${row.lastError ?? "didn't answer"}.` })),
      el("span", { className: "rp-alert-actions" }, again));
  }));
}

/** How many shops an app is on, from the installs; the maker's own test installs counted apart. */
function appReach(appId) {
  const row = appUse?.byApp?.[appId];
  if (!row) return appUse ? "on no shops" : null;
  return [row.shops ? `on ${plural(row.shops, "shop")}` : "on no shops", row.testing ? `${row.testing} testing` : null].filter(Boolean).join(", ");
}

/** A permission in the words the press reads before saying yes; one that reaches shoppers' details is marked. */
function permissionLine(scope) {
  const known = appPermissions[scope];
  return el("li", {}, `${known?.words ?? scope} `, known?.personal ? pill("warning", "shoppers' details") : null);
}

function appCard(app) {
  const d = app.draft ?? app.listing?.details ?? {};
  const actions = [];
  const run = (label, tone, path, ask) => {
    const b = button(label, tone);
    b.addEventListener("click", async () => {
      const reason = ask ? (window.prompt(`${ask}\n\nWhy? The maker reads this (at least 10 characters).`) ?? "").trim() : null;
      if (ask && !reason) return;
      b.disabled = true;
      try {
        await api("POST", path, { appId: app.appId, ...(reason ? { reason } : {}) });
        status.textContent = `${d.name ?? app.appId}: ${label.toLowerCase()} done.`;
        await loadApps();
      } catch (failure) {
        status.textContent = failure.message;
        b.disabled = false;
      }
    });
    actions.push(b);
  };
  if (app.status === "in-review") {
    run("Approve", "primary", "/control/apps/approve", null);
    run("Send back", "secondary", "/control/apps/send-back", `Send ${d.name ?? "this app"} back to its maker.`);
  }
  if (app.onStore) run("Take off the store", "ghost", "/control/apps/unlist", `Take ${app.listing?.details?.name ?? d.name ?? "this app"} off the store.`);
  const [tone, words] = APP_WORDS[app.status] ?? ["neutral", app.status];
  const scopes = d.scopes ?? [];
  return sheet({
    title: d.name ?? app.appId,
    tone, pillWords: words,
    metaParts: [app.makerEmail, app.status === "in-review" || app.status === "draft" ? null : appReach(app.appId), d.supportEmail && d.supportEmail !== app.makerEmail ? `help: ${d.supportEmail}` : null, app.updatedAt ? `updated ${dateOnly(app.updatedAt)}` : null],
    body: [
      d.tagline ? el("p", { className: "cr-body", textContent: d.tagline }) : null,
      d.description ? el("p", { className: "cr-quote", textContent: d.description }) : null,
      el("p", { className: "rp-hint", textContent: [d.website ? d.website : null, d.alertsAddress ? `alerts to ${d.alertsAddress}` : null, d.returnAddresses?.length ? `returns to ${d.returnAddresses.join(", ")}` : null].filter(Boolean).join(" · ") }),
      el("h4", { className: "cr-section", textContent: "Asks to" }),
      scopes.length ? el("ul", { className: "cr-steps" }, ...scopes.map(permissionLine)) : el("p", { className: "rp-hint", textContent: "No permissions." }),
      app.draftDiffers ? el("p", { className: "rp-hint", textContent: "Being changed: the store keeps the approved copy until the maker sends it again." }) : null,
      app.review?.sentBack ? el("p", { className: "rp-hint", textContent: `Last sent back ${dateOnly(app.review.sentBack.at)}: ${app.review.sentBack.reason}` }) : null,
      app.unlisted ? el("p", { className: "rp-hint", textContent: `Taken off ${dateOnly(app.unlisted.at)} by ${app.unlisted.by}: ${app.unlisted.reason}` }) : null,
      app.history?.length ? el("details", {}, el("summary", { textContent: "History", style: "min-height: 44px; padding: 11px 0; cursor: pointer" }), history(app.history.slice().reverse().map((h) => `${when(h.at)} · ${h.by ?? "the maker"} · ${h.what}`))) : null,
    ].filter(Boolean),
    actions: el("div", { className: "cr-actions" }, ...actions),
  });
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
    metaParts: [ticket.pressName ? `${ticket.pressName} (${ticket.shopId})` : setupNote(ticket), ticket.email, `opened ${when(ticket.openedAt)}`, ticket.id],
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
      state.releaseWindow ? el("p", { className: "rp-hint", textContent: state.releaseWindow.closedNow ? `Closed now: ${state.releaseWindow.reason}. A security fix can still go out.${state.releaseWindow.next ? ` Opens ${new Date(state.releaseWindow.next).toLocaleString()}.` : ""}` : `Open. Next closes ${state.releaseWindow.next ? new Date(state.releaseWindow.next).toLocaleString() : "later"} (weekends and the two weeks before Christmas).` }) : null,
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
        pillWords: shop.status === "plan-change-stopped" ? "plan change stopped" : shop.status,
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
  "act-as": "opened the shop's admin as support", "two-step-reset": "turned off two-step sign-in for someone", "test-shop-reset": "reset the test shop's sample books", "google-run-again": "ran a Google step again", "shop-closed": "closed the shop", "shop-reopened": "opened the shop again",
  "newsletter-resumed": "turned the newsletter back on", "fee-change-scheduled": "changed the fee on each order (starts in 30 days)",
  "fee-change-cancelled": "cancelled a waiting fee change", "new-shop-switch": "changed what new shops start with", "signup-retry": "tried making the shop again", "plan-change-retry": "tried the plan change again",
  "access-asked": "asked the press for a yes to make changes",

  "note-added": "added a private note", "note-deleted": "deleted a private note", "tags-set": "changed the shop's tags", "job-run": "ran a job by hand",
  "drift-snoozed": "snoozed a drifting press", "drift-woken": "ended a drifting press's snooze",
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

// ── Is Google ready? (plan 15.4): what is still to do before Connect Google can be switched on. ──
async function loadGoogleReady() {
  const target = $("#google-ready");
  try {
    const { items } = await api("GET", "/control/google-ready");
    target.replaceChildren(...items.map((i) => sheet({ title: i.title, tone: i.done ? "success" : "warning", pillWords: i.done ? "Done" : "To do", body: [el("p", { className: "rp-hint", textContent: i.words })] })));
  } catch (failure) {
    target.replaceChildren(emptyState(failure.message));
  }
}

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

// ── Support asks before making changes (plan 19.6): "Ask the press", their answer, then "Open their admin" once. ──
const ACCESS_STATE = {
  waiting: ["warning", "Waiting for the press"], approved: ["success", "The press said yes"], declined: ["danger", "The press said no"],
  expired: ["neutral", "Ran out after 24 hours"], used: ["neutral", "Yes used for a visit"],
};

async function showAccess(shop, slot) {
  try {
    const { requests } = await api("POST", "/control/access-requests", { shopId: shop.shopId });
    const latest = requests[0];
    if (!latest) {
      slot.replaceChildren(el("p", { className: "rp-hint", style: "margin-top: 12px", textContent: "To make changes in this shop, ask the press first. They get an email and say yes or no on their account page." }));
      return;
    }
    const [tone, words] = ACCESS_STATE[latest.status] ?? ["neutral", latest.status];
    const open = latest.status === "approved" ? button("Open their admin", "primary") : null;
    open?.addEventListener("click", async () => {
      if (!window.confirm(`Anything you change is changed in ${shop.pressName}'s real shop, and the press sees it in their log. Go on?`)) return;
      open.disabled = true;
      try {
        const { url } = await api("POST", "/control/act-as", { shopId: shop.shopId, mode: "edit", requestId: latest.id });
        window.open(url, "_blank", "noopener");
        status.textContent = `Logged. ${shop.pressName}'s admin opened in a new tab for 30 minutes, able to make changes. Their yes is used.`;
      } catch (failure) {
        status.textContent = failure.message;
      }
      await showAccess(shop, slot);
    });
    slot.replaceChildren(el("div", { style: "margin-top: 12px" },
      el("div", { className: "cr-row" }, pill(tone, words)),
      meta(`asked by ${latest.by} on ${when(latest.askedAt)}`, `why: ${latest.reason}`, latest.status === "waiting" || latest.status === "approved" ? `until ${when(latest.expiresAt)}` : null),
      open ? el("div", { className: "cr-actions", style: "margin-top: 8px" }, open) : null));
  } catch (failure) {
    slot.replaceChildren(el("p", { className: "rp-hint", textContent: failure.message }));
  }
}

async function askThePress(shop, clicked, slot) {
  const reason = askWhy(`Ask ${shop.pressName} to let you make changes in their admin for 30 minutes. They get an email and answer on their account page.`);
  if (!reason) return;
  clicked.disabled = true;
  try {
    const { emailed } = await api("POST", "/control/act-as", { shopId: shop.shopId, reason, mode: "edit" });
    status.textContent = emailed
      ? `Asked. ${shop.pressName}'s owner has an email; "Open their admin" shows here once they say yes.`
      : `Asked, but the email to ${shop.pressName}'s owner didn't go. They can still answer on their account page.`;
  } catch (failure) {
    status.textContent = failure.message;
  }
  clicked.disabled = false;
  await showAccess(shop, slot);
}

// ── The business side of Today (plan 19.7-19.9): income over time, failed plan payments, why presses leave. Each part
// shows its own trouble in its own place, so one that can't load never hides the others. ──
async function loadBusiness() {
  await Promise.all([loadIncome(), loadAtRisk(), loadFairMonths(), loadPaymentTrouble(), loadLeaving(), loadAppsClosing()]);
}

const SVG = "http://www.w3.org/2000/svg";
function svg(tag, attrs = {}, ...children) {
  const node = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
  node.append(...children.filter(Boolean));
  return node;
}
const monthWords = (month, style = "short") => new Date(`${month}-15T12:00:00Z`).toLocaleDateString(undefined, { month: style, ...(style === "long" ? { year: "numeric" } : {}), timeZone: "UTC" });
const wholeMoney = (cents, currency) => new Intl.NumberFormat(undefined, { style: "currency", currency, currencyDisplay: "narrowSymbol", maximumFractionDigits: 0 }).format(cents / 100);

/** A tidy top for the income axis: 1, 2 or 5 times a power of ten, in whole currency units. */
function axisTop(cents) {
  const units = Math.max(1, cents / 100);
  const power = 10 ** Math.floor(Math.log10(units));
  const step = [1, 2, 5, 10].find((m) => m * power >= units);
  return step * power * 100;
}

/** The 12-month line as inline SVG: months along the bottom, income on the left, the last point marked and labelled. */
function incomeChart(months, currency, wide = 720) {
  // Drawn at the width it is shown, so its words keep their size on a phone; a narrow chart names every third month.
  const width = Math.max(300, Math.round(wide)), height = 260, left = 64, right = 24, top = 28, bottom = 32;
  const every = width < 560 ? 3 : 1;
  const points = months.map((m, i) => ({ ...m, i })).filter((m) => m.incomeCents !== null);
  const topCents = axisTop(Math.max(...points.map((p) => p.incomeCents), 0));
  const x = (i) => left + (i * (width - left - right)) / Math.max(1, months.length - 1);
  const y = (cents) => top + (height - top - bottom) * (1 - cents / topCents);
  const ticks = [0, topCents / 2, topCents];
  const last = points.at(-1);
  const titleId = "income-chart-title";
  const descId = "income-chart-desc";
  const chart = svg("svg", { class: "cr-chart", viewBox: `0 0 ${width} ${height}`, role: "img", "aria-labelledby": `${titleId} ${descId}` },
    svg("title", { id: titleId }, "Monthly income, last 12 months"),
    svg("desc", { id: descId }, last ? `Now ${wholeMoney(last.incomeCents, currency)} a month, from ${last.paying} paying shop${last.paying === 1 ? "" : "s"}.` : "No income recorded yet."),
    ...ticks.map((cents) => svg("line", { class: "cr-chart-grid", x1: left, x2: width - right, y1: y(cents), y2: y(cents) })),
    ...ticks.map((cents) => {
      const label = svg("text", { class: "cr-chart-axis", x: left - 8, y: y(cents) + 4, "text-anchor": "end" });
      label.textContent = wholeMoney(cents, currency);
      return label;
    }),
    ...months.map((m, i) => {
      if ((months.length - 1 - i) % every) return null;
      const label = svg("text", { class: "cr-chart-axis", x: x(i), y: height - 8, "text-anchor": i === 0 ? "start" : i === months.length - 1 ? "end" : "middle" });
      // January carries its year, so the line says where one year ends and the next begins.
      label.textContent = every === 1 && m.month.endsWith("-01") ? `${monthWords(m.month)} ${m.month.slice(0, 4)}` : monthWords(m.month);
      return label;
    }),
    points.length > 1 ? svg("polyline", { class: "cr-chart-line", points: points.map((p) => `${x(p.i)},${y(p.incomeCents)}`).join(" ") }) : null,
    ...points.map((p) => {
      const isLast = p === last;
      const hover = svg("title");
      hover.textContent = `${monthWords(p.month, "long")}${p === last && p.i === months.length - 1 ? " so far" : ""}: ${wholeMoney(p.incomeCents, currency)} a month, ${p.paying} paying`;
      return svg("g", {},
        svg("circle", { class: "cr-chart-hit", cx: x(p.i), cy: y(p.incomeCents), r: 14 }),
        svg("circle", { class: isLast ? "cr-chart-last" : "cr-chart-dot", cx: x(p.i), cy: y(p.incomeCents), r: isLast ? 6 : 4 }),
        hover);
    }),
    last ? (() => {
      const label = svg("text", { class: "cr-chart-label", x: x(last.i), y: y(last.incomeCents) - 14, "text-anchor": last.i === months.length - 1 ? "end" : "middle" });
      label.textContent = wholeMoney(last.incomeCents, currency);
      return label;
    })() : null);
  // The same numbers as a table, for screen readers.
  const rows = points.map((p) => el("tr", {}, el("th", { scope: "row", textContent: monthWords(p.month, "long") }), el("td", { textContent: wholeMoney(p.incomeCents, currency) }), el("td", { textContent: String(p.paying) })));
  const tableView = el("table", { className: "rp-sr-only" }, el("caption", { textContent: "Monthly income by month" }),
    el("thead", {}, el("tr", {}, el("th", { scope: "col", textContent: "Month" }), el("th", { scope: "col", textContent: "Income a month" }), el("th", { scope: "col", textContent: "Paying shops" }))),
    el("tbody", {}, ...rows));
  return [chart, tableView];
}

let lastIncome = null;
const chartWidth = () => ($("#income-chart").clientWidth || 768) - 48;
let resizing = null;
window.addEventListener("resize", () => {
  clearTimeout(resizing);
  resizing = setTimeout(() => {
    const body = $("#income-chart .rp-card-body");
    if (lastIncome?.started && body) body.replaceChildren(...incomeChart(lastIncome.months, lastIncome.currency ?? "CAD", chartWidth()));
  }, 150);
});

async function loadIncome() {
  const figures = $("#income-figures");
  const box = $("#income-chart");
  try {
    const income = await api("GET", "/control/income");
    const currency = income.currency ?? "CAD";
    const figure = (label, value, foot, tone) => el("div", { className: "rp-card rp-metric" },
      el("div", { className: "rp-metric-label", textContent: label }),
      el("div", { className: "rp-metric-value", textContent: value, dataset: tone ? { tone } : {} }),
      foot ? el("div", { className: "rp-metric-foot", textContent: foot }) : null);
    const rate = income.trials.rate === null ? "None yet" : `${Math.round(income.trials.rate * 100)}%`;
    figures.replaceChildren(
      figure("Kept this month", wholeMoney(income.kept.cents, currency), `${income.kept.newPaying} new paying, ${income.kept.upgrades} bigger plan${income.kept.upgrades === 1 ? "" : "s"}`),
      figure("Lost this month", wholeMoney(income.lost.cents, currency), `${income.lost.lost} stopped paying, ${income.lost.downgrades} smaller plan${income.lost.downgrades === 1 ? "" : "s"}`, income.lost.cents ? "danger" : null),
      figure("Trials that became paying", rate, income.trials.ended ? `${income.trials.converted} of ${income.trials.ended} trials, last ${income.trials.days} days` : `No trials ended in the last ${income.trials.days} days`),
    );
    lastIncome = income;
    box.replaceChildren(income.started
      ? el("div", { className: "rp-card-body", style: "padding-top: 16px" }, ...incomeChart(income.months, currency, chartWidth()))
      : emptyState("The line starts the first night the platform runs.", "Each night the platform writes down its monthly income; the line grows from there."));
  } catch (failure) {
    figures.replaceChildren();
    box.replaceChildren(emptyState(failure.message));
  }
}

// One press's drift watch in its record: the level and reasons, the check-in email, and the snooze with its button.
function driftSection(shop) {
  const d = shop.drift;
  const words = { drifting: "Drifting away", watch: "To watch", fine: "Selling and signing in as usual" };
  return el("div", {},
    el("div", { className: "cr-row" }, pill(d.level === "drifting" ? "danger" : d.level === "watch" ? "warning" : "success", words[d.level] ?? d.level),
      d.snoozedUntil ? pill("neutral", `snoozed until ${dateOnly(d.snoozedUntil)}${d.snoozedBy ? ` by ${d.snoozedBy}` : ""}`) : null),
    meta(...d.reasons, d.checkedInAt ? `check-in email ${dateOnly(d.checkedInAt)}` : null, d.at ? `checked ${dateOnly(d.at)}` : null),
    d.level !== "fine" || d.snoozedUntil ? el("div", { className: "cr-actions" }, snoozeButton(shop.shopId, shop.pressName ?? shop.shopId, d.snoozedUntil ? 0 : 30)) : null,
    shop.moveStuck ? el("p", { className: "rp-hint", textContent: `Their move from the old shop stopped ${shop.moveStuck.days} days ago: still to do ${shop.moveStuck.left.map((t) => t.toLowerCase()).join(", ")}.` }) : null);
}

// Drifting presses: snooze one for a while (it leaves Today and gets no check-in email), or end the snooze.
function snoozeButton(shopId, name, days) {
  const snooze = button(days ? `Snooze ${days} days` : "End snooze", "secondary");
  snooze.addEventListener("click", async () => {
    const reason = (window.prompt(`${days ? `Leave ${name} off Today for ${days} days (no check-in email either).` : `Put ${name} back on Today.`}\n\nWhy? This goes in the activity log (at least 10 characters).`) ?? "").trim();
    if (!reason) return;
    snooze.disabled = true;
    try {
      await api("POST", "/control/drift-snooze", { shopId, days, reason });
      snooze.textContent = days ? `Snoozed for ${days} days` : "Snooze ended";
      await Promise.all([loadToday(), loadAtRisk(), loadShops()]);
    } catch (failure) {
      snooze.disabled = false;
      window.alert(failure.message);
    }
  });
  return snooze;
}

// Fair till sales by month across every press with the stockroom: is the fair till worth showing new presses?
async function loadFairMonths() {
  const target = $("#fair-months");
  if (!target) return;
  try {
    const { months, presses, unread } = await api("GET", "/control/fair-months");
    const cad = (n) => money(Math.round(n * 100), "CAD");
    const sold = months.filter((m) => m.sales);
    fill(target,
      unread.length ? el("p", { className: "rp-hint", textContent: `Couldn't read ${unread.map((u) => u.pressName).join(", ")}; their sales are left out.` }) : null,
      sold.length ? table({
        caption: `Fair till sales by month, ${plural(presses, "press", "presses")} with the stockroom`,
        columns: [
          { header: "Month", lead: true, render: (m) => el("span", { className: "rp-mono", textContent: m.month }) },
          { header: "Sales", render: (m) => String(m.sales) },
          { header: "Copies", render: (m) => String(m.copies) },
          { header: "Money", render: (m) => el("span", { className: "rp-mono", textContent: cad(m.amount) }) },
          { header: "Presses selling", render: (m) => String(m.presses) },
        ],
        rows: [...months].reverse(),
      }) : emptyState("No fair till sales in the last 12 months.", "A press's sales show here once they ring one up at a fair."));
  } catch (failure) {
    target.replaceChildren(emptyState(failure.message));
  }
}

// Presses at risk: the paying presses drifting or to watch, and the monthly income they bring in.
async function loadAtRisk() {
  const target = $("#at-risk");
  if (!target) return;
  try {
    const [{ presses, drifting, watch, currency }, income] = await Promise.all([api("GET", "/control/at-risk"), api("GET", "/control/income").catch(() => null)]);
    // The nightly income record keeps the money at risk too: each month's last night, oldest first.
    const past = (income?.months ?? []).filter((m) => m.atRisk);
    const trend = past.length > 1
      ? el("p", { className: "rp-hint", textContent: `Money at risk at each month's end: ${past.map((m) => `${m.month} ${money(m.atRisk.cents, currency)} (${plural(m.atRisk.count, "press", "presses")})`).join(" · ")}.` })
      : null;
    const figure = (label, value, foot, tone) => el("div", { className: "rp-card rp-metric" },
      el("div", { className: "rp-metric-label", textContent: label }),
      el("div", { className: "rp-metric-value", textContent: String(value), dataset: tone ? { tone } : {} }),
      foot ? el("div", { className: "rp-metric-foot", textContent: foot }) : null);
    const numbers = el("div", { className: "rp-kpi-grid", ariaLabel: "Presses at risk in numbers" },
      figure("Drifting away", drifting.count, `${money(drifting.monthlyCents, currency)} a month`, drifting.count ? "danger" : null),
      figure("To watch", watch.count, `${money(watch.monthlyCents, currency)} a month`, watch.count ? "warn" : null));
    fill(target, numbers, trend, presses.length ? table({
      caption: "Presses at risk, most at risk first",
      columns: [
        { header: "Press", lead: true, render: (p) => el("div", {}, el("p", { className: "cr-title", textContent: p.pressName }), meta(p.shopId, p.ownerEmail)) },
        { header: "Risk", render: (p) => el("div", {}, pill(p.level === "drifting" ? "danger" : "warning", p.level === "drifting" ? "drifting" : "to watch"), p.snoozedUntil ? meta(`snoozed until ${dateOnly(p.snoozedUntil)}`) : null) },
        { header: "Why", render: (p) => meta(...p.reasons, p.checkedInAt ? `check-in email ${dateOnly(p.checkedInAt)}` : null) },
        { header: "A month", render: (p) => el("span", { className: "rp-mono", textContent: money(p.monthlyCents, currency) }) },
        { header: "", render: (p) => snoozeButton(p.shopId, p.pressName, p.snoozedUntil ? 0 : 30) },
      ],
      rows: presses,
    }) : emptyState("No paying press is drifting.", "Every paying press is selling and signing in as usual."));
  } catch (failure) {
    target.replaceChildren(emptyState(failure.message));
  }
}

async function loadPaymentTrouble() {
  const target = $("#payment-trouble");
  try {
    const { shops } = await api("GET", "/control/payment-trouble");
    if (!shops.length) {
      target.replaceChildren(emptyState("No failed plan payments.", "Every paying shop's card is going through."));
      return;
    }
    const days = (n) => `${n} day${n === 1 ? "" : "s"}`;
    target.replaceChildren(table({
      caption: "Failed plan payments, most urgent first",
      columns: [
        { header: "Shop", lead: true, render: (s) => el("div", {}, el("p", { className: "cr-title", textContent: s.pressName }), meta(s.shopId, s.ownerEmail)) },
        { header: "What's wrong", render: (s) => pill(s.open ? "danger" : "warning", s.state) },
        { header: "Since", render: (s) => (s.daysSince === null ? "Not known" : `${days(s.daysSince)} (${dateOnly(s.since)})`) },
        { header: "Time left", render: (s) => (s.daysLeft === null ? "Open while the card is tried again" : `${days(s.daysLeft)}: closes ${dateOnly(s.closesAt)}`) },
      ],
      rows: shops,
      open: (s) => { const shop = allShops.find((x) => x.shopId === s.shopId); if (shop) openShop(shop); },
    }));
  } catch (failure) {
    target.replaceChildren(emptyState(failure.message));
  }
}

/**
 * Why presses dropped an app over the last six months, as bars: every reason on the list (none given as well), the
 * most given first. Nothing when nobody answered. Each line reads as its words and its number; the bar itself is hidden from screen readers.
 */
function dropReasonBars(drops, reasonWords = {}) {
  const counts = drops?.reasons ?? {};
  const answered = Object.values(counts).reduce((sum, n) => sum + n, 0);
  if (!answered) return null;
  const rows = Object.entries(reasonWords).map(([id, label]) => [label, counts[id] ?? 0]);
  const unanswered = Math.max(0, (drops.dropped ?? 0) - answered);
  if (unanswered) rows.push(["Didn't say", unanswered]);
  rows.sort((a, b) => b[1] - a[1]);
  const most = Math.max(...rows.map(([, n]) => n));
  return el("figure", { style: "margin: 16px 0 0" },
    el("figcaption", { className: "cr-section", style: "margin: 0", textContent: "Why presses dropped an app, last 6 months" }),
    el("ul", { className: "cr-bars", dataset: { dropReasons: "" } }, ...rows.map(([label, n]) => el("li", {},
      el("span", { textContent: label }),
      el("span", { className: "cr-bar-track", ariaHidden: "true" }, el("span", { className: "cr-bar", style: `width: ${(n / most) * 100}%`, dataset: n ? {} : { none: "" } })),
      el("span", { className: "cr-bar-n", textContent: String(n) }),
    ))));
}

async function loadAppsClosing() {
  const target = $("#apps-closing");
  try {
    const { shops, closed, drops, reasonWords } = await api("GET", "/control/apps-closing");
    const days = (n) => `${n} day${n === 1 ? "" : "s"}`;
    const shopCell = (s) => el("div", {}, el("p", { className: "cr-title", textContent: s.pressName }), meta(s.shopId, s.ownerEmail));
    const bounced = (s) => (s.bounced ? pill("danger", "Email bounced") : null);
    const openRow = (s) => { const shop = allShops.find((x) => x.shopId === s.shopId); if (shop) openShop(shop); };
    // How often a press dropped an app and then kept it, and why they dropped it: many keeps would mean the plan page's
    // drop confuses people.
    const kept = drops.dropped
      ? el("p", { className: "rp-hint", textContent: `Last 6 months: ${drops.dropped} app${drops.dropped === 1 ? "" : "s"} dropped, ${drops.kept} kept after all, ${drops.closed} closed, ${drops.waiting} still to close.` })
      : null;
    const reasons = dropReasonBars(drops, reasonWords);
    const closing = shops.length
      ? table({
        caption: "Apps closing, soonest first",
        columns: [
          { header: "Shop", lead: true, render: shopCell },
          { header: "Closing", render: (s) => el("div", { className: "cr-tags" }, pill("warning", s.apps), bounced(s)) },
          { header: "Closes", render: (s) => `${dateOnly(s.closesAt)} (${days(s.daysLeft)})` },
          { header: "Reminder", render: (s) => (s.reminded ? `Emailed ${dateOnly(s.reminded)}` : "Goes out a week before") },
        ],
        rows: shops,
        open: openRow,
      })
      : emptyState("No app is closing.", "Nobody has dropped the website or the stockroom from their plan.");
    const records = closed.length
      ? table({
        caption: "Closed apps still holding records, stuck ones first",
        columns: [
          { header: "Shop", lead: true, render: shopCell },
          { header: "App", render: (s) => el("div", { className: "cr-tags" }, pill(s.overdue ? "danger" : "neutral", s.app), bounced(s)) },
          { header: "Download until", render: (s) => (s.overdue ? `${dateOnly(s.downloadUntil)} (over)` : `${dateOnly(s.downloadUntil)} (${days(s.daysLeft)})`) },
          { header: "What's next", render: (s) => (s.overdue ? `Waiting to be deleted${s.problem ? `: ${s.problem}` : ""}` : s.warnedAt ? `Last email sent ${dateOnly(s.warnedAt)}` : "Last email 3 days before") },
        ],
        rows: closed,
        open: openRow,
      })
      : null;
    target.replaceChildren(closing, ...(kept ? [kept] : []), ...(reasons ? [reasons] : []), ...(records ? [records] : []));
  } catch (failure) {
    target.replaceChildren(emptyState(failure.message));
  }
}

async function loadLeaving() {
  const target = $("#leaving");
  const saves = $("#save-list");
  try {
    const answer = await api("GET", "/control/leaving");
    const countList = (counts) => el("dl", { className: "cr-facts" }, ...answer.reasons.flatMap((r) => [el("dt", { textContent: r.label }), el("dd", { textContent: String(counts[r.id] ?? 0) })]));
    const total = (counts) => Object.values(counts).reduce((sum, n) => sum + n, 0);
    target.replaceChildren(
      sheet({ title: "This month", tone: "neutral", pillWords: `${total(answer.thisMonth)} answer${total(answer.thisMonth) === 1 ? "" : "s"}`, body: [countList(answer.thisMonth), answer.stayedThisMonth ? el("p", { className: "rp-hint", textContent: `${answer.stayedThisMonth} answered, then kept their plan.` }) : null] }),
      sheet({ title: "The last 6 months", tone: "neutral", pillWords: `${total(answer.lastSixMonths)} answer${total(answer.lastSixMonths) === 1 ? "" : "s"}`, body: [countList(answer.lastSixMonths), answer.stayedLastSixMonths ? el("p", { className: "rp-hint", textContent: `${answer.stayedLastSixMonths} answered, then kept their plan.` }) : null] }),
      sheet({ title: "In their words", tone: "neutral", body: answer.latest.length
        ? answer.latest.map((a) => el("blockquote", { className: "cr-quote" }, meta(a.pressName, a.label, dateOnly(a.at), a.stayed ? "kept their plan" : null), a.words))
        : [el("p", { className: "rp-hint", textContent: "Nobody has left a few words yet." })] }),
    );
    saves.replaceChildren(answer.saveList.length
      ? table({
        caption: "Shops whose plan is set to end, soonest first",
        columns: [
          { header: "Shop", lead: true, render: (s) => el("div", {}, el("p", { className: "cr-title", textContent: s.pressName }), meta(s.shopId, s.ownerEmail)) },
          { header: "Why it ends", render: (s) => pill(s.why === "cancelled" ? "warning" : "danger", s.why === "cancelled" ? "Cancelled" : "No card") },
          { header: "Ends", render: (s) => (s.endsAt ? `${dateOnly(s.endsAt)} (${s.daysLeft} day${s.daysLeft === 1 ? "" : "s"})` : "Not known") },
          { header: "What they said", render: (s) => (s.label ? `${s.label}${s.words ? `: ${s.words}` : ""}` : "Nothing") },
        ],
        rows: answer.saveList,
        open: (s) => { const shop = allShops.find((x) => x.shopId === s.shopId); if (shop) openShop(shop); },
      })
      : emptyState("No plan is set to end.", "Nobody has cancelled, and no shop is waiting for a card."));
  } catch (failure) {
    target.replaceChildren(emptyState(failure.message));
    saves.replaceChildren();
  }
}

// ── Payments and email delivery (plan 19.12): the last 7 days, on the shop's record. ──
function deliveryView(delivery) {
  if (!delivery) return [];
  const { payments, email } = delivery;
  return [
    el("h3", { className: "cr-section", textContent: "Payments and email, last 7 days" }),
    el("dl", { className: "cr-facts" },
      el("dt", { textContent: "Payments" }), el("dd", { textContent: `${payments.received} message${payments.received === 1 ? "" : "s"} from Stripe, ${payments.failed} not passed on` }),
      el("dt", { textContent: "Email" }), el("dd", { textContent: `${email.sent} sent, ${email.bounced} bounced, ${email.complained} marked as spam` })),
  ];
}

// ── Notes and tags (plan 19.13): private to the platform, never in the shop's own log. ──
function tagPills(tags) {
  return tags?.length ? el("div", { className: "cr-tags" }, ...tags.map((tag) => pill("neutral", tag))) : null;
}

async function loadTags() {
  try {
    shopTags = (await api("POST", "/control/notes", {})).tagsByShop ?? {};
    showShops();
  } catch (failure) {
    status.textContent = failure.message;
  }
}

function notesSection(shop) {
  const slot = el("div", { className: "cr-list" }, el("p", { className: "rp-hint", textContent: "Opening the notes…" }));
  const draw = async () => {
    let found;
    try {
      found = await api("POST", "/control/notes", { shopId: shop.shopId });
    } catch (failure) {
      slot.replaceChildren(el("p", { className: "rp-hint", textContent: failure.message }));
      return;
    }
    const list = found.notes.length
      ? el("ul", { className: "cr-steps" }, ...found.notes.map((note) => {
        const remove = button("Delete", "ghost");
        remove.addEventListener("click", async () => {
          const reason = askWhy(`Delete this note on ${shop.pressName}.`);
          if (!reason) return;
          remove.disabled = true;
          try {
            await api("POST", "/control/notes/delete", { shopId: shop.shopId, id: note.id, reason });
            status.textContent = "Note deleted. It's in the activity log.";
            await draw();
          } catch (failure) {
            status.textContent = failure.message;
            remove.disabled = false;
          }
        });
        return el("li", {}, el("p", { className: "cr-body", style: "margin: 0", textContent: note.words }), meta(when(note.at), note.by), remove);
      }))
      : el("p", { className: "rp-hint", textContent: "No notes yet." });
    const words = el("textarea", { className: "rp-textarea", maxLength: 1000, rows: 3, ariaLabel: `New note on ${shop.pressName}` });
    const add = button("Add note", "secondary");
    add.addEventListener("click", async () => {
      if (!words.value.trim()) { status.textContent = "Write the note first."; return; }
      add.disabled = true;
      try {
        await api("POST", "/control/notes/add", { shopId: shop.shopId, words: words.value });
        status.textContent = "Note added.";
        await draw();
      } catch (failure) {
        status.textContent = failure.message;
        add.disabled = false;
      }
    });
    const tagsField = el("input", { className: "rp-input", value: found.tags.join(", "), autocomplete: "off", ariaLabel: `Tags for ${shop.pressName}` });
    const saveTags = button("Save tags", "secondary");
    saveTags.addEventListener("click", async () => {
      const tags = tagsField.value.split(",").map((t) => t.trim()).filter(Boolean);
      const reason = askWhy(`Set ${shop.pressName}'s tags to: ${tags.join(", ") || "none"}.`);
      if (!reason) return;
      saveTags.disabled = true;
      try {
        const done = await api("POST", "/control/tags", { shopId: shop.shopId, tags, reason });
        shopTags[shop.shopId] = done.tags;
        showShops();
        status.textContent = done.changed ? "Tags saved." : "Those are already the tags.";
        await draw();
      } catch (failure) {
        status.textContent = failure.message;
        saveTags.disabled = false;
      }
    });
    slot.replaceChildren(
      el("label", { className: "rp-field" }, el("span", { className: "rp-label", textContent: "Tags (separated by commas, up to 10)" }), tagsField),
      el("div", { className: "cr-actions", style: "margin-top: 0" }, saveTags),
      list,
      el("div", { className: "cr-actions" }, words, add));
  };
  draw();
  return slot;
}

// ── One timeline per shop (plan 19.10): everything recorded about it, newest first, by kind, with Show older. ──
const TIMELINE_WORDS = { billing: "Billing", release: "Releases", health: "Health", support: "Support", switch: "Switches", visit: "Visits", email: "Email", security: "Sign-in safety", other: "Other" };
function timelineSection(shop) {
  let kind = null;
  let next = null;
  const list = el("ul", { className: "cr-history" });
  const more = button("Show older", "secondary", { hidden: true, className: "rp-btn rp-btn-secondary rp-btn-sm cr-timeline-more" });
  const chips = el("div", { className: "rp-tabs cr-toolbar", role: "group", ariaLabel: "Which kind of entries" },
    ...[["", "All"], ...Object.entries(TIMELINE_WORDS)].map(([value, words]) => el("button", { type: "button", className: "rp-tab", textContent: words, dataset: { kind: value } })));
  const page = async (fresh) => {
    if (fresh) { next = null; list.replaceChildren(el("li", { textContent: "Loading…" })); }
    try {
      const found = await api("POST", "/control/timeline", { shopId: shop.shopId, ...(kind ? { kinds: [kind] } : {}), ...(next ? { before: next } : {}) });
      const lines = found.entries.map((e) => el("li", { textContent: `${when(e.at)} · ${TIMELINE_WORDS[e.kind] ?? e.kind} · ${e.words}${e.by ? ` · ${e.by}` : ""}` }));
      if (fresh) list.replaceChildren(...(lines.length ? lines : [el("li", { textContent: "Nothing recorded yet." })]));
      else list.append(...lines);
      next = found.next;
      more.hidden = !next;
    } catch (failure) {
      list.replaceChildren(el("li", { textContent: failure.message }));
      more.hidden = true;
    }
  };
  for (const chip of chips.querySelectorAll("button")) {
    const pressed = chip.dataset.kind === "";
    chip.setAttribute("aria-pressed", String(pressed));
    chip.setAttribute("aria-selected", String(pressed));
    chip.addEventListener("click", () => {
      for (const other of chips.querySelectorAll("button")) {
        other.setAttribute("aria-pressed", String(other === chip));
        other.setAttribute("aria-selected", String(other === chip));
      }
      kind = chip.dataset.kind || null;
      page(true);
    });
  }
  more.addEventListener("click", async () => {
    more.disabled = true;
    await page(false);
    more.disabled = false;
  });
  page(true);
  return el("div", {}, chips, list, more);
}

/** The drawer's private sections: notes and tags, then the timeline. */
function privateSections(shop) {
  return [
    el("h3", { className: "cr-section", textContent: "Notes (only the platform sees these)" }),
    notesSection(shop),
    el("h3", { className: "cr-section", textContent: "Timeline" }),
    timelineSection(shop),
  ];
}

// ── Jobs (plan 19.11): every scheduled job, its last run, and Run now. ──
const everyWords = (minutes) => (minutes < 60 ? `${minutes} min` : minutes < 1440 ? `${minutes / 60} h` : minutes % 1440 === 0 && minutes > 1440 ? `${minutes / 1440} days` : "day");
const tookWords = (ms) => (ms == null ? "" : ms < 1000 ? `${ms} ms` : ms < 60_000 ? `${Math.round(ms / 100) / 10} s` : `${Math.round(ms / 6000) / 10} min`);

async function loadJobs() {
  try {
    const { jobs } = await api("GET", "/control/jobs");
    setBadge("jobs", jobs.filter((j) => j.late).length);
    $("#jobs").replaceChildren(jobs.length ? table({
      caption: "Jobs",
      rows: jobs,
      columns: [
        { header: "Job", lead: true, render: (job) => el("div", {}, el("p", { className: "cr-title", textContent: job.words }), meta(job.name)) },
        { header: "Every", render: (job) => everyWords(job.every) },
        { header: "Last run", render: (job) => (job.lastRun ? el("span", { className: "rp-mono", textContent: when(job.lastRun.startedAt) }) : el("span", { className: "rp-hint", textContent: "never" })) },
        { header: "Took", render: (job) => tookWords(job.lastRun?.ms) },
        { header: "Result", render: (job) => el("div", {},
          job.late ? pill("danger", "late") : job.never ? pill("neutral", "not run yet") : job.lastRun.ok ? pill("success", "worked") : pill("danger", "failed"),
          meta(job.lastRun?.error ?? job.lastRun?.summary ?? null, job.lastSuccessAt && !job.lastRun?.ok ? `last worked ${when(job.lastSuccessAt)}` : null)) },
        { header: "", end: true, render: (job) => {
          const run = button("Run now", "secondary", { disabled: !job.canRun, title: job.canRun ? "" : "This job can only run on the server." });
          run.addEventListener("click", async () => {
            const reason = askWhy(`Run "${job.words}" now.`);
            if (!reason) return;
            run.disabled = true;
            try {
              const done = await api("POST", "/control/jobs/run", { name: job.name, reason });
              status.textContent = done.run.ok ? `${job.words}: done${done.run.summary ? ` (${done.run.summary})` : ""}.` : `${job.words} failed: ${done.run.error}`;
              await loadJobs();
            } catch (failure) {
              status.textContent = failure.message;
              run.disabled = false;
            }
          });
          return run;
        } },
      ],
    }) : emptyState("No jobs yet."));
  } catch (failure) {
    $("#jobs").replaceChildren(emptyState(failure.message));
  }
}
$("#jobs-refresh").addEventListener("click", loadJobs);

// ── Messages to presses (plan 19.14): a note at the top of shop admins, until its end date. ──
Object.assign(ACTIVITY_WORDS, {
  "press-message-added": "sent a message to presses", "press-message-ended": "ended a message to presses", "data-export": "made a copy of the press's data",
});
const MESSAGE_STATE = { showing: ["success", "Showing"], upcoming: ["info", "Starts later"], ended: ["neutral", "Ended"] };
const audienceWords = (audience) => (audience.all ? "every shop" : audience.plan ? `the ${PLAN_WORDS[audience.plan] ?? audience.plan} plan` : `only ${audience.shopId}`);

async function loadMessages() {
  try {
    const { messages, notices = [] } = await api("GET", "/control/messages");
    $("#messages").replaceChildren(messages.length ? table({
      caption: "Messages to presses",
      rows: messages,
      columns: [
        { header: "Message", lead: true, render: (m) => el("div", {}, el("p", { className: "cr-title", textContent: m.words }), meta(`by ${m.by}`, `why: ${m.reason}`, m.notice ? `promised notice: ${NOTICE_WORDS[m.notice.kind] ?? m.notice.kind}, takes effect ${when(m.notice.takesEffect)}` : null, m.endedAt ? `ended by ${m.endedBy}: ${m.endReason}` : null)) },
        { header: "Who", render: (m) => el("span", { textContent: `${audienceWords(m.audience)} (${m.reaches} shop${m.reaches === 1 ? "" : "s"})` }) },
        { header: "When", render: (m) => el("span", { className: "rp-mono", textContent: `${when(m.startsAt)} to ${when(m.endedAt ?? m.endsAt)}` }) },
        { header: "State", render: (m) => el("div", { className: "cr-row" }, m.level === "important" ? pill("warning", "Important") : null, pill(...MESSAGE_STATE[m.state])) },
        { header: "", end: true, render: (m) => {
          if (m.state === "ended") return el("span");
          const end = button("End now", "ghost");
          end.addEventListener("click", async () => {
            const reason = askWhy("End this message now. It leaves every shop's admin.");
            if (!reason) return;
            end.disabled = true;
            try {
              await api("POST", "/control/messages/end", { id: m.id, reason });
              status.textContent = "The message has ended.";
              await loadMessages();
            } catch (failure) {
              status.textContent = failure.message;
              end.disabled = false;
            }
          });
          return end;
        } },
      ],
    }) : emptyState("No messages yet.", "A message you send shows at the top of the shop admins it reaches."));
    $("#notices").replaceChildren(notices.length ? table({
      caption: "Promised notices sent",
      rows: notices,
      columns: [
        { header: "Change", lead: true, render: (n) => el("div", {}, el("p", { className: "cr-title", textContent: NOTICE_WORDS[n.kind] ?? n.kind }), meta(n.words)) },
        { header: "Sent", render: (n) => el("span", { className: "rp-mono", textContent: when(n.sentAt) }) },
        { header: "Takes effect", render: (n) => el("span", { className: "rp-mono", textContent: when(n.takesEffect) }) },
        { header: "Notice", render: (n) => el("span", { textContent: `${n.daysNotice} days` }) },
        { header: "Owners emailed", end: true, render: (n) => el("span", { textContent: String(n.emailed) }) },
      ],
    }) : emptyState("No promised notices yet.", "Send one from the form above before a price rise, a new helper company or a change to the terms."));
  } catch (failure) {
    $("#messages").replaceChildren(emptyState("Couldn't load the messages.", failure.message));
  }
}

const NOTICE_WORDS = { "price-rise": "a price rise", "new-helper": "a new helper company", "terms-change": "a change to the terms" };
$("#message-words").addEventListener("input", (event) => {
  const left = 400 - event.target.value.length;
  $("#message-count").textContent = `${left} character${left === 1 ? "" : "s"} left.`;
});
$("#message-audience").addEventListener("change", (event) => {
  $("#message-shop-field").hidden = event.target.value !== "shop";
  $("#message-shop").required = event.target.value === "shop";
});
$("#message-notice").addEventListener("change", (event) => {
  const promised = event.target.value !== "";
  $("#message-effect-field").hidden = !promised;
  $("#message-effect").required = promised;
  if (promised) $("#message-level").value = "important";
});
$("#message-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const pick = form.audience.value;
  const audience = pick === "all" ? { all: true } : pick === "shop" ? { shopId: form.shopId.value.trim() } : { plan: pick.slice(5) };
  const important = form.level.value === "important" || form.notice.value !== "";
  if (important && !window.confirm(`Also email this once to the owner of each shop on ${audienceWords(audience)}?`)) return;
  const submit = form.querySelector("button[type=submit]");
  submit.disabled = true;
  try {
    const { shops, emailed, failed = [] } = await api("POST", "/control/messages/add", {
      words: form.words.value, level: form.level.value, audience, reason: form.reason.value,
      startsAt: form.startsAt.value ? new Date(form.startsAt.value).toISOString() : undefined,
      endsAt: form.endsAt.value ? new Date(form.endsAt.value).toISOString() : undefined,
      ...(form.notice.value ? { notice: form.notice.value, takesEffect: new Date(`${form.takesEffect.value}T12:00:00`).toISOString() } : {}),
    });
    status.textContent = `Sent to ${shops} shop admin${shops === 1 ? "" : "s"}${important ? `, and emailed to ${emailed} owner${emailed === 1 ? "" : "s"}` : ""}.`
      + (failed.length ? ` ${failed.length} shop${failed.length === 1 ? "" : "s"} didn't take it yet (${failed.join(", ")}); they're tried again within the hour.` : "");
    form.reset();
    $("#message-shop-field").hidden = true;
    $("#message-effect-field").hidden = true;
    $("#message-count").textContent = "400 characters left.";
    await loadMessages();
  } catch (failure) {
    status.textContent = failure.message;
  }
  submit.disabled = false;
});

// ── Costs (plan 19.15): this month's Google bill per shop against what it pays, most losing first. ──
async function loadCosts() {
  const target = $("#costs");
  try {
    const report = await api("GET", "/control/costs");
    if (report.empty) {
      target.replaceChildren(emptyState(report.empty, "Switching it on is a step in services/costs/README.md."));
      return;
    }
    const inPlans = (cents) => money(cents, report.currency);
    const shops = report.shops.length ? table({
      caption: `Costs per shop, ${report.month}`,
      rows: report.shops,
      open: (row) => { const shop = allShops.find((s) => s.shopId === row.shopId); if (shop) openShop(shop); },
      columns: [
        { header: "Shop", lead: true, render: (row) => el("div", {}, el("p", { className: "cr-title", textContent: row.pressName }), meta(row.shopId, row.testShop ? "test shop" : null, row.otherCurrencies ? `also ${Object.entries(row.otherCurrencies).map(([c, n]) => money(n, c)).join(", ")}` : null)) },
        { header: "Google this month", end: true, render: (row) => el("span", { className: "rp-mono", textContent: inPlans(row.googleCents) }) },
        { header: "Pays this month", end: true, render: (row) => el("span", { className: "rp-mono", textContent: `${inPlans(row.paidCents)}${row.feeCents ? ` (${inPlans(row.feeCents)} in sales fees)` : ""}` }) },
        { header: "Margin", end: true, render: (row) => el("span", { className: "rp-mono", textContent: row.marginCents === null ? "another currency" : inPlans(row.marginCents) }) },
        { header: "State", render: (row) => (row.losing ? pill("danger", "Losing") : row.losing === false ? pill("success", "Covered") : pill("neutral", "Can't compare")) },
      ],
    }) : emptyState("No shops yet.");
    const others = report.notShops.length ? table({
      caption: "Not a shop",
      rows: report.notShops,
      columns: [
        { header: "Project", lead: true, render: (row) => el("span", { className: "rp-mono", textContent: row.projectId ?? "no project (account charges)" }) },
        { header: "Google this month", end: true, render: (row) => el("span", { className: "rp-mono", textContent: money(row.googleCents, row.currency) }) },
      ],
    }) : null;
    target.replaceChildren(
      el("p", { className: "rp-hint", textContent: `${report.month}: ${report.losing} shop${report.losing === 1 ? "" : "s"} costing more than ${report.losing === 1 ? "it pays" : "they pay"}. Google's whole bill: ${Object.entries(report.totals).map(([c, n]) => money(n, c)).join(", ") || "nothing yet"}.` }),
      shops,
      ...(others ? [el("div", { className: "cr-head" }, el("h2", { textContent: "Not a shop" })), others] : []));
  } catch (failure) {
    target.replaceChildren(emptyState("Couldn't load the costs.", failure.message));
  }
}

// ── A press's data, on request (plan 19.16): every file of the shop and stockroom, a link emailed to the owner. ──
function exportButton(shop) {
  const b = button("Email the press its data", "secondary");
  b.addEventListener("click", async () => {
    const reason = askWhy(`Make a copy of everything in ${shop.pressName}'s shop and stockroom, and email the owner a link that works 7 days.`);
    if (!reason) return;
    b.disabled = true;
    try {
      const { emailedTo } = await api("POST", "/control/export", { shopId: shop.shopId, reason });
      status.textContent = `Logged. The link to ${shop.pressName}'s data is emailed to ${emailedTo}.`;
    } catch (failure) {
      status.textContent = failure.message;
    }
    b.disabled = false;
  });
  return b;
}

// ── Setting up (front door, plan 18.2-18.8): presses in setup mode or opening, before they are shops. Read only. ──
const SETUP_STATUS = { setup: ["info", "In setup"], opening: ["warning", "Opening"], open: ["success", "Open"], expired: ["neutral", "Removed"] };
const MOVING_WORDS = { yes: "bringing a shop over", fresh: "starting fresh" };
const LANGUAGE_CHOICE_WORDS = { fr: "emails in French", en: "emails in English" };
/** "riso-press" -> "Riso press"; "" -> "Not chosen yet". */
const lookWords = (id) => (id ? id.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase()) : "Not chosen yet");
const daysWords = (n) => (n === 0 ? "today" : n === 1 ? "yesterday" : `${n} days ago`);

function setupStatusCell(press) {
  const [tone, words] = SETUP_STATUS[press.status] ?? ["neutral", press.status];
  const shown = press.shopStatus === "live" ? pill("success", "Shop live") : pill(tone, words);
  const flag = press.flag === "stuck" ? pill("danger", "Stuck opening") : press.flag === "going-soon" ? pill("warning", `Removed ${dateOnly(press.removesOn)}`) : null;
  return el("div", { className: "cr-row" }, shown, flag);
}

async function loadSetup() {
  try {
    const { counts, looks, presses } = await api("GET", "/control/presses");
    setBadge("setting-up", counts.stuck);
    const figure = (label, value, foot, tone) => el("div", { className: "rp-card rp-metric" },
      el("div", { className: "rp-metric-label", textContent: label }),
      el("div", { className: "rp-metric-value", textContent: String(value), dataset: tone ? { tone } : {} }),
      foot ? el("div", { className: "rp-metric-foot", textContent: foot }) : null);
    $("#setup-numbers").replaceChildren(
      figure("In setup", counts.inSetup, `${counts.signedUpThisWeek} signed up this week`),
      figure("Ready to open", counts.readyToOpen, "name and country filled in"),
      figure("Opening", counts.opening, `${counts.opened} now live`, counts.stuck ? "danger" : null),
      figure("Bringing a shop over", counts.bringingShopOver, `${counts.withProductFile} with a product file kept`),
      figure("Removed soon", counts.goingSoon, "not visited in 45 days", counts.goingSoon ? "warn" : null),
    );
    const needs = [];
    if (counts.stuck) needs.push(["danger", `${counts.stuck} press${counts.stuck === 1 ? "" : "es"} pressed Open my shop over a day ago and the shop isn't live. Check Sign-ups › Shops being made.`, "#making"]);
    if (counts.goingSoon) needs.push(["warning", `${counts.goingSoon} press${counts.goingSoon === 1 ? " hasn't" : "es haven't"} been back to setup in 45 days; their setup is removed at 60.`, "#setup-presses"]);
    $("#setup-needs").replaceChildren(needs.length ? el("div", { className: "rp-alerts" }, ...needs.map(([tone, words, go]) => el("a", { className: "rp-alert", href: go, dataset: { tone } },
      el("span", { className: "rp-alert-glyph", ariaHidden: "true", textContent: tone === "danger" ? "✕" : "!" }),
      el("span", { className: "rp-alert-text" }, el("strong", { className: "rp-alert-title", textContent: words }))))) : el("span"));
    $("#setup-presses").replaceChildren(presses.length ? table({
      caption: "Every press setting up",
      rows: presses,
      open: (press) => {
        const shop = press.shopId && allShops.find((s) => s.shopId === press.shopId);
        if (shop) openShop(shop);
      },
      columns: [
        { header: "Press", lead: true, render: (p) => el("div", {}, el("p", { className: "cr-title", textContent: p.pressName || "No name yet" }), meta(p.ownerEmail, p.sells ? `sells ${p.sells.toLowerCase()}` : null, p.country || null)) },
        { header: "Plan", render: (p) => (p.plan ? PLAN_WORDS[p.plan] ?? p.plan : el("span", { className: "rp-hint", textContent: "not picked" })) },
        { header: "Looks", render: (p) => el("div", {}, el("span", { textContent: `Website: ${lookWords(p.look)}` }), meta(`Admin: ${lookWords(p.adminLook)}`)) },
        { header: "Moving in", render: (p) => el("div", {}, el("span", { textContent: MOVING_WORDS[p.moving] ?? "not answered" }),
          meta(p.import ? `product file: ${p.import.rows ?? "?"} rows` : null, LANGUAGE_CHOICE_WORDS[p.language] ?? null)) },
        { header: "Last visit", render: (p) => el("div", {}, el("span", { className: "rp-mono", textContent: p.idleDays == null ? "" : daysWords(p.idleDays) }), meta(p.createdAt ? `signed up ${dateOnly(p.createdAt)}` : null)) },
        { header: "Where", render: (p) => el("div", {}, setupStatusCell(p),
          meta(p.status === "setup" && p.guide ? `setup guide ${p.guide.done} of ${p.guide.total}${p.guide.next ? `, next: ${p.guide.next.toLowerCase()}` : ""}` : null,
            p.stillToDo.length ? `still to add: ${p.stillToDo.join(", ")}` : null, p.shopId ? `shop ${p.shopId}` : null, p.shopMessage || null,
            Object.keys(p.warned).length ? `emailed ${Object.keys(p.warned).sort((a, b) => b - a).map((d) => `${d} days`).join(" and ")} before removal` : null,
            p.expiredAt ? `cleared ${dateOnly(p.expiredAt)}` : null)) },
      ],
    }) : emptyState("No presses setting up.", "A press shows here as soon as it signs up at the front door."));
    const lookSheet = (title, rows) => sheet({
      title,
      metaParts: [`${rows.reduce((n, r) => n + r.count, 0)} presses`],
      body: [rows.length ? el("ul", { className: "cr-history" }, ...rows.map((r) => el("li", { textContent: `${lookWords(r.id)}: ${r.count}` }))) : emptyState("None yet.")],
    });
    $("#setup-looks").replaceChildren(lookSheet("Website looks", looks.website), lookSheet("Admin looks", looks.admin));
    // The looks live shops wear now (control-room/shopLooks.js), read from each shop: after the setup looks, not before.
    api("GET", "/control/live-looks").then(({ looks: worn, templates, shops, waiting, welcome, unread }) => {
      $("#setup-looks").append(sheet({
        title: "Looks live shops wear",
        metaParts: [plural(shops, "live shop"), welcome.picked || welcome.skipped ? `Choose your look: ${welcome.picked} picked, ${welcome.skipped} skipped` : null, waiting ? `${waiting} picked a look but haven't published it` : null, unread.length ? `${unread.length} couldn't be read` : null].filter(Boolean),
        body: [worn.length ? el("ul", { className: "cr-history" }, ...worn.map((r) => el("li", { textContent: `${r.id ? r.name : "Their own design"}: ${r.count}` }))) : emptyState("No live shops yet.")],
      }), sheet({
        title: "Templates live shops show",
        metaParts: [plural(shops, "live shop")],
        body: [templates.length ? el("ul", { className: "cr-history" }, ...templates.map((r) => el("li", { textContent: `${r.id ? lookWords(r.id) : "No full template"}: ${r.count}` }))) : emptyState("No live shops yet.")],
      }));
    }).catch((failure) => $("#setup-looks").append(el("p", { className: "rp-hint", textContent: failure.message })));
  } catch (failure) {
    $("#setup-presses").replaceChildren(emptyState(failure.message));
  }
}
$("#setup-refresh").addEventListener("click", loadSetup);

// ── Sign-in safety (plan 22.6-22.11): who on the shop's team has two-step on, and their backup codes left. ──
const SAFETY = {
  safe: ["success", "Two-step on"], low: ["warning", "Few codes left"], "no-codes": ["warning", "No backup codes"],
  off: ["danger", "Two-step off"], never: ["neutral", "Not signed in yet"],
};

function signInSafetySection(shop) {
  const slot = el("div", {}, el("p", { className: "rp-hint", textContent: "Reading the shop's sign-in…" }));
  api("POST", "/control/sign-in-safety", { shopId: shop.shopId }).then(({ people, summary, words }) => {
    if (!people.length) return slot.replaceChildren(el("p", { className: "rp-hint", textContent: words ?? "No one on the team yet." }));
    slot.replaceChildren(
      el("p", { className: "rp-hint", textContent: `Team: ${summary.roles.map((r) => `${r.count} ${r.name.toLowerCase()}${r.count === 1 || r.role === "staff" ? "" : "s"}`).join(", ")}.` }),
      el("p", { className: "rp-hint", textContent: `${summary.withTwoStep} of ${summary.signedIn} signed-in people have two-step on.${summary.ownerOff ? " The owner doesn't: if their Google account is taken, so is the shop." : ""}${summary.lowOnCodes ? ` ${summary.lowOnCodes} running low on backup codes.` : ""}` }),
      table({
        caption: "Sign-in safety",
        rows: people,
        columns: [
          { header: "Person", lead: true, render: (p) => el("div", {}, el("p", { className: "cr-title", textContent: p.email }), meta(p.roleName ?? p.role)) },
          { header: "Two-step", render: (p) => pill(...SAFETY[p.state]) },
          { header: "Backup codes", render: (p) => (p.codesLeft == null ? el("span", { className: "rp-hint", textContent: "—" })
            : el("div", {}, el("span", { className: "rp-mono", textContent: `${p.codesLeft} of 10 left` }), p.codesMadeAt ? meta(`made ${dateOnly(p.codesMadeAt)}`) : null)) },
        ],
      }));
  }).catch((failure) => slot.replaceChildren(el("p", { className: "rp-hint", textContent: failure.message })));
  return slot;
}

// ── What a press brought over from its old shop (control-room/broughtOver.js), in a live shop's record. ──
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const lastOn = (kind) => (kind.lastAt ? `last ${dateOnly(kind.lastAt)}` : null);

// Newsletters the press sent, its morning emails (orders digest, running low) and orders shipped in parts or added to.
const ISSUE_WORDS = { queued: "waiting to send", sending: "sending", sent: "sent", paused: "stopped part-way", cancelled: "cancelled", failed: "failed" };
function shopFeaturesSection(shop) {
  const slot = el("div", {}, el("p", { className: "rp-hint", textContent: "Reading the shop's records…" }));
  api("POST", "/control/shop-features", { shopId: shop.shopId }).then(({ features, words }) => {
    if (!features) return slot.replaceChildren(el("p", { className: "rp-hint", textContent: words }));
    const { newsletters: n, alerts: a, orders: o } = features;
    fill(slot,
      ...(n?.paused ?? []).map((p) => el("p", { className: "rp-hint", textContent: `Stopped part-way: "${p.subject}" after ${plural(p.sent, "person", "people")}. ${p.lastError ?? ""}` })),
      el("p", { className: "rp-hint", textContent: n
        ? `Newsletters: ${plural(n.sentIssues, "sent")} of ${n.issues}, reaching ${plural(n.people, "person", "people")} in all${n.lastSentAt ? `, the last on ${dateOnly(n.lastSentAt)}` : ""}.`
        : "Newsletters: none written yet." }),
      el("p", { className: "rp-hint", textContent: `Morning emails: orders needing them ${a.ordersDigest ? "on" : "off"}; running low ${a.lowStock ? "on" : "off"}${a.low || a.out ? ` (${a.low} running low, ${a.out} sold out right now)` : ""}.` }),
      el("p", { className: "rp-hint", textContent: `Last 90 days: ${plural(o.partShipped, "order")} shipped in parts (${plural(o.parts, "parcel")}${o.partRefunded ? `, ${o.partRefunded} refunded with the sent copies kept off the shelf` : ""}), ${plural(o.itemsAdded, "order")} of items added after payment (${o.paidAdded} paid${o.byCustomer ? `; ${o.byCustomer} added by customers from their order page, ${o.byCustomerPaid} paid` : ""}).` }),
      n?.latest.length ? table({
        caption: "Latest newsletters",
        rows: n.latest,
        columns: [
          { header: "Newsletter", lead: true, render: (i) => el("div", {}, el("p", { className: "cr-title", textContent: i.subject || "(no subject)" }), i.status === "paused" ? pill("warning", "needs a look") : null) },
          { header: "Where it stands", render: (i) => ISSUE_WORDS[i.status] ?? i.status },
          { header: "Sent to", render: (i) => el("span", { className: "rp-mono", textContent: String(i.sent) }) },
          { header: "Details", render: (i) => meta(i.failed ? `${i.failed} couldn't be sent` : null, i.skipped ? `${i.skipped} skipped` : null, i.finishedAt ? `finished ${dateOnly(i.finishedAt)}` : i.createdAt ? `written ${dateOnly(i.createdAt)}` : null) },
        ],
      }) : null);
  }).catch((failure) => slot.replaceChildren(el("p", { className: "rp-hint", textContent: failure.message })));
  return slot;
}

// The look a live website wears (control-room/shopLooks.js): what shoppers see, a different look waiting unpublished,
// and what the press picked in Choose your look.
function shopLookSection(shop) {
  const slot = el("div", {}, el("p", { className: "rp-hint", textContent: "Reading the shop's records…" }));
  api("POST", "/control/shop-look", { shopId: shop.shopId }).then(({ look, words }) => {
    if (!look) return slot.replaceChildren(el("p", { className: "rp-hint", textContent: words }));
    fill(slot,
      look.waiting ? el("p", { className: "rp-hint", textContent: `Picked ${lookWords(look.welcome.theme)} in Choose your look but hasn't published it, so shoppers still see the plain starting design. Studio › Publish puts it live.` }) : null,
      el("p", { className: "rp-hint", textContent: look.live
        ? `Shoppers see ${look.live.name}${look.template ? ` (the ${lookWords(look.template)} template)` : ""}${look.publishedAt ? `, published ${dateOnly(look.publishedAt)}` : ""}.`
        : look.publishedAt ? `Shoppers see the press's own design (not from a ready-made look), published ${dateOnly(look.publishedAt)}.` : "Nothing published from Studio yet." }),
      look.draft ? el("p", { className: "rp-hint", textContent: `Trying ${look.draft.name} in Studio, not published.` }) : null,
      look.welcome ? el("p", { className: "rp-hint", textContent: `Choose your look: ${look.welcome.skipped ? "skipped, so it took" : "picked"} ${lookWords(look.welcome.theme)}${look.welcome.at ? ` on ${dateOnly(look.welcome.at)}` : ""}${look.welcome.adminLook ? `; admin look ${lookWords(look.welcome.adminLook)}` : ""}.` }) : null);
  }).catch((failure) => slot.replaceChildren(el("p", { className: "rp-hint", textContent: failure.message })));
  return slot;
}

// The platform's own emails to this press (billing receipts, trial and payment notices…), newest first, with this
// month's receipts counted so "I never got my bill" can be answered at once.
function shopEmailsSection(shop) {
  const slot = el("div", {}, el("p", { className: "rp-hint", textContent: "Reading the email log…" }));
  api("POST", "/control/shop-emails", { shopId: shop.shopId }).then((found) => {
    if (!found.emails) return slot.replaceChildren(el("p", { className: "rp-hint", textContent: found.words }));
    const month = `This month: ${plural(found.receiptsThisMonth, "receipt")} sent${found.lastReceiptAt ? ` (last receipt ${dateOnly(found.lastReceiptAt)})` : ""}, ${plural(found.sentThisMonth, "email")} in all${found.failedThisMonth ? `, ${found.failedThisMonth} couldn't be sent` : ""}.`;
    if (!found.emails.length) return slot.replaceChildren(el("p", { className: "rp-hint", textContent: "The platform hasn't emailed this press yet." }));
    fill(slot,
      el("p", { className: "rp-hint", textContent: month }),
      table({
        caption: "Emails to the press",
        rows: found.emails,
        columns: [
          { header: "Email", lead: true, render: (m) => el("div", {}, el("p", { className: "cr-title", textContent: m.words }), m.error ? meta(m.error) : null) },
          { header: "When", render: (m) => (m.at ? when(m.at) : "?") },
          { header: "", end: true, render: (m) => (m.sent ? pill("success", "sent") : pill("danger", "not sent")) },
        ],
      }),
      found.more ? el("p", { className: "rp-hint", textContent: `${plural(found.more, "older email")} not shown. The timeline's Email filter lists them all.` }) : null);
  }).catch((failure) => slot.replaceChildren(el("p", { className: "rp-hint", textContent: failure.message })));
  return slot;
}

// Social channels (27.8): each network the press connected, whether it still works, and the posts that didn't go out.
function shopSocialSection(shop) {
  const slot = el("div", {}, el("p", { className: "rp-hint", textContent: "Reading the social channels…" }));
  api("POST", "/control/shop-social", { shopId: shop.shopId }).then((found) => {
    if (!found.networks) return slot.replaceChildren(el("p", { className: "rp-hint", textContent: found.words }));
    if (!found.networks.length) return slot.replaceChildren(el("p", { className: "rp-hint", textContent: "No social channels connected." }));
    const state = (n) => {
      if (!n.connected) return pill("neutral", n.disconnectedAt ? "disconnected" : "not connected");
      return n.problem === "lost" ? pill("warning", "stopped working") : pill("success", "connected");
    };
    fill(slot,
      table({
        caption: "Social channels",
        rows: found.networks,
        columns: [
          { header: "Network", lead: true, render: (n) => el("div", {}, el("p", { className: "cr-title", textContent: n.name }), n.accountName ? meta(n.accountName) : null) },
          { header: "Posts to", render: (n) => (n.connected ? plural(n.places, "place") : "—") },
          { header: "Catalog", render: (n) => (n.catalog?.sentAt ? `sent ${dateOnly(n.catalog.sentAt)}` : n.network === "tiktok" ? "—" : "not sent") },
          { header: "", end: true, render: (n) => el("div", {}, state(n), n.problem === "lost" && n.lostAt ? meta(`since ${dateOnly(n.lostAt)}`) : null) },
        ],
      }),
      found.failedCount ? el("h4", { className: "cr-section", textContent: `Posts that didn't go out (${found.failedCount} in 30 days)` }) : null,
      found.failedCount ? history(found.failed.map((f) => `${when(f.at)} · ${f.name ?? "?"} · ${f.detail ?? "no reason given"}`)) : null);
  }).catch((failure) => slot.replaceChildren(el("p", { className: "rp-hint", textContent: failure.message })));
  return slot;
}

// Payment links and the fair till (selling away from the website): how many sales each way, for how much, the last one.
function salesChannelsSection(shop) {
  const slot = el("div", {}, el("p", { className: "rp-hint", textContent: "Reading the shop's records…" }));
  api("POST", "/control/sales-channels", { shopId: shop.shopId }).then(({ channels, words }) => {
    if (!channels) return slot.replaceChildren(el("p", { className: "rp-hint", textContent: words }));
    const cad = (n) => money(Math.round(n * 100), "CAD");
    const { links, fair } = channels;
    const rows = [
      channels.hasShop && (links
        ? { what: "Payment links", warn: Boolean(links.unpaid), amount: plural(links.paid, "paid sale"), more: [`${cad(links.amount)} paid`, `${links.recent} in the last 30 days`, links.waiting ? `${links.waiting} waiting to be paid` : null, links.lastPaidAt ? `last paid ${dateOnly(links.lastPaidAt)}` : `last made ${dateOnly(links.lastMadeAt)}`] }
        : { what: "Payment links", amount: "none yet", more: ["no payment link made"] }),
      channels.hasStockroom && (fair
        ? { what: "Fair till", amount: plural(fair.sales, "sale"), more: [`${plural(fair.copies, "copy", "copies")}`, `${cad(fair.amount)}`, `${plural(fair.days, "selling day")}`, `${fair.recent} in the last 30 days`, fair.lastDay ? `last ${fair.lastDay}` : null] }
        : { what: "Fair till", amount: channels.stockroom === "read" ? "none yet" : "—", more: [channels.stockroom === "read" ? "nothing rung up at a fair" : "the stockroom isn't made yet"] }),
      fair?.helpers && { what: "Fair helpers", amount: plural(fair.helpers.sales, "sale"), more: [`rung up by ${plural(fair.helpers.people, "helper")}`, fair.helpers.lastAt ? `last ${dateOnly(fair.helpers.lastAt)}` : null] },
    ].filter(Boolean);
    const unpaid = links?.unpaid;
    fill(slot,
      unpaid ? el("p", { className: "rp-hint", textContent: `${plural(unpaid.count, "payment link")} (${cad(unpaid.amount)}) still unpaid ${unpaid.count === 1 ? `${unpaid.oldestDays} days after it was made` : `after 3 days or more, the oldest ${unpaid.oldestDays} days`}${unpaid.expired ? `, ${unpaid.expired} already closed` : ""}. ${unpaid.reminded ? `The shop has reminded the customer about ${unpaid.reminded}.` : "No reminder has gone to the customer yet (the shop sends one two days before a link closes)."} The press may think the customer paid.` }) : null,
      rows.length ? table({
      caption: "Payment links and fair till",
      rows,
      columns: [
        { header: "Way", lead: true, render: (r) => el("div", {}, el("p", { className: "cr-title", textContent: r.what }), r.warn ? pill("warning", "needs a look") : null) },
        { header: "How many", render: (r) => el("span", { className: "rp-mono", textContent: r.amount }) },
        { header: "Details", render: (r) => meta(...r.more) },
      ],
    }) : el("p", { className: "rp-hint", textContent: "This plan has neither payment links nor a fair till." }));
  }).catch((failure) => slot.replaceChildren(el("p", { className: "rp-hint", textContent: failure.message })));
  return slot;
}

function broughtOverSection(shop) {
  const slot = el("div", {}, el("p", { className: "rp-hint", textContent: "Reading the shop's records…" }));
  api("POST", "/control/brought-over", { shopId: shop.shopId }).then(({ brought, nothing, words }) => {
    if (!brought) return slot.replaceChildren(el("p", { className: "rp-hint", textContent: words }));
    if (nothing && !brought.move) return slot.replaceChildren(el("p", { className: "rp-hint", textContent: "Nothing brought over yet: no past orders, customers, gift cards, discount codes or old shop links." }));
    const cad = (n) => money(Math.round(n * 100), "CAD");
    const rows = [
      brought.orders && { what: "Past orders", amount: plural(brought.orders.count, "order"), more: [`${cad(brought.orders.amount)} in sales, history only`, plural(brought.orders.runs, "file"), brought.orders.removed ? `${brought.orders.removed} taken out again` : null, brought.orders.rerated ? `rate changed on ${plural(brought.orders.rerated, "order")}` : null, brought.orders.files?.length ? `from ${brought.orders.files.map((f) => `${f.file} (${f.orders})`).join(", ")}` : null, lastOn(brought.orders)] },
      brought.customers && { what: "Customers", amount: plural(brought.customers.count, "customer"), more: [brought.customers.newsletter ? `${brought.customers.newsletter} joined the newsletter` : null, lastOn(brought.customers)] },
      brought.giftCards && { what: "Gift cards", amount: plural(brought.giftCards.count, "card"), more: [`${cad(brought.giftCards.amount)} in balances`, lastOn(brought.giftCards)] },
      brought.codes && { what: "Discount codes", amount: plural(brought.codes.count, "code"), more: [`${brought.codes.active} switched on`] },
      brought.links && { what: "Old shop links", amount: plural(brought.links.count, "link"), more: ["now lead to the imported products", lastOn(brought.links)] },
      brought.photos && { what: "Photos", amount: `${brought.photos.copied} copied`, more: [brought.photos.waiting ? `${brought.photos.waiting} still on the old shop` : "all copied", brought.photos.unreadable ? `${brought.photos.unreadable} couldn't be read` : null], warn: brought.photos.waiting > 0 || brought.photos.unreadable > 0 },
    ].filter(Boolean);
    const move = brought.move;
    fill(slot,
      move ? el("p", { className: "rp-hint", textContent: `Their move so far: ${move.done} of ${move.of} parts done${move.done < move.of ? ` (still to do: ${move.steps.filter((s) => !s.done).map((s) => s.title.toLowerCase()).join(", ")})` : ""}.${move.putAway ? " They put the list away." : ""}` }) : null,
      brought.photos?.waiting ? el("p", { className: "rp-hint", textContent: "Some photos still live on the old shop. They are copied every hour; if the press closes the old shop first, those pictures are lost." }) : null,
      rows.length ? table({
        caption: "Brought over from the old shop",
        rows,
        columns: [
          { header: "What", lead: true, render: (r) => el("div", {}, el("p", { className: "cr-title", textContent: r.what }), r.warn ? pill("warning", "needs a look") : null) },
          { header: "How many", render: (r) => el("span", { className: "rp-mono", textContent: r.amount }) },
          { header: "Details", render: (r) => meta(...r.more) },
        ],
      }) : el("p", { className: "rp-hint", textContent: "Nothing brought over yet." }));
  }).catch((failure) => slot.replaceChildren(el("p", { className: "rp-hint", textContent: failure.message })));
  return slot;
}
