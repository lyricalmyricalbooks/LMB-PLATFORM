// The front door (code plan 18.4, the plan question added in 18.6, docs/plans/1-front-door-v2.md "A simpler flow"): email, the six-digit code, four
// questions, then the admin. New and returning presses come in the same way. Plain browser JavaScript with no
// framework (docs/decisions.md); Firebase's own browser library is loaded from Google for sign-in only. Every check the
// page makes, the server makes again (signup/frontDoor.js).
import { API_BASE, FIREBASE_SDK, PLATFORM_FIREBASE, SETUP_ADMIN_URL } from "../signup/config.js";
import { COUNTRIES, PUBLISHES, countryFromTimeZone, isEmail } from "../signup/form.js";
import { takeHandOff } from "../waitlist/frontPage.js";

const { initializeApp } = await import(`${FIREBASE_SDK}/firebase-app.js`);
const { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signInWithEmailLink, signOut } = await import(`${FIREBASE_SDK}/firebase-auth.js`);

const auth = getAuth(initializeApp(PLATFORM_FIREBASE));
const $ = (selector) => document.querySelector(selector);
const status = $("#status");
const QUESTIONS = ["plan", "name", "sells", "country"];
const STEP_OF = { email: "email", code: "code", pick: "press", plan: "press", name: "press", sells: "press", country: "press", done: "press" };
// A press whose shop is opening or open is run from its admin, reached from the account page.
const ACCOUNT_PAGE = "../account/";
const STATUS_WORDS = { setup: "Setting up", opening: "Opening", open: "Open", expired: "Setup ran out" };
const STEPS = ["email", "code", "press"];

let email = "";
let press = null;
// Whether the person signed in on this visit. Coming back already signed in, the page doesn't move focus on its own.
let signedInHere = false;

/** Shows one screen. Focus moves to its heading when the person moved there, not when the page first opens. */
function show(view, { focus = true } = {}) {
  for (const section of document.querySelectorAll("main section[id^='view-']")) section.hidden = section.id !== `view-${view}`;
  const at = STEPS.indexOf(STEP_OF[view]);
  for (const step of document.querySelectorAll("[data-step]")) {
    const index = STEPS.indexOf(step.dataset.step);
    if (index === at) step.setAttribute("aria-current", "step"); else step.removeAttribute("aria-current");
    step.toggleAttribute("data-done", index < at);
  }
  status.textContent = "";
  if (focus) $(`#view-${view} [tabindex="-1"]`)?.focus?.();
}

async function api(method, path, body) {
  const token = auth.currentUser ? await auth.currentUser.getIdToken() : "";
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new Error("We couldn't reach Colophon. Check your connection and try again.");
  }
  const answer = await response.json().catch(() => ({ ok: false, message: "We couldn't reach Colophon. Check your connection and try again." }));
  if (!response.ok || answer.ok === false) throw new Error(answer.message || "Something went wrong. Try again.");
  return answer;
}

/** Runs `work` with the form's buttons off, showing any failure in the form's own error line. */
async function busy(form, errorLine, work) {
  const buttons = form.closest("section").querySelectorAll("button");
  buttons.forEach((b) => { b.disabled = true; });
  errorLine.hidden = true;
  try {
    await work();
  } catch (failure) {
    errorLine.textContent = failure.message;
    errorLine.hidden = false;
  } finally {
    buttons.forEach((b) => { b.disabled = false; });
  }
}

// ── 1. Email, or Google ──
$("#google").addEventListener("click", async () => {
  try {
    signedInHere = true;
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (error) {
    if (error?.code !== "auth/popup-closed-by-user") status.textContent = "Google sign-in didn't finish. Try again, or use your email.";
  }
});

// After a code is sent, "Send a new code" waits half a minute: the first email is usually on its way, and each send counts
// toward the five an hour.
const RESEND_WAIT_SECONDS = 30;
let resendTimer = 0;
function holdResend() {
  const again = $("#code-again");
  const wait = $("#code-wait");
  let left = RESEND_WAIT_SECONDS;
  clearInterval(resendTimer);
  const tick = () => {
    again.hidden = left > 0;
    wait.hidden = left <= 0;
    wait.textContent = `You can ask for a new code in ${left}s`;
    if (left-- <= 0) clearInterval(resendTimer);
  };
  tick();
  resendTimer = setInterval(tick, 1000);
}

async function sendCode() {
  await api("POST", "/code/send", { email });
  $("#code-email").textContent = email;
  $("#code-form").code.value = "";
  holdResend();
}

// The email typed on the front page (waitlist/frontPage.js) is filled in, so the person only presses Continue.
{
  let storage = null;
  try { storage = sessionStorage; } catch { /* blocked: the box starts empty */ }
  const handed = takeHandOff(storage);
  if (handed) $("#email-form").email.value = handed;
}

$("#email-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.target;
  const error = $("#email-error");
  const typed = form.email.value.trim();
  if (!isEmail(typed)) {
    error.textContent = "Enter your email address.";
    error.hidden = false;
    form.email.focus();
    return;
  }
  busy(form, error, async () => {
    email = typed.toLowerCase();
    await sendCode();
    show("code");
  });
});

