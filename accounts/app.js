// The account page (accounts/index.html): one sign-in, every shop the person belongs to, and each shop's team for its
// owners. An invite link (?invite=…) is accepted once the invited address signs in. Plain browser JavaScript with no
// framework (docs/decisions.md); Firebase's own browser library is loaded from Google for sign-in only. The server
// (accounts/routes.js) checks everything again.
import { API_BASE, FIREBASE_SDK, PLATFORM_FIREBASE } from "../signup/config.js";
import { isEmail } from "../signup/form.js";
import { ROLES, ROLE_HINTS, ROLE_NAMES } from "./roles.js";
import { deviceId } from "../signup/device.js";
import { changingLines } from "./billingWords.js";

const { initializeApp } = await import(`${FIREBASE_SDK}/firebase-app.js`);
const {
  getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, isSignInWithEmailLink, signInWithEmailLink,
  getMultiFactorResolver, multiFactor, TotpMultiFactorGenerator,
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
  if (!response.ok || answer.ok === false) throw Object.assign(new Error(answer.message || "Something went wrong."), { problems: answer.problems, fix: answer.fix, helpLink: answer.helpLink });
  return answer;
}

// 14.4: the message, then what to do next, with a link to the exact help answer.
function showFailure(target, failure) {
  target.textContent = failure.message;
  if (!failure.fix) return;
  target.append(" ", failure.fix);
  if (failure.helpLink) {
    const link = document.createElement("a");
    link.href = failure.helpLink;
    link.textContent = "Read the help answer";
    target.append(" ", link);
  }
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
    if (error?.code === "auth/multi-factor-auth-required") {
      // This person turned on two-step sign-in (plan 14.1): ask for the code from their authenticator app.
      resolver = getMultiFactorResolver(auth, error);
      show("code");
      $("#code-form").code.focus();
    } else if (error?.code !== "auth/popup-closed-by-user") status.textContent = "Google sign-in didn't finish. Try again, or use an email link.";
  }
});

// ── Two-step sign-in (plan 14.1) ──
let resolver = null;
let setupSecret = null;
const WRONG_CODE = "That code didn't work. Codes change every 30 seconds: try the one on screen now.";
const clean = (value) => String(value).replace(/\s+/g, "");

$("#code-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const hint = resolver?.hints.find((h) => h.factorId === TotpMultiFactorGenerator.FACTOR_ID);
  if (!hint) { status.textContent = "Your account has no authenticator app set up. Ask for help."; return; }
  form.querySelector("button").disabled = true;
  try {
    await resolver.resolveSignIn(TotpMultiFactorGenerator.assertionForSignIn(hint.uid, clean(form.code.value)));
    form.reset();
    resolver = null;
    status.textContent = "";
  } catch {
    status.textContent = WRONG_CODE;
  }
  form.querySelector("button").disabled = false;
});

$("#open-twostep").addEventListener("click", async () => {
  try {
    setupSecret = await TotpMultiFactorGenerator.generateSecret(await multiFactor(auth.currentUser).getSession());
  } catch (error) {
    status.textContent = error?.code === "auth/requires-recent-login"
      ? "Sign in again, then set up two-step sign-in straight away."
      : "Two-step sign-in isn't switched on yet. Ask for help and we'll turn it on.";
    return;
  }
  const link = setupSecret.generateQrCodeUrl(auth.currentUser.email, "Colophon");
  $("#setup-key").textContent = setupSecret.secretKey.replace(/(.{4})/g, "$1 ").trim();
  $("#setup-link").href = link;
  try {
    const qr = window.qrcode(0, "M");
    qr.addData(link);
    qr.make();
    $("#setup-qr").replaceChildren(el("img", { src: qr.createDataURL(5, 2), alt: "Code to scan with your authenticator app" }));
  } catch {
    $("#setup-qr").textContent = "";
  }
  status.textContent = "";
  show("twostep");
});
$("#twostep-back").addEventListener("click", () => show("shops"));

