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
exports.balanceDue = exports.moneyKept = exports.moneyTaken = exports.feeTaken = exports.restTaken = exports.bookedCardTaken = exports.cardTaken = exports.giftReturned = exports.giftTaken = exports.cardAsk = exports.DAILY_SUMMARY_HOUR = exports.SECOND_REMINDER_HOURS = exports.REMINDER_HOURS = exports.WAIT_HOLD_MINUTES = exports.DEFAULT_BOOKING_SETTINGS = exports.MAX_SERVICES = exports.DAILY_CAPS = exports.BOOKING_STEPS = exports.MAX_PROCESS_MINUTES = exports.MIN_PROCESS_MINUTES = exports.MAX_GAP_BEFORE = exports.MIN_PROCESS_AFTER = exports.formFor = exports.formsFor = exports.FORM_RENEW_CHOICES = exports.MAX_FORMS = exports.MAX_FORM_TEXT = exports.blockOn = exports.MAX_BLOCKS = exports.MAX_SPECIAL_DAYS = exports.MAX_SPECIAL_HOURS = exports.MAX_ROOMS = exports.MAX_STAFF = exports.roomUnitsText = exports.ROOM_UNIT_CHOICES = exports.MAX_ROOM_UNITS = exports.MAX_EXTRA_MINUTES = exports.MAX_EXTRAS = exports.MAX_LENGTHS = exports.MAX_QUESTIONS = exports.isCourse = exports.MAX_COURSE_DATES = exports.isClass = exports.MAX_CLASS_TIMES = exports.MAX_PLACES = exports.addressLine = exports.MAX_AREAS = exports.CHANNEL_NAMES = exports.BOOKING_CHANNELS = exports.APPROVAL_HOURS = void 0;
exports.CHECK_IN_ALPHABET = exports.PICKUP_MESSAGES = exports.PACK_MESSAGES = exports.packEndsOn = exports.packLeft = exports.packUsed = exports.offersPack = exports.MAX_PACK_DAYS = exports.MAX_PACK_VISITS = exports.joinsVisit = exports.visitName = exports.MAX_VISIT_PARTS = exports.booksByPerson = exports.isDay = exports.weekdayOf = exports.PICKUP_DAYS_AHEAD = exports.MAX_PICKUP_PER_SLOT = exports.PICKUP_SLOT_MINUTES = exports.TEAM_SHOWN_CHOICES = exports.personBio = exports.MAX_BIO_LENGTH = exports.REVIEW_BODY_MAX = exports.REBOOK_WINDOW_DAYS = exports.MAX_RUN_DAYS = exports.MAX_RUN_WEEKS = exports.MAX_RUN_VISITS = exports.MAX_REBOOK_WEEKS = exports.MIN_LATE_DATES = exports.MAX_DECIDE_HOURS = exports.DECIDE_HOURS = exports.servicePhoto = exports.serviceGroup = exports.MAX_GROUP_LENGTH = exports.MAX_FREE_LATE_FEE = exports.tipFits = exports.tipLimitMinor = exports.tipChoices = exports.tipTaken = exports.restPayable = exports.MIN_CARD_MINOR = void 0;
exports.answerBy = answerBy;
exports.approvalAllowed = approvalAllowed;
exports.bookingChannel = bookingChannel;
exports.cleanAreas = cleanAreas;
exports.inArea = inArea;
exports.cleanVisitAddress = cleanVisitAddress;
exports.roomUnits = roomUnits;
exports.cleanSpecialHours = cleanSpecialHours;
exports.specialOn = specialOn;
exports.hoursOnDay = hoursOnDay;
exports.personHoursOn = personHoursOn;
exports.cleanBlocks = cleanBlocks;
exports.blockSpan = blockSpan;
exports.blockedBusy = blockedBusy;
exports.cleanIntakeForm = cleanIntakeForm;
exports.cleanIntakeForms = cleanIntakeForms;
exports.formRunsOut = formRunsOut;
exports.formStillSigned = formStillSigned;
exports.formVersion = formVersion;
exports.bookingsOnDay = bookingsOnDay;
exports.processingStretch = processingStretch;
exports.depositOf = depositOf;
exports.taxIn = taxIn;
exports.giftCardPart = giftCardPart;
exports.cleanTipPercents = cleanTipPercents;
exports.tipOpen = tipOpen;
exports.feeChargeable = feeChargeable;
exports.groupServices = groupServices;
exports.cleanService = cleanService;
exports.cleanLengths = cleanLengths;
exports.lengthName = lengthName;
exports.withLength = withLength;
exports.cleanExtras = cleanExtras;
exports.withExtras = withExtras;
exports.cleanCourseDates = cleanCourseDates;
exports.courseStarts = courseStarts;
exports.runDecisionDue = runDecisionDue;
exports.joinableCourse = joinableCourse;
exports.coursePlacesLeft = coursePlacesLeft;
exports.cleanClassTimes = cleanClassTimes;
exports.cleanQuestions = cleanQuestions;
exports.cleanAnswers = cleanAnswers;
exports.cleanBookingSettings = cleanBookingSettings;
exports.confirmState = confirmState;
exports.runsOnline = runsOnline;
exports.cleanRun = cleanRun;
exports.runStarts = runStarts;
exports.runSettings = runSettings;
exports.rebookDue = rebookDue;
exports.reviewOpen = reviewOpen;
exports.cleanVisitReview = cleanVisitReview;
exports.reviewLink = reviewLink;
exports.thanksDue = thanksDue;
exports.cleanRooms = cleanRooms;
exports.cleanStaff = cleanStaff;
exports.commissionOf = commissionOf;
exports.cleanRates = cleanRates;
exports.forPerson = forPerson;
exports.zonedTime = zonedTime;
exports.dayOf = dayOf;
exports.cleanZone = cleanZone;
exports.zonesDiffer = zonesDiffer;
exports.addDays = addDays;
exports.summaryDue = summaryDue;
exports.secondReminderDue = secondReminderDue;
exports.daysTouched = daysTouched;
exports.placesLeft = placesLeft;
exports.staffFor = staffFor;
exports.clashes = clashes;
exports.bookingWindow = bookingWindow;
exports.freeTimes = freeTimes;
exports.classStartsOn = classStartsOn;
exports.whoIsFree = whoIsFree;
exports.visitPlan = visitPlan;
exports.visitService = visitService;
exports.visitTimeline = visitTimeline;
exports.fitsAt = fitsAt;
exports.visitStaff = visitStaff;
exports.visitFreeTimes = visitFreeTimes;
exports.classPlacesLeft = classPlacesLeft;
exports.keptPerson = keptPerson;
exports.ownerBookingSettings = ownerBookingSettings;
exports.isFreeTime = isFreeTime;
exports.customerCanChange = customerCanChange;
exports.bookingIcs = bookingIcs;
exports.bookingsFeedIcs = bookingsFeedIcs;
exports.googleCalendarLink = googleCalendarLink;
exports.packProblem = packProblem;
exports.pickupSlots = pickupSlots;
exports.pickupTimeProblem = pickupTimeProblem;
exports.cleanCheckInCode = cleanCheckInCode;
exports.checkInCodeFrom = checkInCodeFrom;
/** How long a request waits for the owner's answer before its time is let go (plan 4, 2.5). */
exports.APPROVAL_HOURS = 48;
/** When a request made at `createdMs` for a visit at `startMs` must be answered by: APPROVAL_HOURS later, or the start. */
function answerBy(createdMs, startMs) {
    return Math.min(createdMs + exports.APPROVAL_HOURS * 3_600_000, startMs);
}
/** A service the owner may approve first: one-to-one, nothing paid when booking, no card kept. */
function approvalAllowed(s) {
    return (s.places ?? 1) <= 1 && !s.courseDates?.length && (s.payment === "free" || s.payment === "atShop") && !s.holdCard;
}
/**
 * Where a website booking came from (plan 4, 2.7): the Share dialog's ready links carry `from=<channel>`, the booking
 * page keeps it for the visit and the server stores the channel on the booking. Anything else is no channel.
 */
