// The front door (code plan 18.4; design handoff "Colophon platform", 10 November 2026): email, the six-digit code, then
// three questions about the brand and the terms, and the store is made at once with a free trial of everything (shop
// and stockroom). "Setting up your store…" follows the shop maker until the way into the store's admin is ready. New and returning presses come in the same way. Plain browser JavaScript with no
// framework (docs/decisions.md); Firebase's own browser library is loaded from Google for sign-in only. Every check the
// page makes, the server makes again (signup/frontDoor.js).
import { API_BASE, DEMO_URL, FIREBASE_SDK, PLATFORM_FIREBASE, SETUP_ADMIN_URL } from "../signup/config.js";
import { COUNTRIES, PRODUCT_GROUPS, SERVICE_SELLS, SHOP_TYPES, countryFromTimeZone, isEmail, sellsForGroups, shopTypeOf } from "../signup/form.js";
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
  // Signed in, Sign out sits in the header.
  $("#sign-out").hidden = STEP_OF[view] !== "brand";
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
function choice(name, value, title, line = "") {
  const label = document.createElement("label");
  label.className = "choice";
  label.append(Object.assign(document.createElement("input"), { type: "radio", name, value }), Object.assign(document.createElement("strong"), { textContent: title }));
  if (line) label.append(Object.assign(document.createElement("span"), { textContent: line }));
  return label;
}

// Every new store starts with the whole trial, shop and stockroom; the plan is picked later in the store's Billing.
const TRIAL_PLAN = "both";
let termsVersion = "";
// What /api/plans says: the fee in each billing currency, the founding offer and the countries open today. Until it
// answers (or if it can't), the preview keeps its plain words and the country note says nothing about opening.
let plans = null;
api("GET", "/plans").then((answer) => {
  plans = answer;
  showTypes(answer?.servicesOpen === true || servicesShown);
  pickWantedType();
  termsVersion = plans?.termsVersion ?? "";
  if (Number.isInteger(plans?.trialDays)) {
    $("#new-days").textContent = `${plans.trialDays} days`;
    $("#strip-days").textContent = `${plans.trialDays} days free`;
  }
  // Countries Colophon isn't open in yet say so in the list.
  if (Array.isArray(plans?.openCountries)) {
    for (const option of $("#country").options) if (option.value && !plans.openCountries.includes(option.value)) option.textContent = `${COUNTRIES[option.value].name} (opening later)`;
  }
  showCountry();
}, () => {});

// Use this starter (round three, 25 November 2026): a sample shop at /demo/ links here with ?starter=&style=&name=. The pick
// is kept for the tab (the email step can come back on a new page), shown on the new-store card, and saved with the
// answers as `look` and `lookStyle`, so the new shop's Choose your look opens on it. Only id-shaped values are kept; the
// name is shown as text only.
const STARTER_PICK = (() => {
  const q = new URLSearchParams(location.search);
  const id = (v) => (/^[a-z0-9]+(-[a-z0-9]+)*$/.test(v ?? "") && v.length <= 40 ? v : "");
  let kept = null;
  try { kept = JSON.parse(sessionStorage.getItem("colophon-starter") || "null"); } catch { kept = null; }
  const pick = id(q.get("starter")) ? { look: id(q.get("starter")), lookStyle: id(q.get("style")), name: (q.get("name") ?? "").slice(0, 60) } : kept && id(kept.look) ? { look: id(kept.look), lookStyle: id(kept.lookStyle), name: String(kept.name ?? "").slice(0, 60) } : null;
  if (pick) try { sessionStorage.setItem("colophon-starter", JSON.stringify(pick)); } catch { /* still used on this page */ }
  return pick;
})();
if (STARTER_PICK) {
  $("#new-starter-name").textContent = STARTER_PICK.name || "your starter";
  $("#new-starter-link").href = `/demo/?${new URLSearchParams({ starter: STARTER_PICK.look, style: STARTER_PICK.lookStyle })}`;
  $("#new-starter").hidden = false;
  $("#starter-pick-name").textContent = STARTER_PICK.name || "your starter";
  $("#starter-pick-link").href = $("#new-starter-link").href;
  $("#starter-pick").hidden = false;
}
const starterChange = () => (STARTER_PICK ? { look: STARTER_PICK.look, lookStyle: STARTER_PICK.lookStyle } : {});