$("#setup-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  form.querySelector("button").disabled = true;
  try {
    await multiFactor(auth.currentUser).enroll(TotpMultiFactorGenerator.assertionForEnrollment(setupSecret, clean(form.code.value)), "Authenticator app");
    form.reset();
    await signOut(auth);
    status.textContent = "Two-step sign-in is on. Sign in again, then type the code from the app.";
  } catch {
    status.textContent = WRONG_CODE;
  }
  form.querySelector("button").disabled = false;
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
    showFailure(error, failure);
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
const PLAN_NAMES = { shop: "Shop", stockroom: "Stockroom", both: "Website and stockroom" };
const DAY = 86_400_000;
const shortDay = (iso) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "long" });
const daysLeft = (iso) => Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / DAY));
let myShops = [];

/** Where a shop stands, in a few words and a tone, for its card and the strip at the top. */
function standing(shop) {
  if (shop.access === "paused") return { badge: "Paused", tone: "danger", line: "Paused until a card is added. Shoppers see a \"back soon\" page; everything is kept for 60 days." };
  if (shop.access === "closed") return { badge: "Closed", tone: "neutral", line: "Closed." };
  if (shop.status !== "live") return { badge: "Being made", tone: "info", line: "Still being made. It's usually ready in a minute or two." };
  const plan = shop.billing;
  if (plan?.status === "trialing" && plan.trialEnd) {
    const left = daysLeft(plan.trialEnd);
    return { badge: "Free trial", tone: "info", line: `Free trial: ${left} ${left === 1 ? "day" : "days"} left, until ${shortDay(plan.trialEnd)}.${plan.hasCard ? "" : " Add a card to keep it open after that."}`, trialLeft: left };
  }
  if (plan?.cancelAtPeriodEnd && plan.currentPeriodEnd) return { badge: "Cancelled", tone: "warning", line: `Open until ${shortDay(plan.currentPeriodEnd)}, then the plan ends.` };
  if (plan?.currentPeriodEnd) return { badge: "Live", tone: "success", line: `Next bill ${shortDay(plan.currentPeriodEnd)}.` };
  return { badge: "Live", tone: "success", line: "" };
}

function renderLedger(shops) {
  const states = shops.map(standing);
  const needs = shops.filter((shop) => shop.access === "paused");
  // The trial that ends first, as a mint tile whose bar runs down.
  const trials = shops.map((shop, i) => ({ shop, left: states[i].trialLeft })).filter((t) => t.left !== undefined).sort((a, b) => a.left - b.left);
  const ledger = $("#ledger");
  ledger.replaceChildren(...trials.slice(0, 1).map(({ shop, left }) => {
    const bar = el("div", { className: "cp-bar", role: "img" }, el("i", { style: `width:${Math.round((Math.max(0, Math.min(14, left)) / 14) * 100)}%` }));
    bar.setAttribute("aria-label", `${left} of 14 trial days left`);
    return el("div", { className: "card cp-tone-mint" },
      el("p", { className: "cp-kicker", textContent: `Free trial · ${shop.pressName}` }),
      el("p", { className: "cp-big" }, String(left), el("small", { textContent: left === 1 ? "day left" : "days left" })),
      bar);
  }));
  ledger.hidden = !trials.length;
  // One tile per shop that needs its owner, with the button that fixes it.
  $("#shop-alerts").replaceChildren(...needs.filter((shop) => shop.role === "owner").map((shop) => el("div", { className: "card cp-tone-apricot", role: "alert" },
    el("p", { className: "cp-kicker", textContent: "Paused" }),
    el("h3", { textContent: shop.pressName }),
    el("p", { className: "hint", textContent: "Its plan payment didn't go through, so shoppers see a \"back soon\" page. Add a card and it opens again straight away." }),
    el("div", { className: "cp-actions cp-start" }, el("a", { className: "button primary", href: `/account/billing?shop=${encodeURIComponent(shop.shopId)}`, textContent: "Add a card" })))));
}

