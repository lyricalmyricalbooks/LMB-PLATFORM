// The account page (accounts/index.html): one sign-in, every shop the person belongs to, and each shop's team for its
// owners. An invite link (?invite=…) is accepted once the invited address signs in. Plain browser JavaScript with no
// framework (docs/decisions.md); Firebase's own browser library is loaded from Google for sign-in only. The server
// (accounts/routes.js) checks everything again.
import { API_BASE, FIREBASE_SDK, PLATFORM_FIREBASE } from "../signup/config.js";
import { isEmail } from "../signup/form.js";
import { ROLES, ROLE_HINTS, ROLE_NAMES } from "./roles.js";
import { deviceId } from "../signup/device.js";

const { initializeApp } = await import(`${FIREBASE_SDK}/firebase-app.js`);
const {
  getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, isSignInWithEmailLink, signInWithEmailLink,
} = await import(`${FIREBASE_SDK}/firebase-auth.js`);

const auth = getAuth(initializeApp(PLATFORM_FIREBASE));
const $ = (selector) => document.querySelector(selector);
const status = $("#status");
const EMAIL_KEY = "colophon.signin.email";
const INVITE_KEY = "colophon.invite";
const store = (key, value) => { try { value ? localStorage.setItem(key, value) : localStorage.removeItem(key); } catch {} };
const stored = (key) => { try { return localStorage.getItem(key) || ""; } catch { return ""; } };
function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter(Boolean));
  return node;
}

function show(view) {
  for (const section of document.querySelectorAll("main > section")) section.hidden = section.id !== `view-${view}`;
  $(`#view-${view} h2`)?.focus?.();
}