exports.BOOKING_CHANNELS = ["instagram", "facebook", "google", "qr", "button"];
function bookingChannel(value) {
    return typeof value === "string" && exports.BOOKING_CHANNELS.includes(value) ? value : "";
}
/** The channel in plain words, for the owner. */
exports.CHANNEL_NAMES = { instagram: "Instagram", facebook: "Facebook", google: "Google", qr: "QR code", button: "Book now button" };
/** The most postal or ZIP code starts one service may travel to. */
exports.MAX_AREAS = 40;
const areaCode = (v) => (typeof v === "string" ? v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7) : "");
/** The postal or ZIP code starts a service travels to, from a list or the owner's typing ("M6G, M5V 1"), each once. */
function cleanAreas(raw) {
    const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/[,;\n]+/) : [];
    return [...new Set(list.map(areaCode).filter(Boolean))].slice(0, exports.MAX_AREAS);
}
/** True when a postal or ZIP code is in a service's area (any code when it has none). */
function inArea(postcode, areas) {
    const code = areaCode(postcode);
    return !areas?.length || (!!code && areas.some((a) => code.startsWith(a)));
}
function cleanVisitAddress(raw) {
    const r = (raw && typeof raw === "object" ? raw : {});
    const line = (v, max) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
    const street = line(r.street, 120);
    const city = line(r.city, 60);
    const postcode = line(r.postcode, 12).toUpperCase();
    return street && city && postcode ? { street, city, postcode } : null;
}
/** "12 Main St, Toronto M6G 1A1": the visit's address on one line, as the booking's place. */
const addressLine = (a) => `${a.street}, ${a.city} ${a.postcode}`;
exports.addressLine = addressLine;
exports.MAX_PLACES = 100;
exports.MAX_CLASS_TIMES = 21;
/** A service that takes more than one person at a time. */
const isClass = (s) => Number(s?.places) > 1;
exports.isClass = isClass;
/** The most sessions one course can have. */
exports.MAX_COURSE_DATES = 30;
/** A course: a group class with its own dated sessions, signed up for as a whole. */
const isCourse = (s) => (0, exports.isClass)(s) && (s?.courseDates?.length || 0) >= 2;
exports.isCourse = isCourse;
exports.MAX_QUESTIONS = 5;
/** The most lengths one service can be offered in. */
exports.MAX_LENGTHS = 6;
/** Add-ons and options on one service, and the most minutes one may add. */
exports.MAX_EXTRAS = 8;
exports.MAX_EXTRA_MINUTES = 240;
exports.MAX_ROOM_UNITS = 20;
/** The counts the admin offers for a room. */
exports.ROOM_UNIT_CHOICES = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20];
/** "One at a time" or "3 at once". */
const roomUnitsText = (n) => (n > 1 ? `${n} at once` : "One at a time");
exports.roomUnitsText = roomUnitsText;
/** How many bookings a room takes at once (1 when it isn't listed or has no count). */
function roomUnits(settings, roomId) {
    const units = roomId ? settings.rooms?.find((r) => r.id === roomId)?.units : undefined;
    return units && units > 1 ? units : 1;
}
exports.MAX_STAFF = 20;
exports.MAX_ROOMS = 10;
exports.MAX_SPECIAL_HOURS = 30;
/** The longest stretch, in days. */
exports.MAX_SPECIAL_DAYS = 92;
/** Holiday hours, cleaned: real days in order, at most MAX_SPECIAL_DAYS long, earliest first; ones ended before `today` dropped. */
function cleanSpecialHours(raw, today = "") {
    const taken = new Set();
    const out = [];
    for (const item of Array.isArray(raw) ? raw : []) {
        const r = item && typeof item === "object" ? item : {};
        const from = typeof r.from === "string" && DAY.test(r.from) ? r.from : "";
        const to = typeof r.to === "string" && DAY.test(r.to) ? r.to : from;
        if (!from || to < from || to > addDays(from, exports.MAX_SPECIAL_DAYS - 1) || (today && to < today))
            continue;
        out.push({ id: ownId(r.id, "h", taken, out.length), label: text(r.label, 60), from, to, hours: cleanHours([r.hours, [], [], [], [], [], []], [[], [], [], [], [], [], []])[0] });
    }
    return out.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to)).slice(-exports.MAX_SPECIAL_HOURS);
}
/** The holiday hours that cover `day`, if any (the latest-starting one). */
function specialOn(special, day) {
    let found;
    for (const h of special || [])
        if (h.from <= day && day <= h.to && (!found || h.from >= found.from))
            found = h;
    return found;
}
/** The shop's opening hours on one day: its holiday hours when a stretch covers it, else the weekday's. */
function hoursOnDay(settings, day) {
    return specialOn(settings.specialHours, day)?.hours ?? settings.hours[(0, exports.weekdayOf)(day)] ?? [];
}
/**
 * One person's working hours on one day: their own holiday hours first, then their own weekly hours, else the shop's
 * (holiday hours included). Days off are the caller's to apply.
 */
function personHoursOn(settings, p, day) {
    const own = specialOn(p.specialHours, day);
    if (own)
        return own.hours;
    return p.ownHours ? p.hours[(0, exports.weekdayOf)(day)] || [] : hoursOnDay(settings, day);
}
exports.MAX_BLOCKS = 100;
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/;
/** The owner's blocks, cleaned: a real day and a start before the end; at most MAX_BLOCKS, one-off ones before `today` dropped. */
function cleanBlocks(raw, today = "") {
    if (!Array.isArray(raw))
        return [];
    const out = [];
    for (const b of raw) {
        if (!b || typeof b !== "object")
            continue;
        const r = b;
        const start = String(r.start || ""), end = String(r.end || "");
        if (!(0, exports.isDay)(r.day) || !CLOCK.test(start) || !CLOCK.test(end) || minutesOf(start) >= minutesOf(end))
            continue;
        const weekly = r.weekly === true;
        const until = weekly && (0, exports.isDay)(r.until) && r.until >= r.day ? r.until : "";
        if (today && (weekly ? until && until < today : r.day < today))
            continue;
        const id = typeof r.id === "string" && /^[\w-]{1,40}$/.test(r.id) ? r.id : `b${out.length}${String(r.day).replace(/-/g, "")}`;
        if (out.some((x) => x.id === id))
            continue;
        out.push({ id, title: String(r.title || "").trim().slice(0, 60), staffId: typeof r.staffId === "string" ? r.staffId.slice(0, 40) : "", day: r.day, start, end, weekly, until });
        if (out.length >= exports.MAX_BLOCKS)
            break;
    }
    return out;
}
/** Does a block fall on this shop day? */
const blockOn = (b, day) => b.weekly ? day >= b.day && (!b.until || day <= b.until) && (0, exports.weekdayOf)(day) === (0, exports.weekdayOf)(b.day) : b.day === day;
exports.blockOn = blockOn;
/** A block's stretch on one shop day, in milliseconds ("24:00" is the next midnight). */
function blockSpan(b, day, zone) {
    const at = (hhmm) => (hhmm === "24:00" ? zonedTime(addDays(day, 1), "00:00", zone) : zonedTime(day, hhmm, zone));
    return { start: at(b.start), end: at(b.end) };
}
/** The busy stretches the owner's blocks make around a day (the day before and after too, for times that cross midnight). */
function blockedBusy(blocks, day, zone) {
    const out = [];
    for (const d of [addDays(day, -1), day, addDays(day, 1)]) {
        for (const b of blocks || [])
            if ((0, exports.blockOn)(b, d))
                out.push({ ...blockSpan(b, d, zone), ...(b.staffId ? { staffId: b.staffId } : {}) });
    }
    return out;
}
exports.MAX_FORM_TEXT = 6000;
/** How many forms a shop can ask for. */
exports.MAX_FORMS = 5;
/** How long a signature lasts, in months (0: until the words change). */
exports.FORM_RENEW_CHOICES = [0, 6, 12, 24];
/** The form as saved: words trimmed and capped, its questions cleaned; null when it has no words at all. */
function cleanIntakeForm(raw, fallbackId = "main") {
    const f = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const body = typeof f.text === "string" ? f.text.trim().slice(0, exports.MAX_FORM_TEXT) : "";
    const questions = cleanQuestions(f.questions);
    if (!body && !questions.length)
        return null;
    const serviceIds = [...new Set((Array.isArray(f.serviceIds) ? f.serviceIds : []).filter((x) => typeof x === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(x)))].slice(0, exports.MAX_SERVICES);
    const id = typeof f.id === "string" && /^[A-Za-z0-9_-]{1,24}$/.test(f.id) ? f.id : fallbackId;
    const renew = Number(f.renewMonths);
    const renewMonths = exports.FORM_RENEW_CHOICES.includes(renew) ? renew : 0;
    return { id, on: f.on === true, title: text(f.title, 80) || "Before your first visit", text: body, questions, serviceIds, renewMonths };
}
/** The shop's forms, cleaned: at most MAX_FORMS, ids unique (the first keeps "main"), an older single `intakeForm` read as one. */
function cleanIntakeForms(list, older) {
    const raw = Array.isArray(list) ? list : older ? [older] : [];
    const out = [];
    for (const [i, f] of raw.entries()) {
        const form = cleanIntakeForm(f, i === 0 ? "main" : `f${i + 1}`);
        if (!form)
            continue;
        while (out.some((o) => o.id === form.id))
            form.id = `${form.id}x`.slice(-24);
        out.push(form);
        if (out.length >= exports.MAX_FORMS)
            break;
    }
    return out;
}
/** The forms a booking of this service asks for, in the shop's order. */
const formsFor = (forms, serviceId) => (forms || []).filter((f) => f.on && (!f.serviceIds.length || f.serviceIds.includes(serviceId)));
exports.formsFor = formsFor;
/** The first form a booking of this service asks for (older callers). */
const formFor = (forms, serviceId) => (0, exports.formsFor)(forms, serviceId)[0] || null;
exports.formFor = formFor;
/** When a signature made at `signedAt` stops counting: never (null) without renewal. */
function formRunsOut(signedAt, renewMonths) {
    if (!renewMonths)
        return null;
    const d = new Date(signedAt);
    if (!Number.isFinite(d.getTime()))
        return 0;
    d.setUTCMonth(d.getUTCMonth() + renewMonths);
    return d.getTime();
}
/**
 * Whether a signed record still counts for a visit at `atMs`: this wording, and not run out by then. A record with no
 * signature (or another form's) never counts.
 */
function formStillSigned(record, form, atMs) {
    if (!record?.signedAt || record.version !== formVersion(form))
        return false;
    const ends = formRunsOut(record.signedAt, form.renewMonths);
    return ends === null || ends > atMs;
}
/** Which wording of the form a client signed: changing the title, words or questions asks everyone again. */
function formVersion(form) {
    const source = JSON.stringify([form.title, form.text, form.questions.map((q) => [q.label, q.long, q.required])]);
    let h = 5381;
    for (let i = 0; i < source.length; i += 1)
        h = ((h * 33) ^ source.charCodeAt(i)) >>> 0;
    return `v${h.toString(36)}${source.length.toString(36)}`;
}
/** How many bookings start on `day` (the daily limit's count, plan 4, 1.8): not a closed class time or a person's own busy time. */
function bookingsOnDay(busy, day, zone) {
    return busy.filter((b) => !b.away && !b.closed && dayOf(b.start, zone) === day).length;
}
/** Processing time: it starts at least this far in, lasts at least this long, and ends before the service does. */
exports.MIN_PROCESS_AFTER = 5;
/** The most time before a booking (set-up or travel), in minutes. */
exports.MAX_GAP_BEFORE = 120;
exports.MIN_PROCESS_MINUTES = 10;
exports.MAX_PROCESS_MINUTES = 240;
/**
 * A booking's processing time as [start, end) in milliseconds (plan 4, 1.5), or null: none set, or it no longer fits
 * inside the booking (a booking shortened on the calendar loses it).
 */