/** The hero tile's two lines: a greeting, then how many shops and what needs a look. */
function headline(shops) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const count = shops.length === 1 ? "One shop." : `${shops.length} shops.`;
  const paused = shops.filter((shop) => shop.access === "paused").length;
  const making = shops.filter((shop) => shop.status !== "live" && shop.access !== "closed").length;
  const then = paused ? `${paused === 1 ? "One needs" : `${paused} need`} a new card.`
    : making ? `${making === 1 ? "One is" : `${making} are`} being made.`
    : "All running.";
  return { greeting, count, then };
}

async function loadShops() {
  const { email, shops } = await api("GET", "/accounts/shops");
  myShops = shops;
  $("#me").textContent = email;
  const who = $("#topbar-who");
  who.textContent = (email.trim()[0] ?? "").toUpperCase();
  who.setAttribute("aria-label", `Signed in as ${email}`);
  who.title = `Signed in as ${email}`;
  const words = headline(shops);
  $("#greeting").textContent = words.greeting;
  $("#shops-title").replaceChildren(shops.length ? words.count : "No shops yet.", ...(shops.length ? [el("br"), words.then] : []));
  const list = $("#shops");
  if (!shops.length) {
    list.replaceChildren(el("div", { className: "empty" }, "You're not on any shop's team yet. ", el("a", { href: "../signup/", textContent: "Start a shop" }), ", or ask a shop's owner to invite you."));
  } else {
    list.replaceChildren(...shops.map(shopCard));
  }
  renderLedger(shops);
  await loadRecoveryAlerts().catch(() => {});
  await loadAccessRequests().catch(() => {});
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
      showFailure(status, failure);
      open.disabled = false;
    }
  });
  const actions = el("div", { className: "cp-actions" }, open);
  if (shop.role === "owner") {
    const team = el("button", { type: "button", textContent: "Team" });
    team.addEventListener("click", () => openTeam(shop));
    // The Plan & billing page (accounts/billing.html, served at /account/billing).
    const plan = el("a", { className: "button", href: `/account/billing?shop=${encodeURIComponent(shop.shopId)}`, textContent: "Billing" });
    plan.setAttribute("aria-label", `Plan & billing for ${shop.pressName}`);
    const checkShop = el("button", { type: "button", textContent: "Check my shop" });
    checkShop.addEventListener("click", () => openCheck(shop));
    // Open and Plan & billing stay in sight; the rest sits in one More menu, as the big shop builders do.
    actions.append(plan, moreMenu(shop, [team, checkShop, dataButton(shop)]));
  }
  const where = standing(shop);
  // The website's address, or the stockroom's for a press with the stockroom alone.
  const place = shop.siteUrl ?? shop.stockroomUrl;
  const address = place ? place.replace(/^https?:\/\//, "") : "";
  // The free address once it's set up, unless it's already the address shown.
  const free = shop.freeAddress && shop.freeAddress !== address ? `${shop.freeAddress}${shop.freeAddressLive ? "" : " · setting up"}` : "";
  const meta = el("div", { className: "cp-meta" },
    address ? el("span", { textContent: address }) : null,
    free ? el("span", { textContent: free }) : null,
    shop.plan ? el("span", { textContent: `${PLAN_NAMES[shop.plan] ?? shop.plan} plan` }) : null);
  let trial = null;
  if (where.trialLeft !== undefined) {
    // The bar shows the days left, so a new trial reads as a full bar that runs down.
    trial = el("div", { className: "cp-bar", role: "img" }, el("i", { style: `width:${Math.round((Math.max(0, Math.min(14, where.trialLeft)) / 14) * 100)}%` }));
    trial.setAttribute("aria-label", `${where.trialLeft} of 14 trial days left`);
  }
  const badge = el("span", { className: "pill", textContent: where.badge });
  badge.dataset.tone = where.tone;
  const thumb = el("div", { className: "cp-thumb", textContent: (shop.pressName.trim()[0] ?? "?").toUpperCase() });
  thumb.setAttribute("aria-hidden", "true");
  if (shop.access === "paused") thumb.dataset.tone = "primary";
  return el("div", { className: "cp-shop" },
    thumb,
    el("div", {},
      el("h3", {}, shop.pressName, " ", badge, el("span", { className: "pill", textContent: ROLE_NAMES[shop.role] ?? shop.role })),
      meta,
      where.line ? el("p", { className: "hint", style: "margin-top:6px", textContent: where.line }) : null,
      ...changingLines(shop).map((line) => el("p", { className: "hint", style: "margin-top:6px", textContent: line })),
      trial),
    actions);
}

