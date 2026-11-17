// Book a time page (/book, Bookings beta): choose a service, a day and a time, then your details; free services are booked
// at once, paid ones go to the shop's card page and come back here. The emailed link (/book?booking=<id>&key=<key>) opens
// the booking itself, with Add to calendar, Change time and Cancel. Every word is Text & labels › Book a time page; the
// look is the order slip's (trackingStyle.ts) plus bookTimeStyle.ts. The server decides every time and every price
// (functions/bookings.js); this page only shows what it answers.
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { ArrowLeft, CalendarPlus, ChevronLeft, ChevronRight, Clock, Loader2, MapPin, Users } from "lucide-react";
import { useSEO } from "../../lib/seo";
import { StoreChrome } from "./StoreChrome";
import { StorefrontThemeStyle } from "./StorefrontThemeStyle";
import { useSiteData } from "./useSiteData";
import { getCopy } from "./storeCopy";
import { TRACKING_CSS } from "./trackingStyle";
import { regionProps } from "./storefrontRegions";
import { askBooking } from "./bookTimeAsk";
import { GlobalSections, TemplateSections } from "../../components/sectionRender";
import { BOOK_TIME_CSS } from "./bookTimeStyle";
import { addDays, bookingIcs, googleCalendarLink } from "../../../shared/bookingTimes";
import { shopTimeZone } from "../../../shared/shopTimeZone";
import {
  withCode, packFromSearch, packSaving, longDayText, type BookingCode, type BookingGift, type BookingPackUse, type BookingPackView,
  dayParts, firstOpenDay, groupTimes, lengthText, manageFromSearch, wantedFromSearch, moneyText, monthLabel, pageDays, pageStep, paysUpFront, takesDeposit, timeText, upFrontMinor, whenText, tipMinorOf, tipOk, type TipPick,
  type BookingInfo, type BookingServiceView, type BookingView,
  peopleFor,
} from "./bookTimeRules";

type Copy = (key: string, vars?: Record<string, string | number>) => string;
const ask = askBooking;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function BookTime() {
  return <StoreChrome surface="bookingsPage"><BookTimeContent /></StoreChrome>;
}

function BookTimeContent() {
  const { settings, books } = useSiteData();
  const design = settings?.design;
  const c: Copy = (key, vars) => getCopy(design, key, vars);
  const location = useLocation();
  const manage = useMemo(() => manageFromSearch(location.search), [location.search]);
  // A pack's own page: the link in its email, and where the card page sends the customer back after buying one.
  const packCode = useMemo(() => packFromSearch(location.search), [location.search]);
  useSEO({ title: c("bookTimeTitle"), description: c("bookTimeSubtitle"), noindex: !!manage || !!packCode });

  return (
    <div data-fm-store data-studio-target="copy:Bookings page|style:colors" data-studio-label="Book a time page" className="fm-track min-h-screen fm-page text-white font-sans relative pb-24">
      <StorefrontThemeStyle design={design} />
      <style>{TRACKING_CSS}</style>
      <style>{BOOK_TIME_CSS}</style>
      <div {...regionProps("bookingsGlow")} aria-hidden="true" className="fm-track-strip" />
      <nav {...regionProps("bookingsHeader")} className="relative z-10 border-b-2 fm-track-rule">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-5 flex items-center justify-between gap-4">
          <Link to="/" className="fm-track-link fm-track-mono"><ArrowLeft size={14} aria-hidden="true" /> {c("bookTimeBack")}</Link>
          <span className="fm-track-mono">{c("bookTimeEyebrow")}</span>
        </div>
      </nav>
      <main className="max-w-3xl mx-auto px-5 sm:px-8 pt-12 sm:pt-16 relative z-10">
        {manage ? <ManageBooking id={manage.id} manageKey={manage.key} c={c} /> : packCode ? <PackPage code={packCode} c={c} /> : <NewBooking c={c} />}
      </main>
      <TemplateSections design={design} templateId="bookingsPage" books={books} />
      <GlobalSections design={design} books={books} />
    </div>
  );
}

// ── Making a booking ───────────────────────────────────────────────────────────────────────────────────────────────

type Step = "service" | "time" | "details";

