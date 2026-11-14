// Bookings (beta, 14 November 2026; tasks/todo/2026-11-14-bookings-beta.md). Customers book a time with the shop from
// its Book a time page (/book); the owner sees and changes bookings in Admin › Orders › Bookings. Off for every shop
// until the platform's control room turns it on for that shop: the platform writes `platform/features` { bookings: true }
// into the shop's folder, and every action here first checks it.
//
// Records, all in the shop's own folder (firestore.rules lets admins read them and no browser write them):
//   bookingServices/{id}   a service (src/shared/bookingTimes.ts BookingService)
//   bookingSettings/main   opening hours and rules (BookingSettings)
//   bookings/{id}          { serviceId, serviceName, minutes, gapAfter, location, start, end, customer: { name, email, phone },
//                            note, answers: [{ label, answer }] (the service's own questions), status: "held" | "confirmed" | "cancelled", payment: "free" | "card" | "atShop", priceMinor,
//                            currency, paid, sessions, paidSession?, paymentIntent?, refund?, holdUntil?, manageKeyHash,
//                            source: "website" | "admin", noShow?, history: [{ at, what, by }], createdAt, updatedAt }
//   bookingDays/{day}      { items: { [bookingId]: { start, end, held, s: serviceId } } }: what is taken on one shop day, read and
//                          written in the same transaction as the booking, so two customers can never take one time.
//   bookingWaitlist/{id}   { serviceId, serviceName, day, start | null, name, email, createdAt }: someone who asked to hear
//                          when a full class time (start) or a full day (start null) has room again. Server-only (no rule
//                          opens it); emailed once when a time frees, then deleted; deleted too once its day has passed.
//
// A paid booking holds its time while the customer pays on the shop's own Stripe or Square page
// (payments.standaloneCheckout, as the stockroom's invoice pay links do). No shop order is made and the webhook ignores
// the page; the Book a time page asks "view" when the customer comes back, and the five-minute sweep confirms a paid
// hold or, after HOLD_MINUTES, closes the page and frees the time.
//
// The customer's link to see, move or cancel is /book?booking=<id>&key=<key>; only a hash of the key is kept.
const crypto = require("crypto");
const {
  cleanService, cleanBookingSettings, cleanAnswers, freeTimes, isFreeTime, placesLeft, isClass, daysTouched, addDays, dayOf, isDay, customerCanChange,
  googleCalendarLink, bookingsFeedIcs, bookingIcs, MAX_SERVICES,
} = require("./shared/bookingTimes");

const HOLD_MINUTES = 10;
const MINUTE = 60_000;
/** A hold the sweep never got to (a failed run) stops blocking its time after this long. */
const STALE_HOLD_MS = 2 * 60 * 60 * 1000;
const MAX_DAYS_ASKED = 14;
/** How many people may wait for one day of one service. */
const MAX_WAITING = 30;
const ID = /^[A-Za-z0-9_-]{6,40}$/;
const KEY = /^[a-f0-9]{48}$/;
const SESSION_ID = /^(cs_[A-Za-z0-9_]{8,200}|sqlink_[A-Za-z0-9_-]{1,192})$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const text = (value, max) => (typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "");
const hash = (key) => crypto.createHash("sha256").update(String(key)).digest("hex");
const sameHash = (a, b) => typeof a === "string" && typeof b === "string" && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** What is taken on the given days, as Busy stretches, leaving out `except` (a booking being moved). */
function busyFrom(daySnaps, nowMs, except = "") {
  const busy = [];
  for (const snap of daySnaps) {
    const items = (snap.exists ? snap.data()?.items : null) || {};
    for (const [id, item] of Object.entries(items)) {
      if (id === except || !item || !Number.isFinite(item.start) || !Number.isFinite(item.end)) continue;
      if (item.held && Number.isFinite(item.at) && nowMs - item.at > STALE_HOLD_MS) continue;
      busy.push({ start: item.start, end: item.end, serviceId: typeof item.s === "string" ? item.s : undefined });
    }
  }
  return busy;
}

/** A customer's details from the Book a time page, or { problem }. */
function cleanCustomer(body) {
  const name = text(body?.name, 100);
  const email = text(body?.email, 320).toLowerCase();
  if (!name) return { problem: "Please add your name." };
  if (!EMAIL.test(email)) return { problem: "Please add an email address we can send your booking to." };
  return { name, email, phone: text(body?.phone, 40), note: typeof body?.note === "string" ? body.note.trim().slice(0, 1000) : "" };
}

/** What the customer's page may see of a booking (never the payment ids or the key's hash). */
function publicBooking(id, b, settings, nowMs) {
  const start = Date.parse(b.start);
  return {
    id, serviceId: b.serviceId, serviceName: b.serviceName, minutes: b.minutes, location: b.location || "", start: b.start, end: b.end,
    status: b.status, payment: b.payment, paid: !!b.paid, priceMinor: b.priceMinor || 0, currency: b.currency,
    name: b.customer?.name || "", email: b.customer?.email || "", refunded: !!b.refund?.amountMinor,
    canChange: b.status === "confirmed" && customerCanChange(start, settings, nowMs),
    cancelHours: settings.cancelHours,
  };
}