// ── 2. The code ──
const codeForm = $("#code-form");
codeForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const error = $("#code-error");
  const code = codeForm.code.value.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(code)) {
    error.textContent = "Enter the six numbers from the email.";
    error.hidden = false;
    codeForm.code.focus();
    return;
  }
  busy(codeForm, error, async () => {
    const { link } = await api("POST", "/code/check", { email, code });
    signedInHere = true;
    // The link is a one-time Firebase sign-in for this address; signing in with it here is the same as opening it.
    await signInWithEmailLink(auth, email, link);
  });
});
// Six numbers typed or pasted: carry on without a click.
codeForm.code.addEventListener("input", () => {
  if (/^\d{6}$/.test(codeForm.code.value.replace(/\s+/g, ""))) codeForm.requestSubmit();
});
$("#code-again").addEventListener("click", () => busy(codeForm, $("#code-error"), async () => {
  await sendCode();
  status.textContent = `We sent a new code to ${email}.`;
}));
$("#code-other").addEventListener("click", () => show("email"));

// ── 3. The four questions ──
function choice(name, value, title) {
  const label = document.createElement("label");
  label.className = "choice";
  label.append(Object.assign(document.createElement("input"), { type: "radio", name, value }), Object.assign(document.createElement("strong"), { textContent: title }));
  return label;
}
// What each plan is, in a line. The names and prices come from the platform (GET /api/plans), so a price change there
// shows here; until they load, or if they can't, the tiles show these names with no price.
const PLAN_WORDS = {
  shop: { name: "Shop", line: "Your website, to sell online" },
  stockroom: { name: "Stockroom", line: "Track stock, sales and payouts from fairs and stores" },
  both: { name: "Shop and stockroom", line: "Your website and your stock, kept in step", tag: "Recommended" },
};
const PLAN_ORDER = ["both", "shop", "stockroom"];
let planNames = Object.fromEntries(PLAN_ORDER.map((id) => [id, PLAN_WORDS[id].name]));

function planTiles(plans) {
  const byId = Object.fromEntries((plans?.plans ?? []).map((p) => [p.plan, p]));
  planNames = Object.fromEntries(PLAN_ORDER.map((id) => [id, byId[id]?.name || PLAN_WORDS[id].name]));
  const checked = $("#plan-choices input:checked")?.value;
  $("#plan-choices").replaceChildren(...PLAN_ORDER.map((id) => {
    const label = choice("plan", id, planNames[id]);
    label.append(Object.assign(document.createElement("span"), { textContent: PLAN_WORDS[id].line }));
    if (PLAN_WORDS[id].tag) label.append(Object.assign(document.createElement("b"), { className: "fd-tag", textContent: PLAN_WORDS[id].tag }));
    const plan = byId[id];
    if (plan?.priceText) {
      // With the founding offer, the usual price is shown struck through above the offer price.
      const shown = Object.assign(document.createElement("span"), { className: "fd-price" });
      if (plan.foundingPriceText) shown.append(Object.assign(document.createElement("s"), { textContent: plan.priceText }), plan.foundingPriceText);
      else shown.append(plan.priceText);
      shown.append(Object.assign(document.createElement("small"), { textContent: plan.foundingPriceText ? "a month, as long as you stay" : "a month" }));
      label.append(shown);
    }
    return label;
  }));
  if (checked) $(`#plan-choices input[value="${checked}"]`).checked = true;
  if (plans?.trialDays) {
    const founding = plans.foundingOffer;
    const offer = founding ? ` The first ${founding.presses} presses to pay keep ${founding.percentOff}% off for as long as they stay.` : "";
    const tax = plans.plusTax ? ", plus tax" : "";
    $("#plan-terms").textContent = `Free for ${plans.trialDays} days once your shop opens, then monthly${tax}. Nothing is charged before then, and no card is needed for the trial. Once you add a card, the plan renews each month until you cancel, which you can do online at any time.${offer}`;
  }
}
planTiles(null);
api("GET", "/plans").then(planTiles, () => {});

