// The front door (code plan 18.4; design handoff "Colophon platform", 10 November 2026): email, the six-digit code, then
// three questions about the brand and the terms, and the store is made at once with a free trial of everything (shop
// and stockroom). "Setting up your store…" follows the shop maker until the way into the store's admin is ready. New and returning presses come in the same way. Plain browser JavaScript with no
// framework (docs/decisions.md); Firebase's own browser library is loaded from Google for sign-in only. Every check the
// page makes, the server makes again (signup/frontDoor.js).
import { API_BASE, FIREBASE_SDK, PLATFORM_FIREBASE, SETUP_ADMIN_URL } from "../signup/config.js";
import { COUNTRIES, PUBLISHES, countryFromTimeZone, isEmail } from "../signup/form.js";
import { ROW_WORDS, makingView } from "../signup/making.js";
import { takeHandOff } from "../waitlist/frontPage.js";

const { initializeApp } = await import(`${FIREBASE_SDK}/firebase-app.js`);
const { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signInWithEmailLink, signOut } = await import(`${FIREBASE_SDK}/firebase-auth.js`);

const auth = getAuth(initializeApp(PLATFORM_FIREBASE));
const $ = (selector) => document.querySelector(selector);
const status = $("#status");
const STEP_OF = { email: "signin", code: "signin", pick: "brand", start: "brand" };
// A press whose shop is opening or open is run from its admin, reached from the account page.
const ACCOUNT_PAGE = "../account/";
const STATUS_WORDS = { setup: "Not started", opening: "Being set up", open: "Open", expired: "Setup ran out" };
const STEPS = ["signin", "brand"];

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
  $("#main").dataset.at = STEP_OF[view];
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

// While sign-up is closed (the control room's "Anyone can sign up"), only invited emails can open a shop, so the page
// says so before anyone answers the questions. Open, unreachable or unsure, the note stays hidden.
fetch(`${API_BASE}/plans`)
  .then((response) => (response.ok ? response.json() : null))
  .then((answer) => { if (answer && answer.ok !== false && answer.signupOpen === false) $("#closed-note").hidden = false; })
  .catch(() => { /* no note */ });

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

// ── 3. About your brand: three questions, an optional fourth, the terms, then the store is made ──
function choice(name, value, title) {
  const label = document.createElement("label");
  label.className = "choice";
  label.append(Object.assign(document.createElement("input"), { type: "radio", name, value }), Object.assign(document.createElement("strong"), { textContent: title }));
  return label;
}

// Every new store starts with the whole trial, shop and stockroom; the plan is picked later in the store's Billing.
const TRIAL_PLAN = "both";
let termsVersion = "";
api("GET", "/plans").then((plans) => {
  termsVersion = plans?.termsVersion ?? "";
  if (plans?.trialDays) {
    $("#new-days").textContent = `${plans.trialDays} days`;
    $("#story-lede").textContent = `Three quick questions, then you're in your store. Everything is included for ${plans.trialDays} days. No card needed.`;
  }
  const amount = (text) => Number(String(text).replace(/[^0-9.]/g, "")) || 0;
  const cheapest = (plans?.plans ?? []).map((p) => p.foundingPriceText || p.priceText).filter(Boolean).sort((a, b) => amount(a) - amount(b))[0];
  if (cheapest) $("#new-after").textContent = `From ${cheapest} a month`;
}, () => {});

// The mockup's six answers, each saved as one of sign-up's ids (signup/form.js PUBLISHES); home and beauty count as
// "other" until the shop knows them by name.
const SIGNUP_SELLS = [
  { id: "clothing", label: "Clothing & accessories" },
  { id: "other", label: "Home & kitchen" },
  { id: "prints", label: "Art & prints" },
  { id: "books", label: "Books & media" },
  { id: "other", label: "Beauty & care" },
  { id: "other", label: "Something else" },
].filter((o) => PUBLISHES.options.some((p) => p.id === o.id));
$("#sells-choices").replaceChildren(...SIGNUP_SELLS.map((o) => choice("sells", o.id, o.label)));
// "Selling somewhere already?", optional (ids from form.js QUESTION, which the server checks). It picks the setup
// guide's first step: bring a shop over, import a spreadsheet, or add the first product.
const SELLING_TODAY = [
  { id: "online", label: "Another online shop", line: "Bring your products and old links over" },
  { id: "spreadsheet", label: "A spreadsheet", line: "Import it in one go" },
  { id: "fairs", label: "Fairs and markets", line: "Add what you sell as you go" },
  { id: "starting", label: "Not yet", line: "Start fresh" },
];
$("#today-choices").replaceChildren(...SELLING_TODAY.map((o) => {
  return choice("sellingToday", o.id, o.label);
}));
$("#country").replaceChildren(new Option("Choose a country", ""), ...Object.entries(COUNTRIES).map(([code, c]) => new Option(c.name, code)));