function bookingActions({
  db, requireAdmin, payments, shopTestMode, hitLimit, LIMITS, siteLink, shopName = () => "", zone, currency,
  sendEmail = async () => {}, emailBrand = async () => ({}), claimEmailSend = async () => true, ownerEmail = () => "",
  escapeHtml, risoLayout, risoButton, now = () => new Date(), randomId = () => crypto.randomBytes(12).toString("base64url").replace(/[^A-Za-z0-9]/g, "").slice(0, 16).padEnd(8, "0"),
  randomKey = () => crypto.randomBytes(24).toString("hex"),
}) {
  const services = () => db.collection("bookingServices");
  const settingsRef = () => db.collection("bookingSettings").doc("main");
  const bookings = () => db.collection("bookings");
  const dayRef = (day) => db.collection("bookingDays").doc(day);
  const waitlist = () => db.collection("bookingWaitlist");

  async function featureOn() {
    const snap = await db.collection("platform").doc("features").get().catch(() => null);
    return snap?.exists === true && snap.data()?.bookings === true;
  }
  async function readSettings() {
    const snap = await settingsRef().get();
    return cleanBookingSettings(snap.exists ? snap.data() : null);
  }
  // The shop's pages show "Book a time" in the header, phone menu and footer while bookings are on. They learn it from
  // the public website settings they already read (`bookingsLive`), so no page asks this server on every visit. Only a
  // hint for showing a link: every booking action above still checks the real switch. A shop with no website settings
  // yet is left alone (a record holding only this would stand in for the starting design).
  async function tellWebsite(live) {
    try {
      const ref = db.collection("settings").doc("website");
      const snap = await ref.get();
      if (snap.exists && (snap.data()?.bookingsLive === true) !== (live === true)) await ref.set({ bookingsLive: live === true }, { merge: true });
    } catch (err) {
      console.warn("bookings: the website link wasn't updated:", err?.message || err);
    }
  }
  async function readServices() {
    const snap = await services().limit(MAX_SERVICES).get();
    return snap.docs.map((d) => cleanService(d.data(), d.id)).filter((s) => !s.problem).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  }
  async function standalone() {
    const mode = (await shopTestMode()) ? "test" : "live";
    return { mode, checkout: await payments.standaloneCheckout(mode) };
  }

  // ── Emails ────────────────────────────────────────────────────────────────────────────────────────────────────────

  function whenWords(b) {
    const start = new Date(b.start);
    const opts = { timeZone: zone() };
    const dayText = start.toLocaleDateString("en-CA", { ...opts, weekday: "long", day: "numeric", month: "long", year: "numeric" });
    const timeText = start.toLocaleTimeString("en-CA", { ...opts, hour: "numeric", minute: "2-digit" });
    return `${dayText} at ${timeText}`;
  }
  const manageUrl = (id, key) => siteLink(`/book?booking=${encodeURIComponent(id)}&key=${key}`);

  /** Emails the customer (and tells the owner) about a booking. `kind`: booked, moved, cancelled. Never throws. */
  async function tellCustomer(id, b, kind, { key = "", refundText = "", byShop = false, toOwner = !byShop } = {}) {
    try {
      const to = b.customer?.email;
      if (!to || !EMAIL.test(to)) return;
      if (!byShop && !(await claimEmailSend(db, "bookingEmail", to))) return;
      const brand = await emailBrand();
      const shop = brand.shopName || shopName() || "the shop";
      const when = whenWords(b);
      const where = b.location ? `<p style="margin:0 0 4px;"><strong>Where:</strong> ${escapeHtml(b.location)}</p>` : "";
      const subject = { notCleared: `Not booked: ${b.serviceName}, ${when}`, reminder: `Coming up: ${b.serviceName}, ${when}`, booked: `Booked: ${b.serviceName}, ${when}`, moved: `Moved: ${b.serviceName}, now ${when}`, cancelled: `Cancelled: ${b.serviceName}, ${when}` }[kind];
      const lead = {
        reminder: `A reminder of your booking with ${escapeHtml(shop)}. If you can't make it, please cancel or move it below so the time can go to someone else.`,
        notCleared: `Your bank payment for this booking with ${escapeHtml(shop)} didn't clear in time, so the time has been released. Nothing was taken. You're welcome to book again.`,
        booked: `You're booked in with ${escapeHtml(shop)}.`,
        moved: `Your booking with ${escapeHtml(shop)} has moved.`,
        cancelled: `Your booking with ${escapeHtml(shop)} is cancelled.${refundText ? ` ${escapeHtml(refundText)}` : ""}`,
      }[kind];
      const ended = kind === "cancelled" || kind === "notCleared";
      const calendar = ended ? "" : `<p style="margin:16px 0 0;"><a href="${escapeHtml(googleCalendarLink({ title: `${b.serviceName} · ${shop}`, start: Date.parse(b.start), end: Date.parse(b.end), location: b.location || "" }))}">Add to Google Calendar</a>${key ? ` &nbsp;·&nbsp; <a href="${escapeHtml(siteLink(`/calendar/b/${encodeURIComponent(id)}/${key}.ics`))}">Add to Apple Calendar</a>` : ""}</p>`;
      const manage = !ended && key ? risoButton(escapeHtml(manageUrl(id, key)), "See or change your booking", brand.accent, brand.theme) : "";
      const html = risoLayout(`
        <h4 style="margin:0 0 8px;">${escapeHtml({ notCleared: "Payment didn't clear", reminder: "See you soon", booked: "Booking confirmed", moved: "Booking moved", cancelled: "Booking cancelled" }[kind])}</h4>
        <h2 style="margin:0 0 12px;">${escapeHtml(b.serviceName)}</h2>
        <p style="margin:0 0 16px;">${lead}</p>
        <p style="margin:0 0 4px;"><strong>When:</strong> ${escapeHtml(when)}</p>
        <p style="margin:0 0 4px;"><strong>How long:</strong> ${b.minutes} minutes</p>
        ${where}
        ${manage}
        ${calendar}
      `, { logoUrl: brand.logoUrl || "", accent: brand.accent || "", theme: brand.theme || "light", shopName: shop });
      await sendEmail({ to, subject, html });
      const owner = ownerEmail();
      if (owner && toOwner) {
        await sendEmail({
          to: owner,
          subject: `[BOOKING] ${{ booked: "New", moved: "Moved", notCleared: "Payment didn't clear" }[kind] || "Cancelled"}: ${b.serviceName}, ${when}`,
          html: risoLayout(`<h2 style="margin:0 0 12px;">${escapeHtml(b.customer.name)}: ${escapeHtml(b.serviceName)}</h2>
            <p style="margin:0 0 4px;">${escapeHtml(when)} · ${b.minutes} minutes</p>
            <p style="margin:0 0 4px;">${escapeHtml(b.customer.email)}${b.customer.phone ? ` · ${escapeHtml(b.customer.phone)}` : ""}</p>
            ${kind === "notCleared" ? `<p style="margin:12px 0 0;">Their bank payment was still clearing when the booking was due, so the time was released and nothing was taken. You may want to get in touch with them.</p>` : ""}
            ${b.note ? `<p style="margin:12px 0 0;">“${escapeHtml(b.note)}”</p>` : ""}
            ${(b.answers || []).map((a) => `<p style="margin:12px 0 0;"><strong>${escapeHtml(a.label)}</strong><br>${escapeHtml(a.answer)}</p>`).join("")}
            ${risoButton(escapeHtml(siteLink("/admin#bookings")), "Open Bookings", brand.accent, brand.theme)}`, { logoUrl: brand.logoUrl || "", accent: brand.accent || "", theme: brand.theme || "light", shopName: shop }),
        });
      }
    } catch (err) {
      console.warn(`Booking ${id} ${kind} email failed:`, err?.message || err);
    }
  }

  // ── The waiting list ──────────────────────────────────────────────────────────────────────────────────────────────

  async function busyAround(day, nowMs) {
    const snaps = await Promise.all([addDays(day, -1), day, addDays(day, 1)].map((d) => dayRef(d).get()));
    return busyFrom(snaps, nowMs);
  }
  /** The full starts of a class on one day: its own times that only lack a place (nothing else is in the way). */
  function fullClassTimes(service, settings, busy, day, nowMs) {
    if (!isClass(service)) return [];
    const others = busy.filter((b) => b.serviceId !== service.id);
    const open = new Set(freeTimes({ service, settings, busy, day, zone: zone(), nowMs }));
    return freeTimes({ service, settings, busy: others, day, zone: zone(), nowMs }).filter((ms) => !open.has(ms) && busy.some((b) => b.serviceId === service.id && b.start === ms));
  }

  /**
   * Emails the people waiting for these days whose time has room again: once each, then their entry is gone. Everyone
   * waiting for the same place is told together and the first to book gets it. Never throws.
   */
  async function tellWaitlist(days) {
    try {
      const settings = await readSettings();
      if (!settings.live) return 0;
      let told = 0;
      let list = null;
      for (const day of [...new Set(days)]) {
        const snap = await waitlist().where("day", "==", day).limit(MAX_WAITING * 4).get();
        if (snap.empty) continue;
        list = list || (await readServices());
        const nowMs = now().getTime();
        const busy = await busyAround(day, nowMs);
        const brand = await emailBrand();
        const shop = brand.shopName || shopName() || "the shop";
        for (const doc of snap.docs) {
          const w = doc.data();
          const service = list.find((s) => s.id === w.serviceId && s.active);
          if (!service) { await doc.ref.delete(); continue; }
          const times = freeTimes({ service, settings, busy, day, zone: zone(), nowMs });
          const open = w.start ? times.includes(Date.parse(w.start)) : times.length > 0;
          if (!open || !EMAIL.test(String(w.email || ""))) continue;
          if (!(await claimEmailSend(db, "bookingEmail", w.email))) continue;
          await doc.ref.delete();
          const when = w.start ? whenWords({ start: w.start }) : new Date(`${day}T12:00:00Z`).toLocaleDateString("en-CA", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
          await sendEmail({
            to: w.email,
            subject: `A place has opened: ${service.name}, ${when}`,
            html: risoLayout(`
              <h4 style="margin:0 0 8px;">A place has opened</h4>
              <h2 style="margin:0 0 12px;">${escapeHtml(service.name)}</h2>
              <p style="margin:0 0 16px;">You asked ${escapeHtml(shop)} to tell you if ${w.start ? "a place" : "a time"} opened on ${escapeHtml(when)}. One just did. It isn't held for you, so the first person to book gets it.</p>
              ${risoButton(escapeHtml(siteLink(`/book?service=${encodeURIComponent(service.id)}&day=${day}`)), "Book it now", brand.accent, brand.theme)}
            `, { logoUrl: brand.logoUrl || "", accent: brand.accent || "", theme: brand.theme || "light", shopName: shop }),
          });
          told += 1;
        }
      }
      return told;
    } catch (err) {
      console.warn("bookings: the waiting list wasn't told:", err?.message || err);
      return 0;
    }
  }

  /** Forgets the people who waited for days now past. */
  async function sweepWaitlist() {
    if (!(await featureOn())) return { forgotten: 0 };
    const snap = await waitlist().where("day", "<", dayOf(now().getTime(), zone())).limit(200).get();
    for (const doc of snap.docs) await doc.ref.delete();
    return { forgotten: snap.docs.length };
  }

  // ── Taking, moving and freeing time (one transaction each) ──────────────────────────────────────────────────────

  /** Takes `start` for a new booking if it is still free, writing the booking and its days together. */
  async function takeTime({ id, service, settings, start, record, check = true }) {
    const end = start + service.minutes * MINUTE;
    const blockEnd = end + service.gapAfter * MINUTE;
    const days = daysTouched(start, blockEnd, zone());
    return db.runTransaction(async (tx) => {
      const snaps = await Promise.all(days.map((d) => tx.get(dayRef(d))));
      const nowMs = now().getTime();
      if (check && !isFreeTime({ service, settings, busy: busyFrom(snaps, nowMs), start, zone: zone(), nowMs })) return false;
      const held = record.status === "held";
      days.forEach((d, i) => {
        const items = { ...((snaps[i].exists ? snaps[i].data()?.items : null) || {}) };
        items[id] = { start, end: blockEnd, held, at: nowMs, s: record.serviceId };
        tx.set(dayRef(d), { items });
      });
      tx.set(bookings().doc(id), { ...record, start: new Date(start).toISOString(), end: new Date(end).toISOString() });
      return true;
    });
  }

  /** Frees a booking's time (cancelled, or a hold that ran out), and writes `changes` on the booking. */
  async function freeTime(id, b, changes) {
    const days = daysTouched(Date.parse(b.start), Date.parse(b.end) + (b.gapAfter || 0) * MINUTE, zone());
    await db.runTransaction(async (tx) => {
      const snaps = await Promise.all(days.map((d) => tx.get(dayRef(d))));
      days.forEach((d, i) => {
        const items = { ...((snaps[i].exists ? snaps[i].data()?.items : null) || {}) };
        if (!(id in items)) return;
        delete items[id];
        tx.set(dayRef(d), { items });
      });
      tx.set(bookings().doc(id), changes, { merge: true });
    });
    await tellWaitlist(days);
  }

  /** Moves a booking to `start` if free (its own old time doesn't count against it). */
  async function moveTime(id, b, service, settings, start, { check = true, by = "customer" } = {}) {
    const oldDays = daysTouched(Date.parse(b.start), Date.parse(b.end) + (b.gapAfter || 0) * MINUTE, zone());
    const end = start + b.minutes * MINUTE;
    const blockEnd = end + (b.gapAfter || 0) * MINUTE;
    const newDays = daysTouched(start, blockEnd, zone());
    const all = [...new Set([...oldDays, ...newDays])];
    const moved = await db.runTransaction(async (tx) => {
      const snaps = await Promise.all(all.map((d) => tx.get(dayRef(d))));
      const nowMs = now().getTime();
      const nearby = snaps.filter((_, i) => newDays.includes(all[i]));
      if (check && !isFreeTime({ service, settings, busy: busyFrom(nearby, nowMs, id), start, zone: zone(), nowMs })) return false;
      all.forEach((d, i) => {
        const items = { ...((snaps[i].exists ? snaps[i].data()?.items : null) || {}) };
        delete items[id];
        if (newDays.includes(d)) items[id] = { start, end: blockEnd, held: false, at: nowMs, s: b.serviceId };
        tx.set(dayRef(d), { items });
      });
      tx.set(bookings().doc(id), {
        start: new Date(start).toISOString(), end: new Date(end).toISOString(), updatedAt: new Date(nowMs).toISOString(), reminderSentAt: null,
        history: [...(b.history || []), { at: new Date(nowMs).toISOString(), what: `moved from ${b.start}`, by }].slice(-20),
      }, { merge: true });
      return true;
    });
    // The time left behind may be what someone is waiting for.
    if (moved) await tellWaitlist(oldDays);
    return moved;
  }

  /** Reads a held booking's payment pages; confirms it when one is paid. Returns the booking as it now stands. */
  async function refreshHeld(id, b, checkout) {
    if (b.status !== "held" || !checkout) return b;
    for (const sid of (b.sessions || []).slice(-10)) {
      if (!SESSION_ID.test(sid)) continue;
      const session = await checkout.read(sid).catch(() => null);
      if (!session || session.payment_status !== "paid") continue;
      if (session.metadata?.booking && session.metadata.booking !== id) continue;
      if (Number.isFinite(session.amount_total) && session.amount_total !== b.priceMinor) continue;
      return confirmPaid(id, b, sid, session.payment_intent);
    }
    return b;
  }

  /** Is a payment on one of this hold's pages finished by the customer but still clearing with their bank? */
  async function paymentClearing(b, checkout) {
    if (!checkout) return false;
    for (const sid of (b.sessions || []).slice(-10)) {
      if (!SESSION_ID.test(sid)) continue;
      const session = await checkout.read(sid).catch(() => null);
      if (session?.status === "complete" && session.payment_status === "unpaid") return true;
    }
    return false;
  }

  async function confirmPaid(id, b, sid, intent) {
    const at = now().toISOString();
    const changes = {
      status: "confirmed", paid: true, paidSession: sid, paymentIntent: typeof intent === "string" ? intent : intent?.id || null,
      holdUntil: null, updatedAt: at, history: [...(b.history || []), { at, what: "paid", by: "customer" }].slice(-20),
    };
    // The days stop calling it a hold.
    const days = daysTouched(Date.parse(b.start), Date.parse(b.end) + (b.gapAfter || 0) * MINUTE, zone());
    const confirmed = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(bookings().doc(id));
      if (fresh.data()?.status !== "held") return false;
      const snaps = await Promise.all(days.map((d) => tx.get(dayRef(d))));
      days.forEach((d, i) => {
        const items = { ...((snaps[i].exists ? snaps[i].data()?.items : null) || {}) };
        if (items[id]) items[id] = { ...items[id], held: false };
        tx.set(dayRef(d), { items });
      });
      tx.set(bookings().doc(id), changes, { merge: true });
      return true;
    });
    const next = { ...b, ...changes };
    if (confirmed) await tellCustomer(id, next, "booked", { key: b.pendingKey || "" });
    if (confirmed && b.pendingKey) await bookings().doc(id).set({ pendingKey: null }, { merge: true });
    return next;
  }

  /** Refunds a paid booking in full. Returns the refund, or null when nothing was paid by card. */
  async function refundBooking(id, b, amountMinor = b.priceMinor) {
    if (!b.paid || !b.paymentIntent || b.refund?.refundId) return null;
    const mode = (await shopTestMode()) ? "test" : "live";
    const whole = amountMinor === b.priceMinor;
    const refund = await payments.refund({ mode, paymentIntentId: b.paymentIntent, amountMinor, metadata: { booking: id }, idempotencyKey: whole ? `booking-refund-${id}` : `booking-refund-${id}-${amountMinor}` });
    return { refundId: refund.refundId, amountMinor: refund.amountMinor, at: now().toISOString() };
  }

  async function loadBooking(id, key) {
    if (!ID.test(String(id || "")) || !KEY.test(String(key || ""))) return null;
    const snap = await bookings().doc(id).get();
    const data = snap.exists ? snap.data() : null;
    if (!data || !(sameHash(data.manageKeyHash, hash(key)) || (data.reminderKeyHash && sameHash(data.reminderKeyHash, hash(key))))) return null;
    return snap.data();
  }

  const fail = (res, status, error, code) => res.status(status).json({ error, ...(code ? { code } : {}) });

  // ── Customers (validateDiscountCode actions; no sign-in) ───────────────────────────────────────────────────────

  async function handlePublic(req, res) {
    const action = req.body?.action;
    res.set("Cache-Control", "private, no-store");
    if (!(await hitLimit(db, "booking", req, LIMITS.booking))) return fail(res, 429, "Too many tries. Please wait a few minutes and try again.");
    try {
      if (!(await featureOn())) return res.status(200).json({ on: false });
      const settings = await readSettings();
      const nowMs = now().getTime();
      if (action === "bookingInfo") {
        if (!settings.live) return res.status(200).json({ on: false });
        const list = (await readServices()).filter((s) => s.active);
        return res.status(200).json({
          on: true, zone: zone(), currency: currency(), cancelHours: settings.cancelHours, maxDaysAhead: settings.maxDaysAhead, today: dayOf(nowMs, zone()),
          services: list.map(({ id, name, description, minutes, priceMinor, payment, location, questions, places }) => ({ id, name, description, minutes, priceMinor, payment, location, questions, places })),
        });
      }
      if (action === "bookingTimes") {
        if (!settings.live) return res.status(200).json({ on: false });
        const service = (await readServices()).find((s) => s.id === req.body?.serviceId && s.active);
        if (!service) return fail(res, 404, "This service isn't taking bookings right now.");
        const from = isDay(req.body?.from) ? req.body.from : dayOf(nowMs, zone());
        const count = Math.min(MAX_DAYS_ASKED, Math.max(1, Math.round(Number(req.body?.days) || 7)));
        const days = Array.from({ length: count }, (_, i) => addDays(from, i));
        const snaps = await Promise.all([addDays(from, -1), ...days, addDays(from, count)].map((d) => dayRef(d).get()));
        const busy = busyFrom(snaps, nowMs);
        const out = {};
        // A group class also says how many places each time has left.
        const left = {};
        for (const day of days) {
          out[day] = freeTimes({ service, settings, busy, day, zone: zone(), nowMs }).map((ms) => {
            const iso = new Date(ms).toISOString();
            if (isClass(service)) left[iso] = placesLeft(ms, service, busy);
            return iso;
          });
        }
        // A class's full times are listed too, so the page can offer its waiting list.
        const full = {};
        if (isClass(service)) for (const day of days) {
          const list = fullClassTimes(service, settings, busy, day, nowMs);
          if (list.length) full[day] = list.map((ms) => new Date(ms).toISOString());
        }
        return res.status(200).json({ on: true, days: out, ...(isClass(service) ? { places: service.places, left, full } : {}) });
      }
      if (action === "bookingStart") {
        if (!settings.live) return fail(res, 409, "Bookings are closed right now.");
        const service = (await readServices()).find((s) => s.id === req.body?.serviceId && s.active);
        if (!service) return fail(res, 404, "This service isn't taking bookings right now.");
        const start = Date.parse(String(req.body?.start || ""));
        if (!Number.isFinite(start)) return fail(res, 400, "Pick a time first.");
        const customer = cleanCustomer(req.body);
        if (customer.problem) return fail(res, 400, customer.problem);
        // The service's own questions: a required one left empty stops the booking, with the question named.
        const answered = cleanAnswers(service.questions, req.body?.answers);
        if (answered.problem) return fail(res, 400, answered.problem, "answers");
        const paid = service.payment === "full" && service.priceMinor > 0;
        let checkout = null;
        if (paid) {
          ({ checkout } = await standalone());
          if (!checkout) return fail(res, 409, "This shop can't take card payments for bookings yet. Please contact the shop.", "not_available");
        }
        const id = randomId();
        const key = randomKey();
        const at = new Date(nowMs).toISOString();
        const record = {
          serviceId: service.id, serviceName: service.name, minutes: service.minutes, gapAfter: service.gapAfter, location: service.location,
          customer: { name: customer.name, email: customer.email, phone: customer.phone }, note: customer.note, answers: answered.answers,
          status: paid ? "held" : "confirmed", payment: paid ? "card" : "free", priceMinor: paid ? service.priceMinor : 0, currency: currency(),
          paid: false, sessions: [], holdUntil: paid ? new Date(nowMs + HOLD_MINUTES * MINUTE).toISOString() : null, manageKeyHash: hash(key),
          // Kept only until the payment is confirmed, so the confirmation email can carry the customer's link.
          pendingKey: paid ? key : null,
          source: "website", history: [{ at, what: "booked", by: "customer" }], createdAt: at, updatedAt: at,
        };
        const took = await takeTime({ id, service, settings, start, record });
        if (!took) return fail(res, 409, isClass(service) ? "That class just filled up. Please pick another time." : "Someone just took that time. Please pick another.", "taken");
        if (!paid) {
          await tellCustomer(id, { ...record, start: new Date(start).toISOString(), end: new Date(start + service.minutes * MINUTE).toISOString() }, "booked", { key });
          return res.status(200).json({ id, key, status: "confirmed" });
        }
        try {
          const description = `${shopName() ? `${shopName()}: ` : ""}${service.name}`.slice(0, 250);
          const metadata = { booking: id };
          const session = await checkout.open({
            mode: "payment",
            line_items: [{ quantity: 1, price_data: { currency: currency().toLowerCase(), unit_amount: service.priceMinor, product_data: { name: description } } }],
            customer_email: customer.email,
            metadata,
            payment_intent_data: { description, metadata },
            // Stripe's shortest page life is 30 minutes; the sweep closes it once the hold runs out.
            expires_at: Math.floor(nowMs / 1000) + 31 * 60,
            success_url: manageUrl(id, key),
          }, `booking-${id}`);
          await bookings().doc(id).set({ sessions: [session.id] }, { merge: true });
          return res.status(200).json({ id, key, status: "held", url: session.url, holdMinutes: HOLD_MINUTES });
        } catch (err) {
          await freeTime(id, { ...record, start: new Date(start).toISOString(), end: new Date(start + service.minutes * MINUTE).toISOString() }, { status: "cancelled", holdUntil: null, updatedAt: now().toISOString() });
          if (err?.code === "currency_mismatch") return fail(res, 409, err.message, "currency_mismatch");
          if (["test_only", "not_connected", "not_available"].includes(err?.code)) {
            console.error(`Booking ${id} card payment refused:`, err.code, err?.message || err);
            return fail(res, 409, "This shop can't take card payments for bookings yet. Please contact the shop.", "not_available");
          }
          console.error(`Booking ${id} payment page refused:`, err?.type || "", err?.code || "", err?.param || "", err?.message || err);
          throw err;
        }
      }
      if (action === "bookingWait") {
        // Hear when a full class time (start) or a full day has room again. Nothing is held for anyone.
        if (!settings.live) return fail(res, 409, "Bookings are closed right now.");
        const service = (await readServices()).find((s) => s.id === req.body?.serviceId && s.active);
        if (!service) return fail(res, 404, "This service isn't taking bookings right now.");
        const customer = cleanCustomer(req.body);
        if (customer.problem) return fail(res, 400, customer.problem.replace("send your booking to", "reach you at"));
        const start = req.body?.start ? Date.parse(String(req.body.start)) : null;
        if (start !== null && !Number.isFinite(start)) return fail(res, 400, "Pick a time first.");
        const day = start !== null ? dayOf(start, zone()) : String(req.body?.day || "");
        const today = dayOf(nowMs, zone());
        if (!isDay(day) || day < today || day > addDays(today, settings.maxDaysAhead)) return fail(res, 400, "Pick a day first.");
        const busy = await busyAround(day, nowMs);
        const times = freeTimes({ service, settings, busy, day, zone: zone(), nowMs });
        if (start !== null ? times.includes(start) : times.length > 0) return fail(res, 409, "There is room now. You can book it straight away.", "open");
        if (start !== null && !fullClassTimes(service, settings, busy, day, nowMs).includes(start)) return fail(res, 400, "That time isn't one you can wait for.");
        const startIso = start !== null ? new Date(start).toISOString() : null;
        const wid = hash(`${service.id}|${startIso || day}|${customer.email}`).slice(0, 32);
        const waiting = await waitlist().where("day", "==", day).limit(MAX_WAITING * 4).get();
        if (!waiting.docs.some((d) => d.id === wid) && waiting.docs.filter((d) => d.data()?.serviceId === service.id).length >= MAX_WAITING) {
          return fail(res, 409, "The waiting list for this day is full.", "wait_full");
        }
        await waitlist().doc(wid).set({ serviceId: service.id, serviceName: service.name, day, start: startIso, name: customer.name, email: customer.email, createdAt: new Date(nowMs).toISOString() });
        return res.status(200).json({ ok: true });
      }
      const id = String(req.body?.id || "");
      const key = String(req.body?.key || "");
      let b = await loadBooking(id, key);
      if (!b) return fail(res, 404, "We couldn't find this booking. Check the link in your email.");
      if (action === "bookingView") {
        if (b.status === "held") b = await refreshHeld(id, b, (await standalone()).checkout);
        return res.status(200).json({ booking: publicBooking(id, b, settings, nowMs) });
      }
      if (action === "bookingCancel") {
        if (b.status === "cancelled") return res.status(200).json({ booking: publicBooking(id, b, settings, nowMs) });
        if (b.status !== "confirmed" || !customerCanChange(Date.parse(b.start), settings, nowMs)) {
          return fail(res, 409, `This booking can't be cancelled online within ${settings.cancelHours} hours of its start. Please contact the shop.`, "too_late");
        }
        let refund = null;
        try { refund = await refundBooking(id, b); } catch (err) {
          console.error(`Booking ${id} refund failed:`, err?.message || err);
          return fail(res, 502, "Your refund couldn't be started, so the booking is still on. Please try again in a minute.");
        }
        const at = now().toISOString();
        const changes = { status: "cancelled", cancelledAt: at, cancelledBy: "customer", updatedAt: at, ...(refund ? { refund } : {}),
          history: [...(b.history || []), { at, what: refund ? "cancelled and refunded" : "cancelled", by: "customer" }].slice(-20) };
        await freeTime(id, b, changes);
        const next = { ...b, ...changes };
        await tellCustomer(id, next, "cancelled", { refundText: refund ? "Your payment is being refunded to your card." : "" });
        return res.status(200).json({ booking: publicBooking(id, next, settings, nowMs) });
      }
      if (action === "bookingMove") {
        if (b.status !== "confirmed" || !customerCanChange(Date.parse(b.start), settings, nowMs)) {
          return fail(res, 409, `This booking can't be moved online within ${settings.cancelHours} hours of its start. Please contact the shop.`, "too_late");
        }
        const service = (await readServices()).find((s) => s.id === b.serviceId) || { minutes: b.minutes, gapAfter: b.gapAfter || 0 };
        const start = Date.parse(String(req.body?.start || ""));
        if (!Number.isFinite(start)) return fail(res, 400, "Pick a new time first.");
        const moved = await moveTime(id, b, { ...service, id: b.serviceId, minutes: b.minutes, gapAfter: b.gapAfter || 0 }, settings, start);
        if (!moved) return fail(res, 409, isClass(service) ? "That class just filled up. Please pick another time." : "Someone just took that time. Please pick another.", "taken");
        const next = { ...b, start: new Date(start).toISOString(), end: new Date(start + b.minutes * MINUTE).toISOString() };
        await tellCustomer(id, next, "moved", { key });
        return res.status(200).json({ booking: publicBooking(id, next, settings, nowMs) });
      }
      return fail(res, 400, "Unknown booking action.");
    } catch (err) {
      console.error("booking action failed:", action, err?.message || err);
      return fail(res, 502, "Bookings couldn't be reached just now. Please try again.");
    }
  }

  // ── The owner (createStripeCheckoutSession action "bookingsAdmin") ─────────────────────────────────────────────

  async function handleAdmin(req, res) {
    const adminUser = await requireAdmin(req, res);
    if (!adminUser) return;
    const op = req.body?.op;
    const by = adminUser.email || "admin";
    try {
      if (!(await featureOn())) return fail(res, 403, "Bookings aren't turned on for this shop.", "off");
      const settings = await readSettings();
      if (op === "saveService") {
        const id = ID.test(String(req.body?.service?.id || "")) ? req.body.service.id : randomId();
        const service = cleanService(req.body?.service, id);
        if (service.problem) return fail(res, 400, service.problem);
        const existing = await services().limit(MAX_SERVICES + 1).get();
        if (!existing.docs.some((d) => d.id === id) && existing.docs.length >= MAX_SERVICES) return fail(res, 400, `A shop can have up to ${MAX_SERVICES} services.`);
        await services().doc(id).set({ ...service, updatedAt: now().toISOString(), updatedBy: by });
        return res.status(200).json({ ok: true, service });
      }
      if (op === "deleteService") {
        const id = String(req.body?.id || "");
        if (!ID.test(id)) return fail(res, 400, "Unknown service.");
        await services().doc(id).delete();
        return res.status(200).json({ ok: true });
      }
      if (op === "calendarFeed") {
        // The owner's private calendar link (frontDoor.js answers it). Kept server-only; a new one stops the old.
        const ref = db.collection("bookingFeed").doc("main");
        const snap = await ref.get();
        let token = snap.exists ? snap.data()?.token : "";
        if (!KEY.test(String(token || "")) || req.body?.renew === true) {
          token = randomKey();
          await ref.set({ token, madeAt: now().toISOString(), madeBy: by });
        }
        return res.status(200).json({ path: `/calendar/${token}.ics` });
      }
      if (op === "saveSettings") {
        const next = cleanBookingSettings(req.body?.settings);
        await settingsRef().set({ ...next, updatedAt: now().toISOString(), updatedBy: by });
        await tellWebsite(next.live);
        return res.status(200).json({ ok: true, settings: next });
      }
      if (op === "setLive") {
        // The owner's on/off switch (Orders › Bookings): one tap, nothing else about the hours changes. Off hides the
        // page and its links and stops new bookings; bookings already made stay, and customers can still open theirs.
        const next = { ...settings, live: req.body?.live === true };
        await settingsRef().set({ ...next, updatedAt: now().toISOString(), updatedBy: by });
        await tellWebsite(next.live);
        return res.status(200).json({ ok: true, settings: next });
      }
      if (op === "times") {
        // The admin's own times for a new or moved booking: the same free times customers see, without the notice.
        const service = (await readServices()).find((s) => s.id === req.body?.serviceId);
        if (!service) return fail(res, 404, "Choose a service.");
        const day = isDay(req.body?.day) ? req.body.day : dayOf(now().getTime(), zone());
        const nowMs = now().getTime();
        const snaps = await Promise.all([addDays(day, -1), day, addDays(day, 1)].map((d) => dayRef(d).get()));
        const own = { ...settings, minNoticeHours: 0, maxDaysAhead: 366 };
        const times = freeTimes({ service, settings: own, busy: busyFrom(snaps, nowMs, String(req.body?.except || "")), day, zone: zone(), nowMs });
        return res.status(200).json({ times: times.map((ms) => new Date(ms).toISOString()) });
      }
      if (op === "waitlist") {
        // Who is waiting from one day to another (the week on screen). Read here because no browser may read the list.
        const from = isDay(req.body?.from) ? req.body.from : dayOf(now().getTime(), zone());
        const to = isDay(req.body?.to) ? req.body.to : addDays(from, 6);
        const snap = await waitlist().where("day", ">=", from).where("day", "<=", to).limit(500).get();
        return res.status(200).json({ waiting: snap.docs.map((d) => { const w = d.data(); return { id: d.id, serviceId: w.serviceId, serviceName: w.serviceName, day: w.day, start: w.start || null, name: w.name, email: w.email, createdAt: w.createdAt }; }) });
      }
      if (op === "removeWaiting") {
        const wid = String(req.body?.id || "");
        if (!/^[a-f0-9]{32}$/.test(wid)) return fail(res, 400, "Unknown entry.");
        await waitlist().doc(wid).delete();
        return res.status(200).json({ ok: true });
      }
      if (op === "create") {
        const service = (await readServices()).find((s) => s.id === req.body?.serviceId);
        if (!service) return fail(res, 404, "Choose a service.");
        const customer = cleanCustomer(req.body);
        if (customer.problem) return fail(res, 400, customer.problem.replace("your", "the customer's").replace("Please add an email address we can send your booking to.", "Add the customer's email address."));
        const start = Date.parse(String(req.body?.start || ""));
        if (!Number.isFinite(start)) return fail(res, 400, "Pick a time.");
        const id = randomId();
        const key = randomKey();
        const at = now().toISOString();
        const record = {
          serviceId: service.id, serviceName: service.name, minutes: service.minutes, gapAfter: service.gapAfter, location: service.location,
          // The owner booking someone in may fill in the service's questions or leave them.
          customer: { name: customer.name, email: customer.email, phone: customer.phone }, note: customer.note, answers: cleanAnswers(service.questions, req.body?.answers, false).answers,
          status: "confirmed", payment: service.payment === "full" ? "atShop" : "free", priceMinor: service.priceMinor, currency: currency(),
          paid: false, sessions: [], holdUntil: null, manageKeyHash: hash(key), pendingKey: null, source: "admin",
          history: [{ at, what: "booked", by }], createdAt: at, updatedAt: at,
        };
        // The owner may book any time that doesn't clash, outside the hours too (a favour for a regular).
        const own = { ...settings, minNoticeHours: 0, maxDaysAhead: 366, hours: Array.from({ length: 7 }, () => [{ start: "00:00", end: "23:59" }]), daysOff: [], step: 5 };
        const took = await takeTime({ id, service: { ...service, classTimes: [] }, settings: own, start, record });
        if (!took) return fail(res, 409, isClass(service) ? "That class is full, or the time clashes with another booking." : "That time clashes with another booking.", "taken");
        if (req.body?.sendEmail !== false) await tellCustomer(id, { ...record, start: new Date(start).toISOString(), end: new Date(start + service.minutes * MINUTE).toISOString() }, "booked", { key, byShop: true });
        return res.status(200).json({ ok: true, id });
      }
      const id = String(req.body?.id || "");
      if (!ID.test(id)) return fail(res, 400, "Unknown booking.");
      const snap = await bookings().doc(id).get();
      if (!snap.exists) return fail(res, 404, "This booking is gone.");
      const b = snap.data();
      if (op === "cancel") {
        if (b.status === "cancelled") return res.status(200).json({ ok: true });
        let refund = null;
        // refund: true is the whole payment; refundMinor a part of it (a shop keeping a deposit), 0 for none.
        const part = req.body?.refundMinor;
        const amount = part === undefined ? (req.body?.refund === true ? b.priceMinor : 0) : Number(part);
        if (!Number.isInteger(amount) || amount < 0 || amount > (b.priceMinor || 0)) return fail(res, 400, "The refund can't be more than they paid.");
        if (amount > 0) {
          try { refund = await refundBooking(id, b, amount); } catch (err) {
            console.error(`Booking ${id} refund failed:`, err?.message || err);
            return fail(res, 502, "The refund couldn't be started, so the booking is still on. Try again in a minute.");
          }
        }
        const at = now().toISOString();
        const changes = { status: "cancelled", cancelledAt: at, cancelledBy: by, holdUntil: null, updatedAt: at, ...(refund ? { refund } : {}),
          history: [...(b.history || []), { at, what: refund ? "cancelled and refunded" : "cancelled", by }].slice(-20) };
        await freeTime(id, b, changes);
        if (req.body?.notify !== false && b.status === "confirmed") await tellCustomer(id, { ...b, ...changes }, "cancelled", { byShop: true, refundText: !refund ? "" : refund.amountMinor < b.priceMinor ? `${moneyWords(refund.amountMinor, b.currency)} of your payment is being refunded to your card.` : "Your payment is being refunded to your card." });
        return res.status(200).json({ ok: true, refunded: !!refund, refundMinor: refund?.amountMinor || 0 });
      }
      if (op === "move") {
        if (b.status !== "confirmed") return fail(res, 409, "Only a confirmed booking can be moved.");
        const start = Date.parse(String(req.body?.start || ""));
        if (!Number.isFinite(start)) return fail(res, 400, "Pick a new time.");
        const own = { ...settings, minNoticeHours: 0, maxDaysAhead: 366, hours: Array.from({ length: 7 }, () => [{ start: "00:00", end: "23:59" }]), daysOff: [], step: 5 };
        // A class keeps its places when one of its people is moved: they may join another start of the same class.
        const theirs = (await readServices()).find((s) => s.id === b.serviceId);
        const moved = await moveTime(id, b, { id: b.serviceId, places: theirs?.places || 1, minutes: b.minutes, gapAfter: b.gapAfter || 0 }, own, start, { by });
        if (!moved) return fail(res, 409, isClass(theirs) ? "That class is full, or the time clashes with another booking." : "That time clashes with another booking.", "taken");
        // A new link: the old one in the customer's first email still works, since the key is unchanged.
        if (req.body?.notify !== false) await tellCustomer(id, { ...b, start: new Date(start).toISOString(), end: new Date(start + b.minutes * MINUTE).toISOString() }, "moved", { byShop: true });
        return res.status(200).json({ ok: true });
      }
      if (op === "noShow" || op === "paidAtShop") {
        const at = now().toISOString();
        const changes = op === "noShow"
          ? { noShow: req.body?.value !== false, updatedAt: at, history: [...(b.history || []), { at, what: req.body?.value !== false ? "marked no-show" : "no-show taken off", by }].slice(-20) }
          : { paid: req.body?.value !== false, updatedAt: at, history: [...(b.history || []), { at, what: req.body?.value !== false ? "marked paid at the shop" : "paid mark taken off", by }].slice(-20) };
        await bookings().doc(id).set(changes, { merge: true });
        return res.status(200).json({ ok: true });
      }
      return fail(res, 400, "Unknown bookings action.");
    } catch (err) {
      console.error("bookingsAdmin failed:", op, err?.message || err);
      return fail(res, 502, "Bookings couldn't be saved just now. Please try again.");
    }
  }

  // ── The five-minute sweep ──────────────────────────────────────────────────────────────────────────────────────

  /** Confirms paid holds and frees the time of holds that ran out (their payment page closed first). */
  async function sweepHolds() {
    if (!(await featureOn())) return { confirmed: 0, freed: 0 };
    const snap = await bookings().where("status", "==", "held").limit(100).get();
    if (snap.empty) return { confirmed: 0, freed: 0 };
    const { checkout } = await standalone();
    let confirmed = 0;
    let freed = 0;
    const nowMs = now().getTime();
    for (const doc of snap.docs) {
      let b = doc.data();
      b = await refreshHeld(doc.id, b, checkout);
      if (b.status === "confirmed") { confirmed += 1; continue; }
      if (Date.parse(b.holdUntil || "") > nowMs) continue;
      // A slower way to pay (a bank debit) finishes the page but clears later: keep the time for it until the booking starts.
      if (Date.parse(b.start || "") > nowMs && (await paymentClearing(b, checkout))) {
        if (!b.clearing) await bookings().doc(doc.id).set({ clearing: true, history: [...(b.history || []), { at: now().toISOString(), what: "payment clearing", by: "customer" }].slice(-20) }, { merge: true });
        continue;
      }
      // Close every page first, then read once more: a payment that landed just before the close still counts.
      for (const sid of b.sessions || []) if (SESSION_ID.test(sid)) await checkout?.close(sid).catch(() => {});
      b = await refreshHeld(doc.id, b, checkout);
      if (b.status === "confirmed") { confirmed += 1; continue; }
      const at = now().toISOString();
      await freeTime(doc.id, b, { status: "cancelled", cancelledAt: at, cancelledBy: "hold ran out", holdUntil: null, pendingKey: null, updatedAt: at,
        history: [...(b.history || []), { at, what: b.clearing ? "payment didn't clear" : "not paid in time", by: "shop" }].slice(-20) });
      if (b.clearing) await tellCustomer(doc.id, b, "notCleared", { byShop: true, toOwner: true });
      freed += 1;
    }
    return { confirmed, freed };
  }

  /**
   * Emails each confirmed customer once, about a day before their booking. Skips bookings made in the last
   * REMINDER_SKIP_HOURS (the confirmation is fresh) and ones starting within the hour. Marks before sending, so a
   * second sweep never sends twice.
   */
  async function sweepReminders() {
    if (!(await featureOn())) return { reminded: 0 };
    const { reminderHours } = await readSettings();
    if (!reminderHours) return { reminded: 0 };
    const nowMs = now().getTime();
    const snap = await bookings().where("status", "==", "confirmed").limit(1000).get();
    let reminded = 0;
    for (const doc of snap.docs) {
      const b = doc.data();
      const start = Date.parse(b.start || "");
      if (b.reminderSentAt || !Number.isFinite(start)) continue;
      if (start - nowMs > reminderHours * HOUR || start - nowMs < Math.min(HOUR, reminderHours * HOUR / 2)) continue;
      if (nowMs - Date.parse(b.createdAt || "") < Math.min(REMINDER_SKIP_HOURS, reminderHours / 2) * HOUR) continue;
      // Its own link, so the customer can cancel or move from the reminder; the first email's link keeps working.
      const key = randomKey();
      await bookings().doc(doc.id).set({ reminderSentAt: new Date(nowMs).toISOString(), reminderKeyHash: hash(key) }, { merge: true });
      await tellCustomer(doc.id, b, "reminder", { byShop: true, key });
      reminded += 1;
    }
    return { reminded };
  }

  return { handlePublic, handleAdmin, sweepHolds, sweepReminders, sweepWaitlist, featureOn };
}

