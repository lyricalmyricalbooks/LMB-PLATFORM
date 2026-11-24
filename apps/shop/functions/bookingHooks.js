// Send bookings to other apps (Bookings plan 4, step 5.8, Beta). The owner adds a web address from another tool (a
// spreadsheet, a mailing list, an automation service); each new, moved or cancelled booking is posted there as JSON,
// signed with the hook's own secret so the other end can check it came from this shop. A delivery that fails is tried
// again by bookingSweep (5 more tries, further apart each time); a hook that keeps failing is paused and says so.
//
// Records (server only, never read by pages): `bookingHooks/main` { hooks: [{ id, url, secret, events, on, addedAt,
// lastAt, lastStatus, fails, problem }] } and `bookingHookQueue/{deliveryId}` { hookId, body, tries, nextAt }.
const crypto = require("crypto");
const dnsLookup = require("dns").promises.lookup;
const net = require("net");

const EVENTS = Object.freeze(["booking.created", "booking.moved", "booking.cancelled"]);
const MAX_HOOKS = 5;
const TIMEOUT_MS = 10_000;
/** Minutes to wait before each try again: 5 more tries over about a day. */
const RETRY_MINUTES = Object.freeze([5, 30, 120, 360, 1080]);
/** Failed deliveries in a row before a hook is paused. */
const PAUSE_AFTER = 20;
const SIGNATURE_HEADER = "x-booking-signature";
const LIVE = new Set(["confirmed"]);

/** The address checked: https on the normal port, a name rather than a number, no sign-in in it. Problem in plain words. */
function hookUrlProblem(value) {
  let u;
  try { u = new URL(String(value || "").trim()); } catch { return "Paste the full web address, starting with https://."; }
  if (u.protocol !== "https:") return "The address must start with https://.";
  if (u.username || u.password) return "Take the name and password out of the address.";
  if (u.port && u.port !== "443") return "Use an address without a port number.";
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (net.isIP(host) || !host.includes(".") || /(^|\.)(localhost|local|internal|localdomain|home\.arpa)$/.test(host)) {
    return "Use the web address the other app gave you.";
  }
  if (String(value).trim().length > 500) return "That address is too long.";
  return "";
}

/** True for an address no outside app lives at: this machine, the private network, link-local (the cloud's metadata). */
function privateAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return privateAddress(v.slice(7));
  return v === "::" || v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe8") || v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb") || v.startsWith("ff");
}

/** Which event a booking's change is, or "" when it's none of the three. */
function hookEvent(before, after) {
  const was = before && LIVE.has(before.status);
  const is = after && LIVE.has(after.status);
  if (is && !was) return "booking.created";
  if (was && !is) return "booking.cancelled";
  if (was && is && (before.start !== after.start || before.end !== after.end || (before.staffId || "") !== (after.staffId || ""))) return "booking.moved";
  return "";
}

/** What the other app gets: the booking's useful facts, never its private keys, card details or history. */
function hookBody(event, id, b, { at, shop = "", before = null } = {}) {
  const c = b?.customer || {};
  return {
    event, id, at, shop,
    booking: {
      status: b?.status || "", start: b?.start || "", end: b?.end || "", minutes: b?.minutes || 0,
      service: b?.serviceName || "", serviceId: b?.serviceId || "", staff: b?.staffName || "", staffId: b?.staffId || "",
      location: b?.roomName ? [b.roomName, b.location].filter(Boolean).join(", ") : b?.location || "",
      customer: { name: c.name || "", email: c.email || "", phone: c.phone || "" },
      priceMinor: Number.isFinite(b?.priceMinor) ? b.priceMinor : 0, currency: b?.currency || "", paid: b?.paid === true,
      note: b?.note || "", answers: Array.isArray(b?.answers) ? b.answers.map((a) => ({ question: a.label || "", answer: a.answer || "" })) : [],
    },
    ...(event === "booking.moved" && before ? { was: { start: before.start || "", end: before.end || "", staff: before.staffName || "" } } : {}),
  };
}

/** The signature header: `t=<seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>">` with the hook's secret. */
function signature(secret, text, seconds) {
  return `t=${seconds},v1=${crypto.createHmac("sha256", secret).update(`${seconds}.${text}`).digest("hex")}`;
}

