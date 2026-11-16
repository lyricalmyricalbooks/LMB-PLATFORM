// GENERATED from src/shared/bookingTimes.ts by scripts/build-shared.mjs. Do not edit: change the .ts and run the script.
"use strict";
// Bookings (beta, 14 November 2026; tasks/todo/2026-11-14-bookings-beta.md): the times a customer can book, worked out
// the same way by the Book a time page, the admin and the server (src/shared/CLAUDE.md). Pure: no Firebase, no network.
//
// A service is one thing a customer books (a studio visit, a printing class for one, a portfolio review): how long it
// lasts, the rest the owner wants after it, and its price. The opening hours say when the shop takes bookings, week by
// week, with days off. A time is free when it fits inside the day's hours, is far enough ahead, isn't past the last day
// customers may book, and overlaps no other booking (with its rest after it). One customer at a time, unless the service is a group class
// (`places` above 1): then several people share one start, up to its places.
Object.defineProperty(exports, "__esModule", { value: true });
exports.isDay = exports.weekdayOf = exports.MAX_FREE_LATE_FEE = exports.tipFits = exports.tipLimitMinor = exports.tipChoices = exports.tipTaken = exports.restPayable = exports.MIN_CARD_MINOR = exports.balanceDue = exports.moneyKept = exports.moneyTaken = exports.feeTaken = exports.restTaken = exports.bookedCardTaken = exports.cardTaken = exports.cardAsk = exports.DAILY_SUMMARY_HOUR = exports.SECOND_REMINDER_HOURS = exports.REMINDER_HOURS = exports.WAIT_HOLD_MINUTES = exports.DEFAULT_BOOKING_SETTINGS = exports.MAX_SERVICES = exports.BOOKING_STEPS = exports.MAX_QUESTIONS = exports.isClass = exports.MAX_CLASS_TIMES = exports.MAX_PLACES = void 0;
exports.depositOf = depositOf;
exports.cleanTipPercents = cleanTipPercents;
exports.tipOpen = tipOpen;
exports.feeChargeable = feeChargeable;
exports.cleanService = cleanService;
exports.cleanClassTimes = cleanClassTimes;
exports.cleanQuestions = cleanQuestions;
exports.cleanAnswers = cleanAnswers;
exports.cleanBookingSettings = cleanBookingSettings;
exports.zonedTime = zonedTime;
exports.dayOf = dayOf;
exports.addDays = addDays;
exports.summaryDue = summaryDue;
exports.secondReminderDue = secondReminderDue;
exports.daysTouched = daysTouched;
exports.placesLeft = placesLeft;
exports.clashes = clashes;
exports.bookingWindow = bookingWindow;
exports.freeTimes = freeTimes;
exports.isFreeTime = isFreeTime;
exports.customerCanChange = customerCanChange;
exports.bookingIcs = bookingIcs;
exports.bookingsFeedIcs = bookingsFeedIcs;
exports.googleCalendarLink = googleCalendarLink;
exports.MAX_PLACES = 100;
exports.MAX_CLASS_TIMES = 21;
/** A service that takes more than one person at a time. */
const isClass = (s) => Number(s?.places) > 1;
exports.isClass = isClass;
exports.MAX_QUESTIONS = 5;
exports.BOOKING_STEPS = [15, 30, 60];
exports.MAX_SERVICES = 30;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const MINUTE = 60_000;
/** Monday to Friday, ten to five: what a new shop starts with, so the page is never empty. */
exports.DEFAULT_BOOKING_SETTINGS = {
    live: false,
    hours: [[], [{ start: "10:00", end: "17:00" }], [{ start: "10:00", end: "17:00" }], [{ start: "10:00", end: "17:00" }], [{ start: "10:00", end: "17:00" }], [{ start: "10:00", end: "17:00" }], []],
    daysOff: [],
    minNoticeHours: 12,
    maxDaysAhead: 60,
    cancelHours: 24,
    step: 30,
    reminderHours: 24,
    tips: false,
    tipPercents: [15, 18, 20],
    waitHoldMinutes: 60,
    secondReminderHours: 0,
    dailySummary: false,
    googleCalendar: false,
};
/** How long a freed place may be held for the first person on the waiting list. */
exports.WAIT_HOLD_MINUTES = [15, 30, 60, 120, 240, 720];
/** The reminder choices the owner picks from: none, or this many hours before. */
exports.REMINDER_HOURS = [0, 2, 12, 24, 48, 72];
/** The second reminder's choices: none, or this many hours before. */
exports.SECOND_REMINDER_HOURS = [0, 1, 2, 3];
/** The owner's day summary goes out from this hour of the shop's morning. */
exports.DAILY_SUMMARY_HOUR = 7;
const text = (value, max) => (typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "");
const whole = (value, min, max, fallback) => {
    const n = Math.round(Number(value));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const minutesOf = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
/** What a service takes by card when it is booked, in cents: all of it, its deposit, or nothing. */
function depositOf(s) {
    const price = Math.max(0, Math.round(Number(s?.priceMinor) || 0));
    if (s?.payment === "full")
        return price;
    if (s?.payment !== "deposit")
        return 0;
    const amount = Math.round(Number(s.depositMinor) || 0);
    if (amount > 0)
        return Math.min(amount, price);
    return Math.min(price, Math.round((price * (Number(s.depositPercent) || 0)) / 100));
}
/** What the card page asks for when this booking is made. */
const cardAsk = (b) => (b.payment === "card" ? b.priceMinor || 0 : b.payment === "deposit" ? b.depositMinor || 0 : 0);
exports.cardAsk = cardAsk;
/** What was taken by card for this booking (the most that can go back to the card). */
const cardTaken = (b) => (0, exports.bookedCardTaken)(b) + (0, exports.restTaken)(b);
exports.cardTaken = cardTaken;
/** What the card page took when the booking was made (the deposit, or the whole price). */
const bookedCardTaken = (b) => (b.payment === "card" ? (b.paid ? b.priceMinor || 0 : 0) : b.payment === "deposit" ? (b.depositPaid ? b.depositMinor || 0 : 0) : 0);
exports.bookedCardTaken = bookedCardTaken;
/** What was left and later paid by card from the booking page. */
const restTaken = (b) => Math.max(0, b.rest?.amountMinor || 0);
exports.restTaken = restTaken;
/** A missed-booking or late-cancellation fee charged to the saved card. */
const feeTaken = (b) => Math.max(0, b.fee?.amountMinor || 0);
exports.feeTaken = feeTaken;
/** What was received towards the price itself (not counting a fee). */
const priceTaken = (b) => (b.paid ? b.priceMinor || 0 : (0, exports.cardTaken)(b));
/** Everything the shop has received for this booking, a fee included, before refunds. */
const moneyTaken = (b) => priceTaken(b) + (0, exports.feeTaken)(b);
exports.moneyTaken = moneyTaken;
/** What the shop keeps: received less refunded. */
const moneyKept = (b) => Math.max(0, (0, exports.moneyTaken)(b) - (b.refund?.amountMinor || 0));
exports.moneyKept = moneyKept;
/** What is still to pay at the visit. Nothing for a cancelled booking. */
const balanceDue = (b) => (b.status === "cancelled" ? 0 : Math.max(0, (b.priceMinor || 0) - priceTaken(b)));
exports.balanceDue = balanceDue;
/** The smallest amount a card page takes. */
exports.MIN_CARD_MINOR = 50;
/** Can the client pay what is left by card from their booking page? A confirmed booking with at least 0.50 still due. */
const restPayable = (b) => b.status === "confirmed" && (0, exports.balanceDue)(b) >= exports.MIN_CARD_MINOR;
exports.restPayable = restPayable;
// ── Tips (16 November 2026) ─────────────────────────────────────────────────────────────────────────────────────
/** The owner's tip choices: 1 to 4 whole percents from 1 to 50, smallest first; anything else is the defaults. */
function cleanTipPercents(raw) {
    const list = [...new Set((Array.isArray(raw) ? raw : []).map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 50))].sort((a, b) => a - b).slice(0, 4);
    return list.length ? list : [...exports.DEFAULT_BOOKING_SETTINGS.tipPercents];
}
/** The tip given, by card. Never part of the price, a refund or the shop's takings. */
const tipTaken = (b) => Math.max(0, b.tip?.amountMinor || 0);
exports.tipTaken = tipTaken;
/** Each tip choice in money, from the price. */
const tipChoices = (priceMinor, percents) => percents.map((percent) => ({ percent, amountMinor: Math.round((Math.max(0, priceMinor) * percent) / 100) }));
exports.tipChoices = tipChoices;
/** The biggest tip a client may type: the price itself, and never under 100.00 for a cheap service. */
const tipLimitMinor = (priceMinor) => Math.max(10_000, Math.max(0, priceMinor));
exports.tipLimitMinor = tipLimitMinor;
/** A tip amount the server takes: whole cents, at least the card minimum, at most the limit. */
const tipFits = (tipMinor, priceMinor) => Number.isInteger(tipMinor) && tipMinor >= exports.MIN_CARD_MINOR && tipMinor <= (0, exports.tipLimitMinor)(priceMinor);
exports.tipFits = tipFits;
/**
 * Can the client add a tip on its own (nothing else left to pay)? The shop asks for tips, the visit has started and
 * was kept (not a no-show), it had a price, no tip yet, and at most 14 days have passed since it ended.
 */
