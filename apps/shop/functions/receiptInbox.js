// Admin: Bookkeeping › Receipts › Receipts by email (beta, 12 November 2026). The owner forwards receipts to the shop's
// own receipts address; this collects them from the platform's receipts door (LMB-PLATFORM services/receipts,
// PLATFORM_RECEIPTS_URL), reads each one with the shop's AI, and keeps it waiting until the owner checks it and adds it
// as an expense, or says it isn't a receipt. Nothing here ever writes an expense: the admin's Log expense page does,
// after the owner has looked.
//
// The shop proves who it is with its service key, like the app store and Google doors; only admins get here. A shop
// without the door answers `available: false` and the page shows "Opening soon".
//
//   body { action: "receiptInbox", step, id? }
//   status      what the page shows: { available, on, address, checkedAt, gmailCode, waiting: [...] }
//   start       gives the shop its address and turns it on            stop   turns it off (the address is kept)
//   newAddress  a fresh address; the old one stops                     check  collects now, then answers like status
//   file { id } the receipt's file for the save: the attachment, or the email's words as a PDF
//   done { id } after Add or Not a receipt: the email is binned and the waiting entry removed
//   codeSeen    hides Gmail's forwarding code once the owner has used it
//
// Kept in the shop's own folder, reached only through this file (no browser rule opens them):
//   receiptInboxState/main   { on, address, checkedAt, gmailCode?: { code, from, at } }
//   receiptInbox/{messageId} { from, subject, receivedAt, text, facts, looksLike, hasFile, fileName, fileType, createdAt, state }
const { emailPdf } = require("./emailPdf");

const STEPS = new Set(["status", "start", "stop", "newAddress", "check", "file", "done", "codeSeen"]);
const ID = /^[A-Za-z0-9_-]{6,64}$/;
const WAITING_MAX = 200;
const ROUNDS = 4;
const CHECK_GAP_MS = 15_000;
const TEXT_KEPT = 6000;

/** What the page shows of one waiting receipt: never the whole email, only a first few words. Pure. */
function waitingRow(id, d) {
  return {
    id, from: String(d.from || ""), subject: String(d.subject || ""), receivedAt: String(d.receivedAt || ""),
    facts: d.facts || null, looksLike: d.looksLike !== false, hasFile: d.hasFile === true, fileName: String(d.fileName || ""),
    snippet: String(d.text || "").replace(/\s+/g, " ").trim().slice(0, 160),
  };
}

