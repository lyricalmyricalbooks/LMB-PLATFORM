// The Plan & billing page (accounts/billing.html, served at /account/billing?shop=<id>, code plan 6.5): the shop's
// plan and price, the trial's days left or the next payment, the card on file, changing plan with what changes and
// the prorated amount, invoices with their PDFs, and cancelling or keeping the plan. Plain browser JavaScript with no
// framework, like the account page; the server (accounts/billingRoutes.js) checks everything again and lets only the
// shop's owner in.
import { API_BASE, FIREBASE_SDK, PLATFORM_FIREBASE } from "../signup/config.js";
import { deviceId } from "../signup/device.js";
import { billingWords, day, planChangeWords } from "./billingWords.js";

const { initializeApp } = await import(`${FIREBASE_SDK}/firebase-app.js`);
const { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup } = await import(`${FIREBASE_SDK}/firebase-auth.js`);

const auth = getAuth(initializeApp(PLATFORM_FIREBASE));
const $ = (selector) => document.querySelector(selector);
const status = $("#status");
const params = new URLSearchParams(location.search);
const shopId = params.get("shop") ?? "";
function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter(Boolean));
  return node;
}

function show(view) {
  for (const section of document.querySelectorAll("main > section")) section.hidden = section.id !== `view-${view}`;
  $(`#view-${view} h2`)?.focus?.();
}

function fail(message) {
  $("#error-words").textContent = message;
  show("error");
}

