// Book a time page (/book, Bookings beta): choose a service, a day and a time, then your details; free services are booked
// at once, paid ones go to the shop's card page and come back here. The emailed link (/book?booking=<id>&key=<key>) opens
// the booking itself, with Add to calendar, Change time and Cancel. Every word is Text & labels › Book a time page; the
// look is the order slip's (trackingStyle.ts) plus bookTimeStyle.ts. The server decides every time and every price
// (functions/bookings.js); this page only shows what it answers.
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { ArrowLeft, CalendarPlus, ChevronLeft, ChevronRight, Clock, Loader2, MapPin } from "lucide-react";
import { functionFetch } from "../../lib/functionsBase";
import { useSEO } from "../../lib/seo";
import { StoreChrome } from "./StoreChrome";
import { StorefrontThemeStyle } from "./StorefrontThemeStyle";
import { useSiteData } from "./useSiteData";
import { getCopy } from "./storeCopy";
import { TRACKING_CSS } from "./trackingStyle";
import { BOOK_TIME_CSS } from "./bookTimeStyle";
import { addDays, bookingIcs, googleCalendarLink } from "../../../shared/bookingTimes";
import { shopTimeZone } from "../../../shared/shopTimeZone";
import {
  dayParts, firstOpenDay, groupTimes, lengthText, manageFromSearch, moneyText, monthLabel, pageDays, pageStep, paysUpFront, timeText, whenText,
  type BookingInfo, type BookingServiceView, type BookingView,
} from "./bookTimeRules";

type Copy = (key: string, vars?: Record<string, string | number>) => string;
type Answer = Record<string, any> & { error?: string; code?: string };

async function ask(action: string, body: Record<string, unknown> = {}): Promise<Answer> {
  const response = await functionFetch("validateDiscountCode", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...body }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(String(data.error || response.status)), { code: data.code, status: response.status });
  return data;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function BookTime() {
  return <StoreChrome surface="trackingPage"><BookTimeContent /></StoreChrome>;
}

function BookTimeContent() {
  const { settings } = useSiteData();
  const design = settings?.design;
  const c: Copy = (key, vars) => getCopy(design, key, vars);
  const location = useLocation();
  const manage = useMemo(() => manageFromSearch(location.search), [location.search]);
  useSEO({ title: c("bookTimeTitle"), description: c("bookTimeSubtitle"), noindex: !!manage });

  return (
    <div data-fm-store data-studio-target="copy:Book a time page|style:colors" data-studio-label="Book a time page" className="fm-track min-h-screen fm-page text-white font-sans relative pb-24">
      <StorefrontThemeStyle design={design} />
      <style>{TRACKING_CSS}</style>
      <style>{BOOK_TIME_CSS}</style>
      <div aria-hidden="true" className="fm-track-strip" />
      <nav className="relative z-10 border-b-2 fm-track-rule">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-5 flex items-center justify-between gap-4">
          <Link to="/" className="fm-track-link fm-track-mono"><ArrowLeft size={14} aria-hidden="true" /> {c("bookTimeBack")}</Link>
          <span className="fm-track-mono">{c("bookTimeEyebrow")}</span>
        </div>
      </nav>
      <main className="max-w-3xl mx-auto px-5 sm:px-8 pt-12 sm:pt-16 relative z-10">
        {manage ? <ManageBooking id={manage.id} manageKey={manage.key} c={c} /> : <NewBooking c={c} />}
      </main>
    </div>
  );
}

// ── Making a booking ───────────────────────────────────────────────────────────────────────────────────────────────

type Step = "service" | "time" | "details";