function tipOpen(b, tipsOn, nowMs) {
    if (!tipsOn || b.status !== "confirmed" || b.noShow || b.tip || !((b.priceMinor || 0) > 0))
        return false;
    return Date.parse(b.start || "") <= nowMs && nowMs <= Date.parse(b.end || "") + 14 * 24 * 3_600_000;
}
/** The most a missed-booking fee may be: the price for a priced service, else this. */
exports.MAX_FREE_LATE_FEE = 50_000;
/**
 * Can the owner charge the missed-booking fee now? Only with a saved card and no fee yet, once the booking has started
 * (a no-show) or after the shop cancelled it. A customer who cancelled online did so in time, so they are never charged.
 */
function feeChargeable(b, nowMs) {
    if (!b.card?.paymentMethod || b.fee || !((b.lateFeeMinor || 0) >= 50))
        return false;
    if (b.status === "cancelled")
        return b.cancelledBy !== "customer" && b.cancelledBy !== "hold ran out";
    return b.status === "confirmed" && Date.parse(b.start || "") <= nowMs;
}
/** A service as the owner typed it, cleaned, or { problem } in plain words. */
function cleanService(raw, id = "") {
    const s = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const name = text(s.name, 80);
    if (!name)
        return { problem: "Give the service a name, like Studio visit." };
    const minutes = Math.round(Number(s.minutes));
    if (!Number.isFinite(minutes) || minutes < 5 || minutes > 8 * 60)
        return { problem: "A booking lasts between 5 minutes and 8 hours." };
    const payment = s.payment === "full" || s.payment === "deposit" || s.payment === "atShop" ? s.payment : "free";
    const priceMinor = payment !== "free" ? Math.round(Number(s.priceMinor)) : 0;
    if (payment !== "free" && (!Number.isFinite(priceMinor) || priceMinor < 50))
        return { problem: "A paid booking costs at least 0.50." };
    if (priceMinor > 1_000_000)
        return { problem: "That price is too high for one booking." };
    // A deposit is an amount, or a share of the price; an amount wins when both are sent.
    let depositMinor = 0;
    let depositPercent = 0;
    if (payment === "deposit") {
        const amount = Math.round(Number(s.depositMinor));
        const percent = Math.round(Number(s.depositPercent));
        if (Number.isFinite(amount) && amount > 0)
            depositMinor = amount;
        else if (Number.isFinite(percent) && percent >= 1 && percent <= 99)
            depositPercent = percent;
        else
            return { problem: "Say how much the deposit is: an amount, or a share of the price from 1 to 99 percent." };
        const due = depositOf({ payment, priceMinor, depositMinor, depositPercent });
        if (due < 50)
            return { problem: "A deposit is at least 0.50." };
        if (due >= priceMinor)
            return { problem: "A deposit is less than the price. To take it all when they book, choose paying in full." };
    }
    // Card on file, for a fee after a missed booking. Paid in full has nothing left to charge, so it never holds a card.
    const holdCard = s.holdCard === true && payment !== "full";
    let lateFeeMinor = 0;
    if (holdCard) {
        lateFeeMinor = Math.round(Number(s.lateFeeMinor));
        if (!Number.isFinite(lateFeeMinor) || lateFeeMinor < 50)
            return { problem: "Say what a missed booking costs: at least 0.50." };
        if (lateFeeMinor > (priceMinor || exports.MAX_FREE_LATE_FEE))
            return { problem: priceMinor ? "A missed-booking fee can't be more than the price." : "That missed-booking fee is too high." };
    }
    return {
        id: text(id || s.id, 40).replace(/[^A-Za-z0-9_-]/g, ""),
        name,
        description: typeof s.description === "string" ? s.description.trim().slice(0, 600) : "",
        minutes,
        gapAfter: whole(s.gapAfter, 0, 120, 0),
        priceMinor,
        payment,
        depositMinor,
        depositPercent,
        location: text(s.location, 160),
        active: s.active !== false,
        order: whole(s.order, 0, 999, 0),
        questions: cleanQuestions(s.questions),
        places: whole(s.places, 1, exports.MAX_PLACES, 1),
        classTimes: cleanClassTimes(s.classTimes),
        holdCard,
        lateFeeMinor,
        meet: s.meet === true,
    };
}
/** A class's weekly start times, cleaned: real weekdays and times, no repeats, in week order. */
function cleanClassTimes(raw) {
    const seen = new Set();
    const out = [];
    for (const item of Array.isArray(raw) ? raw : []) {
        const t = item && typeof item === "object" ? item : {};
        const weekday = Number(t.weekday);
        if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6 || typeof t.time !== "string" || !TIME.test(t.time))
            continue;
        const key = `${weekday}-${t.time}`;
        if (seen.has(key))
            continue;
        seen.add(key);
        out.push({ weekday, time: t.time });
    }
    return out.sort((a, b) => a.weekday - b.weekday || a.time.localeCompare(b.time)).slice(0, exports.MAX_CLASS_TIMES);
}
/** The owner's questions, cleaned: empty ones dropped, at most MAX_QUESTIONS, each with its own id. */
function cleanQuestions(raw) {
    const out = [];
    for (const item of Array.isArray(raw) ? raw : []) {
        const q = item && typeof item === "object" ? item : {};
        const label = text(q.label, 140);
        if (!label || out.length >= exports.MAX_QUESTIONS)
            continue;
        let id = text(q.id, 24).replace(/[^A-Za-z0-9_-]/g, "") || `q${out.length + 1}`;
        while (out.some((o) => o.id === id))
            id += "x";
        out.push({ id, label, long: q.long === true, required: q.required === true });
    }
    return out;
}
/**
 * The customer's answers to a service's questions, or which required one is missing. Only the service's own questions
 * are kept (whatever else a page sends is ignored), and an unanswered optional question is left out.
 */
