// The front door (code plan 18.4, docs/plans/1-front-door-v2.md "A simpler flow"): email, the six-digit code, three
// questions, then the admin. New and returning presses come in the same way. Plain browser JavaScript with no
// framework (docs/decisions.md); Firebase's own browser library is loaded from Google for sign-in only. Every check the
// page makes, the server makes again (signup/frontDoor.js).
import { API_BASE, FIREBASE_SDK, PLATFORM_FIREBASE, SETUP_ADMIN_URL } from "../signup/config.js";
import { COUNTRIES, PUBLISHES, isEmail } from "../signup/form.js";

const { initializeApp } = await import(`${FIREBASE_SDK}/firebase-app.js`);
const { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signInWithEmailLink, signOut } = await import(`${FIREBASE_SDK}/firebase-auth.js`);

const auth = getAuth(initializeApp(PLATFORM_FIREBASE));
const $ = (selector) => document.querySelector(selector);
const status = $("#status");
const QUESTIONS = ["name", "sells", "country"];
const STEP_OF = { email: "email", code: "code", name: "press", sells: "press", country: "press", done: "press" };
const STEPS = ["email", "code", "press"];

let email = "";
let press = null;

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
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (error) {
    if (error?.code !== "auth/popup-closed-by-user") status.textContent = "Google sign-in didn't finish. Try again, or use your email.";
  }
});

async function sendCode() {
  await api("POST", "/code/send", { email });
  $("#code-email").textContent = email;
  $("#code-form").code.value = "";
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

// ── 3. The three questions ──
function choice(name, value, title) {
  const label = document.createElement("label");
  label.className = "choice";
  label.append(Object.assign(document.createElement("input"), { type: "radio", name, value }), Object.assign(document.createElement("strong"), { textContent: title }));
  return label;
}
$("#sells-choices").replaceChildren(...PUBLISHES.options.map((o) => choice("sells", o.id, o.label)));
$("#country").replaceChildren(new Option("Choose your country", ""), ...Object.entries(COUNTRIES).map(([code, c]) => new Option(c.name, code)));

function fillAnswers() {
  const [nameForm, sellsForm, countryForm] = QUESTIONS.map((q) => $(`#view-${q} form`));
  nameForm.pressName.value = press.pressName ?? "";
  for (const input of sellsForm.querySelectorAll("input[name=sells]")) input.checked = input.value === press.sells;
  countryForm.country.value = press.country in COUNTRIES ? press.country : "";
}

const valueOf = (form) => {
  const key = form.dataset.question;
  if (key === "sells") return form.querySelector("input[name=sells]:checked")?.value ?? "";
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
  form.querySelector("[data-skip]").addEventListener("click", () => next(form));
  form.querySelector("[data-back]")?.addEventListener("click", (event) => show(event.currentTarget.dataset.back));
}

// ── 4. Saved, then the admin ──
function done() {
  const sells = PUBLISHES.options.find((o) => o.id === press.sells)?.label;
  $("#done-name").textContent = press.pressName || "your press";
  $("#done-press").textContent = press.pressName || "Not named yet";
  $("#done-sells").textContent = sells || "Not said yet";
  $("#done-country").textContent = COUNTRIES[press.country]?.name || "Not said yet";
  $("#done-change").hidden = press.status !== "setup";
  if (SETUP_ADMIN_URL) {
    const go = $("#done-go");
    go.href = `${SETUP_ADMIN_URL}?press=${encodeURIComponent(press.pressId)}`;
    go.hidden = false;
  }
  show("done");
}
$("#done-change").addEventListener("click", () => { fillAnswers(); show("name"); });
$("#sign-out").addEventListener("click", async () => {
  await signOut(auth);
  press = null;
  show("email");
});

// Signed in (just now, or from an earlier visit): make or find the press, then carry on where it left off.
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    if (!press) show("email", { focus: false });
    return;
  }
  try {
    ({ press } = await api("POST", "/press", {}));
  } catch (failure) {
    show("email");
    status.textContent = failure.message;
    return;
  }
  fillAnswers();
  // A press already named, or already opening, shows where it stands; the questions are only for a new one.
  if (press.pressName || press.status !== "setup") done();
  else show("name");
});