function processingStretch(service, start) {
    const after = Math.round(Number(service.processAfter) || 0);
    const length = Math.round(Number(service.processMinutes) || 0);
    if (!Number.isFinite(start) || after < exports.MIN_PROCESS_AFTER || length < exports.MIN_PROCESS_MINUTES || after + length >= service.minutes)
        return null;
    return { start: start + after * 60_000, end: start + (after + length) * 60_000 };
}
exports.BOOKING_STEPS = [15, 30, 60];
/** The daily limit's choices (plan 4, 1.8); 0 is no limit. */
exports.DAILY_CAPS = [0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50];
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
    pickupTimes: false,
    pickupSlotMinutes: 30,
    pickupPerSlot: 4,
    pickupReadyHours: 2,
    thankYou: false,
    reviewUrl: "",
    siteReviews: false,
    textReminders: false,
    textReplies: false,
    askToConfirm: false,
    staff: [],
    rooms: [],
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
/**
 * Sales tax on a booking (17 November 2026). A service with `chargeTax` adds the shop's rate on top of its price when it
 * is booked: the booking's `priceMinor` is then the whole amount with the tax, `taxMinor` the tax in it and `taxLines`
 * the tax by its name in the books ([{ name, cents }]). The tax in `amountMinor` of what was paid or kept: the same share
 * of the tax as of the price, so a deposit, a part refund or a kept fee each carry their own part.
 */
function taxIn(b, amountMinor) {
    const price = Math.round(Number(b?.priceMinor) || 0);
    const tax = Math.round(Number(b?.taxMinor) || 0);
    if (!(tax > 0) || !(price > 0) || !(amountMinor > 0))
        return 0;
    return Math.min(tax, Math.round((tax * Math.min(amountMinor, price)) / price));
}
/** What the card page asks for when this booking is made. */
const cardAsk = (b) => Math.max(0, bookedAsk(b) - giftMinor(b));
exports.cardAsk = cardAsk;
/** What is paid when booked, card and gift card together: the whole price, the deposit or nothing. */
const bookedAsk = (b) => (b.payment === "card" ? b.priceMinor || 0 : b.payment === "deposit" ? b.depositMinor || 0 : 0);
/** Did the booking's own payment (card page, gift card or both) go through? */
const bookedPaid = (b) => (b.payment === "card" ? !!b.paid : b.payment === "deposit" ? !!b.depositPaid : false);
/** The gift card's part of what is paid when booked. */
const giftMinor = (b) => Math.max(0, Math.min(b.giftCard?.amountMinor || 0, bookedAsk(b)));
/** What a gift card paid towards this booking (counted once the booking's payment went through). */
const giftTaken = (b) => (bookedPaid(b) ? giftMinor(b) : 0);
exports.giftTaken = giftTaken;
/** What went back onto the gift card when the booking was cancelled. */
const giftReturned = (b) => (b.giftCard?.returned ? (0, exports.giftTaken)(b) : 0);
exports.giftReturned = giftReturned;
/**
 * How much of `available` on a gift card goes towards `upFront` (what is paid when booked). What is left for the card
 * page is never between nothing and the smallest card payment, so the gift card then covers a little less.
 */
function giftCardPart(upFront, available) {
    const due = Math.max(0, Math.round(upFront) || 0);
    const part = Math.min(due, Math.max(0, Math.floor(available) || 0));
    const left = due - part;
    return left > 0 && left < exports.MIN_CARD_MINOR ? Math.max(0, due - exports.MIN_CARD_MINOR) : part;
}
/** What was taken by card for this booking (the most that can go back to the card). */
const cardTaken = (b) => (0, exports.bookedCardTaken)(b) + (0, exports.restTaken)(b);
exports.cardTaken = cardTaken;
/** What the card page took when the booking was made (the deposit, or the whole price). */
const bookedCardTaken = (b) => (bookedPaid(b) ? (0, exports.cardAsk)(b) : 0);
exports.bookedCardTaken = bookedCardTaken;
/** What was left and later paid by card from the booking page. */
const restTaken = (b) => Math.max(0, b.rest?.amountMinor || 0);
exports.restTaken = restTaken;
/** A missed-booking or late-cancellation fee charged to the saved card. */
const feeTaken = (b) => Math.max(0, b.fee?.amountMinor || 0);
exports.feeTaken = feeTaken;
/** What was received towards the price itself (not counting a fee). */
const priceTaken = (b) => (b.paid ? b.priceMinor || 0 : (0, exports.cardTaken)(b) + (0, exports.giftTaken)(b));
/** Everything the shop has received for this booking, a fee included, before refunds. */
const moneyTaken = (b) => priceTaken(b) + (0, exports.feeTaken)(b);
exports.moneyTaken = moneyTaken;
/** What the shop keeps: received less refunded (to the card, or back onto the gift card). */
const moneyKept = (b) => Math.max(0, (0, exports.moneyTaken)(b) - (b.refund?.amountMinor || 0) - (0, exports.giftReturned)(b));
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
/** Longest group name (plan 4, 2.3). */
exports.MAX_GROUP_LENGTH = 40;
/** A service's group as saved: one line, at most MAX_GROUP_LENGTH characters ("" = no group). */
const serviceGroup = (value) => text(value, exports.MAX_GROUP_LENGTH);
exports.serviceGroup = serviceGroup;
/** A service's photo as saved: an https link with no spaces or quotes ("" = none). */
const servicePhoto = (value) => {
    const link = text(value, 500);
    return /^https:\/\/[^\s<>"']+$/i.test(link) ? link : "";
};
exports.servicePhoto = servicePhoto;
/**
 * The services under their group headings, in the order the owner put them: each group where its first service
 * sits, and the services with no group last under "" (plan 4, 2.3). With no groups at all, one list under "".
 */
function groupServices(services) {
    const groups = [];
    const loose = [];
    for (const s of services) {
        const name = s.group || "";
        if (!name) {
            loose.push(s);
            continue;
        }
        const found = groups.find((g) => g.group.toLowerCase() === name.toLowerCase());
        if (found)
            found.services.push(s);
        else
            groups.push({ group: name, services: [s] });
    }
    return loose.length ? [...groups, { group: "", services: loose }] : groups;
}
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
    // Lengths are for one person at a time; a class or course keeps one length.
    const lengths = Number(s.places) > 1 || (Array.isArray(s.courseDates) && s.courseDates.length) ? [] : cleanLengths(s.lengths, payment !== "free");
    if (lengths.length && payment === "deposit" && depositMinor && lengths.some((l) => depositMinor >= l.priceMinor)) {
        return { problem: "A deposit is less than the price of every length. Lower it, or raise the shortest length's price." };
    }
    // A pack of visits: only for a priced service, two visits or more, at least the smallest card payment.
    const packVisits = payment !== "free" ? whole(s.packVisits, 0, exports.MAX_PACK_VISITS, 0) : 0;
    let packPriceMinor = 0;
    let packDays = 0;
    if (packVisits === 1)
        return { problem: "A pack has at least 2 visits." };
    if (packVisits >= 2) {
        packPriceMinor = Math.round(Number(s.packPriceMinor));
        if (!Number.isFinite(packPriceMinor) || packPriceMinor < exports.MIN_CARD_MINOR)
            return { problem: "Say what the pack costs: at least 0.50." };
        if (packPriceMinor > 5_000_000)
            return { problem: "That pack price is too high." };
        packDays = whole(s.packDays, 0, exports.MAX_PACK_DAYS, 0);
    }
    let lateFeeMinor = 0;
    if (holdCard) {
        lateFeeMinor = Math.round(Number(s.lateFeeMinor));
        if (!Number.isFinite(lateFeeMinor) || lateFeeMinor < 50)
            return { problem: "Say what a missed booking costs: at least 0.50." };
        if (lateFeeMinor > (priceMinor || exports.MAX_FREE_LATE_FEE))
            return { problem: priceMinor ? "A missed-booking fee can't be more than the price." : "That missed-booking fee is too high." };
    }
    const places = whole(s.places, 1, exports.MAX_PLACES, 1);
    const rawDates = Array.isArray(s.courseDates) ? s.courseDates.filter((d) => d !== "" && d != null) : [];
    const courseDates = cleanCourseDates(rawDates);
    if (rawDates.length && courseDates.length < 2)
        return { problem: "A course has at least 2 dates. For a single date, leave the course dates empty." };
    if (courseDates.length && places < 2)
        return { problem: "A course needs room for at least 2 people." };
    const classTimes = courseDates.length ? [] : cleanClassTimes(s.classTimes);
    const introPriceMinor = priceMinor > 0 ? Math.round(Number(s.introPriceMinor) || 0) : 0;
    if (introPriceMinor && (introPriceMinor < exports.MIN_CARD_MINOR || introPriceMinor >= priceMinor))
        return { problem: "A first-visit price is at least 0.50 and less than the price." };
    // A minimum only for a group at set times: a weekly class or a course (a class at any free time has no session to decide).
    const atSetTimes = places >= 2 && (courseDates.length > 0 || classTimes.length > 0);
    const minPlaces = atSetTimes ? whole(s.minPlaces, 0, exports.MAX_PLACES, 0) : 0;
    if (minPlaces > places)
        return { problem: "The minimum to run can't be more than the places." };
    // Processing time: one person's booking only (a class keeps its teacher the whole time).
    const processMinutes = places === 1 && !courseDates.length ? whole(s.processMinutes, 0, exports.MAX_PROCESS_MINUTES, 0) : 0;
    // Time before: one person's booking only (a class's people all start together at the class's own time).
    const gapBefore = places === 1 && !courseDates.length ? whole(s.gapBefore, 0, exports.MAX_GAP_BEFORE, 0) : 0;
    const processAfter = processMinutes ? whole(s.processAfter, 0, 8 * 60, 0) : 0;
    const approval = s.approval === true && approvalAllowed({ places, courseDates, payment, holdCard });
    // At the client's address: one person's visit, never a class or a course.
    const atClient = s.atClient === true && places === 1 && !courseDates.length;
    if (processMinutes && (processMinutes < exports.MIN_PROCESS_MINUTES || processAfter < exports.MIN_PROCESS_AFTER || processAfter + processMinutes >= minutes)) {
        return { problem: "Processing time starts at least 5 minutes in, lasts at least 10 minutes and ends before the service does." };
    }
    return {
        id: text(id || s.id, 40).replace(/[^A-Za-z0-9_-]/g, ""),
        name,
        description: typeof s.description === "string" ? s.description.trim().slice(0, 600) : "",
        minutes,
        gapAfter: whole(s.gapAfter, 0, 120, 0),
        ...(gapBefore ? { gapBefore } : {}),
        priceMinor,
        payment,
        depositMinor,
        depositPercent,
        location: text(s.location, 160),
        ...((0, exports.serviceGroup)(s.group) ? { group: (0, exports.serviceGroup)(s.group) } : {}),
        ...((0, exports.servicePhoto)(s.photo) ? { photo: (0, exports.servicePhoto)(s.photo) } : {}),
        active: s.active !== false,
        order: whole(s.order, 0, 999, 0),
        questions: cleanQuestions(s.questions),
        places,
        // A course runs on its own dates, never at weekly times as well.
        classTimes,
        ...(courseDates.length ? { courseDates } : {}),
        ...(courseDates.length && s.lateJoin === true ? { lateJoin: true } : {}),
        // A minimum of 1 is no minimum: anyone signed up is enough.
        ...(minPlaces >= 2 ? { minPlaces, decideHours: whole(s.decideHours, 1, exports.MAX_DECIDE_HOURS, exports.DECIDE_HOURS) } : {}),
        holdCard,
        lateFeeMinor,
        meet: s.meet === true,
        // A pack pays for single visits; a course is one sign-up for all of its dates.
        packVisits: courseDates.length ? 0 : packVisits,
        packPriceMinor: courseDates.length ? 0 : packPriceMinor,
        packDays: courseDates.length ? 0 : packDays,
        // A class pass: a weekly class's pack that books any weekly class.
        ...(packVisits >= 2 && !courseDates.length && places >= 2 && s.packAnyClass === true ? { packAnyClass: true } : {}),
        ...(introPriceMinor ? { introPriceMinor } : {}),
        roomId: text(s.roomId, 40).replace(/[^A-Za-z0-9_-]/g, ""),
        chargeTax: payment !== "free" && s.chargeTax === true,
        rebookWeeks: whole(s.rebookWeeks, 0, exports.MAX_REBOOK_WEEKS, 0),
        // A request waits for the owner's answer, so a run of visits can't be booked with it.
        repeats: s.repeats === true && places === 1 && !courseDates.length && !approval,
        ...(approval ? { approval: true } : {}),
        ...(atClient ? { atClient: true, areas: cleanAreas(s.areas) } : {}),
        // Extras change one person's booking length, so a class or course never has them; a free service adds time only.
        extras: places === 1 && !courseDates.length ? cleanExtras(s.extras, payment !== "free") : [],
        ...(processMinutes ? { processAfter, processMinutes } : {}),
        ...(lengths.length ? { lengths, minutes: lengths[0].minutes, priceMinor: lengths[0].priceMinor } : {}),
    };
}
/**
 * A service's lengths, cleaned: each 5 minutes to 8 hours, at least 0.50 on a paid service (nothing on a free one),
 * named or left for "60 min", no two the same length. Fewer than two is none: one length is just the service.
 */
