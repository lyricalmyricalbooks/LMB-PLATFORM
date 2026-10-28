// The control room page (control-room/index.html): every shop with its plan, version, health and switches, an
// "Act as this shop" button, a switch for each feature, and the support requests to answer. Plain browser JavaScript with no framework, like the
// sign-up page. The server (control-room/routes.js) checks that the person is a platform admin, and asks for a reason
// that goes in the shop's log.
import { API_BASE, FIREBASE_SDK, PLATFORM_FIREBASE } from "../signup/config.js";
import { deviceId } from "../signup/device.js";

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
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}`, "X-Device-Id": deviceId() } : {}) },
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
  oldShopSync: "Old shop system tab and missing-orders check",
};

async function load() {
  status.textContent = "Loading…";
  // The backup person (plan 8.7) sees only the run book; a platform admin sees it below everything else.
  let role = null;
  try {
    role = (await loadEmergency()).role;
  } catch {
    // Neither an admin nor the backup person: the shops call below says so.
  }
  if (role === "backup") {
    status.textContent = "";
    $("#view-signin").hidden = true;
    $("#view-shops").hidden = true;
    return;
  }
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
    await loadRecoveries();
    await loadBreaches();
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

  // Close for abuse (plan 8.4): checkout and pages close; the shop's pause page shows instead. Reversible.
  const closing = el("button", { type: "button", textContent: shop.closed ? "Open this shop again" : "Close this shop" });
  closing.addEventListener("click", async () => {
    const reason = askWhy(shop.closed
      ? `Open ${shop.pressName}'s checkout and pages again.`
      : `Close ${shop.pressName}'s checkout and pages for abuse. Shoppers see the shop's pause page until you open it again.`);
    if (!reason) return;
    closing.disabled = true;
    try {
      await api("POST", shop.closed ? "/control/reopen" : "/control/close", { shopId: shop.shopId, reason });
      await load();
      status.textContent = `${shop.pressName} is ${shop.closed ? "open again" : "closed"}. It's in the shop's log.`;
    } catch (failure) {
      status.textContent = failure.message;
      closing.disabled = false;
    }
  });

  const moveCards = paymentsMenu(shop.paymentsMoved?.to ?? "platform", { shopId: shop.shopId }, shop.pressName);

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
    el("div", { className: "row" }, el("strong", { textContent: shop.pressName }), el("span", { className: "pill", textContent: LEVEL[shop.health.level] }), act, check, closing),
    el("div", { className: "facts" },
      el("span", { textContent: shop.shopId }),
      el("span", { textContent: `plan: ${shop.plan ?? "?"}` }),
      el("span", { textContent: `version: ${shop.version ?? "none yet"}` }),
      el("span", { textContent: `status: ${shop.status ?? "?"}` }),
      shop.access ? el("span", { textContent: `billing: ${shop.access}` }) : null,
      shop.testShop ? el("span", { textContent: "test shop" }) : null,
      shop.closed ? el("span", { textContent: `closed by ${shop.closed.by}` }) : null,
      shop.paymentsMoved ? el("span", { textContent: `cards: ${PAYMENT_WORDS[shop.paymentsMoved.to]}` }) : null),
    shop.health.reasons.length ? el("ul", {}, ...shop.health.reasons.map((reason) => el("li", { textContent: reason }))) : null,
    switches,
    shop.status === "live" ? moveCards : null);
}

// ── The emergency payments switch (plan 8.5): if the platform's Stripe is paused, move a shop, or every shop. ──
const PAYMENT_WORDS = { platform: "through the platform (normal)", own: "the press's own Stripe keys", square: "Square" };

function paymentsMenu(current, target, name) {
  const choice = el("select", {}, ...Object.entries(PAYMENT_WORDS).map(([value, words]) => el("option", { value, textContent: words, selected: value === current })));
  choice.setAttribute("aria-label", `Card payments for ${name}`);
  const move = el("button", { type: "button", textContent: "Move card payments" });
  move.addEventListener("click", async () => {
    const to = choice.value;
    const reason = askWhy(`Move card payments for ${name} to ${PAYMENT_WORDS[to]}. The press is emailed at once, and the shop's server and pages are deployed again.`);
    if (!reason) return;
    move.disabled = true;
    try {
      const { shops } = await api("POST", "/control/payments", { ...target, to, reason });
      await load();
      const failed = shops.filter((s) => s.error);
      const moved = shops.filter((s) => !s.error && !s.skipped).length;
      status.textContent = `${moved} shop${moved === 1 ? "" : "s"} on ${PAYMENT_WORDS[to]}.${failed.length ? ` Not moved: ${failed.map((s) => `${s.shopId} (${s.error})`).join("; ")}` : ""}`;
    } catch (failure) {
      status.textContent = failure.message;
    }
    move.disabled = false;
  });
  return el("div", { className: "row" }, el("label", { className: "switch" }, "Card payments", choice), move);
}

