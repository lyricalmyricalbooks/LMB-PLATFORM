// Admin › Classes (beta, ways to sell; tasks/todo/2026-11-17-classes-timetable-admin.md). The week's timetable of every
// group class, who is in each one, and the classes themselves. A class is a Bookings service with more than one place,
// so this page reads what Bookings reads and changes things only through the same server calls (bookingsApi.ts): the
// places, payments, waiting list and reminders are the booking engine's. Shown only while Classes is on for the shop
// (Dashboard.tsx hides it otherwise). Colophon bento look: bookings.css tiles and classes.css, tokens only.
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, UserPlus, Users } from "lucide-react";
import toast from "react-hot-toast";
import { Dialog, EmptyState, ErrorState, GhostButton, IconButton, LoadingState, PageActions, PrimaryButton, SecondaryButton, StatusBadge } from "./riso/components";
import { checkInBooking, followBookings, followCourseRows, readBookingSetup, type Booking } from "./bookingsApi";
import { classCount, dayText, moneyText, paymentText, timeText, weekDays, WEEKDAYS, weekStartOf, weekText } from "./bookingsView";
import { classFigures, classTimesText, classWeek, personTag, sessionPlace, type ClassSession } from "./classesView";
import { AddToClassDialog, EMPTY_SERVICE, ServiceDialog } from "./Bookings";
import { addDays, dayOf, isClass, zonedTime, type BookingService, type BookingSettings } from "../../shared/bookingTimes";
import { shopTimeZone } from "../../shared/shopTimeZone";
import { SHOP_CURRENCY } from "./moneySign";
import "./bookings.css";
import "./classes.css";

const ZONE = shopTimeZone();
const today = () => dayOf(Date.now(), ZONE);
const startOf = (day: string) => new Date(zonedTime(day, "00:00", ZONE)).toISOString();
/** A new class starts as a group of eight on Saturday afternoons; the owner changes whatever doesn't fit. */
const NEW_CLASS: BookingService = { ...EMPTY_SERVICE, places: 8, minutes: 90, classTimes: [{ weekday: 6, time: "14:00" }] };