function cleanLengths(raw, priced = true) {
    const out = [];
    for (const item of Array.isArray(raw) ? raw : []) {
        const e = item && typeof item === "object" ? item : {};
        const minutes = Math.round(Number(e.minutes));
        if (!Number.isFinite(minutes) || minutes < 5 || minutes > 8 * 60 || out.length >= exports.MAX_LENGTHS)
            continue;
        const price = Math.round(Number(e.priceMinor));
        const priceMinor = priced ? (Number.isFinite(price) && price >= 50 ? Math.min(price, 1_000_000) : -1) : 0;
        if (priceMinor < 0 || out.some((o) => o.minutes === minutes && o.name === text(e.name, 40)))
            continue;
        let id = text(e.id, 24).replace(/[^A-Za-z0-9_-]/g, "") || `l${out.length + 1}`;
        while (out.some((o) => o.id === id))
            id += "x";
        out.push({ id, name: text(e.name, 40), minutes, priceMinor });
    }
    return out.length >= 2 ? out : [];
}
/** What a length is called: its own name, else its length ("1 h 30 min"). */
function lengthName(length) {
    if (length.name)
        return length.name;
    const h = Math.floor(length.minutes / 60), m = length.minutes % 60;
    return h ? `${h} h${m ? ` ${m} min` : ""}` : `${m} min`;
}
/**
 * The service as booked in the length the client chose (an id; none = the first): its minutes and price are that
 * length's, and its name says which ("Massage, 90 min"), so the calendar, emails and receipts all say it. A person's
 * own rates don't apply to a service with lengths. Processing time stays only while it still fits inside. Refused for
 * a length the service no longer has.
 */
function withLength(service, raw) {
    const lengths = service.lengths || [];
    if (lengths.length < 2)
        return { service };
    const id = typeof raw === "string" ? raw : "";
    const length = id ? lengths.find((l) => l.id === id) : lengths[0];
    if (!length)
        return { problem: "That length isn't offered any more. Please choose again." };
    const fits = (service.processAfter || 0) + (service.processMinutes || 0) < length.minutes;
    const { processAfter: _a, processMinutes: _m, ...rest } = service;
    const kept = service.processMinutes && fits ? { processAfter: service.processAfter, processMinutes: service.processMinutes } : {};
    return { service: { ...rest, ...kept, name: `${service.name}, ${lengthName(length)}`, minutes: length.minutes, priceMinor: length.priceMinor, lengthId: length.id }, length };
}
/** A service's add-ons and options, cleaned: named ones only, at most MAX_EXTRAS, each with its own id. */
function cleanExtras(raw, priced = true) {
    const out = [];
    for (const item of Array.isArray(raw) ? raw : []) {
        const e = item && typeof item === "object" ? item : {};
        const name = text(e.name, 80);
        if (!name || out.length >= exports.MAX_EXTRAS)
            continue;
        let id = text(e.id, 24).replace(/[^A-Za-z0-9_-]/g, "") || `x${out.length + 1}`;
        while (out.some((o) => o.id === id))
            id += "x";
        const minutes = whole(e.minutes, 0, exports.MAX_EXTRA_MINUTES, 0);
        const price = Math.round(Number(e.priceMinor));
        const priceMinor = priced && Number.isFinite(price) && price > 0 ? Math.min(price, 1_000_000) : 0;
        out.push({ id, name, minutes, priceMinor });
    }
    return out;
}
/**
 * The service as booked with the extras the client ticked (ids; unknown ones are ignored, each counts once): its minutes
 * and price grow by theirs, so every rule that reads the service (free times, the card page, deposits, tax, codes) sees
 * the booking's real length and price. A deposit given as an amount stays that amount; a share follows the new price.
 * Refused past 8 hours in all.
 */
function withExtras(service, raw) {
    const ids = new Set(Array.isArray(raw) ? raw.filter((x) => typeof x === "string").slice(0, exports.MAX_EXTRAS * 2) : []);
    const extras = (service.extras || []).filter((e) => ids.has(e.id));
    if (!extras.length)
        return { service, extras };
    const minutes = service.minutes + extras.reduce((n, e) => n + e.minutes, 0);
    if (minutes > 8 * 60)
        return { problem: "With those extras the booking is longer than 8 hours. Choose fewer." };
    const extrasMinor = extras.reduce((n, e) => n + e.priceMinor, 0);
    // `extrasMinor` keeps what the extras add, so a price that replaces the service's own (a first-visit price) keeps them.
    return { service: { ...service, minutes, priceMinor: service.priceMinor + extrasMinor, ...(extrasMinor ? { extrasMinor } : {}) }, extras };
}
/** A course's dates, cleaned: real shop-clock "YYYY-MM-DDTHH:MM" moments, no repeats, earliest first. */
function cleanCourseDates(raw) {
    const out = new Set();
    for (const item of Array.isArray(raw) ? raw : []) {
        if (typeof item !== "string")
            continue;
        const [day, time] = item.trim().slice(0, 16).split("T");
        if (!(0, exports.isDay)(day) || !TIME.test(time || ""))
            continue;
        // A day the calendar doesn't have (30 February) is dropped.
        if (new Date(`${day}T12:00:00Z`).toISOString().slice(0, 10) !== day)
            continue;
        out.add(`${day}T${time}`);
    }
    return [...out].sort().slice(0, exports.MAX_COURSE_DATES);
}
/** A course's session starts (milliseconds), earliest first; a clock change never lists one moment twice. */
function courseStarts(service, zone) {
    if (!(0, exports.isCourse)(service))
        return [];
    const out = [];
    for (const d of service.courseDates) {
        const ms = zonedTime(d.slice(0, 10), d.slice(11, 16), zone);
        if (Number.isFinite(ms) && !out.includes(ms))
            out.push(ms);
    }
    return out.sort((a, b) => a - b);
}
/** How long before a class with a minimum it is decided whether it runs: by default, and at most (a week). */
exports.DECIDE_HOURS = 24;
exports.MAX_DECIDE_HOURS = 168;
/**
 * Whether a class time with a minimum is due to be decided now: from `decideHours` before `start` until it starts. A
 * course is decided on its first date. false for a service without a minimum.
 */