/**
 * The owner's calendar feed for frontDoor.js: every booking from a month back, as one calendar Google or Apple Calendar
 * subscribes to. `db` is the database root; only shops/<shopId>/… is read. null when the link is wrong or Bookings is off.
 */
async function bookingsFeed({ db, shopId, token, shopName = "", nowMs = Date.now() }) {
  if (!KEY.test(String(token || ""))) return null;
  const shop = db.collection("shops").doc(shopId);
  const [features, feed] = await Promise.all([shop.collection("platform").doc("features").get(), shop.collection("bookingFeed").doc("main").get()]);
  if (features.data()?.bookings !== true || !sameHash(feed.data()?.token, token)) return null;
  const snap = await shop.collection("bookings").where("status", "in", ["confirmed", "held"]).limit(2000).get();
  const from = nowMs - 31 * 24 * HOUR;
  const events = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .filter((b) => Date.parse(b.end || "") >= from)
    .map((b) => ({
      id: b.id, start: Date.parse(b.start), end: Date.parse(b.end), location: b.location || "",
      title: `${b.customer?.name || "Booking"}: ${b.serviceName || "Booking"}${b.status === "held" ? " (not paid yet)" : ""}`,
      details: [b.customer?.email, b.customer?.phone, b.note ? `“${b.note}”` : "", ...(b.answers || []).map((a) => `${a.label}: ${a.answer}`)].filter(Boolean).join("\n"),
    }));
  return bookingsFeedIcs(shopName ? `${shopName} bookings` : "Bookings", events, nowMs);
}