/** A shop's More menu: a press-to-open list of its less-used actions. Closes on a choice, Escape or a press outside. */
function moreMenu(shop, items) {
  const menu = el("details", { className: "cp-more" },
    el("summary", { className: "button", textContent: "···" }),
    el("div", { className: "cp-more-list", role: "group" }, ...items));
  menu.querySelector("summary").setAttribute("aria-label", `More for ${shop.pressName}`);
  for (const item of items) item.addEventListener("click", () => { menu.open = false; });
  menu.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !menu.open) return;
    menu.open = false;
    menu.querySelector("summary").focus();
  });
  return menu;
}
document.addEventListener("click", (event) => {
  for (const menu of document.querySelectorAll("details.cp-more[open]")) if (!menu.contains(event.target)) menu.open = false;
});

// The rail's links that open a view on this page (Get help) press its button.
for (const link of document.querySelectorAll("[data-press]")) {
  link.addEventListener("click", (event) => {
    const target = $(link.dataset.press);
    if (!target || target.closest("[hidden]")) return;
    event.preventDefault();
    target.click();
  });
}

// ── Check my shop (plan 14.3) ──
$("#checkshop-back").addEventListener("click", () => show("shops"));
// Help opens on the answers for this shop's plan (help/index.html reads ?plan=).
const helpFor = (shop) => (["shop", "stockroom", "both"].includes(shop?.plan) ? `../help/?plan=${shop.plan}` : "../help/");
const FIX_TO = (shop, to) => (to === "billing" ? `/account/billing?shop=${encodeURIComponent(shop.shopId)}` : to === "admin" ? `${shop.siteUrl ?? ""}/admin` : helpFor(shop));
async function openCheck(shop) {
  status.textContent = "Checking your shop…";
  try {
    const { ok, results } = await api("POST", "/accounts/check", { shopId: shop.shopId });
    $("#checkshop-title").textContent = `${shop.pressName}: check my shop`;
    $("#checkshop-summary").textContent = ok ? "Everything we can check looks good." : "A few things need your attention.";
    $("#checkshop-list").replaceChildren(...results.map((r) => {
      const mark = el("span", { className: "pill", textContent: r.state === "ok" ? "Good" : r.state === "fix" ? "Needs you" : "Can't tell yet" });
      mark.dataset.tone = r.state === "ok" ? "success" : r.state === "fix" ? "warning" : "neutral";
      return el("li", {}, el("div", {}, el("strong", { textContent: r.title }), " ", mark, el("p", { className: "hint", textContent: r.words })),
        r.fix ? el("a", { className: "button", href: FIX_TO(shop, r.fix.to), textContent: r.fix.label }) : null);
    }));
    status.textContent = "";
    show("check-shop");
  } catch (failure) {
    showFailure(status, failure);
  }
}

// ── One shop's team ──
let current = null;
$("#back").addEventListener("click", () => loadShops().catch((failure) => { showFailure(status, failure); }));
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
  // The address the shop was started with is always its owner (it can't be changed or removed), so its row has no controls.
  if (member.signupOwner) return el("li", { className: "row" }, el("span", { textContent: member.email }), el("span", { className: "hint", textContent: "Owner · the address the shop was started with" }));
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
    showFailure(status, failure);
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
$("#open-help").addEventListener("click", () => openHelp().catch((failure) => { showFailure(status, failure); }));
$("#help-back").addEventListener("click", () => loadShops().catch((failure) => { showFailure(status, failure); }));

