// The permission page (accounts/install.html, /account/install.html?app=<id>&shop=<id>&back=<return address>&state=…),
// code plan 26.2. An outside app sends the press here; the page shows what the app wants in plain words, and the shop's
// owner adds it or cancels. Adding sends the press back to the app with a one-time code. Plain browser JavaScript with
// no framework, like the other account pages; the server (services/apps/installs.js) checks everything again.
import { API_BASE, FIREBASE_SDK, PLATFORM_FIREBASE } from "../signup/config.js";
import { deviceId } from "../signup/device.js";

const { initializeApp } = await import(`${FIREBASE_SDK}/firebase-app.js`);
const { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup } = await import(`${FIREBASE_SDK}/firebase-auth.js`);

const auth = getAuth(initializeApp(PLATFORM_FIREBASE));
const $ = (selector) => document.querySelector(selector);
const status = $("#status");
const params = new URLSearchParams(location.search);
const ask = { appId: params.get("app") ?? "", shopId: params.get("shop") ?? "", returnAddress: params.get("back") ?? "" };
const state = params.get("state") ?? undefined;

function show(view) {
  for (const section of document.querySelectorAll("main > section")) section.hidden = section.id !== `view-${view}`;
  $(`#view-${view} h2`)?.focus?.();
}

function fail(message) {
  $("#error-words").textContent = message;
  show("error");
}

async function api(path, body) {
  const token = auth.currentUser ? await auth.currentUser.getIdToken() : "";
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}`, "X-Device-Id": deviceId() } : {}) },
    body: JSON.stringify(body),
  });
  const answer = await response.json().catch(() => ({ ok: false, message: "We couldn't reach Colophon. Check your connection and try again." }));
  if (!response.ok || answer.ok === false) throw new Error(answer.message || "Something went wrong.");
  return answer;
}

async function load() {
  if (!ask.appId || !ask.shopId || !ask.returnAddress) return fail("This link is missing something. Go back to the app and press Install again.");
  show("loading");
  try {
    const preview = await api("/apps/install/preview", ask);
    $("#ask-title").textContent = `Add ${preview.app.name} to your shop?`;
    $("#app-tagline").textContent = preview.app.tagline ?? "";
    $("#testing").hidden = !preview.testing;
    const list = $("#permissions");
    list.replaceChildren(...preview.permissions.map((p) => Object.assign(document.createElement("li"), { textContent: p.words })));
    $("#personal").hidden = !preview.permissions.some((p) => p.personal);
    $("#already").hidden = !preview.alreadyInstalled;
    if (preview.alreadyInstalled) $("#already").textContent = "This app is already on your shop. Saying yes again updates what it can see and change to the list above.";
    const support = $("#support-link");
    support.textContent = preview.app.supportEmail;
    support.href = `mailto:${preview.app.supportEmail}`;
    $("#not-owner").hidden = preview.canApprove;
    $("#approve").hidden = !preview.canApprove;
    show("ask");
  } catch (failure) {
    fail(failure.message);
  }
}

$("#approve").addEventListener("click", async () => {
  const button = $("#approve");
  button.disabled = true;
  status.textContent = "Adding the app…";
  try {
    const { redirect } = await api("/apps/install/approve", { ...ask, state });
    status.textContent = "Added. Taking you back to the app…";
    location.assign(redirect);
  } catch (failure) {
    button.disabled = false;
    status.textContent = "";
    fail(failure.message);
  }
});

$("#google").addEventListener("click", async () => {
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (error) {
    if (error?.code !== "auth/popup-closed-by-user") status.textContent = "Google sign-in didn't finish. Try again, or use an email link from your shops page.";
  }
});
$("#retry").addEventListener("click", () => load());

onAuthStateChanged(auth, (user) => (user ? load() : show("signin")));