export function Classes() {
  const [setup, setSetup] = useState<{ services: BookingService[]; settings: BookingSettings } | null>(null);
  const [loadError, setLoadError] = useState("");
  const [monday, setMonday] = useState(() => weekStartOf(today()));
  const [rows, setRows] = useState<Booking[] | null>(null);
  const [courseRows, setCourseRows] = useState<Booking[]>([]);
  const [rowsError, setRowsError] = useState("");
  const [editing, setEditing] = useState<BookingService | null>(null);
  const [openKey, setOpenKey] = useState("");
  const [nowMs, setNowMs] = useState(() => Date.now());

  const load = () => {
    setLoadError("");
    readBookingSetup().then(({ services, settings }) => setSetup({ services, settings })).catch(() => setLoadError("Your classes couldn't be loaded just now."));
  };
  useEffect(load, []);
  useEffect(() => {
    setRows(null); setRowsError("");
    setCourseRows([]);
    // People on a course that started in an earlier week: found by the week's days.
    const stopCourses = followCourseRows(Array.from({ length: 7 }, (_, i) => addDays(monday, i)), setCourseRows, () => setRowsError("This week's course sign-ups couldn't be loaded just now."));
    const stop = followBookings(startOf(monday), startOf(addDays(monday, 7)), (list) => { setRows(list); setNowMs(Date.now()); }, () => setRowsError("This week's bookings couldn't be loaded just now."));
    return () => { stopCourses(); stop(); };
  }, [monday]);

  const classes = useMemo(() => (setup?.services || []).filter(isClass), [setup]);
  const week = useMemo(
    () => (setup ? classWeek({ services: setup.services, settings: setup.settings, rows: [...(rows || []), ...courseRows], monday, zone: ZONE, nowMs }) : []),
    [setup, rows, courseRows, monday, nowMs],
  );
  const figures = useMemo(() => classFigures(week), [week]);
  const open = week.flatMap((d) => d.sessions).find((s) => s.key === openKey) || null;
  const days = weekDays(monday);
  const now = today();
  const [phoneDay, setPhoneDay] = useState(() => (days.includes(now) ? now : monday));
  useEffect(() => { setPhoneDay(days.includes(now) ? now : monday); }, [monday]);

  if (loadError) return <ErrorState description={loadError} onRetry={load} />;
  if (!setup) return <LoadingState label="Loading your classes" />;
  const startNew = () => setEditing({ ...NEW_CLASS, order: setup.services.length });

  return (
    <div className="bkg-page cls-page">
      <PageActions>
        <PrimaryButton icon={<Plus size={16} aria-hidden />} onClick={startNew}>New class</PrimaryButton>
      </PageActions>

      <div className="bkg-beta" role="note">
        <StatusBadge tone="info" glyph={false}>Beta</StatusBadge>
        <span>Classes is new. Tell us what would make it better from Help.</span>
      </div>

      {classes.length === 0 ? (
        <EmptyState sketch="calendar" title="No classes yet" description="Add a class with its weekly times, places and price. People sign up and pay on your website."
          action={<PrimaryButton icon={<Plus size={16} aria-hidden />} onClick={startNew}>New class</PrimaryButton>} />
      ) : (
        <>
          <section className="bkg-bento cls-bento" aria-label="This week at a glance">
            <div className="bkg-tile bkg-tile-mint">
              <p className="bkg-kicker">Next class</p>
              {figures.next ? (
                <button type="button" className="bkg-next-body" onClick={() => setOpenKey(figures.next!.key)}>
                  <span className="bkg-next-when">{dayText(dayOf(Date.parse(figures.next.start), ZONE))}<span>{timeText(figures.next.start, ZONE)}</span></span>
                  <span className="bkg-next-who">{figures.next.name}</span>
                  <span className="bkg-next-what">{classCount(figures.next.people.length, figures.next.places)}{sessionPlace(figures.next) ? ` · ${sessionPlace(figures.next)}` : ""}</span>
                </button>
              ) : (
                <div className="bkg-next-body">
                  <span className="bkg-next-who">Nothing left this week</span>
                  <span className="bkg-next-what">Look at next week with the arrows below.</span>
                </div>
              )}
            </div>
            <div className="bkg-tile">
              <p className="bkg-kicker">Classes</p>
              <p className="bkg-big">{figures.sessions}</p>
              <p className="bkg-sub">in the week on show</p>
            </div>
            <div className="bkg-tile">
              <p className="bkg-kicker">Places booked</p>
              <p className="bkg-big">{figures.booked}</p>
              <p className="bkg-sub">{figures.places ? `of ${figures.places}` : "none on offer"}</p>
            </div>
          </section>

          <div className="bkg-week">
            <div className="bkg-week-head">
              <h2 className="bkg-week-title">{weekText(monday)}</h2>
              <div className="bkg-week-nav">
                <IconButton label="Previous week" onClick={() => setMonday(addDays(monday, -7))}><ChevronLeft size={18} aria-hidden /></IconButton>
                <SecondaryButton size="sm" onClick={() => setMonday(weekStartOf(now))} disabled={days.includes(now)}>This week</SecondaryButton>
                <IconButton label="Next week" onClick={() => setMonday(addDays(monday, 7))}><ChevronRight size={18} aria-hidden /></IconButton>
              </div>
            </div>
            {rowsError && <p className="bkg-error" role="alert">{rowsError}</p>}
            <div className="bkg-daypills" role="tablist" aria-label="Day">
              {week.map(({ day: d, sessions }) => (
                <button key={d} type="button" role="tab" aria-selected={phoneDay === d} className="bkg-daypill" data-today={d === now || undefined} onClick={() => setPhoneDay(d)}>
                  <span>{WEEKDAYS[new Date(`${d}T12:00:00Z`).getUTCDay()].slice(0, 3)}</span>
                  <strong>{Number(d.slice(8))}</strong>
                  {sessions.length > 0 && <i aria-label={`${sessions.length} ${sessions.length === 1 ? "class" : "classes"}`} />}
                </button>
              ))}
            </div>
            <div className="bkg-grid" aria-busy={rows === null || undefined}>
              {week.map(({ day: d, closed, sessions }) => (
                <section key={d} className="bkg-day" data-phone-shown={phoneDay === d || undefined} data-today={d === now || undefined} data-past={d < now || undefined} aria-label={dayText(d, "long")}>
                  <header className="bkg-day-head">
                    <span className="bkg-day-name">{dayText(d)}</span>
                    {closed && <span className="bkg-day-hours">Day off</span>}
                  </header>
                  {rows === null ? <div className="bkg-skeleton" aria-hidden /> : sessions.length === 0 ? (
                    <p className="bkg-day-empty">{closed ? "Closed" : "No classes"}</p>
                  ) : sessions.map((s) => (
                    <button key={s.key} type="button" className="cls-session" data-full={s.people.length >= s.places || undefined} data-past={s.past || undefined} onClick={() => setOpenKey(s.key)}>
                      <span className="bkg-slot-time">{timeText(s.start, ZONE)}</span>
                      <span className="bkg-slot-who">{s.name}</span>
                      {sessionPlace(s) && <span className="cls-session-place">{sessionPlace(s)}</span>}
                      <span className="bkg-class-count"><Users size={13} aria-hidden /> {s.people.length >= s.places ? "Full" : classCount(s.people.length, s.places)}</span>
                      <span className="bkg-class-bar" aria-hidden><i style={{ width: `${Math.min(100, Math.round((s.people.length / s.places) * 100))}%` }} /></span>
                    </button>
                  ))}
                </section>
              ))}
            </div>
          </div>

          <section className="cls-classes" aria-label="Your classes">
            <h2 className="bkg-week-title">Your classes</h2>
            <ul className="cls-list">
              {classes.map((s) => (
                <li key={s.id} className="bkg-tile cls-class" data-off={!s.active || undefined}>
                  <div className="cls-class-main">
                    <h3>{s.name}{!s.active && <StatusBadge tone="neutral">Hidden</StatusBadge>}</h3>
                    <p className="cls-class-when">{classTimesText(s)}</p>
                    <p className="cls-class-meta">{s.minutes} min · {s.places} places · {s.priceMinor > 0 ? moneyText(s.priceMinor, SHOP_CURRENCY) : "Free"}</p>
                  </div>
                  <SecondaryButton size="sm" onClick={() => setEditing(s)}>Edit</SecondaryButton>
                </li>
              ))}
            </ul>
            <p className="cls-note">Opening hours, days off, your team, rooms and reminders are on the Bookings page. They apply to classes too.</p>
          </section>
        </>
      )}

      {open && <ClassListDialog session={open} service={setup.services.find((s) => s.id === open.serviceId) || null} onClose={() => setOpenKey("")} />}
      {editing && <ServiceDialog service={editing} rooms={setup.settings.rooms} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

/** Who is in one class: tick people in as they arrive, or add someone by hand while places are left. */
function ClassListDialog({ session: s, service, onClose }: { session: ClassSession; service: BookingService | null; onClose: () => void }) {
  const [busy, setBusy] = useState("");
  const [adding, setAdding] = useState(false);
  const left = s.places - s.people.length;
  const here = s.people.filter((b) => b.checkedInAt && b.status === "confirmed").length;
  const isToday = dayOf(Date.parse(s.start), ZONE) === today();
  const check = async (b: Booking, value: boolean) => {
    setBusy(b.id);
    const r = await checkInBooking({ id: b.id, value });
    setBusy("");
    if (r.ok) toast.success(value ? `${b.customer.name} is here` : `${b.customer.name} is not checked in`);
    else toast.error(r.error);
  };
  if (adding && service) return <AddToClassDialog service={service} start={s.start} left={left} onClose={() => setAdding(false)} />;
  return (
    <Dialog open onClose={onClose} title={s.name}
      description={`${dayText(dayOf(Date.parse(s.start), ZONE), "long")}, ${timeText(s.start, ZONE)}${sessionPlace(s) ? ` · ${sessionPlace(s)}` : ""}`}
      footer={<>
        {service && left > 0 && !s.past && <GhostButton icon={<UserPlus size={16} aria-hidden />} onClick={() => setAdding(true)}>Add a person</GhostButton>}
        <SecondaryButton onClick={onClose}>Close</SecondaryButton>
      </>}>
      <div className="cls-roster">
        <p className="cls-roster-count" role="status">
          <strong>{classCount(s.people.length, s.places)}</strong>
          {isToday && s.people.length > 0 && <span>{here} of {s.people.length} here</span>}
        </p>
        {s.people.length === 0 ? <p className="bkg-day-empty">Nobody has booked this class yet.</p> : (
          <ul className="cls-people">
            {s.people.map((b) => {
              const tag = personTag(b);
              const arrived = !!b.checkedInAt && b.status === "confirmed";
              return (
                <li key={b.id} data-here={arrived || undefined}>
                  <div className="cls-person">
                    <span className="cls-person-name">{b.customer.name}{tag && <em>{tag}</em>}</span>
                    <span className="cls-person-pay">{paymentText(b)}</span>
                  </div>
                  {isToday && b.status === "confirmed" && !b.noShow && (
                    arrived
                      ? <GhostButton size="sm" busy={busy === b.id} onClick={() => void check(b, false)}>Undo</GhostButton>
                      : <SecondaryButton size="sm" busy={busy === b.id} onClick={() => void check(b, true)}>Check in</SecondaryButton>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {!isToday && s.people.length > 0 && !s.past && <p className="cls-note">You can check people in on the day of the class.</p>}
      </div>
    </Dialog>
  );
}