async function api(method, path, body) {
  const token = auth.currentUser ? await auth.currentUser.getIdToken() : "";
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}`, "X-Device-Id": deviceId() } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const answer = await response.json().catch(() => ({ ok: false, message: "We couldn't reach Colophon. Check your connection and try again." }));
  if (!response.ok || answer.ok === false) throw Object.assign(new Error(answer.message || "Something went wrong."), { problems: answer.problems });
  return answer;
}

// An invite link: keep its secret through sign-in (an emailed sign-in link comes back without it).
const params = new URLSearchParams(location.search);
if (params.get("invite")) {
  store(INVITE_KEY, params.get("invite"));
  history.replaceState(null, "", location.pathname);
}
$("#invite-hint").hidden = !stored(INVITE_KEY);

// ── Sign in ──
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
    await api("POST", "/signin-link", { email, page: "accounts" });
    store(EMAIL_KEY, email);
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
$("#sign-out").addEventListener("click", () => signOut(auth));

if (isSignInWithEmailLink(auth, location.href)) {
  const email = stored(EMAIL_KEY) || window.prompt("Which email address did you use?") || "";
  try {
    await signInWithEmailLink(auth, email, location.href);
    store(EMAIL_KEY, "");
    history.replaceState(null, "", location.pathname);
  } catch {
    status.textContent = "That link has run out or was already used. Ask for a new one.";
  }
}

// ── The shop switcher ──
const ACCESS_WORDS = { paused: "Paused until a card is added", closed: "Closed" };
let myShops = [];

async function loadShops() {
  const { email, shops } = await api("GET", "/accounts/shops");
  myShops = shops;
  $("#me").textContent = email;
  const list = $("#shops");
  if (!shops.length) {
    list.replaceChildren(el("p", { className: "empty", textContent: "You're not on any shop's team yet. Start a shop, or ask a shop's owner to invite you." }));
  } else {
    list.replaceChildren(...shops.map(shopCard));
  }
  await loadRecoveryAlerts().catch(() => {});
  show("shops");
}

function shopCard(shop) {
  const open = el("button", { type: "button", className: "primary", textContent: shop.role === "author" ? "Open the stockroom" : "Open" });
  open.addEventListener("click", async () => {
    open.disabled = true;
    try {
      const { url } = await api("POST", "/accounts/switch", { shopId: shop.shopId });
      location.assign(url);
    } catch (failure) {
      status.textContent = failure.message;
      open.disabled = false;
    }
  });
  const actions = el("div", { className: "row" }, open);
  if (shop.role === "owner") {
    const team = el("button", { type: "button", textContent: "Team" });
    team.addEventListener("click", () => openTeam(shop));
    actions.append(team);
  }
  const state = ACCESS_WORDS[shop.access] ?? (shop.status === "live" ? "" : "Still being made");
  return el("div", { className: "card" },
    el("div", { className: "row" }, el("strong", { textContent: shop.pressName }), el("span", { className: "pill", textContent: ROLE_NAMES[shop.role] ?? shop.role })),
    state ? el("p", { className: "hint", textContent: state }) : null,
    actions);
}

// ── One shop's team ──
let current = null;
$("#back").addEventListener("click", () => loadShops().catch((failure) => { status.textContent = failure.message; }));
$("#invite-role").replaceChildren(...ROLES.map((role) => new Option(ROLE_NAMES[role], role, role === "staff", role === "staff")));
const roleHint = () => { $("#role-hint").textContent = ROLE_HINTS[$("#invite-role").value]; };
$("#invite-role").addEventListener("change", roleHint);
roleHint();

async function openTeam(shop) {
  current = shop;
  $("#team-title").textContent = `${shop.pressName}: team`;
  await loadTeam();
  show("team");
}

async function loadTeam() {
  const { members, invites } = await api("POST", "/accounts/team", { shopId: current.shopId });
  $("#members").replaceChildren(...members.map(memberRow));
  $("#invites").replaceChildren(...(invites.length ? invites.map(inviteRow) : [el("li", { className: "hint", textContent: "No invites waiting." })]));
}

function memberRow(member) {
  const select = el("select", {}, ...ROLES.map((role) => new Option(ROLE_NAMES[role], role, false, role === member.role)));
  select.setAttribute("aria-label", `Role for ${member.email}`);
  select.addEventListener("change", () => act(select, "/accounts/role", { email: member.email, role: select.value }, `${member.email} is now ${ROLE_NAMES[select.value]}.`));
  const remove = el("button", { type: "button", className: "ghost danger", textContent: "Remove" });
  remove.addEventListener("click", () => {
    if (window.confirm(`Take ${member.email} off the team? They lose access straight away.`)) act(remove, "/accounts/remove", { email: member.email }, `${member.email} is off the team.`);
  });
  return el("li", { className: "row" }, el("span", { textContent: member.email }), select, remove);
}

function inviteRow(invite) {
  const cancel = el("button", { type: "button", className: "ghost", textContent: "Cancel invite" });
  cancel.addEventListener("click", () => act(cancel, "/accounts/cancel-invite", { id: invite.id }, `The invite to ${invite.email} is cancelled.`));
  const until = new Date(invite.expiresAt).toLocaleDateString(undefined, { day: "numeric", month: "long" });
  return el("li", { className: "row" }, el("span", { textContent: `${invite.email} · ${ROLE_NAMES[invite.role]} · works until ${until}` }), cancel);
}

async function act(control, path, body, done) {
  control.disabled = true;
  try {
    await api("POST", path, { shopId: current.shopId, ...body });
    status.textContent = done;
  } catch (failure) {
    status.textContent = failure.message;
  }
  control.disabled = false;
  await loadTeam().catch(() => {});
}

$("#invite-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  const email = form.email.value.trim();
  const problem = form.querySelector('[data-problem="email"]');
  problem.hidden = isEmail(email);
  problem.textContent = "Enter the email address to invite.";
  if (!problem.hidden) return;
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    await api("POST", "/accounts/invite", { shopId: current.shopId, email, role: form.role.value });
    status.textContent = `Invite sent to ${email}.`;
    form.email.value = "";
    await loadTeam();
  } catch (failure) {
    problem.textContent = failure.problems?.email ?? failure.message;
    problem.hidden = false;
  } finally {
    button.disabled = false;
  }
});

// ── Get help (services/support) ──
const STATUS_WORDS = { open: "Waiting for an answer", answered: "Answered", closed: "Closed" };
$("#open-help").addEventListener("click", () => openHelp().catch((failure) => { status.textContent = failure.message; }));
$("#help-back").addEventListener("click", () => loadShops().catch((failure) => { status.textContent = failure.message; }));

async function openHelp() {
  $("#help-shop").replaceChildren(new Option("Not about one shop", ""), ...myShops.map((shop) => new Option(shop.pressName, shop.shopId)));
  if (myShops.length === 1) $("#help-shop").value = myShops[0].shopId;
  await loadTickets();
  show("help");
}

async function loadTickets() {
  const { tickets } = await api("GET", "/support/mine");
  $("#tickets").replaceChildren(...(tickets.length ? tickets.map(ticketCard) : [el("p", { className: "empty", textContent: "No requests yet." })]));
}

function ticketCard(ticket) {
  const when = (at) => new Date(at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  const messages = ticket.messages.map((m) => el("div", { className: `message from-${m.from}` },
    el("p", { className: "hint", textContent: `${m.from === "you" ? "You" : "Colophon support"} · ${when(m.at)}` }),
    el("p", { textContent: m.body, style: "margin:0" })));
  const more = el("form", { className: "stack", noValidate: true },
    el("label", {}, "Add to this request", el("textarea", { name: "body", maxLength: 5000, required: true })),
    el("p", { className: "error", hidden: true, role: "alert" }),
    el("button", { type: "submit", textContent: "Send" }));
  more.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = more.querySelector("button");
    const problem = more.querySelector(".error");
    button.disabled = true;
    try {
      await api("POST", "/support/add", { id: ticket.id, body: more.body.value });
      status.textContent = "Sent. We'll answer by email.";
      await loadTickets();
    } catch (failure) {
      problem.textContent = failure.problems?.body ?? failure.message;
      problem.hidden = false;
      button.disabled = false;
    }
  });
  return el("div", { className: "card" },
    el("div", { className: "row" }, el("strong", { textContent: ticket.subject }), el("span", { className: "pill", textContent: STATUS_WORDS[ticket.status] ?? ticket.status })),
    el("p", { className: "hint", textContent: `Request ${ticket.id}${ticket.pressName ? ` · ${ticket.pressName}` : ""}` }),
    ...messages, more);
}

$("#help-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  const button = form.querySelector("button[type=submit]");
  for (const p of form.querySelectorAll("[data-problem]")) p.hidden = true;
  button.disabled = true;
  // The same id on a retry, so pressing Send twice makes one request.
  form.dataset.requestId ||= crypto.randomUUID();
  try {
    await api("POST", "/support/open", { shopId: form.shopId.value || undefined, subject: form.subject.value, body: form.body.value, requestId: form.dataset.requestId });
    status.textContent = "Sent. We've emailed you a copy, and we'll answer by email.";
    form.reset();
    delete form.dataset.requestId;
    await loadTickets();
  } catch (failure) {
    const problems = failure.problems ?? {};
    for (const [field, words] of Object.entries(problems)) {
      const p = form.querySelector(`[data-problem="${field}"]`);
      if (p) { p.textContent = words; p.hidden = false; }
    }
    if (!Object.keys(problems).length) status.textContent = failure.message;
  } finally {
    button.disabled = false;
  }
});

// ── Account recovery (accounts/recovery.js) ──
const RECOVERY_WORDS = { waiting: "Waiting for a person to check", approved: "Approved, waiting", denied: "Not moved", cancelled: "Stopped by the old address", withdrawn: "You withdrew it", applied: "Moved" };
const day = (at) => new Date(at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
$("#open-recovery").addEventListener("click", () => openRecovery().catch((failure) => { status.textContent = failure.message; }));
$("#recovery-back").addEventListener("click", () => loadShops().catch((failure) => { status.textContent = failure.message; }));

/** Someone asked to move THIS account away: say so first, with a way to stop it. */
async function loadRecoveryAlerts() {
  const { againstMe } = await api("GET", "/recovery/mine");
  $("#recovery-alerts").replaceChildren(...againstMe.map((request) => {
    const stop = el("button", { type: "button", className: "primary", textContent: "Stop this request" });
    stop.addEventListener("click", async () => {
      stop.disabled = true;
      try {
        await api("POST", "/recovery/cancel", { id: request.id });
        status.textContent = "Stopped. Nothing has moved, and we've told our team.";
        await loadRecoveryAlerts();
      } catch (failure) {
        status.textContent = failure.message;
        stop.disabled = false;
      }
    });
    const waiting = request.holdUntil ? ` It's approved and moves after ${day(request.holdUntil)} unless you stop it.` : "";
    return el("div", { className: "card warning", role: "alert" },
      el("strong", { textContent: "Someone asked to move your account" }),
      el("p", { style: "margin:0", textContent: `${request.requesterEmail} asked on ${day(request.askedAt)} to move this account to their address.${waiting} If that wasn't you, stop it.` }),
      el("div", { className: "row" }, stop));
  }));
}