function cleanAnswers(questions, raw, enforce = true) {
    const given = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const answers = [];
    for (const q of questions) {
        const answer = typeof given[q.id] === "string" ? given[q.id].trim().slice(0, q.long ? 1000 : 200) : "";
        if (!answer && q.required && enforce)
            return { problem: `Please answer: ${q.label}`, questionId: q.id };
        if (answer)
            answers.push({ label: q.label, answer });
    }
    return { answers };
}
/** The opening hours and rules, cleaned; anything missing or broken takes the default. */
function cleanBookingSettings(raw) {
    const s = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const rawHours = Array.isArray(s.hours) && s.hours.length === 7 ? s.hours : exports.DEFAULT_BOOKING_SETTINGS.hours;
    const hours = rawHours.map((day) => {
        const windows = (Array.isArray(day) ? day : [])
            .map((w) => (w && typeof w === "object" ? w : {}))
            .filter((w) => typeof w.start === "string" && typeof w.end === "string" && TIME.test(w.start) && TIME.test(w.end) && minutesOf(w.start) < minutesOf(w.end))
            .map((w) => ({ start: String(w.start), end: String(w.end) }))
            .sort((a, b) => minutesOf(a.start) - minutesOf(b.start))
            .slice(0, 4);
        // Overlapping windows on one day read as one: keep each only when it starts after the last one ended.
        const kept = [];
        for (const w of windows)
            if (!kept.length || minutesOf(w.start) >= minutesOf(kept[kept.length - 1].end))
                kept.push(w);
        return kept;
    });
    const daysOff = [...new Set((Array.isArray(s.daysOff) ? s.daysOff : []).filter((d) => typeof d === "string" && DAY.test(d)))].sort().slice(-200);
    const step = exports.BOOKING_STEPS.includes(Number(s.step)) ? Number(s.step) : exports.DEFAULT_BOOKING_SETTINGS.step;
    const reminderHours = exports.REMINDER_HOURS.includes(Number(s.reminderHours)) ? Number(s.reminderHours) : exports.DEFAULT_BOOKING_SETTINGS.reminderHours;
    return {
        live: s.live === true,
        hours,
        daysOff,
        minNoticeHours: whole(s.minNoticeHours, 0, 24 * 14, exports.DEFAULT_BOOKING_SETTINGS.minNoticeHours),
        maxDaysAhead: whole(s.maxDaysAhead, 1, 365, exports.DEFAULT_BOOKING_SETTINGS.maxDaysAhead),
        cancelHours: whole(s.cancelHours, 0, 24 * 14, exports.DEFAULT_BOOKING_SETTINGS.cancelHours),
        step,
        reminderHours,
        tips: s.tips === true,
        tipPercents: cleanTipPercents(s.tipPercents),
        waitHoldMinutes: exports.WAIT_HOLD_MINUTES.includes(Number(s.waitHoldMinutes)) ? Number(s.waitHoldMinutes) : exports.DEFAULT_BOOKING_SETTINGS.waitHoldMinutes,
        secondReminderHours: secondReminder(s.secondReminderHours, reminderHours),
        dailySummary: s.dailySummary === true,
        googleCalendar: s.googleCalendar === true,
    };
}
/** A second reminder only when it comes after the first one: one of the choices, and fewer hours before. */
function secondReminder(value, first) {
    const hours = Number(value);
    if (!exports.SECOND_REMINDER_HOURS.includes(hours))
        return 0;
    return first && hours >= first ? 0 : hours;
}
// ── The shop's clock ────────────────────────────────────────────────────────────────────────────────────────────────
const formatters = new Map();
function partsIn(zone, ms) {
    let f = formatters.get(zone);
    if (!f) {
        f = new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
        formatters.set(zone, f);
    }
    const out = {};
    for (const p of f.formatToParts(new Date(ms)))
        if (p.type !== "literal")
            out[p.type] = Number(p.value);
    return out;
}
function offsetAt(zone, ms) {
    const p = partsIn(zone, ms);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}
