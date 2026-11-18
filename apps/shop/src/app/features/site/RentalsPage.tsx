// Rentals page (/rentals, Rentals beta): the shop's items, each with its price. Rent this opens a picker under the items:
// a day, how long and a start time for an hourly item, or a pickup and a return day for a daily one, with what it costs.
// Pay holds a unit on the server for ten minutes and opens the shop's own card page; the card provider sends the
// customer back with `?rental=<id>&key=<key>`, and the page asks until the payment reads paid. Every word is Text &
// labels › Rentals page; the look is the order slip's (trackingStyle.ts) plus rentalsStyle.ts. The server
// (functions/rentals.js) decides prices, free units and the switch; this page only asks.
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useSEO } from "../../lib/seo";
import { StoreChrome } from "./StoreChrome";
import { StorefrontThemeStyle } from "./StorefrontThemeStyle";
import { useSiteData } from "./useSiteData";
import { getCopy } from "./storeCopy";
import { TRACKING_CSS } from "./trackingStyle";
import { RENTALS_CSS } from "./rentalsStyle";
import { regionProps } from "./storefrontRegions";
import { askRentals, type PublicRentalItem, type RentalQuote, type RentalTimes, type RentalView, type RentalsInfo } from "./rentalsAsk";
import { GlobalSections, TemplateSections } from "../../components/sectionRender";
import { moneyText } from "./bookTimeRules";
import { rentalPrice } from "../../../shared/rentalRules";

type Copy = (key: string, vars?: Record<string, string | number>) => string;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const dayWords = (day: string) => new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));

export default function RentalsPage() {
  return <StoreChrome surface="rentalsPage"><RentalsContent /></StoreChrome>;
}

function RentalsContent() {
  const { settings, books } = useSiteData();
  const design = settings?.design;
  const c: Copy = (key, vars) => getCopy(design, key, vars);
  useSEO({ title: c("rentalsTitle"), description: c("rentalsSubtitle") });
  const { search } = useLocation();
  const back = new URLSearchParams(search);
  const rentalId = back.get("rental") || "";
  const key = back.get("key") || "";

  return (
    <div data-fm-store data-studio-target="copy:Rentals page|style:colors" data-studio-label="Rentals page" className="fm-track min-h-screen fm-page text-white font-sans relative pb-24">
      <StorefrontThemeStyle design={design} />
      <style>{TRACKING_CSS}</style>
      <style>{RENTALS_CSS}</style>
      <div {...regionProps("rentalsGlow")} aria-hidden="true" className="fm-track-strip" />
      <nav {...regionProps("rentalsHeader")} className="relative z-10 border-b-2 fm-track-rule">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-5 flex items-center justify-between gap-4">
          <Link to="/" className="fm-track-link fm-track-mono"><ArrowLeft size={14} aria-hidden="true" /> {c("rentalsBack")}</Link>
          <span className="fm-track-mono">{c("rentalsEyebrow")}</span>
        </div>
      </nav>
      <main className="max-w-5xl mx-auto px-5 sm:px-8 pt-12 sm:pt-16 relative z-10">
        {rentalId && <Booked c={c} id={rentalId} rentalKey={key} />}
        <div {...regionProps("rentalsIntro")} className="mb-10 max-w-3xl">
          <p className="fm-track-mono mb-3">{c("rentalsEyebrow")}</p>
          <h1 tabIndex={-1} className="fm-track-display text-5xl sm:text-6xl outline-none">{c("rentalsTitle")}</h1>
          <p className="mt-4 text-base leading-7 fm-muted">{c("rentalsSubtitle")}</p>
        </div>
        <Items c={c} />
      </main>
      <TemplateSections design={design} templateId="rentalsPage" books={books} />
      <GlobalSections design={design} books={books} />
    </div>
  );
}

/** "CA$20.00 an hour · CA$90.00 a day" for one item. */
function priceWords(item: PublicRentalItem, currency: string, c: Copy): string {
  const m = (minor: number) => moneyText(minor, currency);
  return [
    item.hourMinor ? c("rentalsPerHour", { price: m(item.hourMinor) }) : "",
    item.dayMinor ? c(item.basis === "hour" ? "rentalsDayCap" : "rentalsPerDay", { price: m(item.dayMinor) }) : "",
    item.weekMinor ? c("rentalsPerWeek", { price: m(item.weekMinor) }) : "",
  ].filter(Boolean).join(" · ");
}