async function api(path, body = {}) {
  const token = auth.currentUser ? await auth.currentUser.getIdToken() : "";
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}`, "X-Device-Id": deviceId() } : {}) },
    body: JSON.stringify({ shopId, ...body }),
  });
  const answer = await response.json().catch(() => ({ ok: false, message: "We couldn't reach Colophon. Check your connection and try again." }));
  if (!response.ok || answer.ok === false) throw new Error(answer.message || "Something went wrong.");
  return answer;
}

// Back from Stripe's card page: the card is saved there; it can take a moment to show here.
if (params.get("card") === "added") {
  status.textContent = "Thanks, your card is saved. It can take a minute to show here.";
  params.delete("card");
  history.replaceState(null, "", `${location.pathname}?${params}`);
}

$("#google").addEventListener("click", async () => {
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (error) {
    if (error?.code !== "auth/popup-closed-by-user") status.textContent = "Google sign-in didn't finish. Try again, or use an email link from your shops page.";
  }
});
$("#retry").addEventListener("click", () => load());

let current = null;

async function load() {
  if (!shopId) return fail("This page needs a shop. Open it from your shops page.");
  show("loading");
  try {
    const { billing } = await api("/billing/status");
    current = billing;
    if (!billing) return show("none");
    render(billing);
    show("billing");
    loadPressName();
    loadInvoices();
    loadPaymentWay();
  } catch (failure) {
    fail(failure.message);
  }
}

// The shop's name over the page, from the shops page's list (the billing status doesn't carry it).
async function loadPressName() {
  try {
    const token = await auth.currentUser.getIdToken();
    const response = await fetch(`${API_BASE}/accounts/shops`, { headers: { Authorization: `Bearer ${token}`, "X-Device-Id": deviceId() } });
    const shop = (await response.json()).shops?.find((one) => one.shopId === shopId);
    if (shop) {
      $("#press").textContent = shop.pressName;
      document.title = `Plan & billing · ${shop.pressName} · Colophon`;
    }
  } catch {
    // The name is a nicety; the page works without it.
  }
}

/** The strip over the page: the price, the trial or the next bill, the card and where the plan stands. */
function renderLedger(billing, words) {
  const tax = billing.plusTax ? " + tax" : "";
  const cells = [["Plan", billing.price, `${billing.planName}, monthly${tax}`]];
  if (billing.access === "paused" || billing.access === "closed") cells.push(["Shop", words.state, billing.access === "paused" ? "nothing is deleted" : "your files are kept", "danger"]);
  else if (billing.status === "trialing") cells.push(["Free trial", `${billing.trialDaysLeft ?? 0} days`, `until ${day(billing.trialEnd)}`, "warning"]);
  else if (billing.cancelAtPeriodEnd) cells.push(["Open until", day(billing.currentPeriodEnd).replace(/ \d{4}$/, ""), "then the plan ends", "warning"]);
  else cells.push(["Status", words.state, billing.status === "past_due" ? "update your card" : "all paid up", billing.status === "past_due" ? "danger" : undefined]);
  cells.push(billing.nextPaymentAt ? ["Next bill", day(billing.nextPaymentAt).replace(/ \d{4}$/, ""), `${billing.price}${tax}`] : ["Next bill", "None", billing.hasCard ? "nothing due" : "until a card is added"]);
  cells.push(billing.card ? ["Card", `•••• ${billing.card.last4}`, `runs out ${String(billing.card.expMonth).padStart(2, "0")}/${billing.card.expYear}`] : billing.hasCard ? ["Card", "On file", ""] : ["Card", "None", billing.status === "trialing" ? `needed before ${day(billing.trialEnd).replace(/ \d{4}$/, "")}` : "add one to keep the shop open", billing.status === "trialing" ? undefined : "danger"]);
  $("#plan-ledger").replaceChildren(...cells.map(([label, value, foot, tone]) => {
    const cell = el("div", {}, el("span", { className: "cp-kicker", textContent: label }), el("b", { textContent: value }), el("em", { textContent: foot }));
    if (tone) cell.dataset.tone = tone;
    return cell;
  }));
  const trouble = billing.access === "paused" || billing.status === "past_due";
  $("#plan-alert").hidden = !trouble;
  if (trouble) {
    // The first sentence in bold: what happened. The rest: what to do.
    const [first, ...rest] = words.when.split(/(?<=\.) /);
    $("#plan-alert-words").replaceChildren(el("b", { textContent: first }), rest.length ? ` ${rest.join(" ")}` : "");
    $("#plan-alert-button").textContent = billing.hasCard ? "Change card" : "Add a card";
  }
}

const TONES = { "Free trial": "info", Active: "success", Paused: "danger", Closed: "neutral", Cancelled: "warning", "Payment problem": "danger" };

function render(billing) {
  const words = billingWords(billing, new Date());
  renderLedger(billing, words);
  $("#plan-state").dataset.tone = TONES[words.state] ?? "";
  $("#plan-state").textContent = words.state;
  $("#plan-price").textContent = billing.price;
  $("#plan-per").textContent = billing.plusTax ? "a month, plus tax" : "a month";
  $("#plan-name").textContent = `${billing.planName} plan`;
  $("#plan-when").textContent = words.when;
  $("#plan-closing").textContent = words.closing;
  $("#plan-closing").hidden = !words.closing;
  $("#plan-card").classList.toggle("warning", billing.access !== "open");
  $("#card-words").textContent = words.card;
  $("#card-button").textContent = billing.hasCard ? "Change card" : "Add a card";
  $("#cancel-title").textContent = billing.cancelAtPeriodEnd ? "Your plan is cancelled" : "Cancel plan";
  $("#cancel-words").textContent = words.cancel;
  const ended = billing.access === "closed";
  $("#cancel-button").hidden = billing.cancelAtPeriodEnd || ended;
  $("#keep-button").hidden = !billing.cancelAtPeriodEnd || ended;
  $("#change-form").hidden = ended;
  $("#plan-choices").replaceChildren(el("legend", { className: "rp-sr-only", textContent: "Choose a plan" }), ...billing.plans.map((plan) => {
    const input = el("input", { type: "radio", name: "plan", value: plan.plan, checked: plan.plan === billing.plan });
    return el("label", { className: "choice" }, input, el("strong", { textContent: plan.name }), el("strong", { textContent: `${plan.price}${billing.plusTax ? " + tax" : ""}` }));
  }));
  resetPreview();
}

function resetPreview() {
  $("#change-preview").hidden = true;
  $("#change-preview").replaceChildren();
  $("#change-confirm").hidden = true;
  $("#change-error").hidden = true;
}
$("#plan-choices").addEventListener("change", resetPreview);

const INVOICE_WORDS = { paid: ["Paid", "success"], open: ["Due", "warning"], uncollectible: ["Not paid", "danger"], void: ["Cancelled", "neutral"], draft: ["Coming up", "neutral"] };

async function loadInvoices() {
  const list = $("#invoices");
  try {
    const { invoices } = await api("/billing/invoices");
    const rows = invoices.map((invoice) => {
      const date = invoice.date ? new Date(invoice.date).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "";
      const pdf = invoice.pdfUrl ? el("a", { href: invoice.pdfUrl, textContent: "PDF", target: "_blank", rel: "noopener" }) : null;
      if (pdf) pdf.setAttribute("aria-label", `Invoice ${invoice.number || date} as a PDF`);
      const [word, tone] = INVOICE_WORDS[invoice.status] ?? [invoice.status, "neutral"];
      const pill = el("span", { className: "pill", textContent: word });
      pill.dataset.tone = tone;
      return el("tr", {}, el("td", { textContent: date }), el("td", { textContent: invoice.number || "" }), el("td", { className: "cp-amount", textContent: invoice.amount }), el("td", {}, pill), el("td", {}, pdf));
    });
    // The bill that's coming, so a new shop sees when its first one lands instead of an empty box.
    const coming = current?.nextPaymentAt ?? (current?.status === "trialing" && !current?.cancelAtPeriodEnd ? current.trialEnd : null);
    if (coming) {
      const pill = el("span", { className: "pill", textContent: current.hasCard ? "Coming up" : "Needs a card" });
      pill.dataset.tone = current.hasCard ? "neutral" : "warning";
      rows.unshift(el("tr", {}, el("td", { textContent: new Date(coming).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) }), el("td", { textContent: "Next bill" }), el("td", { className: "cp-amount", textContent: current.price }), el("td", {}, pill), el("td")));
    }
    if (!rows.length) {
      list.replaceChildren(el("p", { className: "empty", textContent: "No invoices yet. Your first one comes with your first payment." }));
      return;
    }
    const head = el("tr", {}, ...["Date", "Invoice", "Amount", "State", ""].map((word, i) => el("th", { scope: "col", textContent: word, className: i === 2 ? "cp-amount" : "" })));
    list.replaceChildren(el("div", { className: "cp-table-wrap" }, el("table", { className: "cp-table" }, el("caption", { className: "rp-sr-only", textContent: "Your invoices" }), el("thead", {}, head), el("tbody", {}, ...rows))),
      invoices.length ? null : el("p", { className: "hint", textContent: "Every invoice is emailed to you as well." }));
  } catch (failure) {
    list.replaceChildren(el("p", { className: "error", textContent: `We couldn't load your invoices: ${failure.message}` }));
  }
}