/** The moment a wall-clock time on a day in the shop's zone happens ("2026-11-20", "14:30"). */
function zonedTime(day, hhmm, zone) {
    const guess = Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)), Number(hhmm.slice(0, 2)), Number(hhmm.slice(3, 5)));
    const first = guess - offsetAt(zone, guess);
    const second = guess - offsetAt(zone, first);
    return second;
}
/** The shop's day (YYYY-MM-DD) a moment falls on. */
function dayOf(ms, zone) {
    const p = partsIn(zone, ms);
    return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}
/** The day after (or `n` days after) a YYYY-MM-DD day. */
function addDays(day, n) {
    const d = new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)) + n));
    return d.toISOString().slice(0, 10);
}
/** 0 = Sunday … 6 = Saturday, for a YYYY-MM-DD day (the calendar's own weekday, whatever the zone). */
/**
 * The shop day whose morning summary is due now, or "" when it isn't: from DAILY_SUMMARY_HOUR in the shop's time zone,
 * once a day (`lastDay` is the day last sent).
 */
function summaryDue(nowMs, zone, lastDay) {
    const day = dayOf(nowMs, zone);
    if (day === lastDay)
        return "";
    return nowMs >= zonedTime(day, `${String(exports.DAILY_SUMMARY_HOUR).padStart(2, "0")}:00`, zone) ? day : "";
}
/** Whether the second reminder is due for a booking: inside its hours, at least 15 minutes ahead, not booked inside them. */
function secondReminderDue(b, hours, nowMs) {
    if (!hours || b.reminder2SentAt)
        return false;
    const start = Date.parse(b.start);
    if (!Number.isFinite(start))
        return false;
    const left = start - nowMs;
    if (left > hours * 3_600_000 || left < 15 * MINUTE)
        return false;
    const made = Date.parse(b.createdAt || "");
    return !(Number.isFinite(made) && start - made <= hours * 3_600_000);
}
const weekdayOf = (day) => new Date(`${day}T12:00:00Z`).getUTCDay();
exports.weekdayOf = weekdayOf;
const isDay = (value) => typeof value === "string" && DAY.test(value);
exports.isDay = isDay;
/** Every shop day a stretch of time touches, for the per-day records the server keeps to stop two bookings clashing. */
function daysTouched(start, end, zone) {
    const out = [dayOf(start, zone)];
    const last = dayOf(Math.max(start, end - 1), zone);
    while (out[out.length - 1] < last && out.length < 3)
        out.push(addDays(out[out.length - 1], 1));
    return out;
}
// ── Free times ──────────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * How many more people can book `service` at `start`: 0 when anything else overlaps it (its rest included). A group
 * class shares its time only with bookings of the same class at the very same start, up to its places.
 */
