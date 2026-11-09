// Colophon's Chit Chats app page (accounts/chitchats.html, /account/chitchats.html?shop=<id>), code plan 26.11.
//   - Not connected and no code yet: sends the owner to the permission page (accounts/install.html), which comes back here
//     with ?code=…&state=….
//   - Back with a code: the owner gives the Chit Chats client ID and access token, and their usual parcel.
//   - Connected: what happens now, Change details and Disconnect.
// Plain browser JavaScript like the other account pages; the server (services/chitchats/app.js) checks everything again.
import { API_BASE, FIREBASE_SDK, PLATFORM_FIREBASE } from "../signup/config.js";
import { deviceId } from "../signup/device.js";

const { initializeApp } = await import(`${FIREBASE_SDK}/firebase-app.js`);
const { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup } = await import(`${FIREBASE_SDK}/firebase-auth.js`);

const auth = getAuth(initializeApp(PLATFORM_FIREBASE));
const $ = (selector) => document.querySelector(selector);
const status = $("#status");
const params = new URLSearchParams(location.search);
const STATE_KEY = "colophon-chitchats-state";
const here = `${location.origin}${location.pathname}`;
const code = params.get("code") ?? "";
let shopId = params.get("shop") ?? "";
let current = null;

// Coming back from the permission page: the shop rides in the state we sent, checked against what this tab kept.
if (code) {
  let kept = null;
  try { kept = JSON.parse(sessionStorage.getItem(STATE_KEY) ?? "null"); } catch { kept = null; }
  if (kept && kept.state === params.get("state")) shopId = kept.shopId;
}

function show(view, { focus = false } = {}) {
  for (const section of document.querySelectorAll("main > section, main > form")) section.hidden = section.id !== `view-${view}`;
  $("#foot").hidden = !["connect", "connected"].includes(view);
  if (focus) $(`#view-${view} h2`)?.focus?.();
}

function fail(message) {
  $("#error-words").textContent = message;
  show("error", { focus: true });
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

function fillParcel(parcel = {}) {
  $("#weight").value = parcel.weightGrams ?? "";
  $("#length").value = parcel.lengthCm ?? "";
  $("#width").value = parcel.widthCm ?? "";
  $("#height").value = parcel.heightCm ?? "";
}

function showConnect(answer) {
  fillParcel(answer.parcel);
  $("#client-id").value = answer.clientId ?? "";
  $("#access-token").value = "";
  $("#connect").textContent = answer.connected ? "Save" : "Connect Chit Chats";
  $("#connect-problem").hidden = true;
  show("connect");
}

function showConnected(answer) {
  $("#client-pill").textContent = `Client ${answer.clientId}`;
  $("#waiting").hidden = !answer.waiting;
  $("#waiting").textContent = answer.waiting === 1 ? "1 order is waiting for postage." : `${answer.waiting} orders are waiting for postage.`;
  $("#last-problem").hidden = !answer.lastProblem;
  $("#last-problem").textContent = answer.lastProblem?.words ?? "";
  show("connected");
}

function goToPermission(appId) {
  const state = crypto.randomUUID();
  try { sessionStorage.setItem(STATE_KEY, JSON.stringify({ state, shopId })); } catch { /* the code still works; only the shop has to be in the address */ }
  const ask = new URLSearchParams({ app: appId, shop: shopId, back: here, state });
  location.assign(`/account/install.html?${ask}`);
}

async function load() {
  if (!shopId) return fail("Open Chit Chats from Settings › Apps in your shop.");
  show("loading");
  try {
    current = await api("/chitchats/status", { shopId });
    if (!current.available) return show("soon");
    if (code) return showConnect(current);
    if (current.connected) return showConnected(current);
    goToPermission(current.appId);
  } catch (failure) {
    fail(failure.message);
  }
}

$("#view-connect").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $("#connect");
  const problem = $("#connect-problem");
  problem.hidden = true;
  button.disabled = true;
  status.textContent = "Checking with Chit Chats…";
  try {
    const parcel = Object.fromEntries(["weight", "length", "width", "height"].map((id) => [$(`#${id}`).name, $(`#${id}`).value]));
    await api("/chitchats/connect", {
      shopId, code: code || undefined, clientId: $("#client-id").value.trim(), accessToken: $("#access-token").value.trim(), parcel,
    });
    try { sessionStorage.removeItem(STATE_KEY); } catch { /* nothing kept */ }
    history.replaceState(null, "", `${here}?shop=${encodeURIComponent(shopId)}`);
    status.textContent = "Connected.";
    current = await api("/chitchats/status", { shopId });
    showConnected(current);
  } catch (failure) {
    status.textContent = "";
    problem.textContent = failure.message;
    problem.hidden = false;
  } finally {
    button.disabled = false;
  }
});

$("#again").addEventListener("click", () => goToPermission(current.appId));
$("#edit").addEventListener("click", () => showConnect(current ?? {}));
$("#disconnect").addEventListener("click", async () => {
  if (!window.confirm("Disconnect Chit Chats? New orders stop going there. Orders already there stay.")) return;
  try {
    await api("/chitchats/disconnect", { shopId });
    current = await api("/chitchats/status", { shopId });
    show("off", { focus: true });
  } catch (failure) {
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