function NewBooking({ c }: { c: Copy }) {
  const navigate = useNavigate();
  const [info, setInfo] = useState<BookingInfo | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [service, setService] = useState<BookingServiceView | null>(null);
  const [step, setStep] = useState<Step>("service");
  const [start, setStart] = useState("");
  const [form, setForm] = useState({ name: "", email: "", phone: "", note: "" });
  const [problems, setProblems] = useState<{ name?: string; email?: string }>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);

  const load = () => {
    setLoadFailed(false);
    setInfo(null);
    ask("bookingInfo").then((answer) => {
      const next = answer as BookingInfo;
      setInfo(next);
      // One service: straight to its times.
      if (next.on && next.services?.length === 1) { setService(next.services[0]); setStep("time"); }
    }).catch(() => setLoadFailed(true));
  };
  useEffect(load, []);
  // Each step starts at the top of the page, with the heading read out.
  useEffect(() => { headingRef.current?.focus({ preventScroll: true }); window.scrollTo({ top: 0 }); }, [step]);

  if (loadFailed) {
    return (
      <Intro c={c}>
        <div className="fm-track-notice" data-tone="danger" role="alert">
          <p>{c("bookTimeLoadError")}</p>
          <button type="button" className="fm-track-btn fm-track-btn-ghost" onClick={load}>{c("bookTimeRetry")}</button>
        </div>
      </Intro>
    );
  }
  if (!info) return <Intro c={c}><Loading c={c} /></Intro>;
  if (!info.on || !info.services?.length) return <Intro c={c}><div className="fm-track-notice" role="status"><p>{c("bookTimeClosed")}</p></div></Intro>;

  const zone = info.zone || shopTimeZone();
  const currency = info.currency || "CAD";
  const today = info.today || "";
  const lastDay = addDays(today, Math.max(0, (info.maxDaysAhead || 60) - 1));
  const steps: Step[] = info.services.length > 1 ? ["service", "time", "details"] : ["time", "details"];
  const end = start && service ? new Date(Date.parse(start) + service.minutes * 60_000).toISOString() : "";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !service || !start) return;
    const found = {
      ...(form.name.trim() ? {} : { name: c("bookTimeNeedName") }),
      ...(EMAIL.test(form.email.trim()) ? {} : { email: c("bookTimeNeedEmail") }),
    };
    setProblems(found);
    if (found.name || found.email) { document.getElementById(found.name ? "bt-name" : "bt-email")?.focus(); return; }
    setBusy(true);
    setError("");
    try {
      const answer = await ask("bookingStart", { serviceId: service.id, start, ...form });
      if (answer.url) { window.location.href = answer.url; return; }
      navigate(`/book?booking=${encodeURIComponent(answer.id)}&key=${answer.key}`, { replace: true });
    } catch (err: any) {
      setBusy(false);
      if (err?.code === "taken") { setStart(""); setStep("time"); setError(c("bookTimeTaken")); return; }
      setError(c("bookTimeError"));
    }
  };

  return (
    <div>
      <ol className="fm-book-steps" aria-label={c("bookTimeTitle")}>
        {steps.map((s, i) => {
          const at = steps.indexOf(step);
          const state = i < at ? "done" : i === at ? "current" : "next";
          return (
            <li key={s} className="fm-book-step" data-state={state} aria-current={state === "current" ? "step" : undefined}>
              <b aria-hidden="true">{i + 1}</b>{c(s === "service" ? "bookTimeStepService" : s === "time" ? "bookTimeStepTime" : "bookTimeStepDetails")}
            </li>
          );
        })}
      </ol>
      <div className="mb-8">
        <p className="fm-track-mono mb-3">{c("bookTimeEyebrow")}</p>
        <h1 ref={headingRef} tabIndex={-1} className="fm-track-display text-5xl sm:text-6xl outline-none">
          {step === "service" || !service ? c("bookTimeTitle") : service.name}
        </h1>
        {step === "service" && <p className="mt-4 text-base leading-7 fm-muted">{c("bookTimeSubtitle")}</p>}
        {step !== "service" && service && <ServiceMeta service={service} currency={currency} c={c} />}
      </div>

      {error && <div className="fm-track-notice mb-6" data-tone="danger" role="alert"><p>{error}</p></div>}

      {step === "service" && (
        <div className="fm-book-list">
          {info.services.map((s) => (
            <button key={s.id} type="button" className="fm-book-service" onClick={() => { setService(s); setStart(""); setError(""); setStep("time"); }}>
              <h2>{s.name}</h2>
              <span className="fm-book-price" translate="no">{s.priceMinor > 0 ? moneyText(s.priceMinor, currency) : c("bookTimeFree")}</span>
              {s.description && <p>{s.description}</p>}
              <span className="fm-book-meta fm-track-mono">
                <span><Clock size={12} aria-hidden="true" /> {lengthText(s.minutes)}</span>
                {s.location && <span><MapPin size={12} aria-hidden="true" /> {s.location}</span>}
                {s.priceMinor > 0 && !paysUpFront(s) && <span>{c("bookTimePayAtShop")}</span>}
              </span>
            </button>
          ))}
        </div>
      )}

      {step === "time" && service && (
        <div className="fm-track-card p-5 sm:p-8">
          <TimePicker serviceId={service.id} zone={zone} today={today} lastDay={lastDay} picked={start} onPick={setStart} c={c} />
          <div className="fm-book-actions mt-2">
            <button type="button" className="fm-track-btn" disabled={!start} onClick={() => { setError(""); setStep("details"); }}>
              {start ? `${c("bookTimeContinue")} · ${timeText(start, zone)}` : c("bookTimeContinue")}
            </button>
            {steps[0] === "service" && (
              <button type="button" className="fm-track-link fm-track-mono bg-transparent border-0 p-0 cursor-pointer" onClick={() => setStep("service")}>
                <ArrowLeft size={14} aria-hidden="true" /> {c("bookTimeChange")}
              </button>
            )}
          </div>
        </div>
      )}

      {step === "details" && service && start && (
        <div className="grid gap-8 lg:grid-cols-[1fr_280px] items-start">
          <form onSubmit={submit} noValidate className="fm-track-card p-6 sm:p-8 space-y-5">
            <Field id="bt-name" label={c("bookTimeName")} problem={problems.name}>
              <input id="bt-name" className="fm-track-input" autoComplete="name" value={form.name} maxLength={100}
                aria-invalid={!!problems.name} aria-describedby={problems.name ? "bt-name-err" : undefined}
                onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field id="bt-email" label={c("bookTimeEmail")} problem={problems.email}>
              <input id="bt-email" type="email" className="fm-track-input" autoComplete="email" value={form.email} maxLength={320}
                aria-invalid={!!problems.email} aria-describedby={problems.email ? "bt-email-err" : undefined}
                onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field id="bt-phone" label={c("bookTimePhone")}>
              <input id="bt-phone" type="tel" className="fm-track-input" autoComplete="tel" value={form.phone} maxLength={40}
                onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <Field id="bt-note" label={c("bookTimeNote")}>
              <textarea id="bt-note" className="fm-track-input" value={form.note} maxLength={1000}
                onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </Field>
            {paysUpFront(service) && <p className="text-sm leading-6 fm-muted">{c("bookTimePayNote", { minutes: 10 })}</p>}
            <button type="submit" className="fm-track-btn w-full" disabled={busy}>
              {busy ? <><Loader2 size={16} className="animate-spin" aria-hidden="true" /> {c("bookTimeBooking")}</>
                : paysUpFront(service) ? c("bookTimePay", { amount: moneyText(service.priceMinor, currency) }) : c("bookTimeBook")}
            </button>
          </form>
          <aside className="fm-track-card p-6 fm-track-ledger">
            <Row label={c("bookTimeWhen")} value={whenText(start, end, zone)} />
            {service.location && <Row label={c("bookTimeWhere")} value={service.location} />}
            <div className="fm-track-total">
              <span className="fm-track-mono">{c("bookTimePaid")}</span>
              <strong translate="no">{service.priceMinor > 0 ? moneyText(service.priceMinor, currency) : c("bookTimeFree")}</strong>
            </div>
            <button type="button" className="fm-track-link fm-track-mono bg-transparent border-0 p-0 mt-5 cursor-pointer" onClick={() => setStep("time")}>
              <ArrowLeft size={14} aria-hidden="true" /> {c("bookTimeChange")}
            </button>
            {typeof info.cancelHours === "number" && <p className="mt-4 text-sm leading-6 fm-muted">{c("bookTimeCancelRule", { hours: info.cancelHours })}</p>}
          </aside>
        </div>
      )}
    </div>
  );
}