function runDecisionDue(start, service, nowMs) {
    if (!service.minPlaces || !Number.isFinite(start))
        return false;
    return nowMs >= start - (service.decideHours || exports.DECIDE_HOURS) * 60 * MINUTE && nowMs < start;
}
/** A course joined late needs at least this many dates still to come. */
exports.MIN_LATE_DATES = 2;
/**
 * The course as someone signing up now gets it: the whole course before it starts; after it starts, only when the owner
 * lets people join late (`lateJoin`) and at least MIN_LATE_DATES dates are still to come, as a course of the dates left
 * at the price of those dates (the whole price shared evenly across the dates, rounded to the cent; a set deposit never
 * more than that). null when it can't be joined any more. Anything that isn't a course comes back as it is.
 */
function joinableCourse(service, zone, nowMs) {
    if (!(0, exports.isCourse)(service))
        return service;
    const dates = service.courseDates;
    const left = dates.filter((d) => zonedTime(d.slice(0, 10), d.slice(11, 16), zone) > nowMs);
    if (left.length === dates.length)
        return service;
    if (!service.lateJoin || left.length < exports.MIN_LATE_DATES)
        return null;
    const full = Math.max(0, Math.round(Number(service.priceMinor) || 0));
    const priceMinor = Math.round((full * left.length) / dates.length);
    return {
        ...service,
        courseDates: left,
        priceMinor,
        ...(service.depositMinor ? { depositMinor: Math.min(service.depositMinor, priceMinor) } : {}),
        joining: { missed: dates.length - left.length, of: dates.length, fullPriceMinor: full },
    };
}
/**
 * The fewest places left across a course's sessions (a sign-up needs one in each), for whoever could run each one.
 * 0 when any session is full or something else is in its way.
 */
function coursePlacesLeft(service, settings, busy, zone) {
    const starts = courseStarts(service, zone);
    return starts.length ? Math.min(...starts.map((ms) => classPlacesLeft(ms, service, settings, busy))) : 0;
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
    const hours = cleanHours(s.hours, exports.DEFAULT_BOOKING_SETTINGS.hours);
    const daysOff = cleanDaysOff(s.daysOff);
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
        pickupTimes: s.pickupTimes === true,
        pickupSlotMinutes: exports.PICKUP_SLOT_MINUTES.includes(Number(s.pickupSlotMinutes)) ? Number(s.pickupSlotMinutes) : exports.DEFAULT_BOOKING_SETTINGS.pickupSlotMinutes,
        pickupPerSlot: whole(s.pickupPerSlot, 1, exports.MAX_PICKUP_PER_SLOT, exports.DEFAULT_BOOKING_SETTINGS.pickupPerSlot),
        pickupReadyHours: whole(s.pickupReadyHours, 0, 72, exports.DEFAULT_BOOKING_SETTINGS.pickupReadyHours),
        rooms: cleanRooms(s.rooms),
        staff: cleanStaff(s.staff, hours),
        ...(s.teamShown === "anyone" || s.teamShown === "hidden" ? { teamShown: s.teamShown } : {}),
        thankYou: s.thankYou === true,
        reviewUrl: reviewLink(s.reviewUrl),
        siteReviews: s.siteReviews === true,
        textReminders: s.textReminders === true,
        textReplies: s.textReplies === true,
        askToConfirm: s.askToConfirm === true,
        ...(() => { const forms = cleanIntakeForms(s.intakeForms, s.intakeForm); return forms.length ? { intakeForms: forms } : {}; })(),
        ...(() => { const blocks = cleanBlocks(s.blocks); return blocks.length ? { blocks } : {}; })(),
        ...(() => { const specialHours = cleanSpecialHours(s.specialHours); return specialHours.length ? { specialHours } : {}; })(),
        ...(exports.DAILY_CAPS.includes(Number(s.dailyCap)) && Number(s.dailyCap) > 0 ? { dailyCap: Number(s.dailyCap) } : {}),
    };
}
/**
 * Where a booking stands on confirm requests (plan 4, 3.3): "confirmed" once the client tapped "Yes, I'll be there",
 * "waiting" after the reminder asked and before they answered, null when nothing was asked (the setting is off, the
 * booking isn't a confirmed one, its reminder hasn't gone, or it has already started).
 */
function confirmState(b, settings, nowMs) {
    if (b.status !== "confirmed")
        return null;
    if (b.clientConfirmedAt)
        return "confirmed";
    if (!settings?.askToConfirm || !settings.reminderHours || !b.reminderSentAt)
        return null;
    const start = Date.parse(b.start || "");
    return Number.isFinite(start) && start > nowMs ? "waiting" : null;
}
exports.MAX_REBOOK_WEEKS = 52;
// ── Standing appointments (Services plan 2, B1) ──────────────────────────────────────────────────────────────────
/** The most visits one run can hold, and the longest gap between two of them. */
exports.MAX_RUN_VISITS = 12;
exports.MAX_RUN_WEEKS = 12;
/** A run stays inside a year from its first visit. */
exports.MAX_RUN_DAYS = 364;
/** Whether clients can book a run of this service online (see `repeats`). */
function runsOnline(s) {
    return !!s?.repeats && !(0, exports.isClass)(s) && (s.payment === "free" || s.payment === "atShop") && !s.holdCard;
}
/** A run asked for, cleaned: null for none (missing, or one visit), else the run or what is wrong with it. */
function cleanRun(raw) {
    if (raw == null || raw === false)
        return null;
    const r = typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const visits = Math.round(Number(r.visits));
    const everyWeeks = Math.round(Number(r.everyWeeks));
    if (visits === 1 || r.visits === undefined)
        return null;
    if (!Number.isFinite(visits) || visits < 2 || visits > exports.MAX_RUN_VISITS)
        return { problem: `A standing appointment is 2 to ${exports.MAX_RUN_VISITS} visits.` };
    if (!Number.isFinite(everyWeeks) || everyWeeks < 1 || everyWeeks > exports.MAX_RUN_WEEKS)
        return { problem: `Choose every 1 to ${exports.MAX_RUN_WEEKS} weeks.` };
    if ((visits - 1) * everyWeeks * 7 > exports.MAX_RUN_DAYS)
        return { problem: "A standing appointment stays within a year. Choose fewer visits or a shorter gap." };
    return { everyWeeks, visits };
}
/**
 * Every visit of a run (milliseconds), the first being `start`: the same time on the shop's clock, `everyWeeks` weeks
 * apart, so a clock change never moves the hour.
 */
function runStarts(start, run, zone) {
    const day = dayOf(start, zone);
    const p = partsIn(zone, start);
    const hhmm = `${String(p.hour % 24).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
    const out = [start];
    for (let n = 1; n < run.visits; n++)
        out.push(zonedTime(addDays(day, n * run.everyWeeks * 7), hhmm, zone));
    return out;
}
/**
 * Settings for a run's later visits: online, the shop's hours and days off; booked by the shop (`owner`), any hour. Either
 * way a later visit may fall up to a year after a first visit at the far edge of the booking window, so the window grows
 * by the longest run.
 */
function runSettings(settings, owner = false) {
    const base = owner ? ownerBookingSettings(settings) : { ...settings, minNoticeHours: 0 };
    return { ...base, maxDaysAhead: (base.maxDaysAhead || exports.DEFAULT_BOOKING_SETTINGS.maxDaysAhead) + exports.MAX_RUN_DAYS };
}
/** A rebook reminder goes out within this many days of falling due; a visit older than that is left alone. */
exports.REBOOK_WINDOW_DAYS = 14;
/**
 * Is a visit due its rebook reminder? The service asks for one, the visit happened (confirmed, not a no-show), the
 * client left an email, `rebookWeeks` weeks have passed (but not `REBOOK_WINDOW_DAYS` more, so turning it on never
 * mails old clients), and none went yet. Whether they booked again since is the caller's to check.
 */
function rebookDue(b, service, nowMs) {
    const weeks = Number(service?.rebookWeeks) || 0;
    if (!(weeks > 0) || b.status !== "confirmed" || b.noShow || b.rebookSentAt || !b.customer?.email)
        return false;
    const start = Date.parse(b.start || "");
    if (!Number.isFinite(start))
        return false;
    const dueAt = start + weeks * 7 * 86_400_000;
    return dueAt <= nowMs && nowMs < dueAt + exports.REBOOK_WINDOW_DAYS * 86_400_000;
}
/** Can the client review this visit on their booking page? The shop takes reviews, the visit happened, none yet. */
function reviewOpen(b, settings, nowMs) {
    if (!settings.siteReviews || b.reviewId || b.status !== "confirmed" || b.noShow)
        return false;
    return Date.parse(b.start || "") <= nowMs;
}
exports.REVIEW_BODY_MAX = 2000;
/**
 * A client's review as they wrote it, cleaned: a whole rating 1–5 and some words (up to REVIEW_BODY_MAX), or { problem }.
 * The name shown is their first name and the first letter of their last ("Ada R."), never the full name.
 */
function cleanVisitReview(raw, fullName) {
    const r = raw && typeof raw === "object" ? raw : {};
    const rating = Number(r.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5)
        return { problem: "Please choose from one to five stars." };
    const body = typeof r.body === "string" ? r.body.trim().slice(0, exports.REVIEW_BODY_MAX) : "";
    if (body.length < 3)
        return { problem: "Please write a few words about your visit." };
    const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
    const authorName = parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.` : parts[0] || "A client";
    return { rating, body, authorName: authorName.slice(0, 80) };
}
/** A review link as typed: an https address of at most 500 characters, else "". */
function reviewLink(raw) {
    const text = typeof raw === "string" ? raw.trim() : "";
    if (!text || text.length > 500)
        return "";
    try {
        const url = new URL(text);
        return url.protocol === "https:" && url.hostname.includes(".") ? url.href : "";
    }
    catch {
        return "";
    }
}
/**
 * Should the visit get the thank-you email? The shop sends them, the visit happened (confirmed, not a no-show, started)
 * and none went yet. A visit that gets the "Add a tip" email (`tipOpen`) is thanked in that email instead.
 */
