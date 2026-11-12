// Colophon's Mailchimp app page (accounts/mailchimp.html, /account/mailchimp.html?shop=<id>), code plan 26.12.
//   - Not connected: sends the owner to the permission page (accounts/install.html), which comes back here with
//     ?code=…&state=…. That code is swapped at once and the owner goes on to Mailchimp's own "allow" page.
//   - Back from Mailchimp with ?code=…&state=mc.…: finish (the server checks the state is the one it made), then pick an
//     audience when the account has more than one.
//   - Connected: readers added, last update, Change audience and Disconnect.
// Plain browser JavaScript like the other account pages; the server (services/mailchimp/app.js) checks everything again.
import { API_BASE, FIREBASE_SDK, PLATFORM_FIREBASE } from "../signup/config.js";
import { deviceId } from "../signup/device.js";
import { mailchimp as LOGO } from "./look/brand-logos.js";

const { initializeApp } = await import(`${FIREBASE_SDK}/firebase-app.js`);
const { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup } = await import(`${FIREBASE_SDK}/firebase-auth.js`);

const auth = getAuth(initializeApp(PLATFORM_FIREBASE));
const $ = (selector) => document.querySelector(selector);
const status = $("#status");
const params = new URLSearchParams(location.search);
const INSTALL_KEY = "colophon-mailchimp-state";
const AWAY_KEY = "colophon-mailchimp-away";
const here = `${location.origin}${location.pathname}`;
const code = params.get("code") ?? "";
const state = params.get("state") ?? "";
// Back from the permission page (a code and this page's own state) or from Mailchimp (a code or a "no"; Mailchimp's
// state starts "mc.", as the server made it).
const fromMailchimp = state.startsWith("mc.");
const from = code && state && !fromMailchimp ? "install" : code || params.get("error") ? "mailchimp" : "";
let shopId = params.get("shop") ?? "";
let current = null;

const kept = (key) => {
  try { return JSON.parse(sessionStorage.getItem(key) ?? "null"); } catch { return null; }
};
const keep = (key, value) => {
  try { value ? sessionStorage.setItem(key, JSON.stringify(value)) : sessionStorage.removeItem(key); } catch { /* only this tab's memory */ }
};
if (from === "install") {
  const saved = kept(INSTALL_KEY);
  if (saved && saved.state === state) shopId = saved.shopId;
}
if (from === "mailchimp" && !shopId) shopId = kept(AWAY_KEY)?.shopId ?? "";

{
  const logo = $("#logo");
  const img = document.createElement("img");
  img.alt = "";
  img.style.cssText = "width: 62%; height: 62%";
  img.src = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${LOGO.viewBox}"${LOGO.color ? ` fill="${LOGO.color}"` : ""}>${LOGO.body}</svg>`)}`;
  logo.append(img);
}