// Bookshop or general shop (14 November 2026, Julian): the first question, so it's clear which one gets the book
// features. A general shop then says what it sells. Both are saved as one sign-up answer (signup/form.js SHOP_TYPES).
// The Services kind (a salon, a studio, a tutor) shows only while the control room has it on (`plans.servicesOpen`),
// or for a press that already picked it; it then asks what the business does.
let servicesShown = false;
// The services page (/services) links here with ?type=services: that card starts picked, when it is shown and nothing
// else is picked yet. Runs once the plans answered, so the card is there.
const WANTED_TYPE = /^[a-z]{1,20}$/.test(new URLSearchParams(location.search).get("type") ?? "") ? new URLSearchParams(location.search).get("type") : "";
function pickWantedType() {
  if (!WANTED_TYPE || startForm.querySelector("input[name=shopType]:checked")) return;
  const input = startForm.querySelector(`input[name=shopType][value="${WANTED_TYPE}"]`);
  if (!input) return;
  input.checked = true;
  showKind();
}
function showTypes(withServices) {
  if (withServices === servicesShown && $("#type-choices").childElementCount) return;
  servicesShown = withServices;
  const picked = startForm?.querySelector("input[name=shopType]:checked")?.value ?? "";
  const types = SHOP_TYPES.filter((t) => t.id !== "services" || withServices);
  const box = $("#type-choices");
  box.dataset.count = String(types.length);
  box.replaceChildren(...types.map((t) => {
    const tile = choice("shopType", t.id, t.label, t.line);
    if (withServices) tile.append(Object.assign(document.createElement("span"), { className: "fd-tools", textContent: t.tools }));
    if (t.id === picked) tile.querySelector("input").checked = true;
    return tile;
  }));
}
// A product shop picks every kind of thing it sells (product types plan, change 12; form.js PRODUCT_GROUPS). Six of the
// commonest show first and "Show N more" opens the rest (25 November 2026: sixteen chips made the step look like work).
// The order on screen doesn't change the answer: `sells` follows the list's own order (form.js sellsForGroups).
const COMMON_GROUPS = ["clothing", "jewelry", "art", "home", "beauty", "food"];
const groupsShown = [...COMMON_GROUPS.map((id) => PRODUCT_GROUPS.options.find((o) => o.id === id)).filter(Boolean), ...PRODUCT_GROUPS.options.filter((o) => !COMMON_GROUPS.includes(o.id))];
$("#sells-choices").replaceChildren(...groupsShown.map((o) => {
  const label = choice(PRODUCT_GROUPS.id, o.id, o.label);
  label.querySelector("input").type = "checkbox";
  if (!COMMON_GROUPS.includes(o.id)) { label.classList.add("fd-extra"); label.hidden = true; }
  return label;
}));
const moreGroups = $("#sells-more");
moreGroups.textContent = `Show ${groupsShown.length - COMMON_GROUPS.length} more`;
/** Opens the rest of the chips (once opened they stay open). */
function showAllGroups() {
  for (const label of $("#sells-choices").querySelectorAll(".fd-extra")) label.hidden = false;
  moreGroups.hidden = true;
  moreGroups.setAttribute("aria-expanded", "true");
}
moreGroups.addEventListener("click", () => {
  showAllGroups();
  $("#sells-choices .fd-extra input")?.focus();
});
/** The product groups ticked, in the list's order. */
const pickedGroups = () => [...startForm.querySelectorAll(`input[name=${PRODUCT_GROUPS.id}]:checked`)].map((input) => input.value);
/** A press saved before groups were asked: its one-word answer's group. */
const GROUP_OF_SELLS = { clothing: "clothing", shoes: "shoes", jewelry: "jewelry", prints: "art", music: "music" };
$("#does-choices").replaceChildren(...SERVICE_SELLS.map((o) => choice("does", o.id, o.label)));
// A bookshop that signed up as zines or comics keeps that answer; a new bookshop is "books".
let bookAnswer = "books";
$("#country").replaceChildren(new Option("Choose a country", ""), ...Object.entries(COUNTRIES).map(([code, c]) => new Option(c.name, code)));