function thanksDue(b, settings, nowMs) {
    if (!settings.thankYou || b.thanksSentAt || b.tipAskedAt || b.status !== "confirmed" || b.noShow)
        return false;
    if (!(Date.parse(b.start || "") <= nowMs))
        return false;
    return !tipOpen(b, settings.tips, nowMs);
}
/** A week of opening hours, cleaned (7 days, up to 4 windows each, in order, no overlaps); `fallback` when broken. */
function cleanHours(raw, fallback) {
    const rawHours = Array.isArray(raw) && raw.length === 7 ? raw : fallback;
    return rawHours.map((day) => {
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
}
const cleanDaysOff = (raw) => [...new Set((Array.isArray(raw) ? raw : []).filter((d) => typeof d === "string" && DAY.test(d)))].sort().slice(-200);
/** An id kept from what was sent, else made from the position; never a repeat. */
function ownId(raw, prefix, taken, index) {
    let id = text(raw, 40).replace(/[^A-Za-z0-9_-]/g, "") || `${prefix}${index + 1}`;
    while (taken.has(id))
        id += "x";
    taken.add(id);
    return id;
}
/** The rooms and chairs, cleaned: named, at most MAX_ROOMS, each with its own id. */
function cleanRooms(raw) {
    const taken = new Set();
    const out = [];
    for (const item of Array.isArray(raw) ? raw : []) {
        const r = item && typeof item === "object" ? item : {};
        const name = text(r.name, 60);
        if (!name || out.length >= exports.MAX_ROOMS)
            continue;
        const units = Math.round(Number(r.units));
        out.push({ id: ownId(r.id, "room", taken, out.length), name, ...(units > 1 ? { units: Math.min(units, exports.MAX_ROOM_UNITS) } : {}) });
    }
    return out;
}
/** The people, cleaned: named, at most MAX_STAFF, each with its own id; own hours start from the shop's. */
/** Longest bio of a person on the booking page (plan 4, 2.4). */
exports.MAX_BIO_LENGTH = 280;
/** A person's bio as saved: one paragraph, at most MAX_BIO_LENGTH characters ("" = none). */
const personBio = (value) => text(value, exports.MAX_BIO_LENGTH);
exports.personBio = personBio;
exports.TEAM_SHOWN_CHOICES = ["pick", "anyone", "hidden"];
function cleanStaff(raw, shopHours = exports.DEFAULT_BOOKING_SETTINGS.hours) {
    const taken = new Set();
    const out = [];
    for (const item of Array.isArray(raw) ? raw : []) {
        const p = item && typeof item === "object" ? item : {};
        const name = text(p.name, 60);
        if (!name || out.length >= exports.MAX_STAFF)
            continue;
        const ownHours = p.ownHours === true;
        const email = text(p.email, 320).toLowerCase();
        out.push({
            id: ownId(p.id, "p", taken, out.length),
            name,
            active: p.active !== false,
            serviceIds: [...new Set((Array.isArray(p.serviceIds) ? p.serviceIds : []).map((v) => text(v, 40)).filter((v) => /^[A-Za-z0-9_-]+$/.test(v)))].slice(0, exports.MAX_SERVICES),
            ownHours,
            hours: ownHours ? cleanHours(p.hours, shopHours) : shopHours.map((d) => d.map((w) => ({ ...w }))),
            daysOff: cleanDaysOff(p.daysOff),
            ...(() => { const specialHours = cleanSpecialHours(p.specialHours); return specialHours.length ? { specialHours } : {}; })(),
            email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : "",
            rates: cleanRates(p.rates),
            ...(commissionOf(p.commissionPercent) ? { commissionPercent: commissionOf(p.commissionPercent) } : {}),
            ...((0, exports.servicePhoto)(p.photo) ? { photo: (0, exports.servicePhoto)(p.photo) } : {}),
            ...((0, exports.personBio)(p.bio) ? { bio: (0, exports.personBio)(p.bio) } : {}),
        });
    }
    return out;
}
/** A commission share: a number from 0.5 to 100 in half steps; anything else is none (0). */
function commissionOf(raw) {
    const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() ? Number(raw) : NaN;
    if (!Number.isFinite(n))
        return 0;
    const half = Math.round(n * 2) / 2;
    return half < 0.5 ? 0 : Math.min(100, half);
}
/** A person's own lengths and prices: one per service, at least one of the two set, lengths 5 minutes to 8 hours. */
function cleanRates(raw) {
    const seen = new Set();
    const out = [];
    for (const item of Array.isArray(raw) ? raw : []) {
        const r = item && typeof item === "object" ? item : {};
        const serviceId = text(r.serviceId, 40);
        if (!/^[A-Za-z0-9_-]+$/.test(serviceId) || seen.has(serviceId) || out.length >= exports.MAX_SERVICES)
            continue;
        const set = (v) => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));
        const minutes = set(r.minutes) ? whole(r.minutes, 5, 8 * 60, 5) : null;
        const priceMinor = set(r.priceMinor) ? whole(r.priceMinor, 0, 1_000_000, 0) : null;
        if (minutes === null && priceMinor === null)
            continue;
        seen.add(serviceId);
        out.push({ serviceId, minutes, priceMinor });
    }
    return out;
}
/**
 * The service as booked with one person picked: their own length and price where they set one (B3). Only a one-to-one
 * service, only someone who does it, and never money on a free service. "Anyone free" keeps the service's own.
 */
function forPerson(service, settings, staffId) {
    if ((service.places || 1) > 1 || (0, exports.isCourse)(service) || (service.lengths?.length || 0) >= 2)
        return service;
    const id = keptPerson(settings, service.id, staffId);
    const rate = id ? (settings.staff || []).find((p) => p.id === id)?.rates?.find((r) => r.serviceId === service.id) : undefined;
    if (!rate)
        return service;
    return { ...service, minutes: rate.minutes ?? service.minutes, priceMinor: service.payment === "free" ? service.priceMinor : rate.priceMinor ?? service.priceMinor };
}
/** How far apart pickup times are offered. */
exports.PICKUP_SLOT_MINUTES = [15, 30, 60];
exports.MAX_PICKUP_PER_SLOT = 20;
/** Shoppers see this many days of pickup times. */
exports.PICKUP_DAYS_AHEAD = 14;
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
/**
 * The moment a wall-clock time on a day in the shop's zone happens ("2026-11-20", "14:30"). A time the clocks skip in
 * spring (2:30 when 2:00 jumps to 3:00) is the same time after the jump (3:30), never an hour early; a time that
 * happens twice in autumn is the first one.
 */
function zonedTime(day, hhmm, zone) {
    const guess = Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)), Number(hhmm.slice(0, 2)), Number(hhmm.slice(3, 5)));
    const first = guess - offsetAt(zone, guess);
    const second = guess - offsetAt(zone, first);
    const p = partsIn(zone, second);
    const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute);
    return wall === guess ? second : Math.max(first, second);
}
/** The shop's day (YYYY-MM-DD) a moment falls on. */
function dayOf(ms, zone) {
    const p = partsIn(zone, ms);
    return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}