function Items({ c }: { c: Copy }) {
  const [info, setInfo] = useState<RentalsInfo | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<PublicRentalItem | null>(null);
  const load = () => { setFailed(false); askRentals("rentalsInfo").then((a) => setInfo(a as RentalsInfo)).catch(() => setFailed(true)); };
  useEffect(load, []);

  if (failed) {
    return (
      <div {...regionProps("rentalsNotice")} className="fm-track-notice" data-tone="danger" role="alert">
        <p>{c("rentalsLoadError")}</p>
        <button type="button" className="fm-track-btn fm-track-btn-ghost" onClick={load}>{c("rentalsRetry")}</button>
      </div>
    );
  }
  if (!info) return <p role="status" className="fm-track-mono"><Loader2 size={16} className="animate-spin inline-block" aria-hidden="true" /> {c("rentalsLoading")}</p>;
  const items = info.items || [];
  if (!info.on || !items.length) return <div {...regionProps("rentalsNotice")} className="fm-track-notice" role="status"><p>{c("rentalsClosed")}</p></div>;
  const currency = info.currency || "CAD";

  return (
    <>
      <ul {...regionProps("rentalsItems")} className="fm-rnt-items" aria-label={c("rentalsTitle")}>
        {items.map((item) => (
          <li key={item.id} className="fm-track-card fm-rnt-item" data-open={open?.id === item.id || undefined}>
            {item.photo && <img className="fm-rnt-photo" src={item.photo} alt="" loading="lazy" />}
            <div className="fm-rnt-body">
              <h2>{item.name}</h2>
              <p className="fm-rnt-price">{priceWords(item, currency, c)}{item.plusTax && <span className="fm-rnt-tax">{c("rentalsPlusTax")}</span>}</p>
              {item.description && <p className="fm-rnt-desc">{item.description}</p>}
              <button type="button" className="fm-track-btn" aria-expanded={open?.id === item.id} onClick={() => setOpen(open?.id === item.id ? null : item)}>
                {c(open?.id === item.id ? "rentalsClose" : "rentalsRent")}
              </button>
            </div>
          </li>
        ))}
      </ul>
      {open && <Picker key={open.id} c={c} item={open} currency={currency} zone={info.zone || ""} onClose={() => setOpen(null)} />}
    </>
  );
}