$("#all-payments").append(paymentsMenu("platform", { all: true }, "every live shop"));

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
for (const button of document.querySelectorAll("#ticket-filters button")) {
  button.addEventListener("click", () => {
    ticketStatus = button.dataset.status;
    for (const other of document.querySelectorAll("#ticket-filters button")) other.setAttribute("aria-pressed", String(other === button));
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

// ── Account recovery (accounts/recovery.js): check, approve or deny; after the wait, move it by hand and record it. ──
let recoveryStatus = "waiting";
for (const button of document.querySelectorAll("#recovery-filters button")) {
  button.addEventListener("click", () => {
    recoveryStatus = button.dataset.status;
    for (const other of document.querySelectorAll("#recovery-filters button")) other.setAttribute("aria-pressed", String(other === button));
    loadRecoveries();
  });
}

async function loadRecoveries() {
  try {
    const { requests } = await api("POST", "/control/recovery", { status: recoveryStatus });
    $("#recoveries").replaceChildren(...(requests.length ? requests.map(recoveryCard) : [el("p", { textContent: "Nothing here." })]));
  } catch (failure) {
    status.textContent = failure.message;
  }
}

function recoveryCard(request) {
  const when = (at) => new Date(at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  const decide = async (button, path, body, done) => {
    button.disabled = true;
    try {
      await api("POST", path, { id: request.id, ...body });
      status.textContent = done;
      await loadRecoveries();
    } catch (failure) {
      status.textContent = failure.message;
      button.disabled = false;
    }
  };
  const words = el("textarea", { maxLength: 2000 });
  words.setAttribute("aria-label", `Note or reason for request ${request.id}`);
  const actions = el("div", { className: "row" });
  if (request.status === "waiting") {
    const approve = el("button", { type: "button", className: "primary", textContent: "Approve (note how you checked)" });
    approve.addEventListener("click", () => decide(approve, "/control/recovery/approve", { note: words.value }, `Approved. Both addresses are told; it can be moved after three days.`));
    actions.append(approve);
  }
  if (request.status === "waiting" || request.status === "approved") {
    const deny = el("button", { type: "button", textContent: "Deny (the reason is emailed)" });
    deny.addEventListener("click", () => decide(deny, "/control/recovery/deny", { reason: words.value }, `Denied, and ${request.requesterEmail} is told why.`));
    actions.append(deny);
  }
  let byHand = null;
  if (request.status === "approved") {
    byHand = el("input", { type: "checkbox" });
    const apply = el("button", { type: "button", className: "primary", textContent: "Record as moved", disabled: Date.now() < Date.parse(request.holdUntil) });
    apply.addEventListener("click", () => decide(apply, "/control/recovery/apply", { doneByHand: byHand.checked }, `Recorded. Both addresses are told the account has moved.`));
    actions.append(el("label", { className: "switch" }, byHand, "I've moved it by hand"), apply);
  }
  return el("div", { className: "card" },
    el("div", { className: "row" }, el("strong", { textContent: `${request.oldEmail} → ${request.requesterEmail}` }), el("span", { className: "pill", textContent: request.status })),
    el("div", { className: "facts" },
      el("span", { textContent: request.id }),
      el("span", { textContent: request.accountId ? "the old address has an account" : "no account uses the old address" }),
      el("span", { textContent: `shops: ${(request.shops ?? []).join(", ") || "none"}` }),
      el("span", { textContent: `asked ${when(request.askedAt)}` }),
      request.holdUntil ? el("span", { textContent: `can move after ${when(request.holdUntil)}` }) : null),
    el("div", { className: "message", textContent: request.details }),
    ...(request.history ?? []).map((h) => el("div", { className: "facts", textContent: `${when(h.at)} · ${h.what}${h.by ? ` · ${h.by}` : ""}${h.note ? ` · ${h.note}` : ""}${h.reason ? ` · ${h.reason}` : ""}` })),
    actions.childElementCount ? words : null,
    actions.childElementCount ? actions : null);
}

// ── The breach register (control-room/breaches.js, plan 8.6): written down, marked reported or told, never deleted. ──
async function loadBreaches() {
  try {
    const { breaches, privacyContact } = await api("POST", "/control/breaches");
    $("#privacy-contact").textContent = privacyContact ? `Privacy contact: ${privacyContact}.` : "";
    $("#breaches").replaceChildren(...(breaches.length ? breaches.map(breachCard) : [el("p", { textContent: "Nothing in the register." })]));
  } catch (failure) {
    status.textContent = failure.message;
  }
}

$("#breach-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const value = (name) => form.elements.namedItem(name);
  try {
    await api("POST", "/control/breaches/record", {
      foundOn: value("foundOn").value, what: value("what").value, people: value("people").value,
      shops: value("shops").value.split(",").map((id) => id.trim()).filter(Boolean),
      reportedToCommissioner: value("reportedToCommissioner").checked, peopleTold: value("peopleTold").checked,
    });
    form.reset();
    status.textContent = "Written in the breach register.";
    await loadBreaches();
  } catch (failure) {
    status.textContent = failure.message;
  }
});

function breachCard(entry) {
  const when = (at) => new Date(at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  const mark = (label, field) => {
    const button = el("button", { type: "button", textContent: label });
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await api("POST", "/control/breaches/update", { id: entry.id, [field]: true });
        await loadBreaches();
      } catch (failure) {
        status.textContent = failure.message;
        button.disabled = false;
      }
    });
    return button;
  };
  const actions = el("div", { className: "row" },
    entry.reportedToCommissioner ? null : mark("Mark reported to the Commissioner", "reportedToCommissioner"),
    entry.peopleTold ? null : mark("Mark people told", "peopleTold"));
  return el("div", { className: `card ${entry.reportedToCommissioner && entry.peopleTold ? "ok" : "watch"}` },
    el("div", { className: "row" }, el("strong", { textContent: `Found ${entry.foundOn}` }), el("span", { className: "pill", textContent: entry.id })),
    el("div", { className: "message", textContent: entry.what }),
    el("div", { className: "facts" },
      el("span", { textContent: `people: ${entry.people}` }),
      el("span", { textContent: `shops: ${entry.shops.join(", ") || "none"}` }),
      el("span", { textContent: entry.reportedToCommissioner ? `reported ${when(entry.reportedAt)}` : "not reported to the Commissioner" }),
      el("span", { textContent: entry.peopleTold ? `people told ${when(entry.toldAt)}` : "people not told" }),
      el("span", { textContent: `kept until at least ${entry.keepUntil}` })),
    ...entry.history.map((h) => el("div", { className: "facts", textContent: `${when(h.at)} · ${h.what} · ${h.by}${h.note ? ` · ${h.note}` : ""}` })),
    actions.childElementCount ? actions : null);
}

// ── The run book (control-room/backupPerson.js, plan 8.7): pause releases, roll back a shop, a status note. ──
async function loadEmergency() {
  const state = await api("GET", "/control/emergency");
  const run = (label, path, body, done) => {
    const button = el("button", { type: "button", textContent: label });
    button.addEventListener("click", async () => {
      const extra = body();
      if (!extra) return;
      button.disabled = true;
      try {
        await api("POST", path, extra);
        status.textContent = done;
        await loadEmergency();
      } catch (failure) {
        status.textContent = failure.message;
        button.disabled = false;
      }
    });
    return button;
  };
  const reason = (what) => {
    const why = (window.prompt(`${what}\n\nWhy? Julian is told (at least 10 characters).`) ?? "").trim();
    return why ? { reason: why } : null;
  };
  const sealed = state.role === "backup" && !state.seal;
  const parts = [];
  if (state.role === "backup") {
    parts.push(el("p", { className: "hint", textContent: state.seal ? `Open until ${new Date(state.seal.until).toLocaleString()}. Every use is emailed to Julian.` : "Shut. Open it only in an emergency." }));
    if (sealed) parts.push(el("div", { className: "row" }, run("Open the emergency access", "/control/emergency/open", () => reason("Open the emergency access for 12 hours."), "Open. Julian has been emailed.")));
  }
  if (!sealed) {
    parts.push(el("div", { className: "row" },
      el("strong", { textContent: state.releasesPaused ? `Releases paused by ${state.releasesPaused.by}: ${state.releasesPaused.reason}` : "Releases are running normally." }),
      state.releasesPaused
        ? run("Resume releases", "/control/emergency/resume-releases", () => reason("Let releases go out again."), "Releases can go out again.")
        : run("Pause releases", "/control/emergency/pause-releases", () => reason("Stop every release; one already running stops before its next shop."), "Releases are paused.")));
    const shopId = el("input", { placeholder: "shop id" });
    shopId.setAttribute("aria-label", "Shop to roll back");
    const version = el("input", { placeholder: "release, like 1.4.0" });
    version.setAttribute("aria-label", "Release to go back to");
    parts.push(el("div", { className: "row" }, shopId, version,
      run("Roll this shop back", "/control/emergency/roll-back", () => {
        const why = reason(`Put ${shopId.value} back on release ${version.value}.`);
        return why ? { ...why, shopId: shopId.value.trim(), version: version.value.trim() } : null;
      }, "Rolled back. It's in the shop's history.")));
    const note = el("textarea", { maxLength: 500, value: state.statusNote?.text ?? "" });
    note.setAttribute("aria-label", "Note on the status page");
    parts.push(note, el("div", { className: "row" },
      run("Post on the status page", "/control/emergency/status-note", () => ({ text: note.value }), "The status page shows the note."),
      run("Take the note down", "/control/emergency/status-note", () => ({ text: "" }), "The note is down.")));
  }
  $("#emergency").replaceChildren(...parts);
  $("#view-emergency").hidden = false;
  return state;
}

$("#google").addEventListener("click", () => signInWithPopup(auth, new GoogleAuthProvider()).catch(() => { status.textContent = "Sign-in didn't finish."; }));
$("#refresh").addEventListener("click", load);
onAuthStateChanged(auth, (user) => {
  if (user) load();
  else { $("#view-signin").hidden = false; $("#view-shops").hidden = true; $("#view-emergency").hidden = true; }
});