/** One booking as a calendar file, for the customer's "Add to Apple Calendar" link. null for a wrong link or a cancelled booking. */
async function customerBookingIcs({ db, shopId, id, key, shopName = "", nowMs = Date.now() }) {
  if (!ID.test(String(id || "")) || !KEY.test(String(key || ""))) return null;
  const shop = db.collection("shops").doc(shopId);
  const [features, snap] = await Promise.all([shop.collection("platform").doc("features").get(), shop.collection("bookings").doc(id).get()]);
  const b = snap.exists ? snap.data() : null;
  if (features.data()?.bookings !== true || !b || b.status !== "confirmed") return null;
  if (!(sameHash(b.manageKeyHash, hash(key)) || (b.reminderKeyHash && sameHash(b.reminderKeyHash, hash(key))))) return null;
  return bookingIcs({ id, title: shopName ? `${b.serviceName} · ${shopName}` : b.serviceName, start: Date.parse(b.start), end: Date.parse(b.end), location: b.location || "", nowMs });
}

const HOUR = 60 * 60 * 1000;
const moneyWords = (minor, currency) => new Intl.NumberFormat("en-CA", { style: "currency", currency: String(currency || "CAD").toUpperCase() }).format(minor / 100);
const REMINDER_SKIP_HOURS = 6;

const PUBLIC_BOOKING_ACTIONS = Object.freeze(["bookingInfo", "bookingTimes", "bookingStart", "bookingView", "bookingCancel", "bookingMove", "bookingWait"]);

module.exports = { bookingsFeed, customerBookingIcs, bookingActions, busyFrom, cleanCustomer, publicBooking, PUBLIC_BOOKING_ACTIONS, HOLD_MINUTES };