function Picker({ c, item, currency, zone, onClose }: { c: Copy; item: PublicRentalItem; currency: string; zone: string; onClose: () => void }) {
  const hourly = item.basis === "hour";
  const [day, setDay] = useState(tomorrow());
  const [hours, setHours] = useState(item.minLength);
  const [start, setStart] = useState("");
  const [endDay, setEndDay] = useState("");
  const [times, setTimes] = useState<RentalTimes | null>(null);
  const [form, setForm] = useState({ name: "", email: "" });
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLFormElement>(null);
  const money = (minor: number) => moneyText(minor, currency);
  useEffect(() => { box.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, []);

  useEffect(() => {
    let live = true;
    setTimes(null);
    askRentals("rentalTimes", { itemId: item.id, day, hours, ...(hourly ? {} : endDay ? { endDay } : {}) })
      .then((a) => { if (live) setTimes(a as RentalTimes); })
      .catch(() => { if (live) setTimes({ day, times: [], days: [] }); });
    return () => { live = false; };
  }, [item.id, day, hours, endDay, hourly]);

  // What it costs: the server's quote for a daily item, and the same rule the server uses for an hourly one.
  const quote: RentalQuote | null = hourly ? (start ? { totalMinor: rentalPrice(item, hours), taxMinor: 0, chargedMinor: rentalPrice(item, hours), free: true, length: hours } : null) : times?.quote || null;
  const ready = hourly ? !!start : !!endDay && !!quote && !("problem" in quote) && quote.free;
  const emailBad = !!form.email && !EMAIL.test(form.email.trim());

  const pay = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!ready) { setProblem(c(hourly ? "rentalsPickTime" : "rentalsPickDays")); return; }
    if (!form.name.trim()) { setProblem(c("rentalsNeedName")); return; }
    if (!EMAIL.test(form.email.trim())) { setProblem(c("rentalsNeedEmail")); return; }
    setBusy(true);
    setProblem("");
    try {
      const a = await askRentals("rentalStart", { itemId: item.id, day, ...(hourly ? { start, hours } : { endDay }), name: form.name.trim(), email: form.email.trim() });
      if (a.url) window.location.assign(String(a.url));
      else setBusy(false);
    } catch (err) {
      const code = (err as { code?: string }).code;
      setProblem(code === "taken" ? c("rentalsTaken") : code === "not_available" ? c("rentalsNotReady") : code === "closed" ? c("rentalsClosed") : (err as Error).message && code === "when" ? (err as Error).message : c("rentalsError"));
      setBusy(false);
    }
  };

  const lengths = Array.from({ length: item.maxLength - item.minLength + 1 }, (_, i) => item.minLength + i);
  return (
    <form ref={box} {...regionProps("rentalsPicker")} className="fm-track-card fm-rnt-book" onSubmit={pay} noValidate aria-labelledby="rnt-pick-heading">
      <h2 id="rnt-pick-heading">{c("rentalsPickHeading", { name: item.name })}</h2>
      <div className="fm-rnt-grid">
        <div className="fm-rnt-field">
          <label htmlFor="rnt-day">{c(hourly ? "rentalsDay" : "rentalsPickup")}</label>
          <input id="rnt-day" className="fm-track-input" type="date" min={tomorrow()} max={addDays(tomorrow(), item.daysAhead)} value={day}
            onChange={(e) => { if (e.target.value) { setDay(e.target.value); setStart(""); if (endDay && endDay < e.target.value) setEndDay(""); } }} />
        </div>
        {hourly ? (
          <div className="fm-rnt-field">
            <label htmlFor="rnt-hours">{c("rentalsHowLong")}</label>
            <select id="rnt-hours" className="fm-track-input" value={hours} onChange={(e) => { setHours(Number(e.target.value)); setStart(""); }}>
              {lengths.map((n) => <option key={n} value={n}>{c(n === 1 ? "rentalsHour" : "rentalsHours", { count: n })}</option>)}
            </select>
          </div>
        ) : (
          <div className="fm-rnt-field">
            <label htmlFor="rnt-end">{c("rentalsReturn")}</label>
            <input id="rnt-end" className="fm-track-input" type="date" min={day} max={addDays(day, item.maxLength - 1)} value={endDay} onChange={(e) => setEndDay(e.target.value)} />
          </div>
        )}
      </div>

      <div className="fm-rnt-field">
        <span className="fm-rnt-legend" id="rnt-chips-label">{c(hourly ? "rentalsStartTimes" : "rentalsFreeDays")}</span>
        {!times ? (
          <p role="status" className="fm-track-mono"><Loader2 size={14} className="animate-spin inline-block" aria-hidden="true" /> {c("rentalsLoading")}</p>
        ) : hourly ? (
          (times.times || []).length === 0 ? <p className="fm-rnt-hint">{c("rentalsNoTimes")}</p> : (
            <ul className="fm-rnt-chips" aria-labelledby="rnt-chips-label">
              {(times.times || []).map((t) => (
                <li key={t.start}><button type="button" className="fm-rnt-chip" disabled={!t.free} aria-pressed={start === t.start} onClick={() => setStart(t.start)}>{t.start}</button></li>
              ))}
            </ul>
          )
        ) : (
          <ul className="fm-rnt-chips" aria-labelledby="rnt-chips-label">
            {(times.days || []).map((d) => (
              <li key={d.day}><button type="button" className="fm-rnt-chip" disabled={!d.free} aria-pressed={d.day === day || d.day === endDay}
                onClick={() => { if (!endDay && d.day >= day && d.day !== day) setEndDay(d.day); else { setDay(d.day); setEndDay(""); } }}>{dayWords(d.day)}</button></li>
            ))}
          </ul>
        )}
        {zone && <p className="fm-rnt-hint">{c("rentalsHours2", { opens: item.opens, closes: item.closes })}</p>}
      </div>

      <div className="fm-rnt-grid">
        <div className="fm-rnt-field">
          <label htmlFor="rnt-name">{c("rentalsName")}</label>
          <input id="rnt-name" className="fm-track-input" autoComplete="name" maxLength={100} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="fm-rnt-field">
          <label htmlFor="rnt-email">{c("rentalsEmail")}</label>
          <input id="rnt-email" className="fm-track-input" type="email" inputMode="email" autoComplete="email" maxLength={254} value={form.email} aria-invalid={emailBad || undefined}
            aria-describedby="rnt-email-hint" onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <p id="rnt-email-hint" className="fm-rnt-hint">{c("rentalsEmailHint")}</p>
        </div>
      </div>

      <div {...regionProps("rentalsSummary")} className="fm-rnt-sum" aria-live="polite">
        {quote && "problem" in quote ? <p className="fm-rnt-error">{quote.problem}</p>
          : quote && !quote.free ? <p className="fm-rnt-error">{c("rentalsTaken")}</p>
          : quote ? <><span>{c(hourly ? (quote.length === 1 ? "rentalsHour" : "rentalsHours") : (quote.length === 1 ? "rentalsDayOne" : "rentalsDays"), { count: quote.length })}</span><strong>{money(quote.totalMinor)}</strong></>
          : <span className="fm-rnt-hint">{c(hourly ? "rentalsPickTime" : "rentalsPickDays")}</span>}
      </div>
      {item.plusTax && quote && !("problem" in quote) && <p className="fm-rnt-hint">{c("rentalsTaxNote")}</p>}
      {problem && <p role="alert" className="fm-rnt-error">{problem}</p>}
      <div className="fm-rnt-foot">
        <button type="submit" className="fm-track-btn" disabled={busy} aria-busy={busy}>
          {busy ? c("rentalsWorking") : quote && !("problem" in quote) ? c("rentalsPay", { amount: money(quote.totalMinor) }) : c("rentalsPayNoAmount")}
        </button>
        <button type="button" className="fm-track-btn fm-track-btn-ghost" onClick={onClose}>{c("rentalsCancel")}</button>
      </div>
      <p className="fm-rnt-hint">{c("rentalsHoldNote")}</p>
    </form>
  );
}