function receiptInboxActions({ url, shopId, serviceKey, requireAdmin, db, readEmail = async () => null, fetch = globalThis.fetch, now = () => Date.now(), timeoutMs = 30000 }) {
  const stateRef = () => db.collection("receiptInboxState").doc("main");
  const drafts = () => db.collection("receiptInbox");

  /** One call to the platform's receipts door as this shop. Throws { code } when it can't be reached or refuses. */
  async function platform(op, args = {}) {
    const key = typeof serviceKey === "function" ? serviceKey() : "";
    if (!key) throw Object.assign(new Error("This shop isn't connected to the platform yet."), { code: "not_connected", status: 503 });
    let response;
    try {
      response = await fetch(`${url}/shop`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Shop-Id": typeof shopId === "function" ? shopId() : shopId, Authorization: `Bearer ${key}` },
        body: JSON.stringify({ op: `receipts.${op}`, args }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      throw Object.assign(new Error("The platform didn't answer. Try again in a minute."), { code: "unreachable", status: 502, cause: err });
    }
    let body = null;
    try { body = await response.json(); } catch { body = null; }
    if (!response.ok || body?.ok === false) {
      throw Object.assign(new Error(body?.message || "The platform couldn't do that just now."), { code: "platform_error", status: response.status >= 400 && response.status < 500 ? response.status : 502 });
    }
    return body ?? {};
  }

  const readState = async () => { const snap = await stateRef().get(); return snap.exists ? snap.data() : {}; };
  const saveState = async (patch) => { const next = { ...(await readState()), ...patch }; await stateRef().set(next); return next; };

  /**
   * Collects what was forwarded since the last look. Each new email is read once and kept waiting; Gmail's forwarding
   * check is kept as a code for the setup steps. Entries the owner already dealt with whose email couldn't be binned
   * then are binned now. Safe to run twice: an email already waiting is never read again.
   */
  async function collect() {
    const state = await readState();
    if (state.on !== true) return state;
    const held = (await drafts().limit(500).get()).docs;
    const leftovers = held.filter((d) => d.data().state === "done");
    if (leftovers.length) {
      try {
        await platform("done", { ids: leftovers.map((d) => d.id) });
        for (const d of leftovers) await d.ref.delete();
      } catch (err) { console.error("receiptInbox: binning dealt-with emails failed:", err?.message || err); }
    }
    const have = held.map((d) => d.id);
    let waiting = held.length - leftovers.length;
    let gmailCode = state.gmailCode || null;
    for (let round = 0; round < ROUNDS && waiting < WAITING_MAX; round += 1) {
      const { emails = [], more = false } = await platform("pull", { have });
      for (const email of emails) {
        if (!ID.test(String(email?.id || ""))) continue;
        have.push(email.id);
        if (email.confirm?.code) {
          gmailCode = { code: String(email.confirm.code).slice(0, 12), from: String(email.confirm.from || "").slice(0, 200), at: new Date(now()).toISOString() };
          await platform("done", { ids: [email.id] }).catch(() => null);
          continue;
        }
        const file = email.file && typeof email.file.data === "string" ? email.file : null;
        const facts = await Promise.resolve(readEmail({ from: email.from, subject: email.subject, text: email.text, ...(file ? { fileType: file.type, fileData: file.data } : {}) })).catch((err) => {
          console.error("receiptInbox: reading an email failed:", err?.message || err);
          return null;
        });
        const { isReceipt, ...read } = facts || {};
        await drafts().doc(email.id).set({
          from: String(email.from || "").slice(0, 200), subject: String(email.subject || "").slice(0, 200), receivedAt: String(email.receivedAt || ""),
          text: String(email.text || "").slice(0, TEXT_KEPT), facts: facts ? read : null, looksLike: isReceipt !== "no",
          hasFile: Boolean(file), fileName: file ? String(file.name || "receipt").slice(0, 120) : "", fileType: file ? String(file.type || "") : "",
          createdAt: new Date(now()).toISOString(), state: "waiting",
        });
        waiting += 1;
      }
      if (!more || !emails.length) break;
    }
    return saveState({ checkedAt: new Date(now()).toISOString(), ...(gmailCode ? { gmailCode } : {}) });
  }

  async function view(state, available) {
    const rows = (await drafts().limit(500).get()).docs.filter((d) => d.data().state !== "done").map((d) => waitingRow(d.id, d.data()));
    rows.sort((a, b) => String(b.receivedAt).localeCompare(String(a.receivedAt)));
    return {
      available, on: available && state.on === true, address: available ? String(state.address || "") : "",
      checkedAt: state.checkedAt || "", gmailCode: state.gmailCode ? { code: state.gmailCode.code, from: state.gmailCode.from || "" } : null, waiting: rows,
    };
  }

  /** The platform's word on this shop's address, kept in the shop's state; the state alone when it can't be asked. */
  async function synced() {
    try {
      const answer = await platform("status");
      const state = await saveState({ on: answer.on === true, address: String(answer.address || "") });
      return { state, available: answer.available === true };
    } catch (err) {
      if (err.code === "not_connected") return { state: await readState(), available: false };
      const state = await readState();
      return { state, available: Boolean(state.address) };
    }
  }

  const STEP = {
    status: async () => { const { state, available } = await synced(); return view(state, available); },
    start: async (_body, who) => { const a = await platform("start", { by: who }); return view(await saveState({ on: a.on === true, address: String(a.address || "") }), a.available === true); },
    stop: async (_body, who) => { const a = await platform("stop", { by: who }); return view(await saveState({ on: false, address: String(a.address || "") }), a.available === true); },
    newAddress: async (_body, who) => { const a = await platform("newAddress", { by: who }); return view(await saveState({ on: a.on === true, address: String(a.address || ""), gmailCode: null }), a.available === true); },
    check: async () => {
      const state = await readState();
      const recent = state.checkedAt && now() - Date.parse(state.checkedAt) < CHECK_GAP_MS;
      return view(recent ? state : await collect(), true);
    },
    codeSeen: async () => view(await saveState({ gmailCode: null }), true),
    file: async (body) => {
      const snap = await drafts().doc(body.id).get();
      if (!snap.exists) throw Object.assign(new Error("That receipt is no longer waiting."), { status: 404, code: "gone" });
      const draft = snap.data();
      if (draft.hasFile) {
        const { file } = await platform("file", { id: body.id });
        if (file?.data) return { file };
      }
      const day = String(draft.receivedAt || "").slice(0, 10) || "email";
      return { file: { name: `email-receipt-${day}.pdf`, type: "application/pdf", data: emailPdf(draft).toString("base64") } };
    },
    done: async (body) => {
      const ref = drafts().doc(body.id);
      if (!(await ref.get()).exists) return { done: true };
      try { await platform("done", { ids: [body.id] }); await ref.delete(); }
      // The email couldn't be binned just now: the entry stays, hidden, so it isn't collected again, and the next
      // check bins it.
      catch { await ref.update({ state: "done" }); }
      return { done: true };
    },
  };

  async function handleReceiptInbox(req, res) {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const step = req.body?.step;
    if (!STEPS.has(step) || ((step === "file" || step === "done") && !ID.test(String(req.body?.id || "")))) {
      res.status(400).json({ error: "Unknown step.", code: "bad_request" });
      return;
    }
    if (!url) {
      res.json({ available: false, on: false, address: "", checkedAt: "", gmailCode: null, waiting: [] });
      return;
    }
    try {
      res.json(await STEP[step](req.body, String(admin.email || "")));
    } catch (err) {
      if (!err.code) console.error("receiptInbox failed:", err?.message || err);
      res.status(err.status || 500).json({ error: err.code ? err.message : "That didn't work just now. Try again in a minute.", code: err.code || "failed" });
    }
  }

  /** The 15-minute look, for a shop that has receipts by email on. One shop's failure is logged, never thrown. */
  async function sweepReceiptInbox() {
    if (!url) return { ran: false };
    try {
      if ((await readState()).on !== true) return { ran: false };
      await collect();
      return { ran: true };
    } catch (err) {
      console.error("receiptInboxSweep:", err?.message || err);
      return { ran: false, error: String(err?.message || err) };
    }
  }

  return { handleReceiptInbox, sweepReceiptInbox, collect };
}

module.exports = { receiptInboxActions, waitingRow, STEPS };