/** A time zone name the runtime knows ("Europe/London"), else "" (plan 4, 2.9). */
function cleanZone(v) {
    if (typeof v !== "string" || v.length > 64 || !/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/.test(v))
        return "";
    try {
        new Intl.DateTimeFormat("en", { timeZone: v });
        return v;
    }
    catch {
        return "";
    }
}
/** True when two zones show a different clock at that moment (Toronto and New York don't). */
function zonesDiffer(a, b, ms) {
    return !!a && !!b && a !== b && offsetAt(a, ms) !== offsetAt(b, ms);
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
function placesLeft(start, service, busy, staffId = "", units = 1) {
    const end = start + (service.minutes + service.gapAfter) * MINUTE;
    // Time before (plan 4, 1.6): set-up or travel is kept free too, like the rest after.
    const begin = start - (Math.round(Number(service.gapBefore)) || 0) * MINUTE;
    const places = (0, exports.isClass)(service) && service.id ? Math.round(Number(service.places)) : 1;
    const room = service.roomId || "";
    // Processing time (plan 4, 1.5): the person is free while a booking processes, so a short booking may sit wholly
    // inside one (theirs or this one's own); the room stays taken, so one needing the same room still clashes.
    const own = processingStretch(service, start);
    const inside = (a, z, gap) => !!gap && a >= gap.start && z <= gap.end;
    let taken = 0;
    const inRoom = [];
    for (const b of busy) {
        if (b.closed) {
            if (b.serviceId === service.id && b.start === start)
                return 0;
            continue;
        }
        if (!(begin < b.end && end > b.start))
            continue;
        // With people, a stretch matters when it is this person's, the whole shop's, or in the room this service needs.
        const mine = !staffId || !b.staffId || b.staffId === staffId;
        const sameRoom = !!room && b.roomId === room;
        if (!mine && !sameRoom)
            continue;
        const sameClass = places > 1 && b.serviceId === service.id && b.start === start && (!staffId || (b.staffId || "") === staffId);
        if (sameClass) {
            taken += 1;
            continue;
        }
        // The room stays in use for the whole booking, processing included; it is full only at its count (plan 4, 1.9).
        if (sameRoom)
            inRoom.push(b);
        if (mine && !inside(begin, end, b.free) && !inside(b.start, b.end, own))
            return 0;
    }
    if (inRoom.length && mostAtOnce(inRoom, begin, end) >= Math.max(1, units))
        return 0;
    return Math.max(0, places - taken);
}
/** The most of `list` in use at one moment between `from` and `to` (each starts or is already running at some point). */
function mostAtOnce(list, from, to) {
    let most = 0;
    for (const at of [from, ...list.map((b) => b.start).filter((t) => t > from && t < to)]) {
        most = Math.max(most, list.filter((b) => b.start <= at && at < b.end).length);
    }
    return most;
}
/** The people who can be booked for a service: active, and doing it (nobody listed for a service means everyone). */
function staffFor(settings, serviceId) {
    return (settings.staff || []).filter((p) => p.active && (!p.serviceIds.length || (!!serviceId && p.serviceIds.includes(serviceId))));
}
/** Does the shop book by person? Only when someone is listed and active. */
const booksByPerson = (settings) => (settings.staff || []).some((p) => p.active);
exports.booksByPerson = booksByPerson;
/** Whether a booking of `service` starting at `start` can't be taken: something overlaps it, or the class is full. */
function clashes(start, service, busy, staffId = "") {
    return placesLeft(start, service, busy, staffId) === 0;
}
/** The last day customers may book, and the earliest moment, as of `nowMs`. */
function bookingWindow(settings, zone, nowMs) {
    return { earliest: nowMs + settings.minNoticeHours * 60 * MINUTE, lastDay: addDays(dayOf(nowMs, zone), settings.maxDaysAhead) };
}
/**
 * The start times (milliseconds) a customer can book on one shop day, earliest first: inside the day's opening hours,
 * whole service inside a window, at the step, after the notice, before the last day, clashing with nothing busy.
 */
function freeTimes(args) {
    const { service, settings, day } = args;
    if (!(0, exports.booksByPerson)(settings))
        return freeTimesFor(args, hoursOnDay(settings, day), "");
    const people = staffFor(settings, service.id).filter((p) => !args.staffId || p.id === args.staffId);
    const all = new Set();
    for (const p of people) {
        if (p.daysOff.includes(day))
            continue;
        for (const ms of freeTimesFor(args, personHoursOn(settings, p, day), p.id))
            all.add(ms);
    }
    return [...all].sort((a, b) => a - b);
}
/** One calendar's free times on a day: the shop's (no person) or one person's, with their working hours. */
function freeTimesFor({ service, settings, busy: booked, day, zone, nowMs }, windows, staffId) {
    if (!(0, exports.isDay)(day) || settings.daysOff.includes(day))
        return [];
    // The daily limit (plan 4, 1.8): a day with that many bookings offers nothing more online.
    if (settings.dailyCap && bookingsOnDay(booked, day, zone) >= settings.dailyCap)
        return [];
    // The owner's blocked time is busy like a booking: the whole shop's for everyone, a person's for them.
    const busy = settings.blocks?.length ? [...booked, ...blockedBusy(settings.blocks, day, zone)] : booked;
    const { earliest, lastDay } = bookingWindow(settings, zone, nowMs);
    if (day < dayOf(nowMs, zone))
        return [];
    const units = roomUnits(settings, service.roomId);
    const open = (start) => placesLeft(start, service, busy, staffId, units) > 0;
    // A course is signed up for at its first session only, however far ahead it starts and whatever the opening hours
    // say. (The server checks a place in every later session when it takes the sign-up.)
    if ((0, exports.isCourse)(service)) {
        const first = courseStarts(service, zone)[0];
        return dayOf(first, zone) === day && first >= earliest && open(first) ? [first] : [];
    }
    if (day > lastDay)
        return [];
    const out = [];
    // A class with its own weekly times runs at those, whatever the opening hours say.
    if ((0, exports.isClass)(service) && service.classTimes?.length) {
        for (const t of service.classTimes) {
            if (t.weekday !== (0, exports.weekdayOf)(day))
                continue;
            const start = zonedTime(day, t.time, zone);
            if (start >= earliest && open(start) && !out.includes(start))
                out.push(start);
        }
        return out.sort((a, b) => a - b);
    }
    for (const w of windows) {
        const close = minutesOf(w.end);
        for (let m = minutesOf(w.start); m + service.minutes <= close; m += settings.step) {
            const start = zonedTime(day, `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`, zone);
            if (start < earliest || !open(start))
                continue;
            // A clock change can make two wall times one moment; offer it once.
            if (out[out.length - 1] !== start)
                out.push(start);
        }
    }
    return out;
}
/**
 * A class's own starts (milliseconds) on one shop day, earliest first: its weekly class times that fall on that weekday,
 * whether or not anyone has booked and however full it is. Nothing for a service that isn't a class, or a class with no
 * weekly times (it runs at any free time in the opening hours). Days off and notice are the caller's to apply.
 */
function classStartsOn(day, service, zone) {
    if (!(0, exports.isDay)(day) || !(0, exports.isClass)(service))
        return [];
    const out = [];
    for (const t of service.classTimes || []) {
        if (t.weekday !== (0, exports.weekdayOf)(day))
            continue;
        const start = zonedTime(day, t.time, zone);
        // A clock change can make two wall times one moment; list it once.
        if (!out.includes(start))
            out.push(start);
    }
    return out.sort((x, y) => x - y);
}
/**
 * Who takes a booking of `service` at `start`: the person asked for when they are free, else (anyone) someone already
 * running that class then, else whoever has the fewest bookings that day, then the list's order. "" when the shop books
 * as one calendar and the time is free; null when nobody can take it (the server's check before it takes a booking).
 */
function whoIsFree(args) {
    const { service, settings, busy, start, zone } = args;
    if (!Number.isFinite(start))
        return null;
    const day = dayOf(start, zone);
    if (!(0, exports.booksByPerson)(settings))
        return freeTimesFor({ ...args, day }, hoursOnDay(settings, day), "").includes(start) ? "" : null;
    const people = staffFor(settings, service.id).filter((p) => (!args.staffId || p.id === args.staffId) && !p.daysOff.includes(day)
        && freeTimesFor({ ...args, day }, personHoursOn(settings, p, day), p.id).includes(start));
    if (!people.length)
        return null;
    const teaching = (0, exports.isClass)(service) ? people.find((p) => busy.some((b) => b.staffId === p.id && b.serviceId === service.id && b.start === start)) : undefined;
    if (teaching)
        return teaching.id;
    const load = (id) => busy.filter((b) => b.staffId === id && dayOf(b.start, zone) === day).length;
    return people.reduce((best, p) => (load(p.id) < load(best.id) ? p : best)).id;
}
// ── Several services in one visit (plan 4, 2.1) ─────────────────────────────────────────────────────────────────────
/** Services a client may add after the first, so one visit holds at most this many plus one. */
exports.MAX_VISIT_PARTS = 3;
/** A visit's services in words: "Cut + Colour" (the one service's name for an ordinary booking). */
const visitName = (b) => [b.serviceName, ...(Array.isArray(b.parts) ? b.parts.map((p) => p?.serviceName) : [])].filter((n) => typeof n === "string" && !!n).join(" + ");
exports.visitName = visitName;
/** Each service of a visit in turn, with who takes it and when (one entry for an ordinary booking). */
function visitPlan(b) {
    const parts = Array.isArray(b.parts) ? b.parts : [];
    const first = { serviceName: b.serviceName || "", staffName: b.staffName || "", start: b.start || "", end: parts.length ? parts[0].start || "" : b.end || "" };
    return [first, ...parts.map((p) => ({ serviceName: p.serviceName || "", staffName: p.staffName || "", start: p.start || "", end: p.end || "" }))];
}
/** Whether a service can be one of several in a visit: one client at a time, not a class or course. */
const joinsVisit = (s) => !!s && !(0, exports.isClass)(s) && !(0, exports.isCourse)(s);
exports.joinsVisit = joinsVisit;
/**
 * The visit as one service for the money rules: the whole price, and a way to pay made from each part's own (what the
 * card takes now is the sum of each part's ask: its full price, its deposit, or nothing at the visit). Only the first
 * keeps its time before and only the last its tidy-up time, so the first carries no rest here. No first-visit price.
 * `taxedMinor`: the part of the price from services that charge tax.
 */
function visitService(first, more) {
    const all = [first, ...more];
    const priceMinor = all.reduce((n, s) => n + Math.max(0, Math.round(Number(s.priceMinor) || 0)), 0);
    const askMinor = all.reduce((n, s) => n + depositOf(s), 0);
    const taxedMinor = all.reduce((n, s) => n + (s.chargeTax ? Math.max(0, Math.round(Number(s.priceMinor) || 0)) : 0), 0);
    const payment = all.every((s) => s.payment === "free") ? "free" : askMinor <= 0 ? "atShop" : askMinor >= priceMinor ? "full" : "deposit";
    return {
        ...first, priceMinor, payment, depositMinor: payment === "deposit" ? askMinor : 0, depositPercent: 0, introPriceMinor: 0,
        chargeTax: taxedMinor > 0, taxedMinor, ...(more.length ? { gapAfter: 0 } : {}),
    };
}
/** Where each service of a visit sits: back to back from `start`; only the last keeps its tidy-up time. */
function visitTimeline(start, services) {
    let at = start;
    return services.map((s, i) => {
        const from = at;
        at += s.minutes * MINUTE;
        return { start: from, end: at, blockEnd: at + (i === services.length - 1 ? (s.gapAfter || 0) * MINUTE : 0) };
    });
}
/**
 * Whether `service` can start at `start` for `staffId` (or anyone free: "" or the person's id; null when nobody), at any
 * minute rather than on the booking step: a later service of a visit starts when the one before ends. Same rules as a
 * free time otherwise: opening or the person's hours, days off, blocked time, notice, the last day, nothing busy. A
 * visit is one booking, so the daily limit was already counted at its first service.
 */
function fitsAt(args) {
    const { service, settings, start, zone, nowMs } = args;
    if (!Number.isFinite(start) || !(0, exports.joinsVisit)(service))
        return null;
    const day = dayOf(start, zone);
    const { earliest, lastDay } = bookingWindow(settings, zone, nowMs);
    if (settings.daysOff.includes(day) || start < earliest || day > lastDay)
        return null;
    const busy = settings.blocks?.length ? [...args.busy, ...blockedBusy(settings.blocks, day, zone)] : args.busy;
    const units = roomUnits(settings, service.roomId);
    const end = start + service.minutes * MINUTE;
    const inside = (windows) => windows.some((w) => start >= zonedTime(day, w.start, zone) && end <= zonedTime(day, w.end, zone));
    if (!(0, exports.booksByPerson)(settings))
        return inside(hoursOnDay(settings, day)) && placesLeft(start, service, busy, "", units) > 0 ? "" : null;
    const people = staffFor(settings, service.id).filter((p) => (!args.staffId || p.id === args.staffId) && !p.daysOff.includes(day)
        && inside(personHoursOn(settings, p, day)) && placesLeft(start, service, busy, p.id, units) > 0);
    if (!people.length)
        return null;
    const load = (id) => busy.filter((b) => b.staffId === id && dayOf(b.start, zone) === day).length;
    return people.reduce((best, p) => (load(p.id) < load(best.id) ? p : best)).id;
}
/**
 * Who takes each service of a visit starting at `start` (one id per service, "" when the shop books as one calendar),
 * or null when the whole visit doesn't fit. `staffIds[i]` is the person the client picked for service i ("" for anyone
 * free); anyone free keeps the person before when they can, so a client isn't passed between chairs for nothing.
 */
function visitStaff(args) {
    const { services, settings, zone, nowMs } = args;
    if (!services.length)
        return null;
    const times = visitTimeline(args.start, services);
    const busy = [...args.busy];
    const out = [];
    for (let i = 0; i < services.length; i++) {
        const service = { ...services[i], gapAfter: i === services.length - 1 ? services[i].gapAfter : 0, ...(i ? { gapBefore: 0 } : {}) };
        const picked = args.staffIds?.[i] || "";
        const at = times[i].start;
        const who = i === 0
            ? whoIsFree({ service, settings, busy, start: at, zone, nowMs, staffId: picked })
            : (!picked && out[i - 1] ? fitsAt({ service, settings, busy, start: at, zone, nowMs, staffId: out[i - 1] }) : null) ?? fitsAt({ service, settings, busy, start: at, zone, nowMs, staffId: picked });
        if (who === null)
            return null;
        out.push(who);
        busy.push({ start: at, end: times[i].blockEnd, serviceId: service.id, ...(who ? { staffId: who } : {}), ...(service.roomId ? { roomId: service.roomId } : {}) });
    }
    return out;
}
/** The start times on one day when the whole visit fits, earliest first (the first service's free times, then the rest). */
function visitFreeTimes(args) {
    const [first, ...more] = args.services;
    if (!first)
        return [];
    const lead = more.length ? { ...first, gapAfter: 0 } : first;
    const starts = freeTimes({ service: lead, settings: args.settings, busy: args.busy, day: args.day, zone: args.zone, nowMs: args.nowMs, staffId: args.staffIds?.[0] || "" });
    if (!more.length)
        return starts;
    // The whole visit must also end inside the day's hours, which each later service's own check sees.
    return starts.filter((start) => visitStaff({ ...args, start }) !== null);
}
/** A class's places left at `start` for whoever could run it (the most any one person has), or the one person asked for. */
function classPlacesLeft(start, service, settings, busy, staffId = "") {
    const units = roomUnits(settings, service.roomId);
    if (!(0, exports.booksByPerson)(settings))
        return placesLeft(start, service, busy, "", units);
    const people = staffFor(settings, service.id).filter((p) => !staffId || p.id === staffId);
    return people.reduce((most, p) => Math.max(most, placesLeft(start, service, busy, p.id, units)), 0);
}
/** The person to keep when a booking moves: theirs while they still do the service, else "" (anyone free). */
function keptPerson(settings, serviceId, staffId) {
    return typeof staffId === "string" && staffId && staffFor(settings, serviceId).some((p) => p.id === staffId) ? staffId : "";
}
/** Settings for the owner booking someone in: any hour of any day, for anyone on the team (a favour for a regular). */
function ownerBookingSettings(settings) {
    const allDay = Array.from({ length: 7 }, () => [{ start: "00:00", end: "23:59" }]);
    // Blocked time keeps clients out, never the owner: they can still put a booking there by hand.
    return { ...settings, minNoticeHours: 0, maxDaysAhead: 366, hours: allDay, daysOff: [], step: 5, blocks: [], specialHours: [], dailyCap: 0,
        staff: (settings.staff || []).map((p) => ({ ...p, ownHours: false, hours: allDay, daysOff: [], specialHours: [] })) };
}
/** Whether `start` is free for a booking (someone can take it, or the shop's one calendar is free there). */
function isFreeTime(args) {
    return whoIsFree(args) !== null;
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
// ── Packs of visits (16 November 2026) ──────────────────────────────────────────────────────────────────────────
exports.MAX_PACK_VISITS = 50;
exports.MAX_PACK_DAYS = 730;
/** Does this service sell a pack of visits? */
const offersPack = (s) => (Number(s?.packVisits) || 0) >= 2 && (Number(s?.packPriceMinor) || 0) >= exports.MIN_CARD_MINOR;
exports.offersPack = offersPack;
/** The visits booked with a pack and not given back. */
const packUsed = (p) => (p.uses || []).filter((u) => !u.returned).length;
exports.packUsed = packUsed;
/** The visits still to book. */
const packLeft = (p) => Math.max(0, (Number(p.visits) || 0) - (0, exports.packUsed)(p));
exports.packLeft = packLeft;
/** The last shop day a pack bought on `day` can be booked for: `days` later, or null when it never runs out. */
const packEndsOn = (day, days) => (days > 0 ? addDays(day, days) : null);
exports.packEndsOn = packEndsOn;
/** The customer's words for each reason a pack can't book this visit. */
exports.PACK_MESSAGES = {
    not_found: "We couldn't find that pack. Check the code in your email.",
    not_paid: "This pack isn't paid for yet.",
    closed: "This pack has been closed. Please contact the shop.",
    other_service: "This pack is for another service.",
    expired: "This pack has run out of time.",
    used_up: "Every visit in this pack has been booked.",
};
/**
 * Why `pack` can't book a visit to `serviceId` on shop day `day` (the visit's own day), or null when it can. A pack
 * running out only stops visits after its last day; a visit booked before then keeps its place.
 */
function packProblem(pack, serviceId, day, weeklyClass = false) {
    if (!pack)
        return "not_found";
    if (pack.status === "held")
        return "not_paid";
    if (pack.status !== "active")
        return "closed";
    // A class pass books any weekly class (`weeklyClass`: the service booked is a class and not a course).
    if (pack.serviceId !== serviceId && !(pack.anyClass && weeklyClass))
        return "other_service";
    if (pack.expiresOn && day > pack.expiresOn)
        return "expired";
    if ((0, exports.packLeft)(pack) <= 0)
        return "used_up";
    return null;
}
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
/** Every pickup slot start on one shop day inside its opening hours (a slot must end by closing), ignoring notice and taken. */
function slotsOn(settings, day, zone) {
    if (!(0, exports.isDay)(day) || settings.daysOff.includes(day))
        return [];
    const out = [];
    for (const w of hoursOnDay(settings, day)) {
        const close = minutesOf(w.end);
        for (let m = minutesOf(w.start); m + settings.pickupSlotMinutes <= close; m += settings.pickupSlotMinutes) {
            const start = zonedTime(day, hhmm(m), zone);
            if (out[out.length - 1] !== start)
                out.push(start);
        }
    }
    return out;
}
/**
 * The pickup times a shopper may choose, by shop day (YYYY-MM-DD → slot starts in milliseconds, earliest first), over
 * the next PICKUP_DAYS_AHEAD days: inside opening hours, at least `pickupReadyHours` from now, and not yet full
 * (`taken` counts orders per slot start). Days with no time left are left out.
 */
function pickupSlots({ settings, zone, nowMs, taken = {}, days = exports.PICKUP_DAYS_AHEAD }) {
    const earliest = nowMs + settings.pickupReadyHours * 60 * MINUTE;
    const first = dayOf(nowMs, zone);
    const out = {};
    for (let i = 0; i < days; i++) {
        const day = addDays(first, i);
        const free = slotsOn(settings, day, zone).filter((start) => start >= earliest && (taken[String(start)] || 0) < settings.pickupPerSlot);
        if (free.length)
            out[day] = free;
    }
    return out;
}
/** The server's check before it takes an order with a pickup time: null when the time is still free. */
function pickupTimeProblem({ settings, zone, nowMs, start, taken = 0 }) {
    if (!Number.isFinite(start))
        return "closed";
    const day = dayOf(start, zone);
    if (!slotsOn(settings, day, zone).includes(start))
        return "closed";
    if (start < nowMs + settings.pickupReadyHours * 60 * MINUTE)
        return "too_soon";
    if (day > addDays(dayOf(nowMs, zone), exports.PICKUP_DAYS_AHEAD - 1))
        return "too_far";
    if (taken >= settings.pickupPerSlot)
        return "full";
    return null;
}
exports.PICKUP_MESSAGES = {
    closed: "The shop isn't open for pickup at that time. Please choose another.",
    too_soon: "That pickup time is too soon for the shop to have your order ready. Please choose a later one.",
    full: "That pickup time has just filled up. Please choose another.",
    too_far: "Pickup times can only be chosen up to two weeks ahead. Please choose an earlier one.",
};
// ── Check-in codes (17 November 2026) ──────────────────────────────────────────────────────────────────────────────
// Each confirmed booking gets a short code (in its emails and on the customer's booking page, also as a QR code). The
// shop types or scans it at the Fair till or Take a payment to mark the person as arrived. Letters and digits that can't
// be mistaken for each other (no 0/O, 1/I).
exports.CHECK_IN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
/** A check-in code as typed, scanned or read aloud ("k7qm 2xpa", "K7QM-2XPA"): "K7QM-2XPA", or "" when it isn't one. */
function cleanCheckInCode(raw) {
    const text = String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (text.length !== 8 || [...text].some((ch) => !exports.CHECK_IN_ALPHABET.includes(ch)))
        return "";
    return `${text.slice(0, 4)}-${text.slice(4)}`;
}
/** A new code from eight random numbers (0 to 255 each), so both sides can make one with their own randomness. */
function checkInCodeFrom(bytes) {
    let text = "";
    for (let i = 0; i < 8; i++)
        text += exports.CHECK_IN_ALPHABET[(bytes[i] ?? 0) % exports.CHECK_IN_ALPHABET.length];
    return `${text.slice(0, 4)}-${text.slice(4)}`;
}