/** After paying (`?rental=<id>&key=<key>`): asks until the payment reads paid, a few times, then shows the booking. */
function Booked({ c, id, rentalKey }: { c: Copy; id: string; rentalKey: string }) {
  const [view, setView] = useState<{ rental: RentalView; zone: string } | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let live = true;
    let tries = 0;
    const ask = () => askRentals("rentalView", { rentalId: id, key: rentalKey })
      .then((a) => {
        if (!live) return;
        setView(a as { rental: RentalView; zone: string });
        if ((a as { rental: RentalView }).rental.status === "held" && tries++ < 6) window.setTimeout(ask, 2500);
      })
      .catch(() => { if (live) setMissing(true); });
    void ask();
    return () => { live = false; };
  }, [id, rentalKey]);

  if (missing) return <div {...regionProps("rentalsNotice")} className="fm-track-notice mb-8" role="status"><p>{c("rentalsNotFound")}</p></div>;
  if (!view) return <p role="status" className="fm-track-mono mb-8"><Loader2 size={16} className="animate-spin inline-block" aria-hidden="true" /> {c("rentalsLoading")}</p>;
  const r = view.rental;
  const when = (ms: number) => new Intl.DateTimeFormat(undefined, { timeZone: view.zone || undefined, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(ms));
  const paid = r.status !== "held" && r.status !== "cancelled";
  return (
    <section {...regionProps("rentalsDone")} className="fm-track-card fm-rnt-done" aria-live="polite">
      <p className="fm-track-mono">{c(paid ? "rentalsDoneEyebrow" : r.status === "cancelled" ? "rentalsCancelledEyebrow" : "rentalsPayingEyebrow")}</p>
      <h2>{r.itemName}</h2>
      <p>{c("rentalsDoneWhen", { from: when(r.startMs), until: when(r.endMs) })}</p>
      {paid && <p>{c("rentalsDonePaid", { amount: moneyText(r.chargedMinor, r.currency) })}</p>}
      {paid && <p className="fm-rnt-hint">{c("rentalsDoneEmail")}</p>}
    </section>
  );
}