/** Posts one body. Never throws: { ok, status } (status 0 when it didn't answer or the address isn't allowed). */
async function postHook(hook, body, { fetchImpl = fetch, lookup = dnsLookup, nowMs = Date.now() } = {}) {
  if (hookUrlProblem(hook.url)) return { ok: false, status: 0 };
  try {
    const host = new URL(hook.url).hostname;
    const addresses = await lookup(host, { all: true });
    if (!addresses.length || addresses.some((a) => privateAddress(a.address))) return { ok: false, status: 0 };
  } catch {
    return { ok: false, status: 0 };
  }
  const text = JSON.stringify(body);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    // Redirects are not followed: the address was checked, wherever it points would not be.
    const res = await fetchImpl(hook.url, {
      method: "POST", redirect: "manual", signal: ctrl.signal,
      headers: { "content-type": "application/json", "user-agent": "ShopBookings/1", [SIGNATURE_HEADER]: signature(hook.secret, text, Math.floor(nowMs / 1000)) },
      body: text,
    });
    return { ok: res.status >= 200 && res.status < 300, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  } finally {
    clearTimeout(timer);
  }
}

/** A hook's last answer in plain words, for the admin. */
function deliveryProblem(status) {
  if (status === 0) return "The address didn't answer.";
  if (status === 401 || status === 403) return "The other app refused it. Check the address is still switched on there.";
  if (status === 404 || status === 410) return "The address isn't there any more. Copy it again from the other app.";
  if (status >= 300 && status < 400) return "The address moves somewhere else. Paste the final address.";
  return `The other app answered with an error (${status}).`;
}

