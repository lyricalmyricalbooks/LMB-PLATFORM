// The sign-up page (signup/index.html): sign in with an email link or Google, tell us about the press, start the free
// trial, then follow the shop being made. Plain browser JavaScript with no framework (docs/decisions.md); Firebase's
// own browser library is loaded from Google for sign-in only. Every check the page makes, the server makes again.
import { API_BASE, FIREBASE_SDK, PLATFORM_FIREBASE } from "./config.js";
import { COUNTRIES, PLAN_CHOICES, QUESTION, checkSignup, isEmail } from "./form.js";

const { initializeApp } = await import(`${FIREBASE_SDK}/firebase-app.js`);
const {
  getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, isSignInWithEmailLink, signInWithEmailLink,
} = await import(`${FIREBASE_SDK}/firebase-auth.js`);

const auth = getAuth(initializeApp(PLATFORM_FIREBASE));
const $ = (selector) => document.querySelector(selector);
const status = $("#status");
const EMAIL_KEY = "colophon.signin.email";
const remember = (value) => { try { value ? localStorage.setItem(EMAIL_KEY, value) : localStorage.removeItem(EMAIL_KEY); } catch {} };
const recalled = () => { try { return localStorage.getItem(EMAIL_KEY) || ""; } catch { return ""; } };

function show(view) {
  for (const section of document.querySelectorAll("main > section")) section.hidden = section.id !== `view-${view}`;
  status.textContent = "";
  $(`#view-${view} h2`)?.focus?.();
}

async function api(method, path, body) {
  const token = auth.currentUser ? await auth.currentUser.getIdToken() : "";
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const answer = await response.json().catch(() => ({ ok: false, message: "We couldn't reach Colophon. Check your connection and try again." }));
  if (!response.ok || answer.ok === false) throw Object.assign(new Error(answer.message || "Something went wrong."), { problems: answer.problems });
  return answer;
}

// ── 1. Sign in ──
$("#google").addEventListener("click", async () => {
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (error) {
    if (error?.code !== "auth/popup-closed-by-user") status.textContent = "Google sign-in didn't finish. Try again, or use an email link.";
  }
});

$("#link-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = event.target.email.value.trim();
  const error = $("#link-error");
  error.hidden = isEmail(email);
  error.textContent = "Enter your email address.";
  if (!error.hidden) return;
  const button = event.target.querySelector("button");
  button.disabled = true;
  try {
    await api("POST", "/signin-link", { email });
    remember(email);
    $("#check-email").textContent = email;
    show("check");
  } catch (failure) {
    error.textContent = failure.message;
    error.hidden = false;
  } finally {
    button.disabled = false;
  }
});
$("#check-again").addEventListener("click", () => show("signin"));

// Coming back from the emailed link.
if (isSignInWithEmailLink(auth, location.href)) {
  const email = recalled() || window.prompt("Which email address did you use?") || "";
  try {
    await signInWithEmailLink(auth, email, location.href);
    remember("");
    history.replaceState(null, "", location.pathname);
  } catch {
    status.textContent = "That link has run out or was already used. Ask for a new one.";
  }
}

// ── 2. About your press ──
function fillDetails(info) {
  document.querySelectorAll("[data-trial-days]").forEach((el) => { el.textContent = String(info.trialDays); });
  const byPlan = Object.fromEntries(info.plans.map((p) => [p.plan, p]));
  $("#plans").replaceChildren(...PLAN_CHOICES.filter((id) => byPlan[id]).map((id, index) => choice("plan", id, byPlan[id].name, `${byPlan[id].priceText} a month`, index === 0)));
  $("#country").replaceChildren(...Object.entries(COUNTRIES).map(([code, c]) => new Option(c.name, code, code === "CA", code === "CA")));
  $("#question-label").textContent = QUESTION.label;
  $("#question-hint").textContent = QUESTION.hint;
  $("#answers").replaceChildren(...QUESTION.options.map((o) => choice(QUESTION.id, o.id, o.label, "", false)));
}

function choice(name, value, title, detail, checked) {
  const label = document.createElement("label");
  label.className = "choice";
  const input = Object.assign(document.createElement("input"), { type: "radio", name, value, checked });
  const strong = Object.assign(document.createElement("strong"), { textContent: title });
  label.append(input, strong);
  if (detail) label.append(Object.assign(document.createElement("span"), { textContent: detail }));
  return label;
}

$("#skip").addEventListener("click", () => {
  document.querySelectorAll(`input[name="${QUESTION.id}"]`).forEach((input) => { input.checked = false; });
  $("#details-form button[type=submit]").focus();
});

$("#details-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  const input = { pressName: form.get("pressName"), plan: form.get("plan"), country: form.get("country"), [QUESTION.id]: form.get(QUESTION.id) };
  const { ok, problems } = checkSignup(input);
  showProblems(problems);
  if (!ok) return;
  const button = event.target.querySelector("button[type=submit]");
  button.disabled = true;
  status.textContent = "Starting your trial…";
  try {
    await api("POST", "/signup", input);
    show("making");
    follow();
  } catch (failure) {
    showProblems(failure.problems ?? {});
    status.textContent = failure.message;
  } finally {
    button.disabled = false;
  }
});

function showProblems(problems) {
  for (const el of document.querySelectorAll("[data-problem]")) {
    const text = problems[el.dataset.problem];
    el.hidden = !text;
    el.textContent = text ?? "";
  }
}

// ── 3. The shop being made ──
let following;
async function follow() {
  clearTimeout(following);
  try {
    const { shops } = await api("GET", "/signup");
    renderShops(shops);
    if (shops.some((s) => s.status === "queued" || s.status === "making")) following = setTimeout(follow, 5000);
  } catch (failure) {
    status.textContent = failure.message;
    following = setTimeout(follow, 15000);
  }
}

const WORDS = {
  queued: "Waiting for its turn. This takes a few minutes.",
  making: "Being made now. This takes a few minutes; you can close this page and we'll email you when it's ready.",
  ready: "Ready. We've emailed you the way in.",
  waiting: "We hit a snag making it. Nothing is lost.",
  "needs-help": "This needs a hand from us. We've been told, and we'll email you when it's sorted.",
};

function renderShops(shops) {
  $("#shops").replaceChildren(...shops.map((shop) => {
    const card = document.createElement("div");
    card.className = "card";
    card.append(Object.assign(document.createElement("strong"), { textContent: shop.pressName }));
    card.append(Object.assign(document.createElement("p"), { textContent: shop.message || WORDS[shop.status] || WORDS.queued }));
    if (shop.status === "ready" && shop.siteUrl) {
      const link = Object.assign(document.createElement("a"), { href: `${shop.siteUrl}/admin`, textContent: "Open your shop's admin" });
      card.append(link);
    }
    if (shop.canRetry) {
      const retry = Object.assign(document.createElement("button"), { type: "button", className: "primary", textContent: "Try again" });
      retry.addEventListener("click", async () => {
        retry.disabled = true;
        try {
          await api("POST", "/signup/retry", { shopId: shop.shopId });
          follow();
        } catch (failure) {
          status.textContent = failure.message;
          retry.disabled = false;
        }
      });
      card.append(retry);
    }
    return card;
  }));
}

// ── Where to start ──
const plans = await api("GET", "/plans").catch(() => null);
if (plans) fillDetails(plans);
onAuthStateChanged(auth, async (user) => {
  if (!user) return show("signin");
  try {
    const { shops } = await api("GET", "/signup");
    if (shops.length) {
      show("making");
      renderShops(shops);
      follow();
    } else {
      show("details");
    }
  } catch (failure) {
    show("details");
    status.textContent = failure.message;
  }
});
