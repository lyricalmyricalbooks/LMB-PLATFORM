// The Plan & billing page (accounts/billing.html, served at /account/billing?shop=<id>, code plan 6.5): the shop's
// plan and price, the trial's days left or the next payment, the card on file, changing plan with what changes and
// the prorated amount, invoices with their PDFs, and cancelling or keeping the plan. Plain browser JavaScript with no
// framework, like the account page; the server (accounts/billingRoutes.js) checks everything again and lets only the
// shop's owner in.
import { API_BASE, FIREBASE_SDK, PLATFORM_FIREBASE } from "../signup/config.js";
import { deviceId } from "../signup/device.js";
import { billingWords, planChangeWords } from "./billingWords.js";

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
    loadInvoices();
    loadPaymentWay();
  } catch (failure) {
    fail(failure.message);
  }
}

function render(billing) {
  const words = billingWords(billing, new Date());
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
  $("#plan-choices").replaceChildren(el("legend", { textContent: "Choose a plan" }), ...billing.plans.map((plan) => {
    const input = el("input", { type: "radio", name: "plan", value: plan.plan, checked: plan.plan === billing.plan });
    return el("label", { className: "choice" }, input, el("span", { textContent: plan.name }), el("strong", { textContent: `${plan.price}${billing.plusTax ? " + tax" : ""}` }));
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

async function loadInvoices() {
  const list = $("#invoices");
  try {
    const { invoices } = await api("/billing/invoices");
    if (!invoices.length) {
      list.replaceChildren(el("p", { className: "empty", textContent: "No invoices yet. Your first one comes with your first payment." }));
      return;
    }
    list.replaceChildren(el("ul", { className: "list" }, ...invoices.map((invoice) => {
      const date = invoice.date ? new Date(invoice.date).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) : "";
      const pdf = invoice.pdfUrl ? el("a", { href: invoice.pdfUrl, textContent: "PDF", target: "_blank", rel: "noopener" }) : null;
      if (pdf) pdf.setAttribute("aria-label", `Invoice ${invoice.number || date} as a PDF`);
      return el("li", { className: "row" },
        el("span", { textContent: `${date}${invoice.number ? ` · ${invoice.number}` : ""}` }),
        el("strong", { textContent: invoice.amount }),
        el("span", { className: "pill", textContent: invoice.status === "paid" ? "Paid" : invoice.status === "open" ? "Due" : invoice.status }),
        pdf);
    })));
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
    el("h2", { textContent: view.title }),
    ...view.lines.map((line) => el("p", { textContent: line })),
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

$("#card-button").addEventListener("click", (event) => act(event.currentTarget, async () => {
  const { url } = await api("/billing/card");
  location.assign(url);
}));

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
