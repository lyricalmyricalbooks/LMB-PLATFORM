// Admin: Bookkeeping › Transactions › Bank feed (beta, 13 November 2026). A paid add-on (Settings › Plan): the owner
// connects the shop's bank through Plaid, in Plaid's own window, and each bank transaction waits here until the owner
// matches it to a card payout or an expense, adds it as a new expense, or skips it. Read-only: nothing here can move
// money, and nothing here writes an expense (the page does, after the owner has looked).
//
// The bank's sign-in and the key that reads its transactions never reach the shop: they stay with the platform's bank
// door (LMB-PLATFORM services/bankfeed, PLATFORM_BANK_FEED_URL). The shop proves who it is with its service key, like
// the receipts and app store doors. A shop without the door answers `available: false` ("Opening soon").
//
//   body { action: "bankFeed", step, ... }
//   status                      what the page shows: { available, addOn, banks, checkedAt, waiting, matches }
//                               (the bookkeeper may read it; every other step is the admin's)
//   linkToken { bankId? }       a one-use token for Plaid's window; bankId signs in again to that bank
//   connect { publicToken, bankName }    after the window: the bank is connected and its lines collected
//   signedIn { bankId }         after signing in again
//   check                       collects new lines now, then answers like status
//   decide { matches: [{ lineId, kind: "payout" | "expense" | "added" | "skipped", ref }] }
//   disconnect { bankId }       the bank is disconnected at Plaid and its waiting lines removed
//
// Kept in the shop's own folder, reached only through this file (no browser rule opens them):
//   bankFeedState/main   { cursors: { [bankId]: cursor }, checkedAt }      where each bank has been read up to
//   bankFeed/{lineId}    { bankId, date, cents, currency, name, account, pending?, state, ref?, decidedAt? }
//                        state "waiting" until decided; a decided line is kept half a year so it is never offered twice
const STEPS = new Set(["status", "linkToken", "connect", "signedIn", "check", "decide", "disconnect"]);
const KINDS = new Set(["payout", "expense", "added", "skipped"]);
const ID = /^[A-Za-z0-9_-]{4,80}$/;
const HELD_MAX = 3000;
const ROUNDS = 8;
const CHECK_GAP_MS = 15_000;
const KEEP_DECIDED_DAYS = 185;
const EMPTY = Object.freeze({ available: false, addOn: { on: false, price: "", extraPrice: "", included: 2 }, banks: [], checkedAt: "", waiting: [], matches: [] });

/** One line as the page gets it. Pure. */
function lineRow(id, d) {
  return { id, bankId: String(d.bankId || ""), date: String(d.date || ""), cents: Number(d.cents) || 0, currency: String(d.currency || ""), name: String(d.name || ""), account: String(d.account || ""), ...(d.pending === true ? { pending: true } : {}) };
}