const startForm = $("#start-form");
showTypes(plans?.servicesOpen === true);
/** The web address a brand name would get, as the preview shows it (the server picks the real one). */
const addressFor = (name) => `${(name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/&/g, " ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "yourbrand")}.web.app`;
const showName = () => {
  const name = startForm.pressName.value.trim();
  $("#new-name").textContent = name || "Your brand";
  $("#new-address").textContent = addressFor(name);
};
const pickedValue = (name) => startForm.querySelector(`input[name=${name}]:checked`)?.value ?? "";
/** The preview's shop line, and the "What do you sell?" chips only for a general shop. */
const showKind = () => {
  const type = pickedValue("shopType");
  const groups = pickedGroups().map((id) => PRODUCT_GROUPS.options.find((o) => o.id === id)).filter(Boolean);
  const does = SERVICE_SELLS.find((o) => o.id === pickedValue("does"));
  $("#sells-group").hidden = type !== "general";
  if (type !== "general") $("#sells-error").hidden = true;
  $("#does-group").hidden = type !== "services";
  if (type !== "services") $("#does-error").hidden = true;
  $("#new-kind").textContent = type === "books" ? "Bookshop"
    : type === "general" ? (groups.length === 1 ? groups[0].label : groups.length > 1 ? `${groups[0].label} and ${groups.length - 1} more` : "Product shop")
    : type === "services" ? (does && does.id !== "services" ? does.label : "Services") : "Your store";
  // A services shop's second side is its money, not a stockroom.
  $("#new-includes").textContent = type === "services" ? "Bookings, website and bookkeeping" : "Shop and stockroom";
};
/** The note under the country, and the fee in the money that country's shops pay in. */
function showCountry() {
  const code = startForm.country.value;
  const country = COUNTRIES[code];
  const open = plans?.openCountries;
  const note = $("#country-note");
  if (country && Array.isArray(open) && !open.includes(code)) {
    const place = /^(United|Netherlands)/.test(country.name) ? `the ${country.name}` : country.name;
    note.textContent = `Colophon isn't open in ${place} yet. We'll save your place and email you when it is.`;
  } else {
    note.textContent = country ? `Sets your shop to ${country.currency} and local taxes.` : "Sets your shop's currency and taxes.";
  }
  // The fee is billed in US dollars for a US shop and Canadian dollars otherwise (services/billing/currencies.js).
  const fee = plans?.fees?.[code === "US" ? "USD" : "CAD"];
  if (!fee?.feeText) return;
  const tax = plans.plusTax ? " + tax" : "";
  $("#new-after").textContent = `${fee.feeText} a month + running cost${tax}`;
  $("#strip-after").textContent = `Then ${fee.feeText} a month + running cost`;
  const founding = fee.foundingFeeText && plans.foundingOffer;
  $("#new-founding-row").hidden = !founding;
  if (founding) {
    const first = plans.foundingOffer.presses;
    $("#new-founding-label").textContent = first ? `First ${first} shops` : "Founding shops";
    $("#new-founding").textContent = `${fee.foundingFeeText} a month`;
  }
}
// "Your new store" shows a real starter: the picture of its home page (join/starters/, taken from the live demo shop),
// and on a wide screen, once a brand name is typed, the live demo shop itself with that name on it (DEMO_URL, the
// demo's ?name=&embed=1). Which starter: the one picked on a sample shop (Use this starter), else the one that suits the
// kind of shop. A shop with no picked starter chooses its look inside, so the tile says "one of the starters".
const STARTER_SHOTS = Object.freeze({
  "aurel-editorial": { shot: "aurel", name: "Aurel", style: "cobalt" },
  "juniper-slow-season": { shot: "slow-season", name: "Slow Season", style: "terracotta" },
  "juniper-catalogue": { shot: "catalogue", name: "Catalogue", style: "acid" },
});
// Product groups the home-goods sample set suits better than the clothing one (apps/shop demoShop DEMO_SELLS).
const HOME_GROUPS = ["home", "beauty", "food", "plants", "craft", "kids", "pets"];
/** The starter, style and sample set the tile shows for the answers so far. */
function previewChoice() {
  const type = pickedValue("shopType");
  const first = pickedGroups()[0];
  const sells = type === "books" ? "books" : type === "services" ? "studio" : HOME_GROUPS.includes(first) ? "home" : "clothing";
  const picked = STARTER_PICK && STARTER_SHOTS[STARTER_PICK.look] ? STARTER_PICK.look : "";
  const starter = picked || (sells === "books" ? "juniper-catalogue" : sells === "home" || sells === "studio" ? "juniper-slow-season" : "aurel-editorial");
  return { starter, style: (picked && STARTER_PICK.lookStyle) || STARTER_SHOTS[starter].style, sells };
}
const wideScreen = window.matchMedia("(min-width: 901px)");
const shotBox = $("#new-shot");
let liveTimer = 0;
let liveSrc = "";
function showPreview() {
  const pick = previewChoice();
  const shown = STARTER_SHOTS[pick.starter];
  for (const img of shotBox.querySelectorAll("img")) img.hidden = img.dataset.shot !== shown.shot;
  $("#new-look-name").textContent = shown.name;
  const link = $("#new-look-link");
  link.hidden = !DEMO_URL;
  if (DEMO_URL) link.href = `${DEMO_URL}?${new URLSearchParams({ starter: pick.starter, style: pick.style, sells: pick.sells })}`;
  // A picked starter or a saved design has its own line on the tile.
  $("#new-look").hidden = !!STARTER_PICK || !!press?.design;
  clearTimeout(liveTimer);
  const name = startForm.pressName.value.trim();
  const src = DEMO_URL && wideScreen.matches && name ? `${DEMO_URL}?${new URLSearchParams({ ...pick, name, embed: "1" })}` : "";
  if (src !== liveSrc) delete shotBox.dataset.live;
  if (src) liveTimer = setTimeout(() => goLive(src), 700);
}
/** Loads the live demo into the tile; it fades in over the picture once it has drawn. */
function goLive(src) {
  if (src === liveSrc) { shotBox.dataset.live = ""; return; }
  liveSrc = src;
  let frame = shotBox.querySelector("iframe");
  if (!frame) {
    frame = document.createElement("iframe");
    frame.title = "Your shop in this starter";
    frame.tabIndex = -1;
    frame.setAttribute("aria-hidden", "true");
    frame.setAttribute("inert", "");
    // The shop runs inside, but can never move this page or open windows.
    frame.setAttribute("sandbox", "allow-scripts allow-same-origin");
    frame.addEventListener("load", () => {
      const loaded = frame.dataset.src;
      // The shop draws just after its page loads.
      setTimeout(() => { if (loaded === liveSrc) shotBox.dataset.live = ""; }, 500);
    });
    shotBox.append(frame);
  }
  frame.dataset.src = src;
  frame.src = src;
}
new ResizeObserver(() => shotBox.style.setProperty("--fd-scale", String(shotBox.clientWidth / 1280))).observe(shotBox);
wideScreen.addEventListener("change", () => showPreview());
showPreview();
startForm.pressName.addEventListener("input", () => { showName(); showPreview(); });
startForm.addEventListener("change", (event) => {
  if (["sells", "productGroups", "does", "shopType"].includes(event.target.name)) { showKind(); showPreview(); }
  if (event.target.name === "country") showCountry();
});
// An answer given clears its own error line.
startForm.addEventListener("change", (event) => {
  const field = event.target.name === "termsAccepted" ? "terms" : event.target.name;
  const line = $(`#${field}-error`);
  if (line && (event.target.type === "checkbox" ? event.target.checked : event.target.value)) line.hidden = true;
});