function NewBooking({ c }: { c: Copy }) {
  const navigate = useNavigate();
  // The waiting list's email links here with the service and day already chosen.
  const { search } = useLocation();
  const wanted = useMemo(() => wantedFromSearch(search), [search]);
  const [info, setInfo] = useState<BookingInfo | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [service, setService] = useState<BookingServiceView | null>(null);
  const [step, setStep] = useState<Step>("service");
  const [start, setStart] = useState("");
  // Who takes it when the shop lists people: one of them, or "" for anyone free.
  const [staffId, setStaffId] = useState("");
  const [form, setForm] = useState({ name: "", email: "", phone: "", note: "" });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [problems, setProblems] = useState<{ name?: string; email?: string; answers?: Record<string, string> }>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // A discount code the server accepted for the chosen service (cleared when the service changes).
  const [applied, setApplied] = useState<BookingCode | null>(null);
  // A gift card the server accepted for what is paid now (cleared when the service or the code changes, which changes that).
  const [gift, setGift] = useState<BookingGift | null>(null);
  // A pack of visits the server accepted for the chosen service: it pays for the visit, so no code or gift card with it.
  const [pack, setPack] = useState<BookingPackUse | null>(null);
  // "Book a visit" on a pack's own page links here with the pack, so it is applied once the service is chosen.
  const usePack = useMemo(() => packFromSearch(search, "usepack"), [search]);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { setApplied(null); setStaffId(""); }, [service?.id]);
  useEffect(() => {
    setPack(null);
    if (!service || !usePack) return;
    let gone = false;
    ask("bookingPack", { serviceId: service.id, pack: usePack }).then((a) => { if (!gone) setPack({ ...(a as Omit<BookingPackUse, "code">), code: usePack }); }).catch(() => {});
    return () => { gone = true; };
  }, [service?.id, usePack]);
  useEffect(() => setGift(null), [service?.id, applied?.code]);

  const load = () => {
    setLoadFailed(false);
    setInfo(null);
    ask("bookingInfo").then((answer) => {
      const next = answer as BookingInfo;
      setInfo(next);
      // One service: straight to its times.
      const asked = next.on ? next.services?.find((sv) => sv.id === wanted.service) : undefined;
      if (asked) { setService(asked); setStep("time"); }
      else if (next.on && next.services?.length === 1) { setService(next.services[0]); setStep("time"); }
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
  if (!info.on || !info.services?.length) return <Intro c={c}><div {...regionProps("bookingsNotice")} className="fm-track-notice" role="status"><p>{c("bookTimeClosed")}</p></div></Intro>;

  const zone = info.zone || shopTimeZone();
  const currency = info.currency || "CAD";
  const today = info.today || "";
  const lastDay = addDays(today, Math.max(0, (info.maxDaysAhead || 60) - 1));
  const steps: Step[] = info.services.length > 1 ? ["service", "time", "details"] : ["time", "details"];
  const end = start && service ? new Date(Date.parse(start) + service.minutes * 60_000).toISOString() : "";
  // The people who do this service (none when the shop lists nobody), and the one picked.
  const people = service ? peopleFor(info, service.id) : [];
  const chosen = people.find((p) => p.id === staffId);
  const questions = service?.questions || [];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !service || !start) return;
    // The shop's own questions for this service: a required one needs an answer.
    const unanswered = Object.fromEntries(questions.filter((q) => q.required && !(answers[q.id] || "").trim()).map((q) => [q.id, c("bookTimeNeedAnswer")]));
    const found = {
      ...(form.name.trim() ? {} : { name: c("bookTimeNeedName") }),
      ...(EMAIL.test(form.email.trim()) ? {} : { email: c("bookTimeNeedEmail") }),
      ...(Object.keys(unanswered).length ? { answers: unanswered } : {}),
    };
    setProblems(found);
    const first = found.name ? "bt-name" : found.email ? "bt-email" : found.answers ? `bt-q-${Object.keys(unanswered)[0]}` : "";
    if (first) { document.getElementById(first)?.focus(); return; }
    setBusy(true);
    setError("");
    try {
      const held = service.id === wanted.service && wanted.offer ? { offer: wanted.offer, offerKey: wanted.offerKey } : {};
      const answer = await ask("bookingStart", { serviceId: service.id, start, ...(staffId ? { staffId } : {}), ...form, answers, ...held, ...(pack ? { pack: pack.code } : { ...(applied ? { code: applied.code } : {}), ...(gift ? { giftCard: gift.code } : {}) }) });
      if (answer.url) { window.location.href = answer.url; return; }
      navigate(`/book?booking=${encodeURIComponent(answer.id)}&key=${answer.key}`, { replace: true });
    } catch (err: any) {
      setBusy(false);
      // The person picked stopped doing this service meanwhile: back to anyone free and the times.
      if (err?.code === "staff") { setStaffId(""); setStart(""); setStep("time"); setError(c("bookTimeStaffProblem")); return; }
      if (err?.code === "taken") { setStart(""); setStep("time"); setError(c("bookTimeTaken")); return; }
      // The code stopped working meanwhile (used up, ended): take it off so the right price shows, and say so.
      if (err?.code === "code") { setApplied(null); setError(c("bookTimeCodeProblem")); return; }
      // The gift card's balance changed meanwhile: take it off so the right amount shows, and say so.
      if (err?.code === "gift") { setGift(null); setError(c("bookTimeGiftProblem")); return; }
      // The pack ran out or closed meanwhile: take it off so the price shows, and say so.
      if (err?.code === "pack") { setPack(null); setError(c("bookTimePackProblem")); return; }
      setError(c("bookTimeError"));
    }
  };

  return (
    <div>
      <ol {...regionProps("bookingsSteps")} className="fm-book-steps" aria-label={c("bookTimeTitle")}>
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
      <div {...regionProps("bookingsIntro")} className="mb-8">
        <p className="fm-track-mono mb-3">{c("bookTimeEyebrow")}</p>
        <h1 ref={headingRef} tabIndex={-1} className="fm-track-display text-5xl sm:text-6xl outline-none">
          {step === "service" || !service ? c("bookTimeTitle") : service.name}
        </h1>
        {step === "service" && <p className="mt-4 text-base leading-7 fm-muted">{c("bookTimeSubtitle")}</p>}
        {step !== "service" && service && <ServiceMeta service={withCode(service, step === "details" ? applied : null)} currency={currency} c={c} paidWith={step === "details" && pack ? c("bookTimePackPaid") : ""} />}
      </div>

      {error && <div className="fm-track-notice mb-6" data-tone="danger" role="alert"><p>{error}</p></div>}

      {step === "service" && (
        <div {...regionProps("bookingsServices")} className="fm-book-list">
          {info.services.map((s) => (
            <button key={s.id} {...regionProps("bookingsService")} type="button" className="fm-book-service" onClick={() => { setService(s); setStart(""); setAnswers({}); setProblems({}); setError(""); setStep("time"); }}>
              <h2>{s.name}</h2>
              <span className="fm-book-price" translate="no">{s.priceMinor > 0 ? moneyText(s.priceMinor, currency) : c("bookTimeFree")}</span>
              {s.description && <p>{s.description}</p>}
              <span className="fm-book-meta fm-track-mono">
                <span><Clock size={12} aria-hidden="true" /> {lengthText(s.minutes)}</span>
                {s.location && <span><MapPin size={12} aria-hidden="true" /> {s.location}</span>}
                {(s.places || 1) > 1 && <span><Users size={12} aria-hidden="true" /> {c("bookTimeClassSize", { count: s.places! })}</span>}
                {s.priceMinor > 0 && !paysUpFront(s) && <span>{c("bookTimePayAtShop")}</span>}
                {takesDeposit(s) && <span translate="no">{c("bookTimeDepositNote", { deposit: moneyText(upFrontMinor(s), currency), rest: moneyText(s.priceMinor - upFrontMinor(s), currency) })}</span>}
                {s.holdCard && <span translate="no">{c("bookTimeCardNote", { fee: moneyText(s.lateFeeMinor || 0, currency) })}</span>}
                {!!s.packVisits && <span translate="no">{c("bookTimePackOffer", { visits: s.packVisits, price: moneyText(s.packPriceMinor || 0, currency) })}</span>}
              </span>
            </button>
          ))}
        </div>
      )}

      {step === "time" && service && (
        <div {...regionProps("bookingsTimes")} className="fm-track-card p-5 sm:p-8">
          {people.length > 0 && (
            <div className="fm-book-people" role="group" aria-label={c("bookTimeWith")}>
              <p className="fm-track-mono w-full" aria-hidden="true">{c("bookTimeWith")}</p>
              {[{ id: "", name: c("bookTimeAnyone") }, ...people].map((p) => (
                <button key={p.id || "anyone"} type="button" className="fm-book-person" aria-pressed={staffId === p.id} onClick={() => { setStaffId(p.id); setStart(""); }}>{p.name}</button>
              ))}
            </div>
          )}
          <TimePicker serviceId={service.id} staffId={staffId} zone={zone} today={today} lastDay={lastDay} picked={start} onPick={setStart} c={c}
            offer={service.id === wanted.service && wanted.offer ? { offer: wanted.offer, offerKey: wanted.offerKey } : undefined}
            waitlist startDay={service.id === wanted.service && wanted.day >= today && wanted.day <= lastDay ? wanted.day : ""} />
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
      {step === "time" && service && !!service.packVisits && !usePack && <PackOffer service={service} currency={currency} c={c} />}

      {step === "details" && service && start && (() => {
        const priced = withCode(service, applied);
        // What the card page asks for now: what is paid when booked, less any gift card; nothing with a pack.
        const payNow = pack ? 0 : gift ? gift.payNowMinor : upFrontMinor(priced);
        return (
        <div className="grid gap-8 lg:grid-cols-[1fr_280px] items-start">
          <form {...regionProps("bookingsForm")} onSubmit={submit} noValidate className="fm-track-card p-6 sm:p-8 space-y-5">
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
            {questions.map((q) => {
              const id = `bt-q-${q.id}`;
              const problem = problems.answers?.[q.id];
              const props = {
                id, className: "fm-track-input", value: answers[q.id] || "", "aria-invalid": !!problem, "aria-required": q.required,
                "aria-describedby": problem ? `${id}-err` : undefined,
              };
              return (
                <Field key={q.id} id={id} label={q.required ? q.label : `${q.label} ${c("bookTimeOptional")}`} problem={problem}>
                  {q.long
                    ? <textarea {...props} maxLength={1000} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} />
                    : <input {...props} maxLength={200} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} />}
                </Field>
              );
            })}
            <Field id="bt-note" label={c("bookTimeNote")}>
              <textarea id="bt-note" className="fm-track-input" value={form.note} maxLength={1000}
                onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </Field>
            {(!!service.packVisits || pack) && !applied && !gift && (
              <ApplyBox region={regionProps("bookingsPackCode")} field="bt-pack" c={c} words={{ open: "bookTimePackOpen", label: "bookTimePackLabel", problem: "bookTimePackProblem" }}
                applied={pack ? c("bookTimePackApplied", { last4: pack.last4, left: pack.left }) : ""}
                onRemove={() => setPack(null)} maxLength={20}
                onTry={async (typed) => setPack({ ...(await ask("bookingPack", { serviceId: service.id, pack: typed, start }) as Omit<BookingPackUse, "code">), code: typed })} />
            )}
            {info.codes && service.priceMinor > 0 && !pack && (
              <ApplyBox region={regionProps("bookingsCode")} field="bt-code" c={c} words={{ open: "bookTimeCodeOpen", label: "bookTimeCodeLabel", problem: "bookTimeCodeProblem" }}
                applied={applied ? `${c("bookTimeCodeApplied", { code: applied.code })} · −${moneyText(applied.discountMinor, currency)}` : ""}
                onRemove={() => setApplied(null)} maxLength={40}
                onTry={async (typed) => setApplied(await ask("bookingCode", { serviceId: service.id, code: typed, email: form.email.trim() }) as BookingCode)} />
            )}
            {info.giftCards && paysUpFront(priced) && !pack && (
              <ApplyBox region={regionProps("bookingsGiftCard")} field="bt-gift" c={c} words={{ open: "bookTimeGiftOpen", label: "bookTimeGiftLabel", problem: "bookTimeGiftProblem" }}
                applied={gift ? `${c("bookTimeGiftApplied", { last4: gift.last4 })} · −${moneyText(gift.giftMinor, currency)}` : ""}
                onRemove={() => setGift(null)} maxLength={40}
                onTry={async (typed) => setGift({ ...(await ask("bookingGiftCard", { serviceId: service.id, giftCard: typed, email: form.email.trim(), ...(applied ? { code: applied.code } : {}) }) as Omit<BookingGift, "code">), code: typed })} />
            )}
            {payNow > 0 && <p className="text-sm leading-6 fm-muted">{c("bookTimePayNote", { minutes: 10 })}</p>}
            {service.holdCard && <p className="text-sm leading-6 fm-muted" translate="no">{c("bookTimeCardAgree", { fee: moneyText(service.lateFeeMinor || 0, currency), hours: info.cancelHours ?? 24 })}</p>}
            <button type="submit" className="fm-track-btn w-full" disabled={busy}>
              {busy ? <><Loader2 size={16} className="animate-spin" aria-hidden="true" /> {c("bookTimeBooking")}</>
                : pack ? (service.holdCard ? c("bookTimeSaveCard") : c("bookTimePackBook"))
                : paysUpFront(priced) && !payNow ? c("bookTimeGiftBook")
                : takesDeposit(priced) ? c("bookTimePayDeposit", { amount: moneyText(payNow, currency) })
                : paysUpFront(priced) ? c("bookTimePay", { amount: moneyText(payNow, currency) })
                : service.holdCard ? c("bookTimeSaveCard") : c("bookTimeBook")}
            </button>
          </form>
          <aside {...regionProps("bookingsSummary")} className="fm-track-card p-6 fm-track-ledger">
            <Row label={c("bookTimeWhen")} value={whenText(start, end, zone)} />
            {chosen && <Row label={c("bookTimeWith")} value={chosen.name} />}
            {service.location && <Row label={c("bookTimeWhere")} value={service.location} />}
            {applied && <Row label={c("bookTimeDiscount")} value={`${applied.code} −${moneyText(applied.discountMinor, currency)}`} />}
            {gift && <Row label={c("bookTimeGiftCard")} value={`••••${gift.last4} −${moneyText(gift.giftMinor, currency)}`} />}
            {pack && <Row label={c("bookTimePackLabelRow")} value={c("bookTimePackApplied", { last4: pack.last4, left: pack.left })} />}
            <div className="fm-track-total">
              <span className="fm-track-mono">{c("bookTimePaid")}</span>
              <strong translate="no">{pack ? c("bookTimePackPaid") : priced.priceMinor > 0 ? moneyText(priced.priceMinor, currency) : c("bookTimeFree")}</strong>
            </div>
            {!pack && takesDeposit(priced) && <p className="mt-2 text-sm leading-6 fm-muted" translate="no">{c("bookTimeDepositNote", { deposit: moneyText(upFrontMinor(priced), currency), rest: moneyText(priced.priceMinor - upFrontMinor(priced), currency) })}</p>}
            {!pack && priced.priceMinor > 0 && !paysUpFront(priced) && <p className="mt-2 text-sm leading-6 fm-muted">{c("bookTimePayAtShop")}</p>}
            <button type="button" className="fm-track-link fm-track-mono bg-transparent border-0 p-0 mt-5 cursor-pointer" onClick={() => setStep("time")}>
              <ArrowLeft size={14} aria-hidden="true" /> {c("bookTimeChange")}
            </button>
            {typeof info.cancelHours === "number" && <p className="mt-4 text-sm leading-6 fm-muted">{c("bookTimeCancelRule", { hours: info.cancelHours })}</p>}
          </aside>
        </div>
      ); })()}
    </div>
  );
}