async function openRecovery() {
  await loadRecoveries();
  show("recovery");
}

async function loadRecoveries() {
  const { asked } = await api("GET", "/recovery/mine");
  $("#recoveries").replaceChildren(...(asked.length ? asked.map(recoveryCard) : [el("p", { className: "empty", textContent: "No requests yet." })]));
}

function recoveryCard(request) {
  const card = el("div", { className: "card" },
    el("div", { className: "row" }, el("strong", { textContent: request.oldEmail }), el("span", { className: "pill", textContent: RECOVERY_WORDS[request.status] ?? request.status })),
    el("p", { className: "hint", textContent: `Asked ${day(request.askedAt)}${request.holdUntil && request.status === "approved" ? ` · moves after ${day(request.holdUntil)}` : ""}` }),
    request.reason ? el("p", { style: "margin:0", textContent: request.reason }) : null);
  if (request.status === "waiting" || request.status === "approved") {
    const withdraw = el("button", { type: "button", className: "ghost", textContent: "Withdraw this request" });
    withdraw.addEventListener("click", async () => {
      withdraw.disabled = true;
      try {
        await api("POST", "/recovery/cancel", { id: request.id });
        status.textContent = "Withdrawn.";
        await loadRecoveries();
      } catch (failure) {
        status.textContent = failure.message;
        withdraw.disabled = false;
      }
    });
    card.append(withdraw);
  }
  return card;
}