// The Get help links on the help, status and billing pages land on /account/#get-help: once signed in, that opens
// the help form (the hash is cleared, so Back to your shops and a reload show the shops as usual).
function openHelpFromLink() {
  if (location.hash !== "#get-help" || !auth.currentUser) return;
  history.replaceState(null, "", location.pathname + location.search);
  openHelp().catch((failure) => { showFailure(status, failure); });
}
addEventListener("hashchange", openHelpFromLink);

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
    if (!Object.keys(problems).length) showFailure(status, failure);
  } finally {
    button.disabled = false;
  }
});

// ── Account recovery (accounts/recovery.js) ──
const RECOVERY_WORDS = { waiting: "Waiting for a person to check", approved: "Approved, waiting", denied: "Not moved", cancelled: "Stopped by the old address", withdrawn: "You withdrew it", applied: "Moved" };
const day = (at) => new Date(at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
$("#open-recovery").addEventListener("click", () => openRecovery().catch((failure) => { showFailure(status, failure); }));
$("#recovery-back").addEventListener("click", () => loadShops().catch((failure) => { showFailure(status, failure); }));

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
        showFailure(status, failure);
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
        showFailure(status, failure);
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
    if (!Object.keys(problems).length) showFailure(status, failure);
  } finally {
    button.disabled = false;
  }
});

// ── Delete my account (accounts/deleteAccount.js) ──
$("#open-delete").addEventListener("click", () => openDelete().catch((failure) => { showFailure(status, failure); }));
$("#delete-back").addEventListener("click", () => loadShops().catch((failure) => { showFailure(status, failure); }));

async function openDelete() {
  const { email, leaving, blockers } = await api("GET", "/accounts/delete-check");
  $("#delete-email").textContent = email;
  $("#delete-teams").textContent = leaving.length
    ? `You leave the team of ${leaving.map((shop) => shop.pressName).join(", ")}.`
    : "You're not on any shop's team, so no shop changes.";
  $("#delete-blockers").replaceChildren(...blockers.map((shop) => el("div", { className: "card warning", role: "alert" },
    el("strong", { textContent: shop.making ? `${shop.pressName} is still being made` : `You're the only owner of ${shop.pressName}` }),
    el("p", { style: "margin:0", textContent: shop.making
      ? "You'll be its only owner. Wait until it's ready, then make someone else an owner from Team, or close the shop, and come back."
      : "A shop always needs an owner. Make someone else an owner from Team, or close the shop, then come back." }))));
  deleteBlocked = blockers.length > 0;
  $("#delete-form").reset();
  matchDeleteEmail();
  show("delete");
}

// The red button wakes only once the typed address matches the account's (and nothing blocks the delete).
let deleteBlocked = false;
function matchDeleteEmail() {
  const typed = $("#delete-form").confirmEmail.value.trim().toLowerCase();
  $("#delete-submit").disabled = deleteBlocked || !typed || typed !== $("#delete-email").textContent.trim().toLowerCase();
}
$("#delete-form").confirmEmail.addEventListener("input", matchDeleteEmail);

$("#delete-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  const button = $("#delete-submit");
  button.disabled = true;
  try {
    await api("POST", "/accounts/delete-me", { confirmEmail: form.confirmEmail.value });
    await signOut(auth).catch(() => {});
    show("signin");
    status.textContent = "Your account is deleted. We've sent a short note to your email address.";
  } catch (failure) {
    showFailure(status, failure);
    matchDeleteEmail();
  }
});

// ── Where to start ──
async function openShops() {
  show("loading");
  try {
    await loadShops();
  } catch (failure) {
    showFailure($("#error-words"), failure);
    show("error");
  }
}
$("#retry").addEventListener("click", openShops);

onAuthStateChanged(auth, async (user) => {
  if (!user) return show("signin");
  show("loading");
  const invite = stored(INVITE_KEY);
  if (invite) {
    try {
      await api("POST", "/accounts/accept", { invite });
      status.textContent = "You've joined the team.";
      store(INVITE_KEY, "");
    } catch (failure) {
      showFailure(status, failure);
      // Keep it only when signing in with another address could still accept it.
      if (!/Sign in with that address/.test(failure.message)) store(INVITE_KEY, "");
    }
  }
  await openShops();
  openHelpFromLink();
});