/**
 * "Have a discount code?" / "Have a gift card?": folded until asked for; the server checks what is typed (`onTry`, which
 * throws when it can't be used) and checks it again on booking. Once applied it shows `applied` with a Remove button.
 */
function ApplyBox({ region, field, words, applied, onTry, onRemove, maxLength, c }: {
  region: ReturnType<typeof regionProps>; field: string; words: { open: string; label: string; problem: string }; applied: string;
  onTry: (typed: string) => Promise<void>; onRemove: () => void; maxLength: number; c: Copy;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [problem, setProblem] = useState("");
  const [checking, setChecking] = useState(false);
  if (applied) {
    return (
      <div {...region} className="fm-book-code" role="status">
        <span translate="no">{applied}</span>
        <button type="button" className="fm-track-link bg-transparent border-0 p-0 cursor-pointer" onClick={() => { onRemove(); setTyped(""); }}>{c("bookTimeCodeRemove")}</button>
      </div>
    );
  }
  if (!open) {
    return <button type="button" className="fm-track-link bg-transparent border-0 p-0 cursor-pointer text-sm" onClick={() => setOpen(true)}>{c(words.open)}</button>;
  }
  const apply = async () => {
    if (!typed.trim() || checking) return;
    setChecking(true);
    setProblem("");
    try {
      await onTry(typed.trim());
    } catch {
      setProblem(c(words.problem));
    } finally {
      setChecking(false);
    }
  };
  return (
    <div {...region}>
      <Field id={field} label={c(words.label)} problem={problem}>
        <div className="fm-book-code-row">
          <input id={field} className="fm-track-input" autoComplete="off" autoCapitalize="characters" spellCheck={false} value={typed} maxLength={maxLength}
            aria-invalid={!!problem} aria-describedby={problem ? `${field}-err` : undefined}
            onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); apply(); } }} />
          <button type="button" className="fm-track-btn fm-track-btn-ghost" onClick={apply} disabled={checking || !typed.trim()}>
            {checking ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : c("bookTimeCodeApply")}
          </button>
        </div>
      </Field>
    </div>
  );
}

