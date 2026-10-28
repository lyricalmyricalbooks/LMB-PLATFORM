// The control room page (control-room/index.html): every shop with its plan, version, health and switches, an
// "Act as this shop" button, a switch for each feature, and the support requests to answer. Plain browser JavaScript with no framework, like the
// sign-up page. The server (control-room/routes.js) checks that the person is a platform admin, and asks for a reason
// that goes in the shop's log.
import { API_BASE, FIREBASE_SDK, PLATFORM_FIREBASE } from "../signup/config.js";
import { deviceId } from "../signup/device.js";

const { initializeApp } = await import(`${FIREBASE_SDK}/firebase-app.js`);
const {
  getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, getMultiFactorResolver, multiFactor, TotpMultiFactorGenerator,
} = await import(`${FIREBASE_SDK}/firebase-auth.js`);

const auth = getAuth(initializeApp(PLATFORM_FIREBASE));
const $ = (selector) => document.querySelector(selector);
const status = $("#status");

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter(Boolean));
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

async function load() {
  status.textContent = "Loading…";
  // The backup person (plan 8.7) sees only the run book; a platform admin sees it below everything else.
  let role = null;
  try {
    role = (await loadEmergency()).role;
  } catch {
    // Neither an admin nor the backup person: the shops call below says so.
  }
  if (role === "backup") {
    status.textContent = "";
    $("#view-signin").hidden = true;
    $("#view-code").hidden = true;
    $("#view-setup").hidden = true;
    $("#view-shops").hidden = true;
    return;
  }
  try {
    await loadToday();
    await loadTestShop();
    const { shops } = await api("GET", "/control/shops");
    allShops = shops;
    showShops();
    status.textContent = "";
    $("#view-signin").hidden = true;
    $("#view-code").hidden = true;
    $("#view-setup").hidden = true;
    $("#view-shops").hidden = false;
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
function showShops() {
  const form = $("#shop-filters");
  const words = form.q.value.trim().toLowerCase();
  const shown = allShops.filter((shop) => (!words || [shop.pressName, shop.shopId, shop.ownerEmail].some((v) => String(v ?? "").toLowerCase().includes(words)))
    && (!form.health.value || shop.health.level === form.health.value)
    && (!form.plan.value || shop.plan === form.plan.value)
    && (!form.billing.value || shop.billingStatus === form.billing.value));
  const problems = allShops.filter((s) => s.health.level === "problem").length;
  $("#summary").textContent = `${allShops.length} shop${allShops.length === 1 ? "" : "s"} · ${problems} with a problem${shown.length !== allShops.length ? ` · showing ${shown.length}` : ""}`;
  $("#shops").replaceChildren(...(shown.length ? shown.map(card) : [el("p", { textContent: allShops.length ? "No shop matches." : "No shops yet." })]));
}
$("#shop-filters").addEventListener("input", showShops);
$("#shop-filters").addEventListener("submit", (event) => event.preventDefault());

// ── One shop's record (plan 9.3) and its per-order fee (plan 9.6). ──
const BILLING_WORDS = { trialing: "free trial", active: "paying", past_due: "payment failing, being retried", paused: "paused", unpaid: "paused, unpaid", incomplete: "waiting for a first payment", canceled: "ended", incomplete_expired: "ended" };
const percent = (basisPoints) => `${basisPoints / 100}%`;
const dateOnly = (at) => (at ? new Date(at).toLocaleDateString(undefined, { dateStyle: "medium" }) : "");

function feeForm(record) {
  const form = el("form", { className: "stack" },
    el("p", { className: "hint", textContent: `Fee on each order now: ${percent(record.fee.basisPoints)}, ${record.fee.refunded ? "given back with a refund" : "kept on a refund"}. The platform's normal fee: ${percent(record.fee.defaults.basisPoints)}.${record.fee.next ? ` Changing to ${percent(record.fee.next.basisPoints)} on ${dateOnly(record.fee.next.from)} (the press was emailed).` : ""}` }),
    el("label", { className: "field" }, "New fee on each order (%)", el("input", { type: "number", name: "percent", min: "0", max: "100", step: "0.01", required: true, value: String((record.fee.next ?? record.fee).basisPoints / 100), inputMode: "decimal" })),
    el("label", { className: "switch" }, el("input", { type: "checkbox", name: "refunded", checked: (record.fee.next ?? record.fee).refunded }), "Give the fee back when an order is refunded"),
    el("label", { className: "field" }, "Why? (goes in the shop's log)", el("input", { name: "reason", required: true, minLength: 10, maxLength: 500 })),
    el("p", { className: "hint", textContent: "The press is emailed now and the new fee starts in 30 days. Setting today's fee again cancels a change that hasn't started." }),
    el("div", { className: "row" }, el("button", { type: "submit", textContent: "Change the fee" })));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector("button");
    button.disabled = true;
    try {
      const done = await api("POST", "/control/fee", { shopId: record.shopId, basisPoints: Math.round(Number(form.percent.value) * 100), refunded: form.refunded.checked, reason: form.reason.value });
      status.textContent = !done.changed ? "That's already the fee, so nothing changed."
        : done.cancelled ? `${record.pressName}: the waiting fee change is cancelled.`
          : `${record.pressName}: emailed. The new fee starts on ${dateOnly(done.next.from)}.`;
      form.replaceWith(feeForm(await api("POST", "/control/shop", { shopId: record.shopId })));
    } catch (failure) {
      status.textContent = failure.message;
      button.disabled = false;
    }
  });
  return form;
}