// ── Colophon support asks before making changes (plan 19.6): approve or decline, and the shop's past support visits. ──
async function loadAccessRequests() {
  const owned = myShops.filter((shop) => shop.role === "owner" && shop.status === "live");
  const cards = [];
  for (const shop of owned) {
    const { requests, visits } = await api("GET", `/account/access-requests?shopId=${encodeURIComponent(shop.shopId)}`);
    const waiting = requests.filter((request) => request.status === "waiting");
    if (!waiting.length && !visits.length) continue;
    cards.push(accessCard(shop, waiting, visits));
  }
  $("#access-requests").replaceChildren(...cards);
}

function accessCard(shop, waiting, visits) {
  const asks = waiting.map((request) => {
    const answer = (approve) => async (event) => {
      event.currentTarget.disabled = true;
      try {
        await api("POST", "/account/access-requests/answer", { id: request.id, approve });
        status.textContent = approve
          ? `Approved. ${request.by} can open ${shop.pressName}'s admin once, for 30 minutes, within the day. It goes in your shop's log.`
          : "Declined. Nobody can make changes in your shop on that request.";
      } catch (failure) {
        showFailure(status, failure);
      }
      await loadAccessRequests().catch(() => {});
    };
    const yes = el("button", { type: "button", className: "primary", textContent: "Approve" });
    yes.addEventListener("click", answer(true));
    const no = el("button", { type: "button", textContent: "Decline" });
    no.addEventListener("click", answer(false));
    return el("div", { className: "card warning", role: "alert" },
      el("strong", { textContent: `Colophon support asks to make changes in ${shop.pressName}` }),
      el("p", { style: "margin:0", textContent: `${request.by} would like to open your admin for 30 minutes, able to make changes. Why: ${request.reason}. Answer by ${day(request.expiresAt)}; nothing changes unless you say yes.` }),
      el("div", { className: "row" }, yes, no));
  });
  const visitList = visits.length
    ? el("ul", { className: "list" }, ...visits.map((visit) => el("li", { className: "hint", textContent: `${day(visit.at)} · ${visit.by} · ${visit.mode === "edit" ? "made changes" : "looked only"} · ${visit.reason}` })))
    : null;
  return el("div", { className: "card stack" },
    el("h3", { textContent: `${shop.pressName}: support visits` }),
    ...asks,
    visitList ? el("p", { className: "hint", style: "margin:0", textContent: "The last visits from Colophon support, newest first:" }) : null,
    visitList);
}

// ── All your data (plan 19.16): every file of the shop and stockroom, with a link emailed to the owner. Once a day. ──
function dataButton(shop) {
  const data = el("button", { type: "button", className: "ghost", textContent: "Download all your data" });
  data.addEventListener("click", async () => {
    // What the copy holds follows the plan: a press with the stockroom alone has no website orders or customers.
    // An app the plan dropped stays in the copy while its 90 days to download last (shop.closed).
    const has = (app) => shop.plan !== (app === "shop" ? "stockroom" : "shop") || (shop.closed ?? []).some((c) => c.app === app);
    const what = !has("shop") ? "books, stock, sales and settings" : !has("stockroom") ? "books, orders, customers and settings" : "books, orders, customers, stockroom and settings";
    if (!window.confirm(`We'll gather everything in ${shop.pressName} (${what}) and email you a link that works for 7 days. Go ahead?`)) return;
    data.disabled = true;
    status.textContent = "Gathering your data…";
    try {
      const { emailedTo } = await api("POST", "/account/export", { shopId: shop.shopId });
      status.textContent = `Done. We've emailed the link to ${emailedTo}. It works for 7 days.`;
    } catch (failure) {
      status.textContent = failure.message;
    }
    data.disabled = false;
  });
  return data;
}
