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

/** Each category's picture and ink, the same as on the shop's Settings › Apps (lucide icons, ISC licence). */
const LOOK = {
  "orders-shipping": ["a", "<path d=\"M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2\"/><path d=\"M15 18H9\"/><path d=\"M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14\"/><circle cx=\"17\" cy=\"18\" r=\"2\"/><circle cx=\"7\" cy=\"18\" r=\"2\"/>"],
  "marketing": ["b", "<path d=\"M11 6a13 13 0 0 0 8.4-2.8A1 1 0 0 1 21 4v12a1 1 0 0 1-1.6.8A13 13 0 0 0 11 14H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z\"/><path d=\"M6 14a12 12 0 0 0 2.4 7.2 2 2 0 0 0 3.2-2.4A8 8 0 0 1 10 14\"/><path d=\"M8 6v8\"/>"],
  "customer-service": ["d", "<path d=\"M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719\"/>"],
  "accounting": ["c", "<rect width=\"16\" height=\"20\" x=\"4\" y=\"2\" rx=\"2\"/><line x1=\"8\" x2=\"16\" y1=\"6\" y2=\"6\"/><line x1=\"16\" x2=\"16\" y1=\"14\" y2=\"18\"/><path d=\"M16 10h.01\"/><path d=\"M12 10h.01\"/><path d=\"M8 10h.01\"/><path d=\"M12 14h.01\"/><path d=\"M8 14h.01\"/><path d=\"M12 18h.01\"/><path d=\"M8 18h.01\"/>"],
  "products": ["a", "<path d=\"M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z\"/><path d=\"M12 22V12\"/><polyline points=\"3.29 7 12 12 20.71 7\"/><path d=\"m7.5 4.27 9 5.15\"/>"],
  "website": ["b", "<path d=\"M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z\"/><circle cx=\"13.5\" cy=\"6.5\" r=\".5\" fill=\"currentColor\"/><circle cx=\"17.5\" cy=\"10.5\" r=\".5\" fill=\"currentColor\"/><circle cx=\"6.5\" cy=\"12.5\" r=\".5\" fill=\"currentColor\"/><circle cx=\"8.5\" cy=\"7.5\" r=\".5\" fill=\"currentColor\"/>"],
  "in-person": ["d", "<path d=\"M15 21v-5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5\"/><path d=\"M17.774 10.31a1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.451 0 1.12 1.12 0 0 0-1.548 0 2.5 2.5 0 0 1-3.452 0 1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.77-3.248l2.889-4.184A2 2 0 0 1 7 2h10a2 2 0 0 1 1.653.873l2.895 4.192a2.5 2.5 0 0 1-3.774 3.244\"/><path d=\"M4 10.95V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8.05\"/>"],
  "other": ["c", "<path d=\"M10 22V7a1 1 0 0 0-1-1H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5a1 1 0 0 0-1-1H2\"/><rect x=\"14\" y=\"2\" width=\"8\" height=\"8\" rx=\"1\"/>"],
};

/** Shows one view. Focus moves only when something went wrong, so a press arriving from an app isn't jumped around. */
function show(view, { focus = false } = {}) {
  for (const section of document.querySelectorAll("main > section")) section.hidden = section.id !== `view-${view}`;
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

async function load() {
  if (!ask.appId || !ask.shopId || !ask.returnAddress) return fail("This link is missing something. Go back to the app and press Install again.");
  show("loading");
  try {
    const preview = await api("/apps/install/preview", ask);
    const { app } = preview;
    document.title = `Add ${app.name} · Colophon`;
    $("#shop-name").textContent = preview.shopName ?? "Your shop";
    $("#title").textContent = `Add ${app.name}`;
    const [ink, picture] = LOOK[app.category] ?? LOOK.other;
    const tile = $("#app-tile");
    tile.dataset.ink = ink;
    tile.innerHTML = `<svg viewBox="0 0 24 24" focusable="false">${picture}</svg>`;
    tile.hidden = false;
    $("#app-tagline").textContent = app.tagline ?? "";
    $("#app-tagline").hidden = !app.tagline;
    $("#testing").hidden = !preview.testing;
    $("#already").hidden = !preview.alreadyInstalled;
    $("#permissions").replaceChildren(...preview.permissions.map((p) => {
      const item = document.createElement("li");
      if (p.scope.startsWith("write_")) item.dataset.change = "";
      item.append(Object.assign(document.createElement("span"), { textContent: p.words }));
      if (p.personal) {
        const tag = Object.assign(document.createElement("span"), { className: "pill", textContent: "Personal details" });
        tag.dataset.tone = "warning";
        item.append(tag);
      }
      return item;
    }));
    $("#approve").textContent = preview.alreadyInstalled ? "Update access" : "Add app";
    $("#support").hidden = !app.supportEmail;
    if (app.supportEmail) $("#support-link").href = `mailto:${app.supportEmail}`;
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
  status.textContent = "Adding…";
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