function fillAnswers() {
  startForm.pressName.value = press.pressName ?? "";
  // A saved answer picks its shop type, and for a general shop its tile ("mixed", an older answer with no tile here,
  // leaves the tiles for the person to pick again).
  const type = shopTypeOf(press.sells);
  // A press that already picked Services keeps its card, even when new sign-ups no longer see it.
  showTypes(plans?.servicesOpen === true || type === "services");
  if (type === "books") bookAnswer = press.sells;
  for (const input of startForm.querySelectorAll("input[name=shopType]")) input.checked = input.value === type;
  const savedGroups = Array.isArray(press.productGroups) && press.productGroups.length ? press.productGroups : [GROUP_OF_SELLS[press.sells]].filter(Boolean);
  for (const input of startForm.querySelectorAll(`input[name=${PRODUCT_GROUPS.id}]`)) input.checked = type === "general" && savedGroups.includes(input.value);
  for (const input of startForm.querySelectorAll("input[name=does]")) input.checked = type === "services" && input.value === press.sells;
  showKind();
  // A saved pick from the longer list opens it, so the answer is never hidden.
  if (startForm.querySelector(".fd-extra input:checked")) showAllGroups();
  // Not answered yet: start from the country the computer's clock is set to, when we can tell and serve it.
  startForm.country.value = press.country in COUNTRIES ? press.country : countryFromTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  showName();
  showCountry();
  // A press that set up before stores were made at sign-up can carry on in its setup guide instead.
  const keep = $("#keep-setup");
  keep.hidden = !(SETUP_ADMIN_URL && press.pressName);
  if (!keep.hidden) keep.querySelector("a").href = setupGuideUrl();
  // A shop designed before the store was made: the tile says so and leads back to the designer.
  const designed = $("#new-design");
  designed.hidden = !press.design;
  // A design made in the designer wins over a starter picked on a sample shop, so only one of the two shows.
  $("#new-starter").hidden = !STARTER_PICK || !!press.design;
  designed.querySelector("a").href = designerUrl();
  showPreview();
}