// ── Packs of visits ────────────────────────────────────────────────────────────────────────────────────────────────

/** "Coming back?": a service's pack of visits under its times, with a name and email form that opens the card page. */
function PackOffer({ service, currency, c }: { service: BookingServiceView; currency: string; c: Copy }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [problems, setProblems] = useState<{ name?: string; email?: string }>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const price = moneyText(service.packPriceMinor || 0, currency);
  const saving = packSaving(service);
  const buy = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const found = { ...(name.trim() ? {} : { name: c("bookTimeNeedName") }), ...(EMAIL.test(email.trim()) ? {} : { email: c("bookTimeNeedEmail") }) };
    setProblems(found);
    if (found.name || found.email) { document.getElementById(found.name ? "bt-pack-name" : "bt-pack-email")?.focus(); return; }
    setBusy(true);
    setError("");
    try {
      const answer = await ask("bookingPackBuy", { serviceId: service.id, name, email });
      if (answer?.url) { window.location.href = answer.url; return; }
      // Studio's preview has no card page: it opens the sample pack's own page straight away.
      if (answer?.code) { navigate(`/book?pack=${encodeURIComponent(answer.code)}`); return; }
      setBusy(false);
      setError(c("bookTimePackError"));
    } catch {
      setBusy(false);
      setError(c("bookTimePackError"));
    }
  };
  return (
    <section {...regionProps("bookingsPack")} className="fm-track-card fm-book-pack p-5 sm:p-8 mt-6" aria-labelledby="bt-pack-title">
      <p className="fm-track-mono mb-2" translate="no">{c("bookTimePackOffer", { visits: service.packVisits || 0, price })}</p>
      <h2 id="bt-pack-title" className="fm-track-display text-3xl">{c("bookTimePackTitle")}</h2>
      <p className="mt-3 text-base leading-7" translate="no">
        {c("bookTimePackText", { visits: service.packVisits || 0, price })}
        {saving > 0 && <> {c("bookTimePackSave", { amount: moneyText(saving, currency), visits: service.packVisits || 0 })}</>}
        {!!service.packDays && <> {c("bookTimePackDays", { days: service.packDays })}</>}
      </p>
      {!open ? (
        <button type="button" className="fm-track-btn fm-track-btn-ghost mt-5" onClick={() => setOpen(true)} translate="no">{c("bookTimePackBuy", { price })}</button>
      ) : (
        <form className="mt-5 space-y-4" onSubmit={buy} noValidate>
          <div className="fm-book-wait-fields">
            <Field id="bt-pack-name" label={c("bookTimeName")} problem={problems.name}>
              <input id="bt-pack-name" className="fm-track-input" autoComplete="name" value={name} maxLength={100}
                aria-invalid={!!problems.name} aria-describedby={problems.name ? "bt-pack-name-err" : undefined} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field id="bt-pack-email" label={c("bookTimeEmail")} problem={problems.email}>
              <input id="bt-pack-email" type="email" className="fm-track-input" autoComplete="email" value={email} maxLength={320}
                aria-invalid={!!problems.email} aria-describedby={problems.email ? "bt-pack-email-err" : undefined} onChange={(e) => setEmail(e.target.value)} />
            </Field>
          </div>
          {error && <p className="fm-book-error" role="alert">{error}</p>}
          <button type="submit" className="fm-track-btn w-full" disabled={busy} translate="no">
            {busy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />} {c("bookTimePackBuy", { price })}
          </button>
          <p className="text-sm leading-6 fm-muted">{c("bookTimePackBuyNote")}</p>
        </form>
      )}
    </section>
  );
}