function placesLeft(start, service, busy) {
    const end = start + (service.minutes + service.gapAfter) * MINUTE;
    const places = (0, exports.isClass)(service) && service.id ? Math.round(Number(service.places)) : 1;
    let taken = 0;
    for (const b of busy) {
        if (!(start < b.end && end > b.start))
            continue;
        if (places > 1 && b.serviceId === service.id && b.start === start)
            taken += 1;
        else
            return 0;
    }
    return Math.max(0, places - taken);
}
/** Whether a booking of `service` starting at `start` can't be taken: something overlaps it, or the class is full. */
function clashes(start, service, busy) {
    return placesLeft(start, service, busy) === 0;
}
/** The last day customers may book, and the earliest moment, as of `nowMs`. */
function bookingWindow(settings, zone, nowMs) {
    return { earliest: nowMs + settings.minNoticeHours * 60 * MINUTE, lastDay: addDays(dayOf(nowMs, zone), settings.maxDaysAhead) };
}
/**
 * The start times (milliseconds) a customer can book on one shop day, earliest first: inside the day's opening hours,
 * whole service inside a window, at the step, after the notice, before the last day, clashing with nothing busy.
 */
function freeTimes({ service, settings, busy, day, zone, nowMs }) {
    if (!(0, exports.isDay)(day) || settings.daysOff.includes(day))
        return [];
    const { earliest, lastDay } = bookingWindow(settings, zone, nowMs);
    if (day > lastDay || day < dayOf(nowMs, zone))
        return [];
    const out = [];
    // A class with its own weekly times runs at those, whatever the opening hours say.
    if ((0, exports.isClass)(service) && service.classTimes?.length) {
        for (const t of service.classTimes) {
            if (t.weekday !== (0, exports.weekdayOf)(day))
                continue;
            const start = zonedTime(day, t.time, zone);
            if (start >= earliest && !clashes(start, service, busy) && !out.includes(start))
                out.push(start);
        }
        return out.sort((a, b) => a - b);
    }
    for (const w of settings.hours[(0, exports.weekdayOf)(day)] || []) {
        const close = minutesOf(w.end);
        for (let m = minutesOf(w.start); m + service.minutes <= close; m += settings.step) {
            const start = zonedTime(day, `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`, zone);
            if (start < earliest || clashes(start, service, busy))
                continue;
            // A clock change can make two wall times one moment; offer it once.
            if (out[out.length - 1] !== start)
                out.push(start);
        }
    }
    return out;
}
/** Whether `start` is one of the times free on its day (the server's check before it takes a booking). */
function isFreeTime(args) {
    const { start, zone } = args;
    return Number.isFinite(start) && freeTimes({ ...args, day: dayOf(start, zone) }).includes(start);
}
/** Whether the customer may still cancel or move online: up to `cancelHours` before it starts. */
function customerCanChange(startMs, settings, nowMs) {
    return nowMs <= startMs - settings.cancelHours * 60 * MINUTE;
}
// ── Calendars ───────────────────────────────────────────────────────────────────────────────────────────────────────
const icsTime = (ms) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsText = (value) => value.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/([,;])/g, "\\$1");
/** A calendar file (.ics) for one booking, which every calendar app opens. */
function bookingIcs({ id, title, start, end, location = "", details = "", nowMs = Date.now() }) {
    return [
        "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Colophon//Bookings//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
        ...icsEvent({ id, title, start, end, location, details }, nowMs),
        "END:VCALENDAR", "",
    ].join("\r\n");
}
function icsEvent({ id, title, start, end, location = "", details = "" }, nowMs) {
    return [
        "BEGIN:VEVENT", `UID:${id}@bookings`, `DTSTAMP:${icsTime(nowMs)}`, `DTSTART:${icsTime(start)}`, `DTEND:${icsTime(end)}`,
        `SUMMARY:${icsText(title)}`, ...(location ? [`LOCATION:${icsText(location)}`] : []), ...(details ? [`DESCRIPTION:${icsText(details)}`] : []),
        "END:VEVENT",
    ];
}
/**
 * The owner's calendar feed: every booking as one calendar that Google or Apple Calendar subscribes to and refreshes
 * by itself. `name` is what the calendar is called in their app.
 */
function bookingsFeedIcs(name, events, nowMs = Date.now()) {
    return [
        "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Colophon//Bookings//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
        `X-WR-CALNAME:${icsText(name)}`, "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H",
        ...events.flatMap((e) => icsEvent(e, nowMs)),
        "END:VCALENDAR", "",
    ].join("\r\n");
}
/** A link that opens Google Calendar with the booking filled in. */
function googleCalendarLink({ title, start, end, location = "", details = "" }) {
    const q = new URLSearchParams({ action: "TEMPLATE", text: title, dates: `${icsTime(start)}/${icsTime(end)}`, ...(location ? { location } : {}), ...(details ? { details } : {}) });
    return `https://calendar.google.com/calendar/render?${q.toString()}`;
}