function bankFeedActions({ url, shopId, serviceKey, requireAdmin, requireBooksReader = requireAdmin, db, fetch = globalThis.fetch, now = () => Date.now(), timeoutMs = 30000 }) {
  const stateRef = () => db.collection("bankFeedState").doc("main");
  const lines = () => db.collection("bankFeed");

  /** One call to the platform's bank door as this shop. Throws { code } when it can't be reached or refuses. */
  async function platform(op, args = {}) {
    const key = typeof serviceKey === "function" ? serviceKey() : "";
    if (!key) throw Object.assign(new Error("This shop isn't connected to the platform yet."), { code: "not_connected", status: 503 });
    let response;
    try {
      response = await fetch(`${url}/shop`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Shop-Id": typeof shopId === "function" ? shopId() : shopId, Authorization: `Bearer ${key}` },
        body: JSON.stringify({ op: `bank.${op}`, args }),
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
  const held = async () => (await lines().limit(HELD_MAX).get()).docs;

  /**
   * Collects what the banks have added since the last look. Lines are saved before the place each bank was read up to,
   * so a save that fails is simply read again; a line already decided keeps its decision. Safe to run twice.
   */
  async function collect() {
    let state = await readState();
    const cursors = { ...(state.cursors || {}) };
    const known = new Map((await held()).map((d) => [d.id, d]));
    for (let round = 0; round < ROUNDS; round += 1) {
      const { banks = [] } = await platform("pull", { cursors });
      let more = false;
      for (const bank of banks) {
        if (!ID.test(String(bank?.bankId || ""))) continue;
        for (const line of Array.isArray(bank.lines) ? bank.lines : []) {
          if (!ID.test(String(line?.id || "")) || !Number.isFinite(line.cents)) continue;
          const before = known.get(line.id)?.data();
          // The bank's own facts are refreshed; what the owner decided is kept.
          const doc = { ...lineRow(line.id, { ...line, bankId: bank.bankId }), state: before?.state || "waiting", ...(before?.ref ? { ref: before.ref } : {}), ...(before?.decidedAt ? { decidedAt: before.decidedAt } : {}) };
          delete doc.id;
          await lines().doc(line.id).set(doc);
          known.set(line.id, { id: line.id, ref: lines().doc(line.id), data: () => doc });
        }
        // A line the bank took back (a pending one that settled under a new id): gone, unless already decided.
        for (const id of Array.isArray(bank.removed) ? bank.removed : []) {
          const doc = known.get(id);
          if (doc && doc.data().state === "waiting") { await doc.ref.delete(); known.delete(id); }
        }
        if (typeof bank.cursor === "string" && bank.cursor) cursors[bank.bankId] = bank.cursor;
        more ||= bank.more === true;
      }
      state = { ...state, cursors, checkedAt: new Date(now()).toISOString() };
      await stateRef().set(state);
      if (!more) break;
    }
    // Decided lines older than half a year are let go: the bank no longer sends them, so they can't come back.
    const cutoff = new Date(now() - KEEP_DECIDED_DAYS * 86_400_000).toISOString().slice(0, 10);
    for (const doc of known.values()) {
      const d = doc.data();
      if (d.state !== "waiting" && String(d.date || "") < cutoff) await doc.ref.delete();
    }
    return state;
  }

  /** The platform's word on the add-on and the banks, with the shop's own lines. */
  async function view(answer = null) {
    let status = answer;
    if (!status) {
      try { status = await platform("status"); }
      catch (err) { if (err.code === "not_connected") return { ...EMPTY }; throw err; }
    }
    const state = await readState();
    const on = status.available === true && status.addOn?.on === true;
    const banks = on && Array.isArray(status.banks) ? status.banks : [];
    const bankIds = new Set(banks.map((b) => b.id));
    const docs = on ? await held() : [];
    const waiting = docs.filter((d) => d.data().state === "waiting" && bankIds.has(d.data().bankId)).map((d) => lineRow(d.id, d.data()));
    waiting.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
    const matches = docs.filter((d) => d.data().state !== "waiting").map((d) => ({ lineId: d.id, kind: d.data().state, ref: String(d.data().ref || "") }));
    return { available: status.available === true, addOn: { ...EMPTY.addOn, ...(status.addOn || {}) }, banks, checkedAt: on ? String(state.checkedAt || "") : "", waiting, matches };
  }

  /** Collects, but never lets a bank that can't be read just now hide the page. */
  const collected = async () => { try { await collect(); } catch (err) { console.error("bankFeed: collecting failed:", err?.message || err); } };

  const STEP = {
    status: async () => view(),
    linkToken: async (body) => ({ token: String((await platform("linkToken", body.bankId ? { bankId: body.bankId } : {})).token || "") }),
    connect: async (body, who) => {
      const answer = await platform("connect", { publicToken: String(body.publicToken || ""), bankName: String(body.bankName || "").slice(0, 80), by: who });
      await collected();
      return view(answer);
    },
    signedIn: async (body, who) => {
      const answer = await platform("signedIn", { bankId: body.bankId, by: who });
      await collected();
      return view(answer);
    },
    check: async () => {
      const state = await readState();
      if (!(state.checkedAt && now() - Date.parse(state.checkedAt) < CHECK_GAP_MS)) await collect();
      return view();
    },
    decide: async (body) => {
      const at = new Date(now()).toISOString();
      for (const match of body.matches) {
        const ref = lines().doc(match.lineId);
        const snap = await ref.get();
        if (!snap.exists || snap.data().pending === true) continue;
        await ref.update({ state: match.kind, ref: String(match.ref || "").slice(0, 120), decidedAt: at });
      }
      return view();
    },
    disconnect: async (body, who) => {
      const answer = await platform("disconnect", { bankId: body.bankId, by: who });
      for (const doc of await held()) if (doc.data().bankId === body.bankId && doc.data().state === "waiting") await doc.ref.delete();
      const state = await readState();
      if (state.cursors?.[body.bankId]) { const { [body.bankId]: _gone, ...cursors } = state.cursors; await stateRef().set({ ...state, cursors }); }
      return view(answer);
    },
  };

  function badRequest(step, body) {
    if (!STEPS.has(step)) return true;
    if ((step === "signedIn" || step === "disconnect") && !ID.test(String(body?.bankId || ""))) return true;
    if (step === "linkToken" && body?.bankId != null && !ID.test(String(body.bankId))) return true;
    if (step === "decide") {
      const matches = body?.matches;
      if (!Array.isArray(matches) || !matches.length || matches.length > 200) return true;
      return matches.some((m) => !m || !ID.test(String(m.lineId || "")) || !KINDS.has(m.kind) || (m.kind !== "skipped" && !String(m.ref || "").trim()));
    }
    return false;
  }

  async function handleBankFeed(req, res) {
    const step = req.body?.step;
    // Looking is open to the bookkeeper; connecting a bank and deciding a line are the admin's.
    const who = step === "status" ? await requireBooksReader(req, res) : await requireAdmin(req, res);
    if (!who) return;
    if (badRequest(step, req.body)) {
      res.status(400).json({ error: "Unknown step.", code: "bad_request" });
      return;
    }
    if (!url) {
      res.json({ ...EMPTY });
      return;
    }
    try {
      res.json(await STEP[step](req.body, String(who.email || "")));
    } catch (err) {
      if (!err.code) console.error("bankFeed failed:", err?.message || err);
      res.status(err.status || 500).json({ error: err.code ? err.message : "That didn't work just now. Try again in a minute.", code: err.code || "failed" });
    }
  }

  /** The regular look, for a shop with a bank connected. One shop's failure is logged, never thrown. */
  async function sweepBankFeed() {
    if (!url) return { ran: false };
    try {
      // A shop that never connected a bank has no state: it isn't asked about at all.
      if (!Object.keys((await readState()).cursors || {}).length) return { ran: false };
      const status = await platform("status");
      if (!(status.available === true && status.addOn?.on === true && status.banks?.length)) return { ran: false };
      await collect();
      return { ran: true };
    } catch (err) {
      console.error("bankFeedSweep:", err?.message || err);
      return { ran: false, error: String(err?.message || err) };
    }
  }

  return { handleBankFeed, sweepBankFeed, collect };
}

module.exports = { bankFeedActions, lineRow, STEPS };