$("#sells-choices").replaceChildren(...PUBLISHES.options.map((o) => choice("sells", o.id, o.label)));
$("#country").replaceChildren(new Option("Choose your country", ""), ...Object.entries(COUNTRIES).map(([code, c]) => new Option(c.name, code)));

function fillAnswers() {
  const [planForm, nameForm, sellsForm, countryForm] = QUESTIONS.map((q) => $(`#view-${q} form`));
  // Nothing picked yet: start on both, the one most presses need.
  for (const input of planForm.querySelectorAll("input[name=plan]")) input.checked = input.value === (press.plan || "both");
  nameForm.pressName.value = press.pressName ?? "";
  for (const input of sellsForm.querySelectorAll("input[name=sells]")) input.checked = input.value === press.sells;
  // Not answered yet: start from the country the computer's clock is set to, when we can tell and serve it.
  countryForm.country.value = press.country in COUNTRIES ? press.country : countryFromTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
}

const valueOf = (form) => {
  const key = form.dataset.question;
  if (key === "sells" || key === "plan") return form.querySelector(`input[name=${key}]:checked`)?.value ?? "";
  return form.elements[key].value.trim();
};

async function save(form, value) {
  const { press: saved } = await api("POST", "/press/setup", { pressId: press.pressId, [form.dataset.question]: value });
  press = saved;
}

function next(form) {
  const at = QUESTIONS.indexOf(form.closest("section").id.replace("view-", ""));
  if (at < QUESTIONS.length - 1) show(QUESTIONS[at + 1]);
  else done();
}

for (const form of document.querySelectorAll("form[data-question]")) {
  const error = form.querySelector(".error");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    busy(form, error, async () => {
      await save(form, valueOf(form));
      next(form);
    });
  });
  // Skipping keeps whatever was saved before and moves on.
  form.querySelector("[data-skip]")?.addEventListener("click", () => next(form));
}
for (const back of document.querySelectorAll("[data-back]")) back.addEventListener("click", () => show(back.dataset.back));

// ── 4. Saved, then the admin ──
function done({ focus = true } = {}) {
  const sells = PUBLISHES.options.find((o) => o.id === press.sells)?.label;
  $("#done-name").textContent = press.pressName || "your press";
  $("#done-plan").textContent = planNames[press.plan] || "Not picked yet";
  $("#done-press").textContent = press.pressName || "Not named yet";
  $("#done-sells").textContent = sells || "Not said yet";
  $("#done-country").textContent = COUNTRIES[press.country]?.name || "Not said yet";
  $("#done-change").hidden = press.status !== "setup";
  if (SETUP_ADMIN_URL) {
    const go = $("#done-go");
    go.href = `${SETUP_ADMIN_URL}?press=${encodeURIComponent(press.pressId)}`;
    go.hidden = false;
  }
  show("done", { focus });
}
$("#done-change").addEventListener("click", () => { fillAnswers(); show("plan"); });
$("#sign-out").addEventListener("click", async () => {
  await signOut(auth);
  press = null;
  show("email");
});

// Signed in (just now, or from an earlier visit): back to where the press left off. One press carries on; several get a
// short picker; a first visit makes the press's setup record.
async function arrive() {
  const { presses } = await api("GET", "/press");
  if (presses.length > 1) return pick(presses);
  if (presses.length === 1) return carryOn(presses[0]);
  return carryOn((await api("POST", "/press", {})).press);
}

function carryOn(chosen) {
  press = chosen;
  if (press.status === "opening" || press.status === "open") {
    location.assign(ACCOUNT_PAGE);
    return;
  }
  fillAnswers();
  // A press already named, or whose setup ran out, shows where it stands; the questions are only for a new one.
  if (press.pressName || press.status !== "setup") done({ focus: signedInHere });
  else show("plan", { focus: signedInHere });
}

function pick(presses) {
  $("#pick-list").replaceChildren(...presses.map((p) => {
    const button = Object.assign(document.createElement("button"), { type: "button", className: "choice" });
    button.append(Object.assign(document.createElement("strong"), { textContent: p.pressName || "Press not named yet" }),
      Object.assign(document.createElement("span"), { textContent: STATUS_WORDS[p.status] ?? "" }));
    button.addEventListener("click", () => { signedInHere = true; carryOn(p); });
    return button;
  }));
  show("pick", { focus: signedInHere });
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    if (!press) show("email", { focus: false });
    return;
  }
  try {
    await arrive();
  } catch (failure) {
    show("email");
    status.textContent = failure.message;
  }
});