function recordView(record) {
  const billing = record.billing;
  const line = (label, value) => (value ? el("li", {}, el("strong", { textContent: `${label}: ` }), value) : null);
  const connections = record.connections;
  return el("div", { className: "stack record" },
    el("ul", {},
      line("Owner", record.ownerEmail),
      line("Started", dateOnly(record.createdAt)),
      line("Address", record.siteUrl),
      line("Plan", billing ? `${billing.plan ?? record.plan} · ${BILLING_WORDS[billing.status] ?? billing.status}${billing.trialEnd ? ` · trial ends ${dateOnly(billing.trialEnd)}` : ""}${billing.currentPeriodEnd ? ` · next payment ${dateOnly(billing.currentPeriodEnd)}` : ""} · ${billing.hasCard ? "card on file" : "no card yet"}${billing.cancelAtPeriodEnd ? " · cancelling" : ""}` : record.plan),
      line("Payments", connections.payments ? `${connections.payments.provider ?? "?"}${connections.payments.connected ? ", connected" : ", not connected yet"}` : "not set up yet"),
      line("Web address", Array.isArray(connections.domains) && connections.domains.length ? connections.domains.map((d) => `${d.name} (${d.state})`).join(", ") : "the shop's own .web.app address"),
      line("Google", connections.google ? Object.entries(connections.google).filter(([k, v]) => v && !["steps", "connectedAt"].includes(k)).map(([k]) => k).join(", ") || "not connected" : "not connected"),
      line("Version", record.version ?? "none yet")),
    el("strong", { textContent: "Setup" }),
    record.setup.length ? el("ul", {}, ...record.setup.map((step) => el("li", { textContent: `${step.step}. ${step.name ?? ""} ${step.ok ? "done" : `stopped: ${step.error}`}` }))) : el("p", { className: "hint", textContent: "No setup steps yet." }),
    el("strong", { textContent: "Fee on each order" }),
    feeForm(record),
    el("strong", { textContent: "Control-room history" }),
    record.history.length ? el("ul", {}, ...record.history.map((e) => el("li", { textContent: `${when(e.at)} · ${e.by ?? "the platform"} ${ACTIVITY_WORDS[e.what] ?? e.what}${e.detail?.reason ? ` (${e.detail.reason})` : ""}` }))) : el("p", { className: "hint", textContent: "Nothing yet." }));
}

// ── Today (plan 9.2): the numbers, then what needs you, each linking to its place below. ──
const money = (cents, currency) => new Intl.NumberFormat(undefined, { style: "currency", currency, currencyDisplay: "narrowSymbol" }).format(cents / 100);

// Your test shop (plan 9.10): the platform's own shop, only for you. Its storefront is behind the pause page.
async function loadTestShop() {
  const { testShop: shop } = await api("GET", "/control/test-shop");
  const box = $("#test-shop");
  if (!shop) {
    box.replaceChildren(el("p", { className: "hint", textContent: "Your test shop isn't made yet. Until it is, run the demo on your computer to try everything." }));
    return;
  }
  const check = shop.lastCheck
    ? `Last release check: ${shop.lastCheck.ok ? "passed" : `failed${shop.lastCheck.failedCheck ? ` at check ${shop.lastCheck.failedCheck}` : ""}`}, ${new Date(shop.lastCheck.at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}.`
    : "No release check yet.";
  const link = (href, words) => (href ? el("a", { href, target: "_blank", rel: "noopener", textContent: words }) : null);
  const reset = el("button", { type: "button", textContent: "Reset the sample books", disabled: shop.status !== "live" });
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
  box.replaceChildren(
    el("div", { className: "row" }, el("strong", { textContent: shop.pressName }), el("span", { className: "pill", textContent: LEVEL[shop.health.level] })),
    el("p", { className: "hint", textContent: check }),
    el("div", { className: "row" }, link(shop.storefrontUrl, "Open the storefront"), link(shop.adminUrl, "Open its admin"), reset),
  );
}