function show(view, { focus = false } = {}) {
  for (const section of document.querySelectorAll("main > section, main > form")) section.hidden = section.id !== `view-${view}`;
  $("#foot").hidden = !["connect", "choose", "connected"].includes(view);
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

/** Drops the code from the address, so a reload doesn't try it again. */
const tidyAddress = () => history.replaceState(null, "", `${here}?shop=${encodeURIComponent(shopId)}`);

function since(iso) {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (!Number.isFinite(minutes)) return "Soon";
  if (minutes < 1) return "Just now";
  const words = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (minutes < 60) return words.format(-minutes, "minute");
  if (minutes < 60 * 24) return words.format(-Math.round(minutes / 60), "hour");
  return words.format(-Math.round(minutes / 1440), "day");
}

function goToPermission(appId) {
  const fresh = crypto.randomUUID();
  keep(INSTALL_KEY, { state: fresh, shopId });
  const ask = new URLSearchParams({ app: appId, shop: shopId, back: here, state: fresh });
  location.assign(`/account/install.html?${ask}`);
}

function goToMailchimp(url) {
  keep(INSTALL_KEY, null);
  keep(AWAY_KEY, { shopId });
  show("away", { focus: true });
  location.assign(url);
}

function showConnect(problem = "") {
  $("#connect-problem").textContent = problem;
  $("#connect-problem").hidden = !problem;
  show("connect", { focus: true });
}

function showChoose(lists, selected, { canCancel = false } = {}) {
  const box = $("#lists");
  box.replaceChildren(box.querySelector("legend"));
  lists.forEach((list, i) => {
    const label = Object.assign(document.createElement("label"), { className: "choice" });
    const input = Object.assign(document.createElement("input"), { type: "radio", name: "listId", value: list.id, checked: selected ? list.id === selected : i === 0 });
    const name = Object.assign(document.createElement("strong"), { textContent: list.name || "Untitled audience" });
    const count = Object.assign(document.createElement("span"), { textContent: `${Number(list.members ?? 0).toLocaleString()} ${list.members === 1 ? "person" : "people"}` });
    label.append(input, name, count);
    box.append(label);
  });
  $("#choose-hint").textContent = canCancel ? "Switching starts the new audience with everyone on your list." : "Readers are added here from now on.";
  $("#choose-cancel").hidden = !canCancel;
  $("#choose-problem").hidden = true;
  show("choose", { focus: true });
}

function showConnected(answer) {
  $("#audience-pill").textContent = answer.audience?.name ?? "";
  $("#added").textContent = Number(answer.added ?? 0).toLocaleString();
  $("#last-sync").textContent = answer.lastSyncAt ? since(answer.lastSyncAt) : "Within 15 minutes";
  const problem = answer.lastProblem?.words ? String(answer.lastProblem.words) : "";
  $("#last-problem").textContent = problem;
  $("#last-problem").hidden = !problem;
  $("#reconnect").hidden = !problem;
  $("#open").hidden = Boolean(problem);
  show("connected");
}

function render(answer) {
  current = answer;
  if (!answer.available) return show("soon");
  if (answer.stage === "choose") return showChoose(answer.lists ?? [], answer.audience?.id);
  if (answer.stage === "connected") return showConnected(answer);
  if (answer.stage === "mailchimp") return showConnect();
  goToPermission(answer.appId);
}

async function load() {
  if (!shopId) return fail("Open Mailchimp from Settings › Apps in your shop.");
  show("loading");
  try {
    current = await api("/mailchimp/status", { shopId });
    if (!current.available) return show("soon");
    if (from === "install") return goToMailchimp((await api("/mailchimp/begin", { shopId, code })).url);
    if (from === "mailchimp") {
      keep(AWAY_KEY, null);
      tidyAddress();
      if (!code) return showConnect("Mailchimp didn't connect. Press Connect Mailchimp to try again.");
      try {
        return render(await api("/mailchimp/finish", { shopId, code, state }));
      } catch (failure) {
        return showConnect(failure.message);
      }
    }
    render(current);
  } catch (failure) {
    fail(failure.message);
  }
}

for (const id of ["#connect", "#reconnect"]) $(id).addEventListener("click", async () => {
  const button = $(id);
  button.disabled = true;
  try {
    goToMailchimp((await api("/mailchimp/begin", { shopId })).url);
  } catch (failure) {
    showConnect(failure.message);
  } finally {
    button.disabled = false;
  }
});

$("#view-choose").addEventListener("submit", async (event) => {
  event.preventDefault();
  const listId = new FormData(event.target).get("listId");
  const problem = $("#choose-problem");
  if (!listId) {
    problem.textContent = "Pick an audience.";
    problem.hidden = false;
    return;
  }
  const button = $("#choose");
  button.disabled = true;
  status.textContent = "Saving…";
  try {
    render(await api("/mailchimp/audience", { shopId, listId }));
    status.textContent = "Saved. Your readers are on their way.";
  } catch (failure) {
    status.textContent = "";
    problem.textContent = failure.message;
    problem.hidden = false;
  } finally {
    button.disabled = false;
  }
});

$("#change").addEventListener("click", async () => {
  const button = $("#change");
  button.disabled = true;
  try {
    const { lists, current: selected } = await api("/mailchimp/lists", { shopId });
    showChoose(lists, selected, { canCancel: true });
  } catch (failure) {
    $("#last-problem").textContent = failure.message;
    $("#last-problem").hidden = false;
  } finally {
    button.disabled = false;
  }
});
$("#choose-cancel").addEventListener("click", () => showConnected(current));

$("#again").addEventListener("click", () => goToPermission(current.appId));
$("#disconnect").addEventListener("click", async () => {
  if (!window.confirm("Disconnect Mailchimp? New readers stop going there. Everyone already there stays.")) return;
  try {
    await api("/mailchimp/disconnect", { shopId });
    current = await api("/mailchimp/status", { shopId });
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