// How the shop pays (6.19): monthly, or a share of website sales up to the plan's price. Stays hidden when the door
// doesn't offer it or can't answer; the rest of the page doesn't depend on it.
function renderPaymentWay(view) {
  const section = $("#payment-way");
  const button = view.button ? el("button", { type: "button", textContent: view.button.label }) : null;
  if (button) button.addEventListener("click", () => act(button, async () => {
    const answer = await api("/billing/payment-way/switch", { to: view.button.to });
    status.textContent = answer.changed ? "Done. The lines above say when the change starts." : "Nothing to change.";
    renderPaymentWay(answer.view);
  }));
  section.replaceChildren(
    el("h3", { textContent: view.title }),
    ...view.lines.filter(Boolean).map((line) => el("p", { textContent: line })),
    view.note ? el("p", { className: "hint", textContent: view.note }) : null,
    button,
  );
  section.hidden = false;
}

async function loadPaymentWay() {
  try {
    const { view } = await api("/billing/payment-way");
    if (view) renderPaymentWay(view);
  } catch {
    $("#payment-way").hidden = true;
  }
}

async function act(button, run) {
  button.disabled = true;
  try {
    await run();
  } catch (failure) {
    status.textContent = failure.message;
  } finally {
    button.disabled = false;
  }
}

const addCard = (event) => act(event.currentTarget, async () => {
  const { url } = await api("/billing/card");
  location.assign(url);
});
$("#card-button").addEventListener("click", addCard);
$("#plan-alert-button").addEventListener("click", addCard);

$("#cancel-button").addEventListener("click", (event) => act(event.currentTarget, async () => {
  if (!window.confirm(billingWords(current, new Date()).cancelAsk)) return;
  await api("/billing/cancel");
  status.textContent = "Your plan is cancelled. Your shop stays open until the date below, and you can keep your plan until then.";
  await load();
}));

$("#keep-button").addEventListener("click", (event) => act(event.currentTarget, async () => {
  await api("/billing/keep");
  status.textContent = "Your plan carries on as before.";
  await load();
}));

const chosen = () => $("#change-form").querySelector("input[name=plan]:checked")?.value;

$("#change-form").addEventListener("submit", (event) => {
  event.preventDefault();
  act($("#change-look"), async () => {
    const plan = chosen();
    $("#change-error").hidden = true;
    if (!plan || plan === current.plan) {
      $("#change-error").textContent = "Choose a different plan first.";
      $("#change-error").hidden = false;
      return;
    }
    const { preview } = await api("/billing/change-plan", { plan, preview: true });
    $("#change-preview").replaceChildren(...planChangeWords(preview, current).map((line) => el("p", { textContent: line })));
    $("#change-preview").hidden = false;
    $("#change-confirm").hidden = false;
  });
});

$("#change-confirm").addEventListener("click", (event) => act(event.currentTarget, async () => {
  const plan = chosen();
  await api("/billing/change-plan", { plan });
  status.textContent = "Your plan is changed. We've emailed you the details.";
  await load();
}));

onAuthStateChanged(auth, (user) => (user ? load() : show("signin")));
