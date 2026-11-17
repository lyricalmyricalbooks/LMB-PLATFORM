// Events page (/events, Events and tickets beta): what's coming up, one event with its tickets (`?event=<id>`), and the
// buyer's own page (`?order=<id>&key=<key>`, where the card page comes back to and where the ticket email links): the
// codes to show at the door, the online link and Add to calendar. Free tickets are confirmed at once; paid ones go to
// the shop's card page. Every word is Text & labels › Events page; the look is the order slip's (trackingStyle.ts)
// plus eventsStyle.ts. The server decides every price, every place left and every total (functions/events.js); this
// page only shows what it answers.
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { ArrowLeft, CalendarPlus, Clock, Loader2, MapPin, Minus, Plus, Video } from "lucide-react";
import { useSEO } from "../../lib/seo";
import { StoreChrome } from "./StoreChrome";
import { StorefrontThemeStyle } from "./StorefrontThemeStyle";
import { useSiteData } from "./useSiteData";
import { getCopy } from "./storeCopy";
import { TRACKING_CSS } from "./trackingStyle";
import { EVENTS_CSS } from "./eventsStyle";
import { regionProps } from "./storefrontRegions";
import { askEvents } from "./eventsAsk";
import { isBookingPreview } from "./bookTimePreview";
import { GlobalSections, TemplateSections } from "../../components/sectionRender";
import { bookingIcs, googleCalendarLink } from "../../../shared/bookingTimes";
import { shopTimeZone } from "../../../shared/shopTimeZone";
import { moneyText } from "./bookTimeRules";
import {
  cartOf, clampQty, codeText, extrasOf, feeOf, eventDayParts, eventFromSearch, eventState, eventWhenText, lowestPrice, orderFromSearch,
  type EventOrderView, type EventView, type EventsInfo, type TicketCode,
} from "./eventsRules";

type Copy = (key: string, vars?: Record<string, string | number>) => string;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HOLD_MINUTES = 10;
/** An event with no end is put in the calendar as two hours. */
const DEFAULT_LENGTH_MS = 2 * 60 * 60_000;

/** A link inside the page; Studio's preview keeps its `preview=true` so the sample data stays. */
const within = (query = "") => {
  const q = new URLSearchParams(query);
  if (isBookingPreview()) q.set("preview", "true");
  const text = q.toString();
  return text ? `/events?${text}` : "/events";
};

export default function EventsPage() {
  return <StoreChrome surface="eventsPage"><EventsContent /></StoreChrome>;
}

function EventsContent() {
  const { settings, books } = useSiteData();
  const design = settings?.design;
  const c: Copy = (key, vars) => getCopy(design, key, vars);
  const { search } = useLocation();
  const order = useMemo(() => orderFromSearch(search), [search]);
  const eventId = useMemo(() => eventFromSearch(search), [search]);
  useSEO({ title: c("eventsTitle"), description: c("eventsSubtitle"), noindex: !!order });

  return (
    <div data-fm-store data-studio-target="copy:Events page|style:colors" data-studio-label="Events page" className="fm-track min-h-screen fm-page text-white font-sans relative pb-24">
      <StorefrontThemeStyle design={design} />
      <style>{TRACKING_CSS}</style>
      <style>{EVENTS_CSS}</style>
      <div {...regionProps("eventsGlow")} aria-hidden="true" className="fm-track-strip" />
      <nav {...regionProps("eventsHeader")} className="relative z-10 border-b-2 fm-track-rule">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-5 flex items-center justify-between gap-4">
          {order || eventId
            ? <Link to={within()} className="fm-track-link fm-track-mono"><ArrowLeft size={14} aria-hidden="true" /> {c("eventsAllEvents")}</Link>
            : <Link to="/" className="fm-track-link fm-track-mono"><ArrowLeft size={14} aria-hidden="true" /> {c("eventsBack")}</Link>}
          <span className="fm-track-mono">{c("eventsEyebrow")}</span>
        </div>
      </nav>
      <main className={`${eventId && !order ? "max-w-5xl" : "max-w-3xl"} mx-auto px-5 sm:px-8 pt-12 sm:pt-16 relative z-10`}>
        {order ? <YourTickets key={order.id} id={order.id} orderKey={order.key} c={c} /> : <Browse eventId={eventId} c={c} />}
      </main>
      <TemplateSections design={design} templateId="eventsPage" books={books} />
      <GlobalSections design={design} books={books} />
    </div>
  );
}