async function loadToday() {
  const { counts, monthlyIncome, currency, needs } = await api("GET", "/control/today");
  const tile = (value, words) => el("div", { className: "tile" }, el("strong", { textContent: String(value) }), el("span", { textContent: words }));
  $("#today-numbers").replaceChildren(
    tile(money(monthlyIncome, currency), "monthly income"),
    tile(counts.live, "shops live"),
    tile(counts.trial, "on a free trial"),
    tile(counts.paying, "paying"),
    tile(counts.signupsThisWeek, "signed up this week"),
    tile(counts.failedPayments, "failed payments"),
    tile(counts.paused, "paused"),
    tile(counts.closed, "closed"),
  );
  $("#needs").replaceChildren(needs.length
    ? el("div", { className: "card watch needs" }, el("strong", { textContent: "Needs you" }),
      el("ul", {}, ...needs.map((need) => el("li", {}, el("a", { href: need.go, textContent: need.words })))))
    : el("p", { className: "hint", textContent: "Nothing needs you right now." }));
}

function card(shop) {
  // "View this shop" looks only (plan 9.8); "Make changes" asks a second time, because it can change the press's shop.
  const actAs = (mode) => async (event) => {
    const button = event.currentTarget;
    const what = mode === "edit"
      ? `Open ${shop.pressName}'s admin for 30 minutes WITH the power to change their shop.`
      : `Open ${shop.pressName}'s admin for 30 minutes, looking only.`;
    const reason = askWhy(what);
    if (!reason) return;
    if (mode === "edit" && !window.confirm(`Anything you change is changed in ${shop.pressName}'s real shop, and the press sees it in their log. Go on?`)) return;
    button.disabled = true;
    try {
      const { url } = await api("POST", "/control/act-as", { shopId: shop.shopId, reason, mode });
      window.open(url, "_blank", "noopener");
      status.textContent = `Logged. ${shop.pressName}'s admin opened in a new tab${mode === "edit" ? ", able to make changes" : ", looking only"}.`;
    } catch (failure) {
      status.textContent = failure.message;
    }
    button.disabled = false;
  };
  const act = el("button", { type: "button", textContent: "View this shop", disabled: shop.status !== "live" });
  act.addEventListener("click", actAs("view"));
  const change = el("button", { type: "button", textContent: "Make changes", disabled: shop.status !== "live" });
  change.addEventListener("click", actAs("edit"));

  // Self-checks now (2.11): what's off goes to the repair queue below.
  const check = el("button", { type: "button", textContent: "Check now", disabled: shop.status !== "live" });
  check.addEventListener("click", async () => {
    check.disabled = true;
    try {
      const { ok, results } = await api("POST", "/control/check", { shopId: shop.shopId });
      const fixed = results.filter((r) => r.fixed).length;
      const failing = results.filter((r) => !r.ok).length;
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
  const closing = el("button", { type: "button", textContent: shop.closed ? "Open this shop again" : "Close this shop" });
  closing.addEventListener("click", async () => {
    const reason = askWhy(shop.closed
      ? `Open ${shop.pressName}'s checkout and pages again.`
      : `Close ${shop.pressName}'s checkout and pages for abuse. Shoppers see the shop's pause page until you open it again.`);
    if (!reason) return;
    closing.disabled = true;
    try {
      await api("POST", shop.closed ? "/control/reopen" : "/control/close", { shopId: shop.shopId, reason });
      await load();
      status.textContent = `${shop.pressName} is ${shop.closed ? "open again" : "closed"}. It's in the shop's log.`;
    } catch (failure) {
      status.textContent = failure.message;
      closing.disabled = false;
    }
  });

  const moveCards = paymentsMenu(shop.paymentsMoved?.to ?? "platform", { shopId: shop.shopId }, shop.pressName);

  const switches = shop.switches
    ? el("div", { className: "row" }, ...Object.entries(shop.switches).map(([name, on]) => {
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
      return el("label", { className: "switch" }, box, SWITCH_WORDS[name] ?? name);
    }))
    : null;

  const open = el("button", { type: "button", textContent: "Open record", "aria-expanded": "false" });
  const recordSlot = el("div");
  open.addEventListener("click", async () => {
    if (open.getAttribute("aria-expanded") === "true") {
      recordSlot.replaceChildren();
      open.setAttribute("aria-expanded", "false");
      open.textContent = "Open record";
      return;
    }
    open.disabled = true;
    try {
      recordSlot.replaceChildren(recordView(await api("POST", "/control/shop", { shopId: shop.shopId })));
      open.setAttribute("aria-expanded", "true");
      open.textContent = "Close record";
    } catch (failure) {
      status.textContent = failure.message;
    }
    open.disabled = false;
  });
  return el("div", { className: `card ${shop.health.level}` },
    el("div", { className: "row" }, el("strong", { textContent: shop.pressName }), el("span", { className: "pill", textContent: LEVEL[shop.health.level] }), open, act, change, check, closing),
    el("div", { className: "facts" },
      el("span", { textContent: shop.shopId }),
      el("span", { textContent: `plan: ${shop.plan ?? "?"}` }),
      el("span", { textContent: `version: ${shop.version ?? "none yet"}` }),
      el("span", { textContent: `status: ${shop.status ?? "?"}` }),
      shop.access ? el("span", { textContent: `billing: ${shop.access}` }) : null,
      shop.testShop ? el("span", { textContent: "test shop" }) : null,
      shop.closed ? el("span", { textContent: `closed by ${shop.closed.by}` }) : null,
      shop.paymentsMoved ? el("span", { textContent: `cards: ${PAYMENT_WORDS[shop.paymentsMoved.to]}` }) : null),
    shop.health.reasons.length ? el("ul", {}, ...shop.health.reasons.map((reason) => el("li", { textContent: reason }))) : null,
    switches,
    shop.status === "live" ? moveCards : null,
    recordSlot);
}

// ── The emergency payments switch (plan 8.5): if the platform's Stripe is paused, move a shop, or every shop. ──
const PAYMENT_WORDS = { platform: "through the platform (normal)", own: "the press's own Stripe keys", square: "Square" };

function paymentsMenu(current, target, name) {
  const choice = el("select", {}, ...Object.entries(PAYMENT_WORDS).map(([value, words]) => el("option", { value, textContent: words, selected: value === current })));
  choice.setAttribute("aria-label", `Card payments for ${name}`);
  const move = el("button", { type: "button", textContent: "Move card payments" });
  move.addEventListener("click", async () => {
    const to = choice.value;
    const reason = askWhy(`Move card payments for ${name} to ${PAYMENT_WORDS[to]}. The press is emailed at once, and the shop's server and pages are deployed again.`);
    if (!reason) return;
    move.disabled = true;
    try {
      const { shops } = await api("POST", "/control/payments", { ...target, to, reason });
      await load();
      const failed = shops.filter((s) => s.error);
      const moved = shops.filter((s) => !s.error && !s.skipped).length;
      status.textContent = `${moved} shop${moved === 1 ? "" : "s"} on ${PAYMENT_WORDS[to]}.${failed.length ? ` Not moved: ${failed.map((s) => `${s.shopId} (${s.error})`).join("; ")}` : ""}`;
    } catch (failure) {
      status.textContent = failure.message;
    }
    move.disabled = false;
  });
  return el("div", { className: "row" }, el("label", { className: "switch" }, "Card payments", choice), move);
}

$("#all-payments").append(paymentsMenu("platform", { all: true }, "every live shop"));

// ── The repair queue (control-room/repairs.js): mark an item fixed once a person has dealt with it. ──
let repairStatus = "open";
for (const button of document.querySelectorAll(".repair-filters button")) {
  button.addEventListener("click", () => {
    repairStatus = button.dataset.status;
    for (const other of document.querySelectorAll(".repair-filters button")) other.setAttribute("aria-pressed", String(other === button));
    loadRepairs();
  });
}

async function loadRepairs() {
  try {
    const { repairs } = await api("POST", "/control/repairs", { status: repairStatus });
    const empty = repairStatus === "open" ? "Nothing to fix." : "Nothing fixed yet.";
    $("#repairs").replaceChildren(...(repairs.length ? repairs.map(repairCard) : [el("p", { textContent: empty })]));
  } catch (failure) {
    status.textContent = failure.message;
  }
}

function repairCard(item) {
  const when = (at) => new Date(at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  const done = el("button", { type: "button", className: "primary", textContent: "Mark fixed", hidden: item.status !== "open" });
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
  const resume = el("button", { type: "button", textContent: "Turn the newsletter back on", hidden: item.status !== "open" || item.check !== "newsletter-reputation" });
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
  return el("div", { className: `card ${item.status === "open" ? "problem" : "ok"}` },
    el("div", { className: "row" }, el("strong", { textContent: item.problem }), el("span", { className: "pill", textContent: item.check }), resume, done),
    el("div", { className: "facts" },
      el("span", { textContent: item.shopId }),
      el("span", { textContent: `seen ${item.count} time${item.count === 1 ? "" : "s"}, last ${when(item.lastSeenAt)}` }),
      item.fixedAt ? el("span", { textContent: `fixed ${when(item.fixedAt)} by ${item.fixedBy}` }) : null),
    item.detail ? el("p", { className: "hint", textContent: item.detail }) : null,
    item.note ? el("p", { className: "hint", textContent: `Note: ${item.note}` }) : null);
}

// ── Support requests (services/support): answer, and the press gets it by email; close when done. ──
let ticketStatus = "open";
for (const button of document.querySelectorAll("#ticket-filters button")) {
  button.addEventListener("click", () => {
    ticketStatus = button.dataset.status;
    for (const other of document.querySelectorAll("#ticket-filters button")) other.setAttribute("aria-pressed", String(other === button));
    loadTickets();
  });
}

async function loadTickets() {
  try {
    const { tickets } = await api("POST", "/control/support", { status: ticketStatus });
    $("#tickets").replaceChildren(...(tickets.length ? tickets.map(ticketCard) : [el("p", { textContent: "Nothing here." })]));
  } catch (failure) {
    status.textContent = failure.message;
  }
}

function ticketCard(ticket) {
  const when = (at) => new Date(at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  const answer = el("textarea", { maxLength: 5000 });
  answer.setAttribute("aria-label", `Answer to ${ticket.email}`);
  const send = el("button", { type: "button", className: "primary", textContent: "Send the answer" });
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
  const close = el("button", { type: "button", textContent: "Close", disabled: ticket.status === "closed" });
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
  return el("div", { className: "card" },
    el("div", { className: "row" }, el("strong", { textContent: ticket.subject }), el("span", { className: "pill", textContent: ticket.status })),
    el("div", { className: "facts" },
      el("span", { textContent: ticket.id }), el("span", { textContent: ticket.email }),
      ticket.pressName ? el("span", { textContent: `${ticket.pressName} (${ticket.shopId})` }) : null,
      el("span", { textContent: `opened ${when(ticket.openedAt)}` })),
    ...ticket.messages.map((m) => el("div", { className: `message from-${m.from}` },
      el("div", { className: "facts", textContent: `${m.from === "press" ? ticket.email : m.by} · ${when(m.at)}` }),
      el("div", { textContent: m.body }))),
    answer, el("div", { className: "row" }, send, close));
}

// ── Account recovery (accounts/recovery.js): check, approve or deny; after the wait, move it by hand and record it. ──
let recoveryStatus = "waiting";
for (const button of document.querySelectorAll("#recovery-filters button")) {
  button.addEventListener("click", () => {
    recoveryStatus = button.dataset.status;
    for (const other of document.querySelectorAll("#recovery-filters button")) other.setAttribute("aria-pressed", String(other === button));
    loadRecoveries();
  });
}

async function loadRecoveries() {
  try {
    const { requests } = await api("POST", "/control/recovery", { status: recoveryStatus });
    $("#recoveries").replaceChildren(...(requests.length ? requests.map(recoveryCard) : [el("p", { textContent: "Nothing here." })]));
  } catch (failure) {
    status.textContent = failure.message;
  }
}

function recoveryCard(request) {
  const when = (at) => new Date(at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  const decide = async (button, path, body, done) => {
    button.disabled = true;
    try {
      await api("POST", path, { id: request.id, ...body });
      status.textContent = done;
      await loadRecoveries();
    } catch (failure) {
      status.textContent = failure.message;
      button.disabled = false;
    }
  };
  const words = el("textarea", { maxLength: 2000 });
  words.setAttribute("aria-label", `Note or reason for request ${request.id}`);
  const actions = el("div", { className: "row" });
  if (request.status === "waiting") {
    const approve = el("button", { type: "button", className: "primary", textContent: "Approve (note how you checked)" });
    approve.addEventListener("click", () => decide(approve, "/control/recovery/approve", { note: words.value }, `Approved. Both addresses are told; it can be moved after three days.`));
    actions.append(approve);
  }
  if (request.status === "waiting" || request.status === "approved") {
    const deny = el("button", { type: "button", textContent: "Deny (the reason is emailed)" });
    deny.addEventListener("click", () => decide(deny, "/control/recovery/deny", { reason: words.value }, `Denied, and ${request.requesterEmail} is told why.`));
    actions.append(deny);
  }
  let byHand = null;
  if (request.status === "approved") {
    byHand = el("input", { type: "checkbox" });
    const apply = el("button", { type: "button", className: "primary", textContent: "Record as moved", disabled: Date.now() < Date.parse(request.holdUntil) });
    apply.addEventListener("click", () => decide(apply, "/control/recovery/apply", { doneByHand: byHand.checked }, `Recorded. Both addresses are told the account has moved.`));
    actions.append(el("label", { className: "switch" }, byHand, "I've moved it by hand"), apply);
  }
  return el("div", { className: "card" },
    el("div", { className: "row" }, el("strong", { textContent: `${request.oldEmail} → ${request.requesterEmail}` }), el("span", { className: "pill", textContent: request.status })),
    el("div", { className: "facts" },
      el("span", { textContent: request.id }),
      el("span", { textContent: request.accountId ? "the old address has an account" : "no account uses the old address" }),
      el("span", { textContent: `shops: ${(request.shops ?? []).join(", ") || "none"}` }),
      el("span", { textContent: `asked ${when(request.askedAt)}` }),
      request.holdUntil ? el("span", { textContent: `can move after ${when(request.holdUntil)}` }) : null),
    el("div", { className: "message", textContent: request.details }),
    ...(request.history ?? []).map((h) => el("div", { className: "facts", textContent: `${when(h.at)} · ${h.what}${h.by ? ` · ${h.by}` : ""}${h.note ? ` · ${h.note}` : ""}${h.reason ? ` · ${h.reason}` : ""}` })),
    actions.childElementCount ? words : null,
    actions.childElementCount ? actions : null);
}

// ── The breach register (control-room/breaches.js, plan 8.6): written down, marked reported or told, never deleted. ──
async function loadBreaches() {
  try {
    const { breaches, privacyContact } = await api("POST", "/control/breaches");
    $("#privacy-contact").textContent = privacyContact ? `Privacy contact: ${privacyContact}.` : "";
    $("#breaches").replaceChildren(...(breaches.length ? breaches.map(breachCard) : [el("p", { textContent: "Nothing in the register." })]));
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
  const when = (at) => new Date(at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  const mark = (label, field) => {
    const button = el("button", { type: "button", textContent: label });
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await api("POST", "/control/breaches/update", { id: entry.id, [field]: true });
        await loadBreaches();
      } catch (failure) {
        status.textContent = failure.message;
        button.disabled = false;
      }
    });
    return button;
  };
  const actions = el("div", { className: "row" },
    entry.reportedToCommissioner ? null : mark("Mark reported to the Commissioner", "reportedToCommissioner"),
    entry.peopleTold ? null : mark("Mark people told", "peopleTold"));
  return el("div", { className: `card ${entry.reportedToCommissioner && entry.peopleTold ? "ok" : "watch"}` },
    el("div", { className: "row" }, el("strong", { textContent: `Found ${entry.foundOn}` }), el("span", { className: "pill", textContent: entry.id })),
    el("div", { className: "message", textContent: entry.what }),
    el("div", { className: "facts" },
      el("span", { textContent: `people: ${entry.people}` }),
      el("span", { textContent: `shops: ${entry.shops.join(", ") || "none"}` }),
      el("span", { textContent: entry.reportedToCommissioner ? `reported ${when(entry.reportedAt)}` : "not reported to the Commissioner" }),
      el("span", { textContent: entry.peopleTold ? `people told ${when(entry.toldAt)}` : "people not told" }),
      el("span", { textContent: `kept until at least ${entry.keepUntil}` })),
    ...entry.history.map((h) => el("div", { className: "facts", textContent: `${when(h.at)} · ${h.what} · ${h.by}${h.note ? ` · ${h.note}` : ""}` })),
    actions.childElementCount ? actions : null);
}

// ── The run book (control-room/backupPerson.js, plan 8.7): pause releases, roll back a shop, a status note. ──
async function loadEmergency() {
  const state = await api("GET", "/control/emergency");
  const run = (label, path, body, done) => {
    const button = el("button", { type: "button", textContent: label });
    button.addEventListener("click", async () => {
      const extra = body();
      if (!extra) return;
      button.disabled = true;
      try {
        await api("POST", path, extra);
        status.textContent = done;
        await loadEmergency();
      } catch (failure) {
        status.textContent = failure.message;
        button.disabled = false;
      }
    });
    return button;
  };
  const reason = (what) => {
    const why = (window.prompt(`${what}\n\nWhy? Julian is told (at least 10 characters).`) ?? "").trim();
    return why ? { reason: why } : null;
  };
  const sealed = state.role === "backup" && !state.seal;
  const parts = [];
  if (state.role === "backup") {
    parts.push(el("p", { className: "hint", textContent: state.seal ? `Open until ${new Date(state.seal.until).toLocaleString()}. Every use is emailed to Julian.` : "Shut. Open it only in an emergency." }));
    if (sealed) parts.push(el("div", { className: "row" }, run("Open the emergency access", "/control/emergency/open", () => reason("Open the emergency access for 12 hours."), "Open. Julian has been emailed.")));
  }
  if (!sealed) {
    parts.push(el("div", { className: "row" },
      el("strong", { textContent: state.releasesPaused ? `Releases paused by ${state.releasesPaused.by}: ${state.releasesPaused.reason}` : "Releases are running normally." }),
      state.releasesPaused
        ? run("Resume releases", "/control/emergency/resume-releases", () => reason("Let releases go out again."), "Releases can go out again.")
        : run("Pause releases", "/control/emergency/pause-releases", () => reason("Stop every release; one already running stops before its next shop."), "Releases are paused.")));
    const shopId = el("input", { placeholder: "shop id" });
    shopId.setAttribute("aria-label", "Shop to roll back");
    const version = el("input", { placeholder: "release, like 1.4.0" });
    version.setAttribute("aria-label", "Release to go back to");
    parts.push(el("div", { className: "row" }, shopId, version,
      run("Roll this shop back", "/control/emergency/roll-back", () => {
        const why = reason(`Put ${shopId.value} back on release ${version.value}.`);
        return why ? { ...why, shopId: shopId.value.trim(), version: version.value.trim() } : null;
      }, "Rolled back. It's in the shop's history.")));
    const note = el("textarea", { maxLength: 500, value: state.statusNote?.text ?? "" });
    note.setAttribute("aria-label", "Note on the status page");
    parts.push(note, el("div", { className: "row" },
      run("Post on the status page", "/control/emergency/status-note", () => ({ text: note.value }), "The status page shows the note."),
      run("Take the note down", "/control/emergency/status-note", () => ({ text: "" }), "The note is down.")));
  }
  $("#emergency").replaceChildren(...parts);
  $("#view-emergency").hidden = false;
  return state;
}


// ── Sign-ups and the waitlist (plan 9.5): invite someone and they skip the daily line; Try again for a stuck shop. ──
const when = (at) => (at ? new Date(at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "");

async function invite(address, button) {
  if (button) button.disabled = true;
  try {
    const { email, sent } = await api("POST", "/control/invite", { email: address });
    await loadWaitlist();
    status.textContent = sent ? `Invite sent to ${email}.` : `${email} was already invited. Nothing new was sent.`;
  } catch (failure) {
    status.textContent = failure.message;
    if (button) button.disabled = false;
  }
}

async function loadWaitlist() {
  try {
    const { waiting, people, inTheMaking } = await api("GET", "/control/waitlist");
    $("#waitlist-summary").textContent = `${waiting} waiting on the list · ${inTheMaking.length} shop${inTheMaking.length === 1 ? "" : "s"} being made`;
    $("#making").replaceChildren(...inTheMaking.map((shop) => {
      const retry = el("button", { type: "button", textContent: "Try again", hidden: ["queued", "making"].includes(shop.status) });
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
      return el("div", { className: `card ${shop.canRetry || shop.status === "failed" ? "problem" : "watch"}` },
        el("div", { className: "row" }, el("strong", { textContent: shop.pressName }), el("span", { className: "pill", textContent: shop.status }), retry),
        el("div", { className: "facts" }, el("span", { textContent: shop.shopId }), el("span", { textContent: shop.ownerEmail ?? "" }), el("span", { textContent: `started ${when(shop.createdAt)}` })),
        shop.message ? el("p", { className: "hint", textContent: shop.message }) : null);
    }));
    $("#waitlist").replaceChildren(...(people.length ? people.map((person) => {
      const button = el("button", { type: "button", textContent: person.invited ? "Invited" : "Invite", disabled: person.invited });
      button.addEventListener("click", () => invite(person.email, button));
      return el("div", { className: "card" },
        el("div", { className: "row" }, el("strong", { textContent: person.press || person.name || person.email }), button),
        el("div", { className: "facts" }, el("span", { textContent: person.email }), el("span", { textContent: `wants: ${person.plan}` }), el("span", { textContent: `joined ${when(person.joinedAt)}` })));
    }) : [el("p", { textContent: "Nobody is on the waitlist yet." })]));
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
      const note = changed ? el("span", { className: "hint", textContent: ` (normally ${field.kind === "yesNo" ? (defaults[field.path] ? "on" : "off") : toShown(field, defaults[field.path])})` }) : null;
      if (field.kind === "yesNo") {
        return el("label", { className: "switch" }, el("input", { type: "checkbox", name: field.path, checked: values[field.path] }), field.label, note);
      }
      const unit = field.kind === "cents" ? " ($)" : field.kind === "basisPoints" ? " (%)" : "";
      const step = field.kind === "whole" ? "1" : "0.01";
      return el("label", { className: "field" }, `${field.label}${unit}`, note,
        el("input", { type: "number", name: field.path, value: toShown(field, values[field.path]), step, min: toShown(field, field.min), max: toShown(field, field.max), required: true, inputMode: "decimal" }));
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
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    const { changed } = await api("POST", "/control/settings", { values, reason: form.reason.value });
    form.reason.value = "";
    await loadSettings();
    await loadActivity();
    status.textContent = changed.length ? `Saved: ${changed.map((c) => settingsFields.find((f) => f.path === c.path)?.label ?? c.path).join("; ")}.` : "Nothing had changed, so nothing was saved.";
  } catch (failure) {
    status.textContent = failure.message;
  }
  button.disabled = false;
});

// ── Activity log (plan 9.9): read only. ──
const ACTIVITY_WORDS = {
  "settings-changed": "changed the platform settings", "waitlist-invite": "invited someone from the waitlist", "switch-set": "set a switch",
  "act-as": "opened the shop's admin as support", "test-shop-reset": "reset the test shop's sample books", "shop-closed": "closed the shop", "shop-reopened": "opened the shop again",
  "newsletter-resumed": "turned the newsletter back on", "fee-change-scheduled": "changed the fee on each order (starts in 30 days)",
  "fee-change-cancelled": "cancelled a waiting fee change", "new-shop-switch": "changed what new shops start with", "signup-retry": "tried making the shop again",
};

async function loadActivity() {
  try {
    const shopId = $("#activity-form").shopId.value.trim();
    const { entries } = await api("POST", "/control/activity", shopId ? { shopId } : {});
    $("#activity").replaceChildren(...(entries.length ? entries.map((entry) => el("div", { className: "card" },
      el("div", { className: "row" }, el("strong", { textContent: `${entry.by ?? "the platform"} ${ACTIVITY_WORDS[entry.what] ?? entry.what}` }), entry.shopId ? el("span", { className: "pill", textContent: entry.shopId }) : null),
      el("div", { className: "facts" }, el("span", { textContent: when(entry.at) }),
        entry.detail?.reason ? el("span", { textContent: `why: ${entry.detail.reason}` }) : null,
        ...(entry.detail?.changes ?? []).map((c) => el("span", { textContent: `${c.path}: ${c.from} → ${c.to}` })),
        entry.detail?.email ? el("span", { textContent: entry.detail.email }) : null)))
      : [el("p", { textContent: "Nothing yet." })]));
  } catch (failure) {
    status.textContent = failure.message;
  }
}

$("#activity-form").addEventListener("submit", (event) => {
  event.preventDefault();
  loadActivity();
});

// ── Signing in (plan 9.1): Google, then a code from the authenticator app. The server refuses a sign-in without it. ──
const showOnly = (id) => {
  for (const view of ["#view-signin", "#view-code", "#view-setup", "#view-shops", "#view-emergency"]) $(view).hidden = view !== id;
};
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
    $("#every-switch").replaceChildren(...Object.entries(switches).map(([name, startsOn]) => {
      const words = SWITCH_WORDS[name] ?? name;
      const button = (on) => {
        const b = el("button", { type: "button", textContent: on ? "On for every shop" : "Off for every shop" });
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
      return el("div", { className: "card" }, el("div", { className: "row" }, el("strong", { textContent: words }), button(true), button(false)),
        el("label", { className: "switch" }, box, "New shops start with it on"));
    }));
  } catch (failure) {
    status.textContent = failure.message;
  }
}
