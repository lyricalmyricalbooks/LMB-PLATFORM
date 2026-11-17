// Timetable page (/classes, Classes beta): the week's classes day by day, each with its time, length, price and the
// places left. Sign up (or Join the waiting list when a class is full) hands over to Book a time with the class and
// its day chosen, so signing up, paying, packs of visits and the waiting list stay one path (BookTime.tsx). Every word
// is Text & labels › Classes page; the look is the order slip's (trackingStyle.ts) plus classesStyle.ts. The server
// decides what is on and how many places are left (functions/bookings.js `classTimetable`); this page only shows it.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useSEO } from "../../lib/seo";
import { StoreChrome } from "./StoreChrome";
import { StorefrontThemeStyle } from "./StorefrontThemeStyle";
import { useSiteData } from "./useSiteData";
import { getCopy } from "./storeCopy";
import { TRACKING_CSS } from "./trackingStyle";
import { CLASSES_CSS } from "./classesStyle";
import { regionProps } from "./storefrontRegions";
import { askTimetable } from "./classesAsk";
import { isBookingPreview } from "./bookTimePreview";
import { GlobalSections, TemplateSections } from "../../components/sectionRender";
import { shopTimeZone } from "../../../shared/shopTimeZone";
import { courseDateLines, lengthText, moneyText, timeText } from "./bookTimeRules";
import { dayOf } from "../../../shared/bookingTimes";
import { dayHeading, placesState, signUpPath, timetableDays, weekFromSearch, weekRangeText, weekStep, type CourseView, type TimetableInfo, type TimetableSession } from "./classesRules";

type Copy = (key: string, vars?: Record<string, string | number>) => string;

/** A link that keeps Studio's `preview=true`, so the sample week (and Book a time's samples) stay. */
const kept = (path: string) => (isBookingPreview() ? `${path}${path.includes("?") ? "&" : "?"}preview=true` : path);
const weekPath = (from = "") => kept(from ? `/classes?from=${from}` : "/classes");

export default function ClassesPage() {
  return <StoreChrome surface="classesPage"><ClassesContent /></StoreChrome>;
}

function ClassesContent() {
  const { settings, books } = useSiteData();
  const design = settings?.design;
  const c: Copy = (key, vars) => getCopy(design, key, vars);
  useSEO({ title: c("classesTitle"), description: c("classesSubtitle") });

  return (
    <div data-fm-store data-studio-target="copy:Classes page|style:colors" data-studio-label="Classes page" className="fm-track min-h-screen fm-page text-white font-sans relative pb-24">
      <StorefrontThemeStyle design={design} />
      <style>{TRACKING_CSS}</style>
      <style>{CLASSES_CSS}</style>
      <div {...regionProps("classesGlow")} aria-hidden="true" className="fm-track-strip" />
      <nav {...regionProps("classesHeader")} className="relative z-10 border-b-2 fm-track-rule">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-5 flex items-center justify-between gap-4">
          <Link to="/" className="fm-track-link fm-track-mono"><ArrowLeft size={14} aria-hidden="true" /> {c("classesBack")}</Link>
          <span className="fm-track-mono">{c("classesEyebrow")}</span>
        </div>
      </nav>
      <main className="max-w-3xl mx-auto px-5 sm:px-8 pt-12 sm:pt-16 relative z-10">
        <div {...regionProps("classesIntro")} className="mb-8">
          <p className="fm-track-mono mb-3">{c("classesEyebrow")}</p>
          <h1 className="fm-track-display text-5xl sm:text-6xl">{c("classesTitle")}</h1>
          <p className="mt-4 text-base leading-7 fm-muted">{c("classesSubtitle")}</p>
        </div>
        <Timetable c={c} />
      </main>
      <TemplateSections design={design} templateId="classesPage" books={books} />
      <GlobalSections design={design} books={books} />
    </div>
  );
}