// ── What's on, and one event ───────────────────────────────────────────────────────────────────────────────────────

function Browse({ eventId, c }: { eventId: string; c: Copy }) {
  const [info, setInfo] = useState<EventsInfo | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const load = () => {
    setLoadFailed(false);
    return askEvents("eventsInfo").then((answer) => setInfo(answer as EventsInfo)).catch(() => setLoadFailed(true));
  };
  useEffect(() => { void load(); }, []);
  // Moving between the list and an event starts at the top, with the heading read out.
  useEffect(() => { if (info) { headingRef.current?.focus({ preventScroll: true }); window.scrollTo({ top: 0 }); } }, [eventId, !!info]);

  if (loadFailed) {
    return (
      <Intro c={c}>
        <div className="fm-track-notice" data-tone="danger" role="alert">
          <p>{c("eventsLoadError")}</p>
          <button type="button" className="fm-track-btn fm-track-btn-ghost" onClick={() => { setInfo(null); void load(); }}>{c("eventsRetry")}</button>
        </div>
      </Intro>
    );
  }
  if (!info) return <Intro c={c}><p role="status" className="fm-evt-empty fm-track-mono"><Loader2 size={16} className="animate-spin inline-block" aria-hidden="true" /> {c("eventsLoading")}</p></Intro>;

  const events = info.on ? info.events || [] : [];
  const zone = info.zone || shopTimeZone();
  const currency = info.currency || "CAD";
  const event = eventId ? events.find((e) => e.id === eventId) : undefined;

  if (eventId && !event) {
    return (
      <Intro c={c}>
        <div {...regionProps("eventsNotice")} className="fm-track-notice" role="status">
          <p>{c("eventsNotFound")}</p>
          {events.length > 0 && <Link to={within()} className="fm-track-btn fm-track-btn-ghost">{c("eventsAllEvents")}</Link>}
        </div>
      </Intro>
    );
  }
  if (event) return <OneEvent key={event.id} event={event} zone={zone} currency={currency} codes={!!info.codes} c={c} headingRef={headingRef} onStale={load} />;
  if (!events.length) return <Intro c={c}><div {...regionProps("eventsNotice")} className="fm-track-notice" role="status"><p>{c("eventsNone")}</p></div></Intro>;

  return (
    <Intro c={c} headingRef={headingRef}>
      <ul {...regionProps("eventsList")} className="fm-evt-list">
        {events.map((e) => {
          const day = eventDayParts(e.start, zone);
          const state = eventState(e);
          const from = lowestPrice(e);
          return (
            <li key={e.id}>
              <Link {...regionProps("eventsCard")} to={within(`event=${e.id}`)} className="fm-evt-card" data-photo={!!e.photo}>
                <span className="fm-evt-date" aria-hidden="true"><span>{day.month}</span><strong>{day.day}</strong><span>{day.weekday}</span></span>
                {e.photo && <img className="fm-evt-photo" src={e.photo} alt="" loading="lazy" decoding="async" />}
                <span className="fm-evt-main">
                  <h2>{e.title}</h2>
                  <p>{eventWhenText(e.start, e.end, zone)}</p>
                  {(e.venue || e.online) && <p>{[e.venue, e.online ? c("eventsOnline") : ""].filter(Boolean).join(" · ")}</p>}
                </span>
                <span className="fm-evt-tag" data-state={state} translate="no">
                  {state === "cancelled" ? c("eventsCancelled") : state === "closed" ? c("eventsSalesClosed") : state === "soldOut" ? c("eventsSoldOut")
                    : from === 0 ? c("eventsFree") : e.tickets.some((t) => t.priceMinor !== from) ? c("eventsFrom", { price: moneyText(from || 0, currency) }) : moneyText(from || 0, currency)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Intro>
  );
}

function Intro({ c, children, headingRef }: { c: Copy; children: React.ReactNode; headingRef?: React.Ref<HTMLHeadingElement> }) {
  return (
    <div>
      <div {...regionProps("eventsIntro")} className="mb-8">
        <p className="fm-track-mono mb-3">{c("eventsEyebrow")}</p>
        <h1 ref={headingRef} tabIndex={-1} className="fm-track-display text-5xl sm:text-6xl outline-none">{c("eventsTitle")}</h1>
        <p className="mt-4 text-base leading-7 fm-muted">{c("eventsSubtitle")}</p>
      </div>
      {children}
    </div>
  );
}

function Field({ id, label, problem, hint, children }: { id: string; label: string; problem?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="fm-track-mono block">{label}</label>
      {children}
      {hint && !problem && <p id={`${id}-hint`} className="text-sm fm-muted">{hint}</p>}
      {problem && <p id={`${id}-err`} className="fm-evt-error">{problem}</p>}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="fm-track-row"><span className="fm-track-mono">{label}</span><span className="text-right" translate="no">{value}</span></div>;
}

function Facts({ start, end, venue, address, zone, online }: { start: string; end?: string; venue?: string; address?: string; zone: string; online?: string }) {
  return (
    <ul {...regionProps("eventsFacts")} className="fm-evt-facts">
      <li><Clock size={16} aria-hidden="true" /><span>{eventWhenText(start, end, zone)}</span></li>
      {(venue || address) && <li><MapPin size={16} aria-hidden="true" /><span>{venue || address}{venue && address && <small>{address}</small>}</span></li>}
      {online && <li><Video size={16} aria-hidden="true" /><span>{online}</span></li>}
    </ul>
  );
}

/**
 * "Have a discount code?": folded until asked for. The server checks what is typed (`onTry` throws when it can't be
 * used) and checks it again when the order is made. Once applied it shows the code with a Remove button.
 */
function CodeBox({ applied, onTry, onRemove, c }: { applied: string; onTry: (typed: string) => Promise<void>; onRemove: () => void; c: Copy }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [problem, setProblem] = useState("");
  const [checking, setChecking] = useState(false);
  if (applied) {
    return (
      <div {...regionProps("eventsCode")} className="fm-evt-applied" role="status">
        <span translate="no">{applied}</span>
        <button type="button" className="fm-track-link bg-transparent border-0 p-0 cursor-pointer" onClick={() => { onRemove(); setTyped(""); }}>{c("eventsCodeRemove")}</button>
      </div>
    );
  }
  if (!open) return <button type="button" className="fm-track-link bg-transparent border-0 p-0 cursor-pointer text-sm justify-self-start" onClick={() => setOpen(true)}>{c("eventsCodeOpen")}</button>;
  const apply = async () => {
    if (!typed.trim() || checking) return;
    setChecking(true);
    setProblem("");
    try { await onTry(typed.trim()); } catch { setProblem(c("eventsCodeProblem")); } finally { setChecking(false); }
  };
  return (
    <div {...regionProps("eventsCode")}>
      <Field id="evt-code" label={c("eventsCodeLabel")} problem={problem}>
        <div className="fm-evt-code-row">
          <input id="evt-code" className="fm-track-input" autoComplete="off" autoCapitalize="characters" spellCheck={false} value={typed} maxLength={40}
            aria-invalid={!!problem} aria-describedby={problem ? "evt-code-err" : undefined}
            onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void apply(); } }} />
          <button type="button" className="fm-track-btn fm-track-btn-ghost" onClick={() => { void apply(); }} disabled={checking || !typed.trim()}>
            {checking ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : c("eventsCodeApply")}
          </button>
        </div>
      </Field>
    </div>
  );
}

function OneEvent({ event, zone, currency, codes, c, headingRef, onStale }: {
  event: EventView; zone: string; currency: string; codes: boolean; c: Copy; headingRef: React.Ref<HTMLHeadingElement>; onStale: () => Promise<void>;
}) {
  const navigate = useNavigate();
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [form, setForm] = useState({ name: "", email: "" });
  const [problems, setProblems] = useState<{ tickets?: string; name?: string; email?: string }>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [applied, setApplied] = useState<TicketCode | null>(null);
  const state = eventState(event);
  const [extraPicks, setExtraPicks] = useState<Record<string, number>>({});
  const cart = cartOf(event, picks);
  // Extras ride along with tickets: with no ticket picked they are neither shown in the sums nor sent.
  const added = extrasOf(event, cart.count ? extraPicks : {});
  const taxed = cart.taxed || added.taxed;
  // The server's own fee once a code is applied (a code that makes every ticket free takes the fee with it).
  const fee = applied ? applied.feeMinor || 0 : feeOf(event, cart.tickets);
  // With a code, the server's own figures are shown (the code comes off before any tax).
  const due = applied ? applied.totalMinor : cart.totalMinor + added.totalMinor + fee;
  const amount = moneyText(due, currency);
  const tryCode = async (code: string, tickets = cart.tickets) => {
    setApplied(await askEvents("eventCode", { eventId: event.id, tickets, extras: added.extras, code, email: form.email.trim() }) as TicketCode);
  };
  // Other tickets, another amount: the code is asked about again, and dropped when it no longer fits.
  const picked = JSON.stringify([cart.tickets, added.extras]);
  useEffect(() => {
    if (!applied) return;
    if (!cart.totalMinor) { setApplied(null); return; }
    let live = true;
    askEvents("eventCode", { eventId: event.id, tickets: cart.tickets, extras: added.extras, code: applied.code, email: form.email.trim() })
      .then((answer) => { if (live) setApplied(answer as TicketCode); }).catch(() => { if (live) setApplied(null); });
    return () => { live = false; };
  }, [picked]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const found = {
      ...(cart.count ? {} : { tickets: c("eventsNeedTickets") }),
      ...(form.name.trim() ? {} : { name: c("eventsNeedName") }),
      ...(EMAIL.test(form.email.trim()) ? {} : { email: c("eventsNeedEmail") }),
    };
    setProblems(found);
    const first = found.tickets ? "evt-tickets" : found.name ? "evt-name" : found.email ? "evt-email" : "";
    if (first) { document.getElementById(first)?.focus(); return; }
    setBusy(true);
    setError("");
    try {
      const answer = await askEvents("eventStart", { eventId: event.id, name: form.name.trim(), email: form.email.trim(), locale: navigator.language || "en", tickets: cart.tickets, ...(Object.keys(added.extras).length ? { extras: added.extras } : {}), ...(applied ? { code: applied.code } : {}) });
      if (answer.on === false) { setBusy(false); setError(c("eventsSalesClosed")); return; }
      if (answer.url) { window.location.href = answer.url; return; }
      navigate(within(`order=${encodeURIComponent(answer.orderId)}&key=${answer.key}`));
    } catch (err: any) {
      setBusy(false);
      // Someone else got there first: show what is left now, with the picks trimmed to it.
      if (err?.code === "code") { setApplied(null); setError(c("eventsCodeProblem")); return; }
      if (err?.code === "extras") { await onStale(); setExtraPicks({}); setError(c("eventsExtrasChanged")); return; }
      if (err?.code === "tickets" || err?.code === "closed") {
        await onStale();
        setError(c(err.code === "tickets" ? "eventsTicketsChanged" : "eventsSalesClosed"));
        return;
      }
      setError(c(err?.code === "not_available" ? "eventsNotAvailable" : err?.status === 429 ? "eventsTooMany" : "eventsError"));
    }
  };

  return (
    <div>
      <div {...regionProps("eventsIntro")} className="mb-8">
        <p className="fm-track-mono mb-3">{c("eventsEyebrow")}</p>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 ref={headingRef} tabIndex={-1} className="fm-track-display text-5xl sm:text-6xl outline-none">{event.title}</h1>
          {state !== "open" && <span className="fm-track-stamp" data-state="ended">{c(state === "cancelled" ? "eventsCancelled" : state === "soldOut" ? "eventsSoldOut" : "eventsSalesClosed")}</span>}
        </div>
        <Facts start={event.start} end={event.end} venue={event.venue} address={event.address} zone={zone} online={event.online ? c("eventsOnlineNote") : ""} />
      </div>

      {event.photo && <img {...regionProps("eventsPhoto")} className="fm-evt-photo fm-evt-hero" src={event.photo} alt="" decoding="async" />}

      <div className="fm-evt-layout">
        <div>
          {event.description && <p {...regionProps("eventsAbout")} className="fm-evt-about">{event.description}</p>}
          <section {...regionProps("eventsTickets")} className="fm-track-card p-5 sm:p-8" aria-labelledby="evt-tickets">
            <h2 id="evt-tickets" tabIndex={-1} className="fm-track-mono mb-5 outline-none">{c("eventsTicketsHeading")}</h2>
            <ul className="fm-evt-tickets">
              {event.tickets.map((t) => {
                const qty = clampQty(t, picks[t.id] || 0);
                const canBuy = state === "open" && !t.soldOut;
                const set = (next: number) => { setPicks({ ...picks, [t.id]: clampQty(t, next) }); setProblems({ ...problems, tickets: undefined }); };
                return (
                  <li key={t.id} className="fm-evt-ticket" data-gone={t.soldOut}>
                    <div>
                      <h3>{t.name}</h3>
                      <p translate="no">
                        {t.priceMinor > 0 ? moneyText(t.priceMinor, currency) : c("eventsFree")}{!!t.taxMinor && <> {c("eventsPlusTax")}</>}
                        {t.priceMinor > 0 && !!event.feeMinor && <> {c("eventsFeeNote", { amount: moneyText(event.feeMinor, currency) })}</>}
                        {canBuy && t.left > 0 && t.left < Math.min(5, t.maxPerOrder) && <> · <b>{c("eventsLeft", { count: t.left })}</b></>}
                      </p>
                    </div>
                    {canBuy ? (
                      <div className="fm-evt-qty" role="group" aria-label={t.name}>
                        <button type="button" className="fm-evt-step" aria-label={c("eventsFewer", { ticket: t.name })} disabled={qty <= 0} onClick={() => set(qty - 1)}><Minus size={16} aria-hidden="true" /></button>
                        <output aria-live="polite">{qty}</output>
                        <button type="button" className="fm-evt-step" aria-label={c("eventsMore", { ticket: t.name })} disabled={qty >= t.left} onClick={() => set(qty + 1)}><Plus size={16} aria-hidden="true" /></button>
                      </div>
                    ) : <span className="fm-evt-gone">{t.soldOut && state === "open" ? c("eventsSoldOut") : ""}</span>}
                  </li>
                );
              })}
            </ul>
            {problems.tickets && <p className="fm-evt-error" role="alert">{problems.tickets}</p>}
          </section>
          {state === "open" && !!event.extras?.length && (
            <section {...regionProps("eventsExtras")} className="fm-track-card p-5 sm:p-8 fm-evt-extras" aria-labelledby="evt-extras">
              <h2 id="evt-extras" className="fm-track-mono mb-5">{c("eventsExtrasHeading")}</h2>
              <ul className="fm-evt-tickets">
                {event.extras.map((x) => {
                  const qty = Math.max(0, Math.min(extraPicks[x.id] || 0, x.maxPerOrder));
                  const set = (next: number) => setExtraPicks({ ...extraPicks, [x.id]: Math.max(0, Math.min(next, x.maxPerOrder)) });
                  return (
                    <li key={x.id} className="fm-evt-ticket">
                      <div>
                        <h3>{x.name}</h3>
                        <p translate="no">{moneyText(x.priceMinor, currency)}{!!x.taxMinor && <> {c("eventsPlusTax")}</>}</p>
                      </div>
                      <div className="fm-evt-qty" role="group" aria-label={x.name}>
                        <button type="button" className="fm-evt-step" aria-label={c("eventsFewer", { ticket: x.name })} disabled={qty <= 0} onClick={() => set(qty - 1)}><Minus size={16} aria-hidden="true" /></button>
                        <output aria-live="polite">{qty}</output>
                        <button type="button" className="fm-evt-step" aria-label={c("eventsMore", { ticket: x.name })} disabled={qty >= x.maxPerOrder} onClick={() => set(qty + 1)}><Plus size={16} aria-hidden="true" /></button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>

        {state === "open" ? (
          <form {...regionProps("eventsForm")} onSubmit={submit} noValidate className="fm-track-card p-5 sm:p-8 fm-evt-form">
            <h2 className="fm-track-mono">{c("eventsYourDetails")}</h2>
            {error && <div className="fm-track-notice" data-tone="danger" role="alert"><p>{error}</p></div>}
            <Field id="evt-name" label={c("eventsName")} problem={problems.name}>
              <input id="evt-name" className="fm-track-input" autoComplete="name" maxLength={100} value={form.name} aria-invalid={!!problems.name}
                aria-describedby={problems.name ? "evt-name-err" : undefined} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field id="evt-email" label={c("eventsEmail")} problem={problems.email} hint={c("eventsEmailHint")}>
              <input id="evt-email" type="email" className="fm-track-input" autoComplete="email" inputMode="email" maxLength={320} value={form.email} aria-invalid={!!problems.email}
                aria-describedby={problems.email ? "evt-email-err" : "evt-email-hint"} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <div {...regionProps("eventsSummary")} className="fm-track-ledger">
              {event.tickets.filter((t) => cart.tickets[t.id]).map((t) => (
                <Row key={t.id} label={`${cart.tickets[t.id]} × ${t.name}`} value={t.priceMinor > 0 ? moneyText(cart.tickets[t.id] * t.priceMinor, currency) : c("eventsFree")} />
              ))}
              {(event.extras ?? []).filter((x) => added.extras[x.id]).map((x) => (
                <Row key={x.id} label={`${added.extras[x.id]} × ${x.name}`} value={moneyText(added.extras[x.id] * x.priceMinor, currency)} />
              ))}
              {fee > 0 && <Row label={c("eventsFeeRow")} value={moneyText(fee, currency)} />}
              {applied && <Row label={c("eventsDiscountRow", { code: applied.code })} value={`−${moneyText(applied.amountMinor, currency)}`} />}
              <div className="fm-track-total">
                <span className="fm-track-mono">{c("eventsTotal")}</span>
                <strong translate="no">{cart.count && !due ? c("eventsFree") : amount}{taxed && due > 0 && <small className="fm-track-mono"> {c("eventsPlusTax")}</small>}</strong>
              </div>
            </div>
            {codes && cart.totalMinor > 0 && (
              <CodeBox c={c} applied={applied ? c("eventsCodeApplied", { code: applied.code }) : ""} onTry={tryCode} onRemove={() => setApplied(null)} />
            )}
            {due > 0 && <p className="text-sm leading-6 fm-muted">{c("eventsPayNote", { minutes: HOLD_MINUTES })}</p>}
            <button type="submit" className="fm-track-btn w-full" disabled={busy}>
              {busy ? <><Loader2 size={16} className="animate-spin" aria-hidden="true" /> {c("eventsWorking")}</>
                : due > 0 ? c(taxed ? "eventsPayTax" : "eventsPay", { amount }) : c("eventsGetFree")}
            </button>
          </form>
        ) : (
          <div {...regionProps("eventsNotice")} className="fm-track-notice" role="status">
            <p>{c(state === "cancelled" ? "eventsCancelledText" : state === "soldOut" ? "eventsSoldOutText" : "eventsSalesClosed")}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── The buyer's own page ───────────────────────────────────────────────────────────────────────────────────────────

function YourTickets({ id, orderKey, c }: { id: string; orderKey: string; c: Copy }) {
  const [order, setOrder] = useState<EventOrderView | null>(null);
  const [zone, setZone] = useState(shopTimeZone());
  const [missing, setMissing] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = () => askEvents("eventView", { orderId: id, key: orderKey }).then((answer) => {
    setFailed(false);
    setOrder(answer.order as EventOrderView);
    if (answer.zone) setZone(answer.zone);
  }).catch((err: any) => { if (err?.code === "not_found" || err?.status === 404) setMissing(true); else setFailed(true); });
  useEffect(() => { void load(); }, []);
  // The card page comes back here a moment before the payment is confirmed: look again until it is, or the hold ends.
  const waiting = order?.status === "held";
  useEffect(() => {
    if (!waiting) return;
    const timer = window.setInterval(() => { void load(); }, 3000);
    return () => window.clearInterval(timer);
  }, [waiting]);

  if (missing) return <Intro c={c}><div {...regionProps("eventsNotice")} className="fm-track-notice" data-tone="danger" role="alert"><p>{c("eventsOrderNotFound")}</p></div></Intro>;
  if (failed && !order) {
    return (
      <Intro c={c}>
        <div className="fm-track-notice" data-tone="danger" role="alert">
          <p>{c("eventsLoadError")}</p>
          <button type="button" className="fm-track-btn fm-track-btn-ghost" onClick={() => { setFailed(false); void load(); }}>{c("eventsRetry")}</button>
        </div>
      </Intro>
    );
  }
  if (!order) return <Intro c={c}><p role="status" className="fm-evt-empty fm-track-mono"><Loader2 size={16} className="animate-spin inline-block" aria-hidden="true" /> {c("eventsLoading")}</p></Intro>;

  const paid = order.status === "paid";
  const called = order.eventCancelled;
  // Tickets the shop gave back: all of them (the order is "refunded") or some (still paid, with money sent back).
  const back = order.status === "refunded";
  const refunded = order.refundedMinor || 0;
  const startMs = Date.parse(order.start);
  const endMs = Date.parse(order.end) > startMs ? Date.parse(order.end) : startMs + DEFAULT_LENGTH_MS;
  const place = [order.venue, order.address].filter(Boolean).join(", ");
  const download = () => {
    const ics = bookingIcs({ id: order.id, title: order.title, start: startMs, end: endMs, location: place });
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "event.ics";
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="space-y-8">
      <div {...regionProps("eventsIntro")}>
        <p className="fm-track-mono mb-3">{c("eventsEyebrow")}</p>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="fm-track-display text-5xl sm:text-6xl">{c(called ? "eventsCancelled" : back ? (refunded ? "eventsRefundedTitle" : "eventsTicketsCancelledTitle") : paid ? "eventsGoingTitle" : waiting ? "eventsHeldTitle" : "eventsEndedTitle")}</h1>
          <span className="fm-track-stamp" data-state={called || back || order.status === "cancelled" ? "ended" : paid ? "paid" : "unpaid"}>{order.title}</span>
        </div>
        <p className="mt-4 text-base leading-7 fm-muted" role="status">
          {called && back && refunded ? c("eventsCancelledRefundedText") : back ? c(refunded ? "eventsRefundedText" : "eventsTicketsCancelledText") : called ? c("eventsCancelledOrderText") : paid ? c("eventsGoingText") : waiting ? c("eventsHeldText") : c("eventsEndedText")}
        </p>
      </div>

      <div {...regionProps("eventsConfirmation")} className="fm-track-card p-6 sm:p-8 fm-track-ledger">
        <Row label={c("eventsWhen")} value={eventWhenText(order.start, order.end, zone)} />
        {place && <Row label={c("eventsWhere")} value={place} />}
        {order.name && <Row label={c("eventsNameRow")} value={order.name} />}
        {order.lines.map((l) => <Row key={l.ticketId} label={`${l.qty} × ${l.name}`} value={l.priceMinor > 0 ? moneyText(l.qty * l.priceMinor, order.currency) : c("eventsFree")} />)}
        {(order.extras ?? []).map((x) => <Row key={x.extraId} label={`${x.qty} × ${x.name}`} value={moneyText(x.qty * x.priceMinor, order.currency)} />)}
        {!!order.feeMinor && <Row label={c("eventsFeeRow")} value={moneyText(order.feeMinor, order.currency)} />}
        {!!order.discount?.amountMinor && <Row label={c("eventsDiscountRow", { code: order.discount.code })} value={`−${moneyText(order.discount.amountMinor, order.currency)}`} />}
        {order.taxMinor > 0 && <Row label={c("eventsTax")} value={moneyText(order.taxMinor, order.currency)} />}
        {paid && order.onlineUrl && !called && (
          <div className="fm-track-row"><span className="fm-track-mono">{c("eventsOnlineRow")}</span><a className="text-right underline underline-offset-2" href={order.onlineUrl} target="_blank" rel="noopener noreferrer">{c("eventsJoinOnline")}</a></div>
        )}
        {refunded > 0 && <Row label={c("eventsRefundedRow")} value={`−${moneyText(refunded, order.currency)}`} />}
        <div className="fm-track-total">
          <span className="fm-track-mono">{c(paid || back ? "eventsPaid" : "eventsTotal")}</span>
          <strong translate="no">{order.chargedMinor > 0 ? moneyText(Math.max(0, order.chargedMinor - refunded), order.currency) : c("eventsFree")}</strong>
        </div>

        {paid && !called && order.tickets.length > 0 && (
          <>
            <ul {...regionProps("eventsCodes")} className="fm-evt-codes" aria-label={c("eventsYourTickets")}>
              {order.tickets.map((t, i) => (
                <li key={t.code} className="fm-evt-code" data-used={t.used ? "true" : undefined}>
                  <TicketQr code={t.code} alt={c("eventsCodeQr")} />
                  <div className="fm-evt-code-words">
                    <span className="fm-track-mono">{c("eventsTicketNumber", { number: i + 1, total: order.tickets.length })} · {t.name}</span>
                    <strong translate="no">{codeText(t.code)}</strong>
                    {t.used && <span className="fm-evt-code-used fm-track-mono">{c("eventsTicketUsed")}</span>}
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm leading-6 fm-muted">{c("eventsShowCode")}</p>
          </>
        )}
      </div>

      {paid && !called && (
        <div {...regionProps("eventsActions")} className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <button type="button" className="fm-track-btn" onClick={download}><CalendarPlus size={16} aria-hidden="true" /> {c("eventsAddCalendar")}</button>
          <a className="fm-track-link fm-track-mono underline underline-offset-4" href={googleCalendarLink({ title: order.title, start: startMs, end: endMs, location: place })} target="_blank" rel="noopener noreferrer">{c("eventsGoogleCalendar")}</a>
        </div>
      )}
      {(order.status === "cancelled" || back) && !called && (
        <Link to={within(`event=${order.eventId}`)} className="fm-track-btn">{c("eventsTryAgain")}</Link>
      )}
    </div>
  );
}

/** A ticket's code as a QR picture the door scans (the letters beside it always work too). */
function TicketQr({ code, alt }: { code: string; alt: string }) {
  const [picture, setPicture] = useState("");
  useEffect(() => {
    let live = true;
    void import("qrcode-generator").then(({ default: qrcode }) => {
      const qr = qrcode(0, "M");
      qr.addData(code);
      qr.make();
      if (live) setPicture(qr.createDataURL(6, 3));
    }).catch(() => { /* the letters still work */ });
    return () => { live = false; };
  }, [code]);
  return picture ? <img className="fm-evt-code-qr" src={picture} alt={alt} width={96} height={96} /> : <span className="fm-evt-code-qr" aria-hidden="true" />;
}