/** A pack's own page (`/book?pack=<code>`): visits left, the last day to book, the visits coming up and Book a visit. */
function PackPage({ code, c }: { code: string; c: Copy }) {
  const [pack, setPack] = useState<BookingPackView | null>(null);
  const [zone, setZone] = useState(shopTimeZone());
  const [state, setState] = useState<"loading" | "ready" | "missing" | "failed">("loading");
  const polls = useRef(0);
  const load = (quiet = false) => {
    if (!quiet) setState("loading");
    return ask("bookingPackView", { pack: code }).then((answer) => {
      setPack(answer.pack || null);
      setState(answer.pack ? "ready" : "missing");
    }).catch((err: any) => setState(err?.status === 404 || err?.code === "pack" ? "missing" : "failed"));
  };
  useEffect(() => { void load(); ask("bookingInfo").then((a) => { if (a?.zone) setZone(a.zone); }).catch(() => {}); }, [code]);
  // Back from the card page: the payment usually lands within seconds, so look again a few times.
  useEffect(() => {
    if (pack?.status !== "held" || polls.current >= 8) return;
    const timer = window.setTimeout(() => { polls.current += 1; void load(true); }, 4000);
    return () => window.clearTimeout(timer);
  }, [pack]);

  if (state === "loading") return <Loading c={c} />;
  if (state === "failed") {
    return (
      <div className="fm-track-notice" data-tone="danger" role="alert">
        <p>{c("bookTimeLoadError")}</p>
        <button type="button" className="fm-track-btn fm-track-btn-ghost" onClick={() => void load()}>{c("bookTimeRetry")}</button>
      </div>
    );
  }
  if (state === "missing" || !pack) {
    return (
      <div className="space-y-6">
        <div className="fm-track-notice" data-tone="danger" role="alert"><p>{c("bookTimePackMissing")}</p></div>
        <Link to="/book" className="fm-track-link fm-track-mono"><CalendarPlus size={14} aria-hidden="true" /> {c("bookTimeAnother")}</Link>
      </div>
    );
  }
  const usable = pack.status === "active" && pack.left > 0;
  return (
    <div className="space-y-8">
      <div {...regionProps("bookingsIntro")}>
        <p className="fm-track-mono mb-3">{c("bookTimeEyebrow")}</p>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="fm-track-display text-5xl sm:text-6xl">{c("bookTimePackPageTitle")}</h1>
          <span className="fm-track-stamp" data-state={pack.status === "active" ? "paid" : pack.status === "held" ? "unpaid" : "ended"}>{pack.serviceName}</span>
        </div>
        <p className="mt-4 text-base leading-7 fm-muted" role="status">
          {pack.status === "held" ? c("bookTimePackPending") : pack.status === "closed" ? c("bookTimePackClosed") : pack.left ? c("bookTimePackPageText") : c("bookTimePackUsedUp")}
        </p>
      </div>
      <div {...regionProps("bookingsPass")} className="fm-track-card p-6 sm:p-8 fm-track-ledger">
        <Row label={c("bookTimeWhat")} value={pack.serviceName} />
        <Row label={c("bookTimePackCode")} value={`••••${pack.last4}`} />
        <Row label={c("bookTimePackUntil")} value={pack.expiresOn ? longDayText(pack.expiresOn) : c("bookTimePackNoEnd")} />
        {pack.coming.length > 0 && <Row label={c("bookTimePackComing")} value={pack.coming.map((iso) => whenText(iso, iso, zone).split(", ").slice(0, 2).join(", ")).join(" · ")} />}
        <div className="fm-track-total">
          <span className="fm-track-mono">{c("bookTimePackLeft")}</span>
          <strong translate="no">{c("bookTimePackLeftValue", { left: pack.left, visits: pack.visits })}</strong>
        </div>
        <div className="fm-book-pack-meter" aria-hidden="true">
          {Array.from({ length: pack.visits }, (_, i) => <span key={i} data-used={i >= pack.left || undefined} />)}
        </div>
      </div>
      {pack.status === "held" && (
        <button type="button" className="fm-track-btn fm-track-btn-ghost" onClick={() => { polls.current = 0; void load(true); }}>{c("bookTimeCheckAgain")}</button>
      )}
      {usable && (
        <Link to={`/book?service=${encodeURIComponent(pack.serviceId)}&usepack=${encodeURIComponent(code)}`} className="fm-track-btn">
          <CalendarPlus size={16} aria-hidden="true" /> {c("bookTimePackBookVisit")}
        </Link>
      )}
    </div>
  );
}