function Timetable({ c }: { c: Copy }) {
  const { search } = useLocation();
  const asked = useMemo(() => weekFromSearch(search), [search]);
  const [info, setInfo] = useState<TimetableInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const weekRef = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);

  const load = (from: string) => {
    let stale = false;
    setFailed(false);
    setLoading(true);
    askTimetable(from).then((answer) => { if (!stale) setInfo(answer); }).catch(() => { if (!stale) setFailed(true); }).finally(() => { if (!stale) setLoading(false); });
    return () => { stale = true; };
  };
  useEffect(() => load(asked), [asked]);
  // After moving to another week the new dates are read out (not on the first load, which would steal the page's start).
  useEffect(() => {
    if (loading || !info?.from) return;
    if (moved.current) weekRef.current?.focus({ preventScroll: true });
    moved.current = true;
  }, [loading, info?.from]);

  if (failed) {
    return (
      <div className="fm-track-notice" data-tone="danger" role="alert">
        <p>{c("classesLoadError")}</p>
        <button type="button" className="fm-track-btn fm-track-btn-ghost" onClick={() => load(asked)}>{c("classesRetry")}</button>
      </div>
    );
  }
  if (!info) return <p role="status" className="fm-cls-empty fm-track-mono"><Loader2 size={16} className="animate-spin inline-block" aria-hidden="true" /> {c("classesLoading")}</p>;
  if (!info.on || !info.from) return <div {...regionProps("classesNotice")} className="fm-track-notice" role="status"><p>{c("classesClosed")}</p></div>;

  const zone = info.zone || shopTimeZone();
  const currency = info.currency || "CAD";
  const today = info.today || info.from;
  const lastDay = info.lastDay || info.from;
  const earlier = weekStep(info.from, today, lastDay, -1);
  const later = weekStep(info.from, today, lastDay, 1);
  const days = timetableDays(info).filter((d) => d.sessions.length > 0);

  const courses = info.courses || [];
  // A shop that runs only courses shows no empty week under them.
  const weekly = (info.classes || []).length > 0 || courses.length === 0;

  return (
    <div>
      {courses.length > 0 && (
        <section className="fm-cls-courses" aria-labelledby="cls-courses">
          <h2 {...regionProps("classesDay")} id="cls-courses" className="fm-cls-day-head">{c("classesCourses")}</h2>
          <ul className="fm-cls-list">
            {courses.map((k) => <Course key={k.id} k={k} zone={zone} currency={currency} c={c} />)}
          </ul>
        </section>
      )}
      {weekly && <>
      <div {...regionProps("classesWeek")} className="fm-cls-week">
        {earlier ? <Link to={weekPath(earlier === today ? "" : earlier)} className="fm-cls-arrow" aria-label={c("classesEarlier")} title={c("classesEarlier")}><ChevronLeft size={18} aria-hidden="true" /></Link>
          : <span className="fm-cls-arrow" aria-hidden="true"><ChevronLeft size={18} /></span>}
        <h2 ref={weekRef} tabIndex={-1} className="outline-none" aria-live="polite">{weekRangeText(info.from)}</h2>
        {later ? <Link to={weekPath(later)} className="fm-cls-arrow" aria-label={c("classesLater")} title={c("classesLater")}><ChevronRight size={18} aria-hidden="true" /></Link>
          : <span className="fm-cls-arrow" aria-hidden="true"><ChevronRight size={18} /></span>}
      </div>
      {days.length === 0 ? (
        <div {...regionProps("classesNotice")} className="fm-track-notice" role="status">
          <p>{c("classesNoneWeek")}</p>
          {later && <Link to={weekPath(later)} className="fm-track-btn fm-track-btn-ghost">{c("classesNextWeek")}</Link>}
        </div>
      ) : (
        <div className="fm-cls-days" aria-busy={loading}>
          {days.map((d) => (
            <section key={d.day} aria-labelledby={`cls-${d.day}`}>
              <h3 {...regionProps("classesDay")} id={`cls-${d.day}`} className="fm-cls-day-head">
                {dayHeading(d.day)}{d.day === today && <span className="fm-cls-today">{c("classesToday")}</span>}
              </h3>
              <ul className="fm-cls-list">
                {d.sessions.map((s) => <Session key={`${s.classId}@${s.start}`} s={s} zone={zone} currency={currency} c={c} />)}
              </ul>
            </section>
          ))}
        </div>
      )}
      </>}
      <p className="fm-cls-zone fm-track-mono">{c("classesZone", { zone: zone.replace(/_/g, " ") })}</p>
    </div>
  );
}

/** A course: every date listed, one price, one Sign up for them all (Book a time takes it from its first date). */
function Course({ k, zone, currency, c }: { k: CourseView; zone: string; currency: string; c: Copy }) {
  const left = k.left;
  const state = left === undefined ? "open" : placesState(left, k.places);
  const full = state === "full";
  const price = k.priceMinor > 0 ? `${moneyText(k.priceMinor, currency)}${k.plusTax ? ` ${c("classesPlusTax")}` : ""}` : c("classesFree");
  const lines = courseDateLines(k.starts, zone);
  return (
    <li {...regionProps("classesSession")} className="fm-cls-session" data-state={state}>
      <div className="fm-cls-time"><strong>{c("classesCourseDates", { count: k.starts.length })}</strong><span>{lengthText(k.minutes)}</span></div>
      <div className="fm-cls-main">
        <h3>{k.name}</h3>
        <p>{[price, k.location].filter(Boolean).join(" · ")}</p>
        <ol className="fm-cls-dates">{lines.map((line) => <li key={line}>{line}</li>)}</ol>
      </div>
      <div className="fm-cls-side">
        {left !== undefined && (
          <span className="fm-cls-tag" data-state={state}>
            {full ? c("classesFull") : state === "last" ? c("classesLastPlace") : c("classesPlacesLeft", { count: left })}
          </span>
        )}
        {!full && (
          <Link to={kept(signUpPath(k.id, dayOf(Date.parse(k.starts[0]), zone)))} className="fm-track-btn" aria-label={c("classesSignUpAria", { name: k.name, when: lines[0] })}>
            {c("classesSignUp")}
          </Link>
        )}
      </div>
    </li>
  );
}

function Session({ s, zone, currency, c }: { s: TimetableSession; zone: string; currency: string; c: Copy }) {
  const k = s.klass;
  const state = placesState(s.left, k.places);
  const time = timeText(s.start, zone);
  const price = k.priceMinor > 0 ? `${moneyText(k.priceMinor, currency)}${k.plusTax ? ` ${c("classesPlusTax")}` : ""}` : c("classesFree");
  const full = state === "full";
  return (
    <li {...regionProps("classesSession")} className="fm-cls-session" data-state={state}>
      <div className="fm-cls-time"><strong>{time}</strong><span>{lengthText(k.minutes)}</span></div>
      <div className="fm-cls-main">
        <h4>{k.name}</h4>
        <p>{[price, k.location].filter(Boolean).join(" · ")}</p>
      </div>
      <div className="fm-cls-side">
        <span className="fm-cls-tag" data-state={state}>
          {full ? c("classesFull") : state === "last" ? c("classesLastPlace") : c("classesPlacesLeft", { count: s.left })}
        </span>
        <Link to={kept(signUpPath(k.id, s.day))} className={`fm-track-btn${full ? " fm-track-btn-ghost" : ""}`} aria-label={c(full ? "classesWaitlistAria" : "classesSignUpAria", { name: k.name, when: `${dayHeading(s.day)}, ${time}` })}>
          {c(full ? "classesWaitlist" : "classesSignUp")}
        </Link>
      </div>
    </li>
  );
}