const startForm = $("#start-form");
/** The web address a brand name would get, as the preview shows it (the server picks the real one). */
const addressFor = (name) => `${(name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/&/g, " ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "yourbrand")}.web.app`;
const showName = () => {
  const name = startForm.pressName.value.trim();
  $("#new-name").textContent = name || "Your brand";
  $("#new-address").textContent = addressFor(name);
};
const showKind = () => {
  const picked = startForm.querySelector("input[name=sells]:checked");
  $("#new-kind").textContent = picked ? picked.parentElement.textContent : "Your store";
};
startForm.pressName.addEventListener("input", showName);
startForm.addEventListener("change", (event) => { if (event.target.name === "sells") showKind(); });
// An answer given clears its own error line.
startForm.addEventListener("change", (event) => {
  const field = event.target.name === "termsAccepted" ? "terms" : event.target.name;
  const line = $(`#${field}-error`);
  if (line && (event.target.type === "checkbox" ? event.target.checked : event.target.value)) line.hidden = true;
});

function fillAnswers() {
  startForm.pressName.value = press.pressName ?? "";
  // One answer can sit behind several tiles ("other"): the last one, Something else, is shown picked.
  const matches = [...startForm.querySelectorAll("input[name=sells]")].filter((input) => input.value === press.sells);
  for (const input of startForm.querySelectorAll("input[name=sells]")) input.checked = input === matches.at(-1);
  showKind();
  for (const input of startForm.querySelectorAll("input[name=sellingToday]")) input.checked = input.value === press.sellingToday;
  // Not answered yet: start from the country the computer's clock is set to, when we can tell and serve it.
  startForm.country.value = press.country in COUNTRIES ? press.country : countryFromTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  showName();
  // A press that set up before stores were made at sign-up can carry on in its setup guide instead.
  const keep = $("#keep-setup");
  keep.hidden = !(SETUP_ADMIN_URL && press.pressName);
  if (!keep.hidden) keep.querySelector("a").href = setupGuideUrl();
  // A shop designed before the store was made: the tile says so and leads back to the designer.
  const designed = $("#new-design");
  designed.hidden = !press.design;
  designed.querySelector("a").href = designerUrl();
}

/** The designer that runs before the store exists (built from apps/shop, served at /design/). */
const designerUrl = () => `/design/studio?press=${encodeURIComponent(press.pressId)}`;

const setupGuideUrl = () => `${SETUP_ADMIN_URL}?press=${encodeURIComponent(press.pressId)}`;

/** The questions' own checks (the server checks again); returns true when every required answer is there. */
function checkAnswers(answers, { terms = true } = {}) {
  const problems = {
    pressName: answers.pressName ? "" : "Enter your brand's name.",
    sells: answers.sells ? "" : "Pick what you sell.",
    country: answers.country ? "" : "Choose where your brand is based.",
    terms: !terms || answers.termsAccepted ? "" : "Tick the box to agree to the terms.",
  };
  for (const [field, words] of Object.entries(problems)) {
    const line = $(`#${field}-error`);
    line.textContent = words;
    line.hidden = !words;
  }
  const first = Object.entries(problems).find(([, words]) => words)?.[0];
  if (first) startForm.querySelector(first === "terms" ? "[name=termsAccepted]" : first === "sells" ? "input[name=sells]" : `[name=${first}]`)?.focus();
  return !first;
}

const readAnswers = () => {
  const picked = (name) => startForm.querySelector(`input[name=${name}]:checked`)?.value ?? "";
  return { pressName: startForm.pressName.value.trim(), sells: picked("sells"), country: startForm.country.value, sellingToday: picked("sellingToday"), termsAccepted: startForm.termsAccepted.checked };
};

// Design my shop first: the answers are saved (no store is made, no terms needed yet), then the real designer opens
// with a sample shop. Its Done comes back here, and Start my free trial makes the store with that design on.
$("#design-first").addEventListener("click", () => {
  const answers = readAnswers();
  if (!checkAnswers(answers, { terms: false })) return;
  busy(startForm, $("#start-error"), async () => {
    const { termsAccepted: _terms, ...change } = answers;
    if (!change.sellingToday) delete change.sellingToday;
    press = (await api("POST", "/press/setup", { pressId: press.pressId, plan: TRIAL_PLAN, ...change })).press;
    location.assign(designerUrl());
  });
});

startForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const answers = readAnswers();
  if (!checkAnswers(answers)) return;
  busy(startForm, $("#start-error"), async () => {
    const { termsAccepted, ...change } = answers;
    if (!change.sellingToday) delete change.sellingToday;
    const { press: saved } = await api("POST", "/press/setup", { pressId: press.pressId, plan: TRIAL_PLAN, ...change });
    press = saved;
    try {
      const opened = await api("POST", "/press/open", { pressId: press.pressId, plan: TRIAL_PLAN, termsAccepted, termsVersion });
      press = opened.press;
      // Its country hasn't opened yet: nothing is made, the place is kept, and the setup guide is the way on.
      if (opened.shop?.status === "later") throw new Error(opened.shop.message || "Colophon hasn't opened where you are yet. We've saved your place.");
    } catch (failure) {
      // The answers are saved either way, so the setup guide can carry on from them.
      const keep = $("#keep-setup");
      if (SETUP_ADMIN_URL) { keep.querySelector("a").href = setupGuideUrl(); keep.hidden = false; }
      throw failure;
    }
    making();
  });
});

// ── 4. Setting up your store: the shop maker's progress, until the way in is ready ──
const overlay = $("#making");
let following = 0;

function drawMaking(view) {
  $("#making-rows").replaceChildren(...view.rows.map((row) => {
    const item = document.createElement("li");
    const tone = { done: "success", working: "info", waiting: "" }[row.state];
    const pill = Object.assign(document.createElement("span"), { className: "pill", textContent: ROW_WORDS[row.state] });
    if (tone) pill.dataset.tone = tone;
    item.append(Object.assign(document.createElement("span"), { textContent: row.label }), pill);
    return item;
  }));
  $("#making-bar").style.width = `${view.percent}%`;
  const go = $("#making-go");
  if (view.openUrl) { go.href = view.openUrl; go.removeAttribute("aria-disabled"); } else { go.removeAttribute("href"); go.setAttribute("aria-disabled", "true"); }
  $("#making-title").textContent = view.phase === "ready" ? "Your store is ready." : "Setting up your store…";
  $("#making-hint").textContent = view.phase === "ready" ? "Your setup guide is waiting inside."
    : view.phase === "queued" ? (view.message || "Your store is next in line. You can close this page: we'll email you the way in.")
      : "About a minute. You'll land in your store's setup guide. We'll email you the way in too.";
  const error = $("#making-error");
  error.textContent = view.phase === "stuck" ? view.message : "";
  error.hidden = view.phase !== "stuck" || !view.message;
  $("#making-retry").hidden = !view.canRetry;
}

/** Shows the overlay and follows the press's store until it is ready (or the person leaves). */
function making() {
  overlay.hidden = false;
  drawMaking(makingView(press));
  $("#making-title").focus();
  clearTimeout(following);
  const check = async () => {
    try {
      const { presses } = await api("GET", "/press");
      press = presses.find((p) => p.pressId === press.pressId) ?? press;
    } catch {
      // A missed check is tried again on the next tick.
    }
    const view = makingView(press);
    drawMaking(view);
    if (view.phase !== "ready") following = setTimeout(check, 2000);
  };
  following = setTimeout(check, 1000);
}
$("#making-retry").addEventListener("click", async () => {
  $("#making-retry").hidden = true;
  try { await api("POST", "/signup/retry", { shopId: press.shopId }); } catch (failure) { status.textContent = failure.message; }
});

$("#sign-out")?.addEventListener("click", async () => {
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
  // An open store is run from its admin; one being made shows how far it has got.
  if (press.status === "open") {
    location.assign(press.openUrl || ACCOUNT_PAGE);
    return;
  }
  if (press.status === "opening") {
    fillAnswers();
    show("start", { focus: false });
    making();
    return;
  }
  if (press.status !== "setup") {
    location.assign(ACCOUNT_PAGE);
    return;
  }
  fillAnswers();
  show("start", { focus: signedInHere });
}

function pick(presses) {
  $("#pick-list").replaceChildren(...presses.map((p) => {
    const button = Object.assign(document.createElement("button"), { type: "button", className: "choice" });
    button.append(Object.assign(document.createElement("strong"), { textContent: p.pressName || "Brand not named yet" }),
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
