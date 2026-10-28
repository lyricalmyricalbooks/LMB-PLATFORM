// The control room page (control-room/index.html): every shop with its plan, version, health and switches, an
// "Act as this shop" button, a switch for each feature, and the support requests to answer. Plain browser JavaScript with no framework, like the
// sign-up page. The server (control-room/routes.js) checks that the person is a platform admin, and asks for a reason
// that goes in the shop's log.
import { API_BASE, FIREBASE_SDK, PLATFORM_FIREBASE } from "../signup/config.js";

const { initializeApp } = await import(`${FIREBASE_SDK}/firebase-app.js`);
const { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup } = await import(`${FIREBASE_SDK}/firebase-auth.js`);

const auth = getAuth(initializeApp(PLATFORM_FIREBASE));
const $ = (selector) => document.querySelector(selector);
const status = $("#status");

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter(Boolean));
  return node;
}

async function api(method, path, body) {
  const token = auth.currentUser ? await auth.currentUser.getIdToken() : "";
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const answer = await response.json().catch(() => ({ ok: false, message: "The platform didn't answer. Try again." }));
  if (!response.ok || answer.ok === false) throw new Error(answer.message || "Something went wrong.");
  return answer;
}

const askWhy = (what) => (window.prompt(`${what}\n\nWhy? This goes in the shop's log (at least 10 characters).`) ?? "").trim();
const LEVEL = { problem: "Problem", watch: "Look", ok: "OK" };
const SWITCH_WORDS = {
  legacyStockroomSignIn: "Old stockroom sign-in",
  githubPagesForwarding: "Forward the old GitHub Pages address",
  gmailReceiptFinder: "Find receipts in Gmail",
  gmailOrderScan: "Scan Gmail for order receipts",
};

async function load() {
  status.textContent = "Loading…";
  try {
    const { shops } = await api("GET", "/control/shops");
    const problems = shops.filter((s) => s.health.level === "problem").length;
    $("#summary").textContent = `${shops.length} shops · ${problems} with a problem`;
    $("#shops").replaceChildren(...(shops.length ? shops.map(card) : [el("p", { textContent: "No shops yet." })]));
    status.textContent = "";
    $("#view-signin").hidden = true;
    $("#view-shops").hidden = false;
    await loadRepairs();
    await loadTickets();
  } catch (failure) {
    status.textContent = failure.message;
  }
}

function card(shop) {
  const act = el("button", { type: "button", textContent: "Act as this shop", disabled: shop.status !== "live" });
  act.addEventListener("click", async () => {
    const reason = askWhy(`Open ${shop.pressName}'s admin as support for 30 minutes.`);
    if (!reason) return;
    act.disabled = true;
    try {
      const { url } = await api("POST", "/control/act-as", { shopId: shop.shopId, reason });
      window.open(url, "_blank", "noopener");
      status.textContent = `Logged. ${shop.pressName}'s admin opened in a new tab.`;
    } catch (failure) {
      status.textContent = failure.message;
    }
    act.disabled = false;
  });

  // Self-checks now (2.11): what's off goes to the repair queue below.
  const check = el("button", { type: "button", textContent: "Check now", disabled: shop.status !== "live" });
  check.addEventListener("click", async () => {
    check.disabled = true;
    try {
      const { ok, results } = await api("POST", "/control/check", { shopId: shop.shopId });
      const fixed = results.filter((r) => r.fixed).length;
      const failing = results.filter((r) => !r.ok).length;
      await load();
      status.textContent = ok
        ? `${shop.pressName}: every self-check passes${fixed ? ` (${fixed} fixed itself)` : ""}.`
        : `${shop.pressName}: ${failing} problem${failing === 1 ? "" : "s"} sent to the repair queue.`;
    } catch (failure) {
      status.textContent = failure.message;
    }
    check.disabled = false;
  });

  const switches = shop.switches
    ? el("div", { className: "row" }, ...Object.entries(shop.switches).map(([name, on]) => {
      const box = el("input", { type: "checkbox", checked: on });
      box.addEventListener("change", async () => {
        const reason = askWhy(`Turn "${SWITCH_WORDS[name] ?? name}" ${box.checked ? "on" : "off"} for ${shop.pressName}. Its pages are deployed again.`);
        if (!reason) { box.checked = !box.checked; return; }
        box.disabled = true;
        try {
          await api("POST", "/control/switch", { shopId: shop.shopId, name, on: box.checked, reason });
          status.textContent = `${SWITCH_WORDS[name] ?? name} is ${box.checked ? "on" : "off"} for ${shop.pressName}.`;
        } catch (failure) {
          box.checked = !box.checked;
          status.textContent = failure.message;
        }
        box.disabled = false;
      });
      return el("label", { className: "switch" }, box, SWITCH_WORDS[name] ?? name);
    }))
    : null;

  return el("div", { className: `card ${shop.health.level}` },
    el("div", { className: "row" }, el("strong", { textContent: shop.pressName }), el("span", { className: "pill", textContent: LEVEL[shop.health.level] }), act, check),
    el("div", { className: "facts" },
      el("span", { textContent: shop.shopId }),
      el("span", { textContent: `plan: ${shop.plan ?? "?"}` }),
      el("span", { textContent: `version: ${shop.version ?? "none yet"}` }),
      el("span", { textContent: `status: ${shop.status ?? "?"}` }),
      shop.access ? el("span", { textContent: `billing: ${shop.access}` }) : null,
      shop.testShop ? el("span", { textContent: "test shop" }) : null),
    shop.health.reasons.length ? el("ul", {}, ...shop.health.reasons.map((reason) => el("li", { textContent: reason }))) : null,
    switches);
}