/** The designer that runs before the store exists (built from apps/shop, served at /design/). */
const designerUrl = () => `/design/studio?press=${encodeURIComponent(press.pressId)}`;

const setupGuideUrl = () => `${SETUP_ADMIN_URL}?press=${encodeURIComponent(press.pressId)}`;

/** The questions' own checks (the server checks again); returns true when every required answer is there. */
function checkAnswers(answers, { terms = true } = {}) {
  const problems = {
    pressName: answers.pressName ? "" : "Enter your brand's name.",
    shopType: answers.shopType ? "" : "Pick the kind of shop.",
    sells: answers.shopType !== "general" || answers.sells ? "" : "Pick at least one kind of thing you sell.",
    does: answers.shopType !== "services" || answers.sells ? "" : "Pick what you do.",
    country: answers.country ? "" : "Choose where your brand is based.",
    terms: !terms || answers.termsAccepted ? "" : "Tick the box to agree to the terms.",
  };
  for (const [field, words] of Object.entries(problems)) {
    const line = $(`#${field}-error`);
    line.textContent = words;
    line.hidden = !words;
  }
  const first = Object.entries(problems).find(([, words]) => words)?.[0];
  if (first) startForm.querySelector(first === "terms" ? "[name=termsAccepted]" : first === "sells" ? "input[name=productGroups]" : `[name=${first}]`)?.focus();
  return !first;
}

// `shopType` is the page's own; the server gets `sells`: the bookshop answer, the product shop's tile or the services shop's.
const readAnswers = () => {
  const shopType = pickedValue("shopType");
  const productGroups = shopType === "general" ? pickedGroups() : [];
  const sells = shopType === "books" ? bookAnswer : shopType === "general" ? sellsForGroups(productGroups) : shopType === "services" ? pickedValue("does") : "";
  return { pressName: startForm.pressName.value.trim(), shopType, sells, productGroups, country: startForm.country.value, termsAccepted: startForm.termsAccepted.checked };
};

// Design my shop first: the answers are saved (no store is made, no terms needed yet), then the real designer opens
// with a sample shop. Its Done comes back here, and Start my free trial makes the store with that design on.
$("#design-first").addEventListener("click", () => {
  const answers = readAnswers();
  if (!checkAnswers(answers, { terms: false })) return;
  busy(startForm, $("#start-error"), async () => {
    const { termsAccepted: _terms, shopType: _type, ...change } = answers;
    press = (await api("POST", "/press/setup", { pressId: press.pressId, plan: TRIAL_PLAN, ...starterChange(), ...change })).press;
    location.assign(designerUrl());
  });
});

startForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const answers = readAnswers();
  if (!checkAnswers(answers)) return;
  busy(startForm, $("#start-error"), async () => {
    const { termsAccepted, shopType: _type, ...change } = answers;
    const { press: saved } = await api("POST", "/press/setup", { pressId: press.pressId, plan: TRIAL_PLAN, ...starterChange(), ...change });
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