function Intro({ c, children }: { c: Copy; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-8">
        <p className="fm-track-mono mb-3">{c("bookTimeEyebrow")}</p>
        <h1 className="fm-track-display text-5xl sm:text-6xl">{c("bookTimeTitle")}</h1>
        <p className="mt-4 text-base leading-7 fm-muted">{c("bookTimeSubtitle")}</p>
      </div>
      {children}
    </div>
  );
}

function Loading({ c }: { c: Copy }) {
  return <p role="status" className="fm-book-empty fm-track-mono"><Loader2 size={16} className="animate-spin inline-block" aria-hidden="true" /> {c("bookTimeLoading")}</p>;
}

function ServiceMeta({ service, currency, c }: { service: BookingServiceView; currency: string; c: Copy }) {
  return (
    <p className="mt-4 fm-book-meta fm-track-mono">
      <span><Clock size={12} aria-hidden="true" /> {lengthText(service.minutes)}</span>
      <span translate="no">{service.priceMinor > 0 ? moneyText(service.priceMinor, currency) : c("bookTimeFree")}</span>
      {service.location && <span><MapPin size={12} aria-hidden="true" /> {service.location}</span>}
    </p>
  );
}

function Field({ id, label, problem, children }: { id: string; label: string; problem?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="fm-track-mono block">{label}</label>
      {children}
      {problem && <p id={`${id}-err`} className="fm-book-error">{problem}</p>}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="fm-track-row"><span className="fm-track-mono">{label}</span><span className="text-right">{value}</span></div>;
}

// ── The day and time picker (new bookings and Change time) ─────────────────────────────────────────────────────────

function TimePicker({ serviceId, zone, today, lastDay, picked, onPick, c }: {
  serviceId: string; zone: string; today: string; lastDay: string; picked: string; onPick: (iso: string) => void; c: Copy;
}) {
  const [from, setFrom] = useState(today);
  const [times, setTimes] = useState<Record<string, string[]> | null>(null);
  const [failed, setFailed] = useState(false);
  const [day, setDay] = useState("");
  const [attempt, setAttempt] = useState(0);
  const days = pageDays(from, lastDay);

  useEffect(() => {
    let cancelled = false;
    setTimes(null);
    setFailed(false);
    ask("bookingTimes", { serviceId, from, days: days.length || 1 }).then((answer) => {
      if (cancelled) return;
      const got = (answer.days || {}) as Record<string, string[]>;
      setTimes(got);
      setDay((current) => (current && days.includes(current) && (got[current] || []).length ? current : firstOpenDay(days, got)));
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [serviceId, from, attempt]);

  const back = pageStep(from, today, lastDay, -1);
  const next = pageStep(from, today, lastDay, 1);
  const dayTimes = times?.[day] || [];
  const pageEmpty = !!times && days.every((d) => !(times[d] || []).length);

  return (
    <div>
      <div className="fm-book-bar">
        <button type="button" className="fm-book-arrow" disabled={!back} aria-label={c("bookTimeEarlier")} onClick={() => back && setFrom(back)}><ChevronLeft size={18} aria-hidden="true" /></button>
        <p className="fm-track-mono" aria-live="polite">{monthLabel(days)}</p>
        <button type="button" className="fm-book-arrow" disabled={!next} aria-label={c("bookTimeLater")} onClick={() => next && setFrom(next)}><ChevronRight size={18} aria-hidden="true" /></button>
      </div>
      <div className="fm-book-days" role="group" aria-label={c("bookTimeStepTime")}>
        {days.map((d) => {
          const parts = dayParts(d);
          const empty = !!times && !(times[d] || []).length;
          return (
            <button key={d} type="button" className="fm-book-day" aria-pressed={d === day} data-empty={empty || undefined}
              aria-label={`${parts.weekday} ${parts.date} ${parts.month}`} onClick={() => setDay(d)}>
              <span aria-hidden="true">{parts.weekday}</span><strong aria-hidden="true">{parts.date}</strong><span aria-hidden="true">{parts.month}</span>
            </button>
          );
        })}
      </div>
      {failed ? (
        <div className="fm-track-notice mb-6" data-tone="danger" role="alert">
          <p>{c("bookTimeLoadError")}</p>
          <button type="button" className="fm-track-btn fm-track-btn-ghost" onClick={() => setAttempt((n) => n + 1)}>{c("bookTimeRetry")}</button>
        </div>
      ) : !times ? <Loading c={c} /> : pageEmpty ? (
        <div className="fm-book-empty">
          <p className="mb-4">{c("bookTimeNoTimesPage")}</p>
          {next && <button type="button" className="fm-track-btn fm-track-btn-ghost" onClick={() => setFrom(next)}>{c("bookTimeShowLater")}</button>}
        </div>
      ) : !dayTimes.length ? <p className="fm-book-empty fm-muted">{c("bookTimeNoTimesDay")}</p> : (
        groupTimes(dayTimes, zone).map((g) => (
          <div key={g.group}>
            <p className="fm-track-mono fm-book-group">{c(g.group === "morning" ? "bookTimeMorning" : g.group === "afternoon" ? "bookTimeAfternoon" : "bookTimeEvening")}</p>
            <div className="fm-book-times">
              {g.times.map((t) => (
                <button key={t} type="button" className="fm-book-time" aria-pressed={t === picked} onClick={() => onPick(t)} translate="no">{timeText(t, zone)}</button>
              ))}
            </div>
          </div>
        ))
      )}
      <p className="fm-track-mono mb-6">{c("bookTimeZone", { zone: zone.replace(/_/g, " ") })}</p>
    </div>
  );
}

// ── An existing booking (the emailed link) ─────────────────────────────────────────────────────────────────────────

function ManageBooking({ id, manageKey, c }: { id: string; manageKey: string; c: Copy }) {
  const [booking, setBooking] = useState<BookingView | null>(null);
  const [info, setInfo] = useState<BookingInfo | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "failed">("loading");
  const [mode, setMode] = useState<"view" | "move" | "cancel">("view");
  const [newStart, setNewStart] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const polls = useRef(0);

  const load = (quiet = false) => {
    if (!quiet) setState("loading");
    return ask("bookingView", { id, key: manageKey }).then((answer) => {
      setBooking(answer.booking || null);
      setState(answer.booking ? "ready" : "missing");
    }).catch((err: any) => setState(err?.status === 404 ? "missing" : "failed"));
  };
  useEffect(() => { void load(); ask("bookingInfo").then((a) => setInfo(a as BookingInfo)).catch(() => setInfo({ on: false })); }, [id, manageKey]);
  // Back from the card page: the payment usually lands within seconds, so look again a few times.
  useEffect(() => {
    if (booking?.status !== "held" || polls.current >= 8) return;
    const timer = window.setTimeout(() => { polls.current += 1; void load(true); }, 4000);
    return () => window.clearTimeout(timer);
  }, [booking]);

  if (state === "loading") return <Loading c={c} />;
  if (state === "failed") {
    return (
      <div className="fm-track-notice" data-tone="danger" role="alert">
        <p>{c("bookTimeLoadError")}</p>
        <button type="button" className="fm-track-btn fm-track-btn-ghost" onClick={() => void load()}>{c("bookTimeRetry")}</button>
      </div>
    );
  }
  if (state === "missing" || !booking) {
    return (
      <div className="space-y-6">
        <div className="fm-track-notice" data-tone="danger" role="alert"><p>{c("bookTimeMissing")}</p></div>
        <Link to="/book" className="fm-track-link fm-track-mono"><CalendarPlus size={14} aria-hidden="true" /> {c("bookTimeAnother")}</Link>
      </div>
    );
  }

  const zone = info?.zone || shopTimeZone();
  const startMs = Date.parse(booking.start);
  const endMs = Date.parse(booking.end);
  const canMove = booking.canChange && !!info?.on && !!info.today;
  const lastDay = info?.today ? addDays(info.today, Math.max(0, (info.maxDaysAhead || 60) - 1)) : "";
  const title = booking.status === "cancelled" ? c("bookTimeCancelledTitle") : booking.status === "held" ? c("bookTimeHeldTitle") : c("bookTimeConfirmedTitle");
  const stamp = booking.status === "cancelled" ? "ended" : booking.status === "held" ? "unpaid" : "paid";

  const act = async (action: "bookingMove" | "bookingCancel", body: Record<string, unknown> = {}) => {
    setBusy(true);
    setError("");
    try {
      const answer = await ask(action, { id, key: manageKey, ...body });
      setBooking(answer.booking);
      setMode("view");
      setNewStart("");
      setNotice(action === "bookingMove" ? c("bookTimeMoved") : "");
    } catch (err: any) {
      setError(err?.code === "taken" ? c("bookTimeTaken") : err?.code === "too_late" ? c("bookTimeTooLate") : c("bookTimeError"));
      if (err?.code === "taken") setNewStart("");
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    const ics = bookingIcs({ id: booking.id, title: booking.serviceName, start: startMs, end: endMs, location: booking.location });
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "booking.ics";
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="space-y-8">
      <div>
        <p className="fm-track-mono mb-3">{c("bookTimeEyebrow")}</p>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="fm-track-display text-5xl sm:text-6xl">{title}</h1>
          <span className="fm-track-stamp" data-state={stamp}>{booking.serviceName}</span>
        </div>
        <p className="mt-4 text-base leading-7 fm-muted" role="status">
          {booking.status === "confirmed" ? c("bookTimeConfirmedText", { email: booking.email })
            : booking.status === "held" ? c("bookTimeHeldText")
              : `${c("bookTimeCancelledText")}${booking.refunded ? ` ${c("bookTimeRefunded")}` : ""}`}
        </p>
      </div>

      {notice && <div className="fm-track-notice" role="status"><p>{notice}</p></div>}
      {error && <div className="fm-track-notice" data-tone="danger" role="alert"><p>{error}</p></div>}

      <div className="fm-track-card p-6 sm:p-8 fm-track-ledger">
        <Row label={c("bookTimeWhat")} value={`${booking.serviceName} · ${lengthText(booking.minutes)}`} />
        <Row label={c("bookTimeWhen")} value={whenText(booking.start, booking.end, zone)} />
        {booking.location && <Row label={c("bookTimeWhere")} value={booking.location} />}
        <div className="fm-track-total">
          <span className="fm-track-mono">{c("bookTimePaid")}</span>
          <strong translate="no">{booking.priceMinor > 0 ? (booking.paid ? c("bookTimePaidAmount", { amount: moneyText(booking.priceMinor, booking.currency) }) : moneyText(booking.priceMinor, booking.currency)) : c("bookTimeFree")}</strong>
        </div>
      </div>

      {booking.status === "held" && (
        <button type="button" className="fm-track-btn fm-track-btn-ghost" onClick={() => { polls.current = 0; void load(true); }}>{c("bookTimeCheckAgain")}</button>
      )}

      {booking.status === "confirmed" && mode === "view" && (
        <div className="space-y-5">
          <div className="fm-book-actions">
            <button type="button" className="fm-track-btn" onClick={download}><CalendarPlus size={16} aria-hidden="true" /> {c("bookTimeAddCalendar")}</button>
            <a className="fm-track-btn fm-track-btn-ghost" href={googleCalendarLink({ title: booking.serviceName, start: startMs, end: endMs, location: booking.location })} target="_blank" rel="noopener noreferrer">{c("bookTimeGoogle")}</a>
          </div>
          {booking.canChange ? (
            <div className="fm-book-actions">
              {canMove && <button type="button" className="fm-track-link fm-track-mono bg-transparent border-0 p-0 cursor-pointer" onClick={() => { setMode("move"); setError(""); setNotice(""); }}>{c("bookTimeMove")}</button>}
              <button type="button" className="fm-track-link fm-track-mono bg-transparent border-0 p-0 cursor-pointer" onClick={() => { setMode("cancel"); setError(""); setNotice(""); }}>{c("bookTimeCancel")}</button>
            </div>
          ) : <p className="text-sm leading-6 fm-muted">{c("bookTimeTooLate")}</p>}
          {booking.canChange && <p className="text-sm leading-6 fm-muted">{c("bookTimeCancelRule", { hours: booking.cancelHours })}</p>}
        </div>
      )}

      {booking.status === "confirmed" && mode === "move" && info?.today && (
        <div className="fm-track-card p-5 sm:p-8">
          <h2 className="fm-track-display text-3xl mb-6">{c("bookTimeMoveTitle")}</h2>
          <TimePicker serviceId={booking.serviceId} zone={zone} today={info.today} lastDay={lastDay} picked={newStart} onPick={setNewStart} c={c} />
          <div className="fm-book-actions">
            <button type="button" className="fm-track-btn" disabled={!newStart || busy} onClick={() => void act("bookingMove", { start: newStart })}>
              {busy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />} {newStart ? c("bookTimeMoveSave", { time: timeText(newStart, zone) }) : c("bookTimeMoveTitle")}
            </button>
            <button type="button" className="fm-track-btn fm-track-btn-ghost" onClick={() => { setMode("view"); setNewStart(""); }}>{c("bookTimeKeep")}</button>
          </div>
        </div>
      )}

      {booking.status === "confirmed" && mode === "cancel" && (
        <div className="fm-track-notice" data-tone="warning" role="alertdialog" aria-labelledby="bt-cancel-q">
          <div>
            <p id="bt-cancel-q"><strong>{c("bookTimeCancelSure")}</strong></p>
            {booking.paid && <p>{c("bookTimeCancelRefund")}</p>}
          </div>
          <div className="fm-book-actions">
            <button type="button" className="fm-track-btn" disabled={busy} onClick={() => void act("bookingCancel")}>
              {busy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />} {c("bookTimeCancelYes")}
            </button>
            <button type="button" className="fm-track-btn fm-track-btn-ghost" onClick={() => setMode("view")}>{c("bookTimeCancelNo")}</button>
          </div>
        </div>
      )}

      <Link to="/book" className="fm-track-link fm-track-mono"><CalendarPlus size={14} aria-hidden="true" /> {c("bookTimeAnother")}</Link>
    </div>
  );
}