// ── The repair queue (control-room/repairs.js): mark an item fixed once a person has dealt with it. ──
let repairStatus = "open";
for (const button of document.querySelectorAll(".repair-filters button")) {
  button.addEventListener("click", () => {
    repairStatus = button.dataset.status;
    for (const other of document.querySelectorAll(".repair-filters button")) other.setAttribute("aria-pressed", String(other === button));
    loadRepairs();
  });
}

async function loadRepairs() {
  try {
    const { repairs } = await api("POST", "/control/repairs", { status: repairStatus });
    const empty = repairStatus === "open" ? "Nothing to fix." : "Nothing fixed yet.";
    $("#repairs").replaceChildren(...(repairs.length ? repairs.map(repairCard) : [el("p", { textContent: empty })]));
  } catch (failure) {
    status.textContent = failure.message;
  }
}

function repairCard(item) {
  const when = (at) => new Date(at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  const done = el("button", { type: "button", className: "primary", textContent: "Mark fixed", hidden: item.status !== "open" });
  done.addEventListener("click", async () => {
    const note = (window.prompt("What did you do? It goes in the shop's log.") ?? "").trim();
    if (!note) return;
    done.disabled = true;
    try {
      await api("POST", "/control/repairs/fixed", { id: item.id, note });
      await load();
      status.textContent = "Marked fixed.";
    } catch (failure) {
      status.textContent = failure.message;
      done.disabled = false;
    }
  });
  return el("div", { className: `card ${item.status === "open" ? "problem" : "ok"}` },
    el("div", { className: "row" }, el("strong", { textContent: item.problem }), el("span", { className: "pill", textContent: item.check }), done),
    el("div", { className: "facts" },
      el("span", { textContent: item.shopId }),
      el("span", { textContent: `seen ${item.count} time${item.count === 1 ? "" : "s"}, last ${when(item.lastSeenAt)}` }),
      item.fixedAt ? el("span", { textContent: `fixed ${when(item.fixedAt)} by ${item.fixedBy}` }) : null),
    item.detail ? el("p", { className: "hint", textContent: item.detail }) : null,
    item.note ? el("p", { className: "hint", textContent: `Note: ${item.note}` }) : null);
}

// ── Support requests (services/support): answer, and the press gets it by email; close when done. ──
let ticketStatus = "open";
for (const button of document.querySelectorAll(".filters button")) {
  button.addEventListener("click", () => {
    ticketStatus = button.dataset.status;
    for (const other of document.querySelectorAll(".filters button")) other.setAttribute("aria-pressed", String(other === button));
    loadTickets();
  });
}

async function loadTickets() {
  try {
    const { tickets } = await api("POST", "/control/support", { status: ticketStatus });
    $("#tickets").replaceChildren(...(tickets.length ? tickets.map(ticketCard) : [el("p", { textContent: "Nothing here." })]));
  } catch (failure) {
    status.textContent = failure.message;
  }
}

function ticketCard(ticket) {
  const when = (at) => new Date(at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  const answer = el("textarea", { maxLength: 5000 });
  answer.setAttribute("aria-label", `Answer to ${ticket.email}`);
  const send = el("button", { type: "button", className: "primary", textContent: "Send the answer" });
  send.addEventListener("click", async () => {
    send.disabled = true;
    try {
      await api("POST", "/control/support/answer", { id: ticket.id, body: answer.value });
      status.textContent = `Answer emailed to ${ticket.email}.`;
      await loadTickets();
    } catch (failure) {
      status.textContent = failure.message;
      send.disabled = false;
    }
  });
  const close = el("button", { type: "button", textContent: "Close", disabled: ticket.status === "closed" });
  close.addEventListener("click", async () => {
    close.disabled = true;
    try {
      await api("POST", "/control/support/close", { id: ticket.id });
      status.textContent = `Request ${ticket.id} closed.`;
      await loadTickets();
    } catch (failure) {
      status.textContent = failure.message;
      close.disabled = false;
    }
  });
  return el("div", { className: "card" },
    el("div", { className: "row" }, el("strong", { textContent: ticket.subject }), el("span", { className: "pill", textContent: ticket.status })),
    el("div", { className: "facts" },
      el("span", { textContent: ticket.id }), el("span", { textContent: ticket.email }),
      ticket.pressName ? el("span", { textContent: `${ticket.pressName} (${ticket.shopId})` }) : null,
      el("span", { textContent: `opened ${when(ticket.openedAt)}` })),
    ...ticket.messages.map((m) => el("div", { className: `message from-${m.from}` },
      el("div", { className: "facts", textContent: `${m.from === "press" ? ticket.email : m.by} · ${when(m.at)}` }),
      el("div", { textContent: m.body }))),
    answer, el("div", { className: "row" }, send, close));
}

$("#google").addEventListener("click", () => signInWithPopup(auth, new GoogleAuthProvider()).catch(() => { status.textContent = "Sign-in didn't finish."; }));
$("#refresh").addEventListener("click", load);
onAuthStateChanged(auth, (user) => {
  if (user) load();
  else { $("#view-signin").hidden = false; $("#view-shops").hidden = true; }
});