function Intro({ c, children }: { c: Copy; children: React.ReactNode }) {
  return (
    <div>
      <div {...regionProps("bookingsIntro")} className="mb-8">
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

/** The chosen service's line under its heading: length, price (after a discount code, or "Paid with your pack"), place. */
function ServiceMeta({ service, currency, c, paidWith = "" }: { service: BookingServiceView; currency: string; c: Copy; paidWith?: string }) {
  return (
    <p className="mt-4 fm-book-meta fm-track-mono">
      <span><Clock size={12} aria-hidden="true" /> {lengthText(service.minutes)}</span>
      <span translate="no">{paidWith || (service.priceMinor > 0 ? moneyText(service.priceMinor, currency) : c("bookTimeFree"))}</span>
      {service.location && <span><MapPin size={12} aria-hidden="true" /> {service.location}</span>}
      {(service.places || 1) > 1 && <span><Users size={12} aria-hidden="true" /> {c("bookTimeClassSize", { count: service.places! })}</span>}
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

function TimePicker({ serviceId, staffId = "", zone, today, lastDay, picked, onPick, c, waitlist = false, startDay = "", offer }: {
  serviceId: string; /** Only this person's free times ("" = anyone free). */ staffId?: string; zone: string; today: string; lastDay: string; picked: string; onPick: (iso: string) => void; c: Copy;
  /** A place held for this person from the waiting list: the server shows it as free to them only. */
  offer?: { offer: string; offerKey: string };
  /** New bookings only: full class times and booked-up days offer the waiting list. */
  waitlist?: boolean; startDay?: string;
}) {
  const [from, setFrom] = useState(startDay || today);
  // The waiting list: a class's full times by day, the booked-up days, and what the form on screen is for.
  const [full, setFull] = useState<Record<string, string[]>>({});
  const [fullDays, setFullDays] = useState<string[]>([]);
  const [waitFor, setWaitFor] = useState<{ day: string; start?: string } | null>(null);
  const [waitNote, setWaitNote] = useState("");
  const [times, setTimes] = useState<Record<string, string[]> | null>(null);
  // A group class: how many places each time still has.
  const [left, setLeft] = useState<Record<string, number>>({});
  const [failed, setFailed] = useState(false);
  const [day, setDay] = useState(startDay);
  const [attempt, setAttempt] = useState(0);
  // The held place's start and how long it is held, once the server confirms it is still theirs.
  const [held, setHeld] = useState<{ start: string; until: string } | null>(null);
  const days = pageDays(from, lastDay);

  useEffect(() => {
    let cancelled = false;
    setTimes(null);
    setFailed(false);
    ask("bookingTimes", { serviceId, from, days: days.length || 1, ...(staffId ? { staffId } : {}), ...(offer || {}) }).then((answer) => {
      if (cancelled) return;
      const got = (answer.days || {}) as Record<string, string[]>;
      const hold = (answer.held || null) as { start: string; until: string } | null;
      setHeld((current) => current || hold);
      // Their held place starts out chosen.
      if (hold && !picked) onPick(hold.start);
      setTimes(got);
      setLeft((answer.left || {}) as Record<string, number>);
      const gone = (waitlist ? answer.full || {} : {}) as Record<string, string[]>;
      const booked = (waitlist ? answer.fullDays || [] : []) as string[];
      setFull(gone);
      setFullDays(booked);
      setDay((current) => (current && days.includes(current) && ((got[current] || []).length || (gone[current] || []).length || booked.includes(current)) ? current : firstOpenDay(days, got)));
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [serviceId, staffId, from, attempt]);

  const back = pageStep(from, today, lastDay, -1);
  const next = pageStep(from, today, lastDay, 1);
  const dayTimes = times?.[day] || [];
  const dayFull = full[day] || [];
  const shown = dayFull.length ? [...dayTimes, ...dayFull].sort() : dayTimes;
  const pageEmpty = !!times && days.every((d) => !(times[d] || []).length && !(full[d] || []).length && !fullDays.includes(d));
  const waitForm = waitFor && (
    <WaitForm key={waitFor.start || waitFor.day} serviceId={serviceId} wait={waitFor} zone={zone} c={c} onClose={() => setWaitFor(null)}
      onOpen={() => { setWaitFor(null); setWaitNote(c("bookTimeWaitOpen")); setAttempt((n) => n + 1); }} />
  );

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
          const empty = !!times && !(times[d] || []).length && !(full[d] || []).length && !fullDays.includes(d);
          return (
            <button key={d} type="button" className="fm-book-day" aria-pressed={d === day} data-empty={empty || undefined}
              aria-label={`${parts.weekday} ${parts.date} ${parts.month}`} onClick={() => { setDay(d); setWaitFor(null); setWaitNote(""); }}>
              <span aria-hidden="true">{parts.weekday}</span><strong aria-hidden="true">{parts.date}</strong><span aria-hidden="true">{parts.month}</span>
            </button>
          );
        })}
      </div>
      {held && (
        <div {...regionProps("bookingsNotice")} className="fm-track-notice mb-6" role="status">
          <p>{c("bookTimeHeldNote", { time: timeText(held.start, zone), until: timeText(held.until, zone) })}</p>
        </div>
      )}
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
      ) : !shown.length && fullDays.includes(day) ? (
        waitForm || (
          <div className="fm-book-empty">
            <p className="mb-4">{c("bookTimeDayFull")}</p>
            <button type="button" className="fm-track-btn fm-track-btn-ghost" onClick={() => setWaitFor({ day })}>{c("bookTimeWaitDay")}</button>
          </div>
        )
      ) : !shown.length ? <p className="fm-book-empty fm-muted">{c("bookTimeNoTimesDay")}</p> : (
        groupTimes(shown, zone).map((g) => (
          <div key={g.group}>
            <p className="fm-track-mono fm-book-group">{c(g.group === "morning" ? "bookTimeMorning" : g.group === "afternoon" ? "bookTimeAfternoon" : "bookTimeEvening")}</p>
            <div className="fm-book-times">
              {g.times.map((t) => dayFull.includes(t) ? (
                <button key={t} type="button" className="fm-book-time" data-full aria-pressed={waitFor?.start === t}
                  aria-label={`${timeText(t, zone)}, ${c("bookTimeFull")}. ${c("bookTimeWaitTitle")}`} onClick={() => { setWaitNote(""); setWaitFor({ day, start: t }); }}>
                  <span translate="no">{timeText(t, zone)}</span>
                  <small>{c("bookTimeFull")}</small>
                </button>
              ) : (
                <button key={t} type="button" className="fm-book-time" aria-pressed={t === picked} onClick={() => onPick(t)}>
                  <span translate="no">{timeText(t, zone)}</span>
                  {left[t] > 0 && <small data-last={left[t] === 1 || undefined}>{left[t] === 1 ? c("bookTimeLastPlace") : c("bookTimePlacesLeft", { count: left[t] })}</small>}
                </button>
              ))}
            </div>
          </div>
        ))
      )}
      {shown.length > 0 && waitForm}
      {waitNote && <div className="fm-track-notice mb-6" role="status"><p>{waitNote}</p></div>}
      <p className="fm-track-mono mb-6">{c("bookTimeZone", { zone: zoneName(zone) })}</p>
    </div>
  );
}

/** The waiting list form: a name and an email, for one full class time or one booked-up day. Nothing is held. */
function WaitForm({ serviceId, wait, zone, c, onClose, onOpen }: {
  serviceId: string; wait: { day: string; start?: string }; zone: string; c: Copy; onClose: () => void; onOpen: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [problems, setProblems] = useState<{ name?: string; email?: string }>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const longDay = new Date(`${wait.day}T12:00:00Z`).toLocaleDateString(undefined, { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
  const when = wait.start ? `${longDay}, ${timeText(wait.start, zone)}` : longDay;

  if (done) return <div className="fm-track-notice mb-6" role="status"><p>{c("bookTimeWaitDone")}</p></div>;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const found = { ...(name.trim() ? {} : { name: c("bookTimeNeedName") }), ...(EMAIL.test(email.trim()) ? {} : { email: c("bookTimeWaitNeedEmail") }) };
    setProblems(found);
    if (found.name || found.email) { document.getElementById(found.name ? "bt-wait-name" : "bt-wait-email")?.focus(); return; }
    setBusy(true);
    setError("");
    try {
      await ask("bookingWait", { serviceId, name, email, ...(wait.start ? { start: wait.start } : { day: wait.day }) });
      setDone(true);
    } catch (err: any) {
      setBusy(false);
      if (err?.code === "open") { onOpen(); return; }
      setError(c(err?.code === "wait_full" ? "bookTimeWaitFull" : "bookTimeWaitError"));
    }
  };

  return (
    <form className="fm-book-wait" onSubmit={submit} noValidate aria-labelledby="bt-wait-title">
      <h2 id="bt-wait-title">{c("bookTimeWaitTitle")}</h2>
      <p className="fm-muted">{c("bookTimeWaitNote", { when })}</p>
      <div className="fm-book-wait-fields">
        <Field id="bt-wait-name" label={c("bookTimeName")} problem={problems.name}>
          <input id="bt-wait-name" className="fm-track-input" autoComplete="name" value={name} maxLength={100}
            aria-invalid={!!problems.name} aria-describedby={problems.name ? "bt-wait-name-err" : undefined} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field id="bt-wait-email" label={c("bookTimeEmail")} problem={problems.email}>
          <input id="bt-wait-email" type="email" className="fm-track-input" autoComplete="email" value={email} maxLength={320}
            aria-invalid={!!problems.email} aria-describedby={problems.email ? "bt-wait-email-err" : undefined} onChange={(e) => setEmail(e.target.value)} />
        </Field>
      </div>
      {error && <p className="fm-book-error" role="alert">{error}</p>}
      <div className="fm-book-actions">
        <button type="submit" className="fm-track-btn" disabled={busy}>{c("bookTimeWaitSend")}</button>
        <button type="button" className="fm-track-link" onClick={onClose}>{c("bookTimeWaitCancel")}</button>
      </div>
    </form>
  );
}

// ── Tips ───────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The tip choices: each share of the price with its amount, no tip (when paying what's left too), or a typed amount. */
function TipPicker({ pick, onPick, percents, priceMinor, currency, limitMinor, optional, tipMinor, c }: {
  pick: TipPick; onPick: (p: TipPick) => void; percents: number[]; priceMinor: number; currency: string; limitMinor: number; optional: boolean; tipMinor: number; c: Copy;
}) {
  const other = pick.kind === "other";
  const bad = other && pick.text.trim() !== "" && !tipOk(tipMinor, limitMinor, true);
  return (
    <fieldset {...regionProps("bookingsTip")} className="space-y-3">
      <legend className="fm-track-mono mb-3">{c("bookTimeTipTitle")}</legend>
      <div className="fm-book-times fm-book-tips" translate="no">
        {percents.map((percent) => (
          <button key={percent} type="button" className="fm-book-time" aria-pressed={pick.kind === "percent" && pick.percent === percent} onClick={() => onPick({ kind: "percent", percent })}>
            {percent}%<small>{moneyText(Math.round((priceMinor * percent) / 100), currency)}</small>
          </button>
        ))}
        {optional && <button type="button" className="fm-book-time" aria-pressed={pick.kind === "none"} onClick={() => onPick({ kind: "none" })}>{c("bookTimeTipNone")}</button>}
        <button type="button" className="fm-book-time" aria-pressed={other} onClick={() => onPick({ kind: "other", text: other ? pick.text : "" })}>{c("bookTimeTipOther")}</button>
      </div>
      {other && (
        <label className="block">
          <span className="fm-track-mono mb-2 block">{c("bookTimeTipAmount")}</span>
          <input className="fm-track-input" inputMode="decimal" autoFocus value={pick.text} aria-invalid={bad || undefined} aria-describedby={bad ? "bt-tip-limit" : undefined}
            onChange={(e) => onPick({ kind: "other", text: e.target.value.replace(/[^\d.]/g, "") })} />
          {bad && <span id="bt-tip-limit" className="mt-2 block text-sm" role="alert">{c("bookTimeTipLimit", { min: moneyText(50, currency), max: moneyText(limitMinor, currency) })}</span>}
        </label>
      )}
    </fieldset>
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
  const [tipPick, setTipPick] = useState<TipPick>({ kind: "none" });
  const polls = useRef(0);

  const load = (quiet = false) => {
    if (!quiet) setState("loading");
    return ask("bookingView", { id, key: manageKey }).then((answer) => {
      setBooking(answer.booking || null);
      setState(answer.booking ? "ready" : "missing");
    }).catch((err: any) => setState(err?.status === 404 ? "missing" : "failed"));
  };
  // A tip on its own starts on the middle choice; with what's left to pay it starts on no tip.
  useEffect(() => {
    const percents = booking?.tipPercents || [];
    if (booking?.canTip && percents.length) setTipPick({ kind: "percent", percent: percents[Math.floor((percents.length - 1) / 2)] });
  }, [booking?.canTip, (booking?.tipPercents || []).join(",")]);
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

  const fullyPaid = booking.paid || (!!booking.restPaidMinor && !booking.dueMinor);
  const tipPercents = booking.tipPercents || [];
  const asksTip = (booking.canPayRest || booking.canTip) && tipPercents.length > 0 && !booking.tipMinor;
  const tipMinor = asksTip ? tipMinorOf(tipPick, booking.priceMinor) : 0;
  const tipLimit = booking.tipLimitMinor || 10_000;
  const tipFine = tipOk(tipMinor, tipLimit, !booking.canPayRest);
  // Pay what is left (with a tip, if one is picked) or a tip on its own: the shop's own card page, which comes back here.
  const payRest = async (action: "bookingPayRest" | "bookingTip" = "bookingPayRest") => {
    setBusy(true);
    setError("");
    try {
      const answer = await ask(action, { id, key: manageKey, ...(tipMinor ? { tipMinor } : {}) });
      if (answer?.url) window.location.assign(answer.url);
      else { if (answer?.booking) setBooking(answer.booking); setBusy(false); }
    } catch (err: any) {
      setBusy(false);
      if (err?.code === "nothing_due") void load(true);
      else setError(c("bookTimeError"));
    }
  };

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
      <div {...regionProps("bookingsIntro")}>
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

      <div {...regionProps("bookingsConfirmation")} className="fm-track-card p-6 sm:p-8 fm-track-ledger">
        <Row label={c("bookTimeWhat")} value={`${booking.serviceName} · ${lengthText(booking.minutes)}`} />
        <Row label={c("bookTimeWhen")} value={whenText(booking.start, booking.end, zone)} />
        {booking.staffName && <Row label={c("bookTimeWith")} value={booking.staffName} />}
        {booking.location && <Row label={c("bookTimeWhere")} value={booking.location} />}
        {booking.meetUrl && booking.status === "confirmed" && (
          <div className="fm-track-row"><span className="fm-track-mono">{c("bookTimeVideo")}</span><a className="text-right underline underline-offset-2" href={booking.meetUrl} target="_blank" rel="noopener noreferrer">{c("bookTimeJoin")}</a></div>
        )}
        {!!booking.discountMinor && <Row label={c("bookTimeDiscount")} value={`${booking.discountCode || ""} −${moneyText(booking.discountMinor, booking.currency)}`.trim()} />}
        {!!booking.giftMinor && <Row label={c("bookTimeGiftCard")} value={`••••${booking.giftCardLast4 || ""} −${moneyText(booking.giftMinor, booking.currency)}`} />}
        {!!booking.packLast4 && <Row label={c("bookTimePackLabelRow")} value={c("bookTimePackVisit", { last4: booking.packLast4, visit: booking.packVisit || 1, visits: booking.packVisits || 1 })} />}
        <div className="fm-track-total">
          <span className="fm-track-mono">{c("bookTimePaid")}</span>
          <strong translate="no">{booking.payment === "pack" ? c("bookTimePackPaid") : booking.priceMinor > 0 ? (fullyPaid ? c("bookTimePaidAmount", { amount: moneyText(booking.priceMinor, booking.currency) }) : moneyText(booking.priceMinor, booking.currency)) : c("bookTimeFree")}</strong>
        </div>
        {booking.status !== "cancelled" && !fullyPaid && booking.depositPaid && (
          <p className="mt-2 text-sm leading-6 fm-muted" translate="no">{c("bookTimeDepositPaid", { deposit: moneyText(booking.depositMinor || 0, booking.currency), rest: moneyText(booking.dueMinor || 0, booking.currency) })}</p>
        )}
        {booking.status !== "cancelled" && !booking.paid && !!booking.restPaidMinor && !booking.dueMinor && <p className="mt-2 text-sm leading-6 fm-muted">{c("bookTimeRestPaid")}</p>}
        {!!booking.tipMinor && <p className="mt-2 text-sm leading-6 fm-muted" translate="no">{c("bookTimeTipPaid", { amount: moneyText(booking.tipMinor, booking.currency) })}</p>}
        {booking.status === "confirmed" && booking.payment === "atShop" && !fullyPaid && booking.priceMinor > 0 && <p className="mt-2 text-sm leading-6 fm-muted">{c("bookTimePayAtShop")}</p>}
        {booking.status === "confirmed" && booking.cardLast4 && !booking.feeMinor && <p className="mt-2 text-sm leading-6 fm-muted" translate="no">{c("bookTimeCardOnFile", { last4: booking.cardLast4, fee: moneyText(booking.lateFeeMinor || 0, booking.currency) })}</p>}
        {!!booking.feeMinor && <p className="mt-2 text-sm leading-6 fm-muted" translate="no">{c("bookTimeFeeCharged", { fee: moneyText(booking.feeMinor, booking.currency) })}</p>}
      </div>

      {booking.status === "held" && (
        <button type="button" className="fm-track-btn fm-track-btn-ghost" onClick={() => { polls.current = 0; void load(true); }}>{c("bookTimeCheckAgain")}</button>
      )}

      {booking.status === "confirmed" && mode === "view" && (
        <div {...regionProps("bookingsActions")} className="space-y-5">
          {asksTip && (
            <TipPicker pick={tipPick} onPick={setTipPick} percents={tipPercents} priceMinor={booking.priceMinor} currency={booking.currency}
              limitMinor={tipLimit} optional={!!booking.canPayRest} tipMinor={tipMinor} c={c} />
          )}
          {booking.canPayRest && (
            <div className="space-y-2">
              <button type="button" className="fm-track-btn" disabled={busy || !tipFine} onClick={() => void payRest()} translate="no">
                {busy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />} {c("bookTimePayRest", { amount: moneyText((booking.dueMinor || 0) + tipMinor, booking.currency) })}
              </button>
              <p className="text-sm leading-6 fm-muted">{c("bookTimePayRestNote")}</p>
            </div>
          )}
          {!booking.canPayRest && asksTip && booking.canTip && (
            <button type="button" className="fm-track-btn" disabled={busy || !tipFine} onClick={() => void payRest("bookingTip")} translate="no">
              {busy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />} {c("bookTimeTipAdd", { amount: moneyText(tipMinor, booking.currency) })}
            </button>
          )}
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
        <div {...regionProps("bookingsTimes")} className="fm-track-card p-5 sm:p-8">
          <h2 className="fm-track-display text-3xl mb-6">{c("bookTimeMoveTitle")}</h2>
          <TimePicker serviceId={booking.serviceId} staffId={booking.staffId} zone={zone} today={info.today} lastDay={lastDay} picked={newStart} onPick={setNewStart} c={c} />
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
            {booking.payment === "card" && booking.paid && <p>{c("bookTimeCancelRefund")}</p>}
            {booking.payment === "deposit" && booking.depositPaid && <p>{c("bookTimeCancelDepositRefund")}</p>}
            {booking.payment === "pack" && <p>{c("bookTimePackCancelBack")}</p>}
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

/** "America/Toronto" → "Eastern Time" in the shopper's language; the place name if the browser can't name it. */
function zoneName(zone: string): string {
  try {
    const name = new Intl.DateTimeFormat(undefined, { timeZone: zone, timeZoneName: "longGeneric" }).formatToParts(new Date())
      .find((p) => p.type === "timeZoneName")?.value;
    if (name && !/^GMT/.test(name)) return name;
  } catch { /* fall through */ }
  return zone.split("/").pop()!.replace(/_/g, " ");
}