function hooksFor({ db, now = () => new Date(), fetchImpl, lookup, randomId = () => crypto.randomBytes(12).toString("hex") }) {
  const main = () => db.collection("bookingHooks").doc("main");
  const queue = () => db.collection("bookingHookQueue");
  const readHooks = async () => {
    const snap = await main().get();
    return snap.exists && Array.isArray(snap.data()?.hooks) ? snap.data().hooks : [];
  };
  /** Writes one hook's last answer (and pauses it after too many failures in a row). */
  async function recordAnswer(hookId, got) {
    await db.runTransaction(async (tx) => {
      const cur = await tx.get(main());
      const hooks = cur.exists && Array.isArray(cur.data()?.hooks) ? cur.data().hooks : [];
      tx.set(main(), {
        ...(cur.exists ? cur.data() : {}),
        hooks: hooks.map((h) => {
          if (h.id !== hookId) return h;
          const fails = got.ok ? 0 : (h.fails || 0) + 1;
          const pause = !got.ok && fails >= PAUSE_AFTER;
          return { ...h, lastAt: now().toISOString(), lastStatus: got.status, fails, problem: got.ok ? "" : deliveryProblem(got.status), ...(pause ? { on: false, paused: true } : {}) };
        }),
      });
    });
  }
  const view = (h) => ({ id: h.id, url: h.url, secret: h.secret, events: h.events, on: h.on !== false, paused: h.paused === true, addedAt: h.addedAt || null, lastAt: h.lastAt || null, lastStatus: h.lastStatus ?? null, problem: h.problem || "" });

  /** A booking changed (the Firestore trigger): each hook that wants this event gets it, or it waits in the queue. */
  async function bookingChanged(id, before, after, shop = "") {
    const event = hookEvent(before, after);
    if (!event) return { sent: 0, queued: 0 };
    const hooks = (await readHooks()).filter((h) => h.on !== false && (h.events || EVENTS).includes(event));
    let sent = 0;
    let queued = 0;
    for (const h of hooks) {
      const body = hookBody(event, id, event === "booking.cancelled" ? { ...before, ...after } : after, { at: now().toISOString(), shop, before });
      const got = await postHook(h, body, { fetchImpl, lookup, nowMs: now().getTime() });
      await recordAnswer(h.id, got);
      if (got.ok) { sent += 1; continue; }
      await queue().doc(randomId()).set({ hookId: h.id, body, tries: 1, nextAt: now().getTime() + RETRY_MINUTES[0] * 60_000 });
      queued += 1;
    }
    return { sent, queued };
  }

  /** bookingSweep: deliveries that are due go again; after the last try they're dropped. */
  async function sweepDeliveries() {
    const nowMs = now().getTime();
    const snap = await queue().where("nextAt", "<=", nowMs).limit(50).get();
    if (snap.empty) return { sent: 0, dropped: 0 };
    const hooks = new Map((await readHooks()).map((h) => [h.id, h]));
    let sent = 0;
    let dropped = 0;
    for (const d of snap.docs) {
      const job = d.data();
      const hook = hooks.get(job.hookId);
      if (!hook || hook.on === false) { await d.ref.delete(); dropped += 1; continue; }
      const got = await postHook(hook, job.body, { fetchImpl, lookup, nowMs });
      await recordAnswer(hook.id, got);
      if (got.ok) { await d.ref.delete(); sent += 1; continue; }
      const tries = (job.tries || 1) + 1;
      if (tries > RETRY_MINUTES.length) { await d.ref.delete(); dropped += 1; continue; }
      await d.ref.set({ ...job, tries, nextAt: nowMs + RETRY_MINUTES[tries - 1] * 60_000 });
    }
    return { sent, dropped };
  }

  /** The owner's op `bookingHooks`: steps list, add { url, events }, remove { id }, switch { id, on }, test { id }. */
  async function ownerStep(body, { shop = "" } = {}) {
    const step = String(body?.step || "list");
    if (step === "list") return { status: 200, json: { hooks: (await readHooks()).map(view), events: EVENTS } };
    if (step === "add") {
      const url = String(body?.url || "").trim();
      const problem = hookUrlProblem(url);
      if (problem) return { status: 400, problem };
      const events = Array.isArray(body?.events) ? EVENTS.filter((e) => body.events.includes(e)) : [...EVENTS];
      if (!events.length) return { status: 400, problem: "Pick at least one kind of change to send." };
      const hooks = await readHooks();
      if (hooks.length >= MAX_HOOKS) return { status: 400, problem: `You can add up to ${MAX_HOOKS} addresses.` };
      if (hooks.some((h) => h.url === url)) return { status: 400, problem: "That address is already added." };
      const hook = { id: `h${randomId().slice(0, 12)}`, url, secret: `whsec_${crypto.randomBytes(24).toString("hex")}`, events, on: true, addedAt: now().toISOString(), lastAt: null, lastStatus: null, fails: 0, problem: "" };
      await db.runTransaction(async (tx) => {
        const cur = await tx.get(main());
        const list = cur.exists && Array.isArray(cur.data()?.hooks) ? cur.data().hooks : [];
        tx.set(main(), { ...(cur.exists ? cur.data() : {}), hooks: [...list.filter((h) => h.url !== url), hook] });
      });
      return { status: 200, json: { hooks: (await readHooks()).map(view), added: hook.id } };
    }
    const id = String(body?.id || "");
    const hooks = await readHooks();
    const hook = hooks.find((h) => h.id === id);
    if (!hook) return { status: 404, problem: "That address isn't there any more." };
    if (step === "remove" || step === "switch") {
      await db.runTransaction(async (tx) => {
        const cur = await tx.get(main());
        const list = cur.exists && Array.isArray(cur.data()?.hooks) ? cur.data().hooks : [];
        const next = step === "remove" ? list.filter((h) => h.id !== id) : list.map((h) => (h.id === id ? { ...h, on: body?.on === true, ...(body?.on === true ? { paused: false, fails: 0 } : {}) } : h));
        tx.set(main(), { ...(cur.exists ? cur.data() : {}), hooks: next });
      });
      if (step === "remove") {
        const left = await queue().where("hookId", "==", id).limit(200).get();
        for (const d of left.docs) await d.ref.delete();
      }
      return { status: 200, json: { hooks: (await readHooks()).map(view) } };
    }
    if (step === "test") {
      const at = now().toISOString();
      const sample = hookBody("booking.test", "test", { status: "confirmed", start: at, end: at, minutes: 60, serviceName: "Sample service", customer: { name: "Sample client", email: "client@example.com", phone: "" }, priceMinor: 0, currency: "" }, { at, shop });
      const got = await postHook(hook, sample, { fetchImpl, lookup, nowMs: now().getTime() });
      await recordAnswer(hook.id, got);
      return { status: 200, json: { ok: got.ok, problem: got.ok ? "" : deliveryProblem(got.status), hooks: (await readHooks()).map(view) } };
    }
    return { status: 400, problem: "Unknown step." };
  }

  return { bookingChanged, sweepDeliveries, ownerStep };
}

module.exports = { hooksFor, hookUrlProblem, privateAddress, hookEvent, hookBody, signature, postHook, deliveryProblem, EVENTS, MAX_HOOKS, RETRY_MINUTES, PAUSE_AFTER, SIGNATURE_HEADER };