$("#recovery-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  const button = form.querySelector("button[type=submit]");
  for (const p of form.querySelectorAll("[data-problem]")) p.hidden = true;
  button.disabled = true;
  try {
    await api("POST", "/recovery/ask", { oldEmail: form.oldEmail.value, details: form.details.value });
    status.textContent = "Sent. We've emailed you a copy, and a person will look at it.";
    form.reset();
    await loadRecoveries();
  } catch (failure) {
    const problems = failure.problems ?? {};
    for (const [field, words] of Object.entries(problems)) {
      const p = form.querySelector(`[data-problem="${field}"]`);
      if (p) { p.textContent = words; p.hidden = false; }
    }
    if (!Object.keys(problems).length) status.textContent = failure.message;
  } finally {
    button.disabled = false;
  }
});

// ── Where to start ──
onAuthStateChanged(auth, async (user) => {
  if (!user) return show("signin");
  const invite = stored(INVITE_KEY);
  if (invite) {
    try {
      await api("POST", "/accounts/accept", { invite });
      status.textContent = "You've joined the team.";
      store(INVITE_KEY, "");
    } catch (failure) {
      status.textContent = failure.message;
      // Keep it only when signing in with another address could still accept it.
      if (!/Sign in with that address/.test(failure.message)) store(INVITE_KEY, "");
    }
  }
  try {
    await loadShops();
  } catch (failure) {
    status.textContent = failure.message;
  }
});
