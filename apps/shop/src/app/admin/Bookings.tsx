// Admin › Orders › Bookings (beta, 14 November 2026; tasks/todo/2026-11-14-bookings-beta.md). The week's bookings, the
// services customers can book and the opening hours, in the Colophon bento look (bookings.css, tokens only). Shown only
// when the platform turned Bookings on for the shop (Dashboard.tsx hides the page otherwise). Reads come from the shop's
// folder; every change goes through the server (bookingsApi.ts), which keeps two bookings from ever taking one time.
import { useEffect, useMemo, useState } from "react";
import { BellRing, CalendarPlus, DoorOpen, UserRound, UserPlus, ChevronLeft, ChevronRight, ClipboardList, Clock, Copy, Download, ExternalLink, Mail, MapPin, Plus, Printer, QrCode, Trash2, Users, Video, X } from "lucide-react";
import toast from "react-hot-toast";
import {
  Checkbox, DataTable, DestructiveButton, Dialog, Drawer, EmptyState, ErrorState, FilterBar, GhostButton, IconButton, LoadingState, PageActions, PrimaryButton,
  SaveBar, SearchField, SecondaryButton, SelectField, StatusBadge, TabPanel, Tabs, TextArea, TextField, Toggle, useConfirm,
} from "./riso/components";
import { ClientFormFacts } from "./clientForm";
import { bookingsAdmin, followBookings, readBookingSetup, readBookingsBetween, type Booking, type PackRow, type Waiting } from "./bookingsApi";
import { packLeftText, packList, packState, bookingFigures, bookingList, LIST_AHEAD_DAYS, LIST_BACK_DAYS, listRange, listTag, type ListMode, lastMonths, monthText, moneyShort, teamPay, teamPayRows, type PayLine, type BookingFigures, byDay, cardText, classCount, dayList, dayListRows, daySlots, heldPlaces, placeHolds, waitingByDay, waitingText, dayText, hoursLine, teamDay, hourLabel, moneyText, nextUp, paymentText, timeText, weekDays, WEEKDAYS, weekFigures, weekStartOf, weekText, whenFromNow } from "./bookingsView";
import { addDays, zonedTime, balanceDue, BOOKING_STEPS, cardAsk, cardTaken, dayOf, depositOf, feeChargeable, restPayable, MAX_FREE_LATE_FEE, REMINDER_HOURS, SECOND_REMINDER_HOURS, WAIT_HOLD_MINUTES, PICKUP_SLOT_MINUTES, MAX_PICKUP_PER_SLOT, cleanTipPercents, commissionOf, reviewLink, tipTaken, offersPack, MAX_PACK_VISITS, MAX_PACK_DAYS, DEFAULT_BOOKING_SETTINGS, MAX_CLASS_TIMES, MAX_COURSE_DATES, MAX_PLACES, DECIDE_HOURS, MAX_QUESTIONS, MAX_STAFF, MAX_ROOMS, staffFor, booksByPerson, runsOnline, MAX_RUN_VISITS, MAX_RUN_WEEKS, MAX_RUN_DAYS, MAX_EXTRAS, MAX_EXTRA_MINUTES, withExtras, forPerson, type BookingExtra, type BookingService, type BookingSettings, type HoursWindow, type StaffMember, type PersonRate, type BookingRoom, type IntakeForm, MAX_FORM_TEXT } from "../../shared/bookingTimes";
import { shopTimeZone } from "../../shared/shopTimeZone";
import { SHOP_CURRENCY } from "./moneySign";
import { paysOnSquare } from "../../lib/shopProfile";
import { copyText } from "./clipboard";
import { daySheetHtml, printDaySheet } from "./bookingsDaySheet";
import { toCsv } from "./spreadsheetFile";
import { qrPicture } from "./stockroom/qrCodesStore";
import { saveFile } from "./xlsxWriter";
import "./bookings.css";

type Tab = "calendar" | "services" | "packs" | "team" | "hours" | "figures" | "pay";
type CalendarView = "week" | "day" | "list";
const VIEW_KEY = "colophon.bookings.view";
const ZONE = shopTimeZone();
const today = () => dayOf(Date.now(), ZONE);
const bookPageUrl = () => new URL(`${(import.meta.env.BASE_URL || "/").replace(/\/?$/, "/")}book`, window.location.origin).toString();

export function Bookings() {
  const [tab, setTab] = useState<Tab>("calendar");
  // The empty Calendar's "Add a service" opens the form straight away, not just the tab.
  const [adding, setAdding] = useState(false);
  const [setup, setSetup] = useState<{ services: BookingService[]; settings: BookingSettings; saved: boolean } | null>(null);
  const [setupError, setSetupError] = useState("");
  const [monday, setMonday] = useState(() => weekStartOf(today()));
  const [rows, setRows] = useState<Booking[] | null>(null);
  const [upcoming, setUpcoming] = useState<Booking[]>([]);
  const [rowsError, setRowsError] = useState("");
  const [open, setOpen] = useState<Booking | null>(null);
  const [creating, setCreating] = useState(false);
  const [switching, setSwitching] = useState(false);
  // Week or list, remembered on this computer.
  const [view, setView] = useState<CalendarView>(() => { try { const v = localStorage.getItem(VIEW_KEY); return v === "list" || v === "day" ? v : "week"; } catch { return "week"; } });
  // The team's day: one column per person (shown once the shop lists people). Moving it to another week moves the week.
  const [teamDayShown, setTeamDayShown] = useState(today);
  const showDay = (d: string) => { setTeamDayShown(d); if (weekStartOf(d) !== monday) setMonday(weekStartOf(d)); };
  const pickView = (v: CalendarView) => { setView(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* private window: not remembered */ } };

  const reloadSetup = () => readBookingSetup().then((s) => { setSetup(s); setSetupError(""); }).catch((e) => setSetupError(e?.message || "Couldn't load your bookings."));
  useEffect(() => { void reloadSetup(); }, []);
  useEffect(() => {
    setRows(null);
    const from = new Date(Date.parse(`${monday}T00:00:00Z`) - 14 * 3600_000).toISOString();
    const to = new Date(Date.parse(`${addDays(monday, 7)}T00:00:00Z`) + 14 * 3600_000).toISOString();
    return followBookings(from, to, (r) => { setRows(r); setRowsError(""); }, (e) => setRowsError(e.message || "Couldn't load bookings."));
  }, [monday]);
  // The Next up tile looks past the week shown: the next two weeks from now.
  useEffect(() => followBookings(new Date(Date.now() - 4 * 3600_000).toISOString(), new Date(Date.now() + 15 * 86_400_000).toISOString(), setUpcoming, () => setUpcoming([])), []);
  // Keep the open booking in step with live changes.
  useEffect(() => { if (open && rows) { const fresh = rows.find((r) => r.id === open.id); if (fresh && fresh !== open) setOpen(fresh); } }, [rows]);

  if (setupError) return <ErrorState title="Bookings couldn't be opened" description={setupError} onRetry={() => void reloadSetup()} />;
  if (!setup) return <LoadingState label="Opening bookings…" />;

  const weekRows = (rows || []).filter((b) => { const d = dayOf(Date.parse(b.start), ZONE); return d >= monday && d <= addDays(monday, 6); });
  const figures = weekFigures(weekRows);
  // The figures follow the week on show, so say which week that is.
  const thisWeek = monday === weekStartOf(today());
  const weekLabel = thisWeek ? "This week" : `Week of ${dayText(monday)}`;
  const next = nextUp(upcoming, Date.now());
  const noServices = setup.services.length === 0;
  const live = setup.settings.live;
  const hasTeam = booksByPerson(setup.settings);
  const shownView: CalendarView = view === "day" && !hasTeam ? "week" : view;
  // The Packs tab shows once any service sells a pack of visits (or did: a pack stays on the service until it is taken off).
  const sellsPacks = setup.services.some((s) => (s.packVisits || 0) > 0);
  // The owner's on/off switch: one tap, saved at once, nothing else about the hours changes.
  const setLive = async (next: boolean) => {
    setSwitching(true);
    setSetup({ ...setup, settings: { ...setup.settings, live: next } });
    try {
      await bookingsAdmin("setLive", { live: next });
      toast.success(next ? "Bookings are on" : "Bookings are off");
    } catch (e: any) {
      setSetup({ ...setup, settings: { ...setup.settings, live: !next } });
      toast.error(e?.message || "That didn't save. Please try again.");
    } finally { setSwitching(false); }
  };

  return (
    <div className="bkg-page">
      <PageActions>
        <PrimaryButton icon={<CalendarPlus size={16} aria-hidden />} onClick={() => setCreating(true)} disabled={noServices}>New booking</PrimaryButton>
      </PageActions>

      <div className="bkg-beta" role="note">
        <StatusBadge tone="info" glyph={false}>Beta</StatusBadge>
        <span>Bookings is new. Tell us what would make it better from Help.</span>
      </div>

      <section className="bkg-bento" aria-label="At a glance">
        <div className="bkg-tile bkg-tile-mint bkg-next">
          <p className="bkg-kicker">Next up</p>
          {next ? (
            <button type="button" className="bkg-next-body" onClick={() => setOpen(next)}>
              <span className="bkg-next-when">{timeText(next.start, ZONE)} <span>{whenFromNow(next, Date.now(), ZONE)}</span></span>
              <span className="bkg-next-who">{next.customer.name}</span>
              <span className="bkg-next-what">{next.serviceName} · {next.minutes} min</span>
            </button>
          ) : (
            <div className="bkg-next-body">
              <span className="bkg-next-who">Nothing booked yet</span>
              <span className="bkg-next-what">{!setup.services.length ? "Add what customers can book under Services." : setup.settings.live ? "New bookings show here the moment they're made." : "Turn Bookings on to start taking them."}</span>
            </div>
          )}
        </div>
        <div className="bkg-tile bkg-figure">
          <p className="bkg-kicker">{weekLabel}</p>
          <p className="bkg-big">{figures.count}</p>
          <p className="bkg-sub">{figures.count === 1 ? "booking" : "bookings"} · {figures.hours} h</p>
        </div>
        <div className="bkg-tile bkg-figure">
          <p className="bkg-kicker">Taken by card</p>
          <p className="bkg-big bkg-big-money">{moneyText(figures.takenMinor, SHOP_CURRENCY)}</p>
          <p className="bkg-sub">{thisWeek ? "this week" : weekLabel.toLowerCase()}</p>
        </div>
        <div className="bkg-tile bkg-tile-ink bkg-pagecard" data-live={live || undefined}>
          <div className="bkg-switch-row">
            <p className="bkg-kicker">Bookings</p>
            <Toggle label={live ? "On" : "Off"} checked={live} disabled={switching || (noServices && !live)} onChange={(v) => void setLive(v)} />
          </div>
          <p className="bkg-page-state">{live ? "Taking bookings" : "Not taking bookings"}</p>
          <p className="bkg-page-note">{noServices && !live ? "Add a service to turn this on." : live ? "Your website shows Book a time." : "Hidden from your website. Bookings already made stay."}</p>
          <div className="bkg-pill-row">
            <button type="button" className="bkg-pill" onClick={() => void copyText(bookPageUrl(), "Link")}><Copy size={14} aria-hidden /> Copy link</button>
            <a className="bkg-pill" href={bookPageUrl()} target="_blank" rel="noreferrer"><ExternalLink size={14} aria-hidden /> View</a>
          </div>
        </div>
      </section>

      <Tabs<Tab> label="Bookings" variant="page" value={tab} onChange={setTab}
        tabs={[{ id: "calendar", label: "Calendar" }, { id: "services", label: "Services", count: setup.services.length },
          ...(sellsPacks ? [{ id: "packs" as const, label: "Packs" }] : []),
          { id: "team", label: "Team & rooms", ...(setup.settings.staff.length ? { count: setup.settings.staff.filter((p) => p.active).length } : {}) }, { id: "hours", label: "Hours & rules" }, { id: "figures", label: "Figures" },
          ...(setup.settings.staff.length ? [{ id: "pay" as const, label: "Team pay" }] : [])]} />

      <TabPanel tabId="calendar" active={tab === "calendar"}>
        {noServices ? (
          <EmptyState title="Add what customers can book" description="A studio visit, a class for one, a portfolio review: give it a length and a price, then turn on your bookings page."
            action={<PrimaryButton icon={<Plus size={16} aria-hidden />} onClick={() => { setAdding(true); setTab("services"); }}>Add a service</PrimaryButton>} />
        ) : (<>
          <div className="bkg-view-switch">
            <Tabs<CalendarView> label="Show bookings as" idPrefix="bkg-view-" value={shownView} onChange={pickView}
              tabs={[{ id: "week", label: "Week" }, ...(hasTeam ? [{ id: "day" as const, label: "Team day" }] : []), { id: "list", label: "List" }]} />
          </div>
          {shownView === "week"
            ? <WeekView monday={monday} setMonday={setMonday} rows={rows} error={rowsError} settings={setup.settings} services={setup.services} onOpen={setOpen} />
            : shownView === "day"
              ? <TeamDayView day={teamDayShown} setDay={showDay} rows={rows} error={rowsError} settings={setup.settings} onOpen={setOpen} />
              : <ListView services={setup.services} onOpen={setOpen} />}
        </>)}
      </TabPanel>
      <TabPanel tabId="services" active={tab === "services"}>
        <ServicesPanel services={setup.services} rooms={setup.settings.rooms} onChanged={reloadSetup} startAdding={adding} onStarted={() => setAdding(false)} />
      </TabPanel>
      {sellsPacks && (
        <TabPanel tabId="packs" active={tab === "packs"}>
          {tab === "packs" && <PacksPanel />}
        </TabPanel>
      )}
      <TabPanel tabId="team" active={tab === "team"}>
        <TeamPanel settings={setup.settings} services={setup.services} onSaved={reloadSetup} />
      </TabPanel>
      <TabPanel tabId="figures" active={tab === "figures"}>
        {tab === "figures" && <FiguresPanel />}
      </TabPanel>
      {setup.settings.staff.length > 0 && (
        <TabPanel tabId="pay" active={tab === "pay"}>
          {tab === "pay" && <PayPanel staff={setup.settings.staff} onEditTeam={() => setTab("team")} />}
        </TabPanel>
      )}
      <TabPanel tabId="hours" active={tab === "hours"}>
        <HoursPanel settings={setup.settings} services={setup.services} saved={setup.saved} onSaved={reloadSetup} active={tab === "hours"} />
      </TabPanel>

      {open && <BookingDrawer booking={open} services={setup.services} settings={setup.settings} onClose={() => setOpen(null)} />}
      {creating && <NewBookingDialog services={setup.services} settings={setup.settings} onClose={() => setCreating(false)} />}
    </div>
  );
}

// ── Calendar ────────────────────────────────────────────────────────────────────────────────────────────────────────

function WeekView({ monday, setMonday, rows, error, settings, services, onOpen }: {
  monday: string; setMonday: (d: string) => void; rows: Booking[] | null; error: string; settings: BookingSettings; services: BookingService[]; onOpen: (b: Booking) => void;
}) {
  const serviceOf = (serviceId: string) => services.find((s) => s.id === serviceId);
  const placesOf = (serviceId: string) => serviceOf(serviceId)?.places || 1;
  const days = weekDays(monday);
  const groups = useMemo(() => byDay(rows || [], ZONE), [rows]);
  const now = today();
  const [phoneDay, setPhoneDay] = useState(() => (days.includes(now) ? now : monday));
  useEffect(() => { setPhoneDay(days.includes(now) ? now : monday); }, [monday]);
  // The waiting list for the week on show. Read again whenever the bookings change, because a freed place empties it.
  const [waiting, setWaiting] = useState<Waiting[]>([]);
  const [waitingDay, setWaitingDay] = useState("");
  const [listDay, setListDay] = useState("");
  const [joining, setJoining] = useState<{ service: BookingService; start: string; left: number } | null>(null);
  useEffect(() => {
    let stale = false;
    bookingsAdmin<{ waiting?: Waiting[] }>("waitlist", { from: monday, to: addDays(monday, 6) })
      .then((answer) => { if (!stale) setWaiting(answer.waiting || []); })
      .catch(() => { if (!stale) setWaiting([]); });
    return () => { stale = true; };
  }, [monday, rows]);
  const waitingDays = useMemo(() => waitingByDay(waiting), [waiting]);
  return (
    <div className="bkg-week">
      <div className="bkg-week-head">
        <h2 className="bkg-week-title">{weekText(monday)}</h2>
        <div className="bkg-week-nav">
          <IconButton label="Previous week" onClick={() => setMonday(addDays(monday, -7))}><ChevronLeft size={18} aria-hidden /></IconButton>
          <SecondaryButton size="sm" onClick={() => setMonday(weekStartOf(now))} disabled={days.includes(now)}>This week</SecondaryButton>
          <IconButton label="Next week" onClick={() => setMonday(addDays(monday, 7))}><ChevronRight size={18} aria-hidden /></IconButton>
        </div>
      </div>
      {error && <p className="bkg-error" role="alert">{error}</p>}
      <div className="bkg-daypills" role="tablist" aria-label="Day">
        {days.map((d) => (
          <button key={d} type="button" role="tab" aria-selected={phoneDay === d} className="bkg-daypill" data-today={d === now || undefined} onClick={() => setPhoneDay(d)}>
            <span>{WEEKDAYS[new Date(`${d}T12:00:00Z`).getUTCDay()].slice(0, 3)}</span>
            <strong>{Number(d.slice(8))}</strong>
            {(groups.get(d)?.length || 0) > 0 && <i aria-label={`${groups.get(d)!.length} booked`} />}
          </button>
        ))}
      </div>
      <div className="bkg-grid" aria-busy={rows === null || undefined}>
        {days.map((d) => {
          const list = groups.get(d) || [];
          const wd = new Date(`${d}T12:00:00Z`).getUTCDay();
          const closed = settings.daysOff.includes(d) || settings.hours[wd].length === 0;
          const slots = daySlots(list, placesOf);
          // Places held for the waiting list: inside their class card, or a row of their own.
          const holds = placeHolds(heldPlaces(waitingDays.get(d) || []), slots.flatMap((s) => (s.kind === "class" ? [{ serviceId: s.serviceId, start: s.start }] : [])));
          return (
            <section key={d} className="bkg-day" data-phone-shown={phoneDay === d || undefined} data-today={d === now || undefined} data-past={d < now || undefined} aria-label={dayText(d, "long")}>
              <header className="bkg-day-head">
                <span className="bkg-day-name">{dayText(d)}</span>
                <span className="bkg-day-hours">{settings.daysOff.includes(d) ? "Day off" : hoursLine(settings.hours[wd])}</span>
                {list.length > 0 && <IconButton label={`Who's coming on ${dayText(d, "long")}`} onClick={() => setListDay(d)}><ClipboardList size={16} aria-hidden /></IconButton>}
              </header>
              {rows === null ? <div className="bkg-skeleton" aria-hidden /> : list.length === 0 ? (
                !holds.loose.length && <p className="bkg-day-empty">{closed ? "Closed" : "Nothing booked"}</p>
              ) : slots.map((slot) => { const held = slot.kind === "class" ? holds.inClass(slot.serviceId, slot.start) : []; return slot.kind === "class" ? (
                <div key={slot.key} className="bkg-class" data-full={slot.people.length + held.length >= slot.places || undefined}>
                  <span className="bkg-slot-time">{timeText(slot.start, ZONE)}</span>
                  <span className="bkg-slot-who">{slot.serviceName}</span>
                  <span className="bkg-class-count"><Users size={13} aria-hidden /> {classCount(slot.people.length, slot.places)}</span>
                  <span className="bkg-class-bar" aria-hidden><i style={{ width: `${Math.min(100, Math.round((slot.people.length / slot.places) * 100))}%` }} /></span>
                  <ul className="bkg-class-people">
                    {slot.people.map((b) => (
                      <li key={b.id}>
                        <button type="button" data-status={b.status} data-noshow={b.noShow || undefined} onClick={() => onOpen(b)}>
                          {b.customer.name}{b.status === "held" ? <em>{b.clearing ? "clearing" : "paying"}</em> : b.noShow ? <em>no-show</em> : b.checkedInAt && b.status === "confirmed" ? <em>here</em> : null}
                        </button>
                      </li>
                    ))}
                    {held.map((h) => (
                      <li key={h.id}>
                        <button type="button" data-status="offer" aria-label={`${h.name}, place held from the waiting list until ${timeText(h.heldUntil, ZONE)}`} onClick={() => setWaitingDay(d)}>
                          {h.name}<em>held until {timeText(h.heldUntil, ZONE)}</em>
                        </button>
                      </li>
                    ))}
                  </ul>
                  {slot.people.length + held.length < slot.places && Date.parse(slot.start) > Date.now() && serviceOf(slot.serviceId) && (
                    <GhostButton size="sm" icon={<UserPlus size={14} aria-hidden />} onClick={() => setJoining({ service: serviceOf(slot.serviceId)!, start: slot.start, left: slot.places - slot.people.length - held.length })}>Add a person</GhostButton>
                  )}
                </div>
              ) : (
                <button key={slot.booking.id} type="button" className="bkg-slot" data-status={slot.booking.status} data-noshow={slot.booking.noShow || undefined} onClick={() => onOpen(slot.booking)}>
                  <span className="bkg-slot-time">{timeText(slot.booking.start, ZONE)}</span>
                  <span className="bkg-slot-who">{slot.booking.customer.name}</span>
                  <span className="bkg-slot-what">{slot.booking.serviceName}{slot.booking.staffName ? ` · ${slot.booking.staffName}` : ""}</span>
                  {slot.booking.status === "held" && <span className="bkg-slot-tag">{slot.booking.clearing ? "Payment clearing" : "Paying now"}</span>}
                  {slot.booking.noShow && <span className="bkg-slot-tag">No-show</span>}
                  {!slot.booking.noShow && slot.booking.checkedInAt && slot.booking.status === "confirmed" && <span className="bkg-slot-tag" data-here>Here</span>}
                </button>
              ); })}
              {rows !== null && holds.loose.map((h) => (
                <button key={h.id} type="button" className="bkg-slot" data-status="offer" onClick={() => setWaitingDay(d)}>
                  <span className="bkg-slot-time">{timeText(h.heldStart, ZONE)}</span>
                  <span className="bkg-slot-who">{h.name}</span>
                  <span className="bkg-slot-what">{h.serviceName}</span>
                  <span className="bkg-slot-tag">Held from the waiting list until {timeText(h.heldUntil, ZONE)}</span>
                </button>
              ))}
              {(waitingDays.get(d)?.length || 0) > 0 && (
                <button type="button" className="bkg-waiting" onClick={() => setWaitingDay(d)}>
                  <BellRing size={13} aria-hidden /> {waitingText(waitingDays.get(d)!.length)}
                </button>
              )}
            </section>
          );
        })}
      </div>
      {joining && <AddToClassDialog {...joining} onClose={() => setJoining(null)} />}
      {listDay && <DayListDialog day={listDay} list={groups.get(listDay) || []} onClose={() => setListDay("")} onOpen={(b) => { setListDay(""); onOpen(b); }} />}
      {waitingDay && (
        <WaitingDialog day={waitingDay} list={waitingDays.get(waitingDay) || []} onClose={() => setWaitingDay("")}
          onRemoved={(id) => setWaiting((all) => all.filter((w) => w.id !== id))} />
      )}
    </div>
  );
}

/**
 * The team's day (Services plan phase 4 part 2): one column per person across the opening hours, each booking placed by
 * its time, a person who isn't working that day shaded, and the bookings that name nobody in a column of their own.
 */
function TeamDayView({ day, setDay, rows, error, settings, onOpen }: {
  day: string; setDay: (d: string) => void; rows: Booking[] | null; error: string; settings: BookingSettings; onOpen: (b: Booking) => void;
}) {
  const t = useMemo(() => teamDay(rows || [], settings, day, ZONE), [rows, settings, day]);
  const now = today();
  const span = t.endMin - t.startMin;
  const hours = Array.from({ length: span / 60 }, (_, i) => t.startMin + i * 60);
  // The red line for now, on today only.
  const [nowMin, setNowMin] = useState(() => Math.round((Date.now() - zonedTime(day, "00:00", ZONE)) / 60_000));
  useEffect(() => {
    const tick = () => setNowMin(Math.round((Date.now() - zonedTime(day, "00:00", ZONE)) / 60_000));
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [day]);
  const showNow = day === now && nowMin >= t.startMin && nowMin <= t.endMin;
  const at = (min: number) => `calc(var(--bkg-min) * ${min})`;
  return (
    <div className="bkg-tday">
      <div className="bkg-week-head">
        <h2 className="bkg-week-title">{dayText(day, "long")}</h2>
        <div className="bkg-week-nav">
          <IconButton label="Previous day" onClick={() => setDay(addDays(day, -1))}><ChevronLeft size={18} aria-hidden /></IconButton>
          <SecondaryButton size="sm" onClick={() => setDay(now)} disabled={day === now}>Today</SecondaryButton>
          <IconButton label="Next day" onClick={() => setDay(addDays(day, 1))}><ChevronRight size={18} aria-hidden /></IconButton>
        </div>
      </div>
      {error && <p className="bkg-error" role="alert">{error}</p>}
      {rows === null ? <div className="bkg-skeleton" aria-hidden /> : (
        <div className="bkg-tday-scroll">
          <div className="bkg-tday-grid" style={{ ["--bkg-cols" as string]: t.columns.length }}>
            <div className="bkg-tday-corner" aria-hidden>{t.count ? `${t.count} booked` : "Nothing booked"}</div>
            {t.columns.map((c) => (
              <div key={c.id || "nobody"} className="bkg-tday-head" data-off={c.off || undefined} data-nobody={c.id === "" || undefined}>
                <span className="bkg-tday-name">{c.name}</span>
                <span className="bkg-tday-hours">{c.id === "" ? "Pick someone in each booking" : c.off ? "Not working" : hoursLine(c.hours)}</span>
              </div>
            ))}
            <div className="bkg-tday-times" aria-hidden style={{ height: at(span) }}>
              {hours.map((h) => <span key={h} style={{ top: at(h - t.startMin) }}>{hourLabel(h)}</span>)}
            </div>
            {t.columns.map((c) => (
              <section key={c.id || "nobody"} className="bkg-tday-col" aria-label={`${c.name}: ${c.blocks.length ? `${c.blocks.length} booked` : c.off ? "not working" : "nothing booked"}`}
                data-off={c.off || undefined} data-nobody={c.id === "" || undefined} style={{ height: at(span) }}>
                {!c.off && c.id !== "" && c.hours.map((w) => (
                  <i key={w.start} className="bkg-tday-open" aria-hidden style={{ top: at(Math.max(0, minutesText(w.start) - t.startMin)), height: at(minutesText(w.end) - Math.max(t.startMin, minutesText(w.start))) }} />
                ))}
                {c.blocks.map((blk) => {
                  const first = blk.people[0];
                  const many = blk.people.length > 1;
                  return (
                    <button key={blk.key} type="button" className="bkg-tday-block" data-status={first.status} data-noshow={(!many && first.noShow) || undefined} data-short={blk.height < 45 || undefined}
                      style={{ top: at(blk.top), height: at(blk.height), left: `calc(${(blk.lane / blk.lanes) * 100}% + 3px)`, width: `calc(${100 / blk.lanes}% - 6px)` }}
                      aria-label={`${timeText(blk.start, ZONE)}, ${many ? `${blk.serviceName}, ${blk.people.length} people` : `${first.customer.name}, ${blk.serviceName}`}`}
                      onClick={() => onOpen(first)}>
                      <span className="bkg-slot-time">{timeText(blk.start, ZONE)}</span>
                      <span className="bkg-slot-who">{many ? `${blk.serviceName} · ${blk.people.length}` : first.customer.name}</span>
                      {!many && <span className="bkg-slot-what">{blk.serviceName}{first.roomName ? ` · ${first.roomName}` : ""}</span>}
                      {!many && first.status === "held" && <span className="bkg-slot-tag">{first.clearing ? "Clearing" : "Paying"}</span>}
                      {!many && !first.noShow && first.checkedInAt && first.status === "confirmed" && <span className="bkg-slot-tag" data-here>Here</span>}
                    </button>
                  );
                })}
                {showNow && <i className="bkg-tday-now" aria-hidden style={{ top: at(nowMin - t.startMin) }} />}
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const minutesText = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + (m || 0); };

/** Every booking as one list: still to come, past or cancelled, with a search and a service filter. */
function ListView({ services, onOpen }: { services: BookingService[]; onOpen: (b: Booking) => void }) {
  const [mode, setMode] = useState<ListMode>("upcoming");
  const [query, setQuery] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [rows, setRows] = useState<Booking[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    setRows(null);
    const { from, to } = listRange(mode, Date.now());
    return followBookings(from, to, (r) => { setRows(r); setError(""); }, (e) => setError(e.message || "Couldn't load bookings."));
  }, [mode]);
  const days = useMemo(() => bookingList(rows || [], { mode, query, serviceId, nowMs: Date.now(), zone: ZONE }), [rows, mode, query, serviceId]);
  const count = days.reduce((n, d) => n + d.rows.length, 0);
  const now = today();
  const filtered = !!query.trim() || !!serviceId;
  const span = mode === "upcoming" ? `the next ${LIST_AHEAD_DAYS} days` : mode === "past" ? `the last ${LIST_BACK_DAYS} days` : `the last ${LIST_BACK_DAYS} days and the next ${LIST_AHEAD_DAYS}`;
  return (
    <div className="bkg-list">
      <FilterBar>
        <div className="rp-grow"><SearchField label="Find a booking" placeholder="Name, email, phone or service" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
        <SelectField label="Which bookings" hideLabel value={mode} onChange={(e) => setMode(e.target.value as ListMode)}>
          <option value="upcoming">Coming up</option>
          <option value="past">Past</option>
          <option value="cancelled">Cancelled</option>
        </SelectField>
        {services.length > 1 && (
          <SelectField label="Service" hideLabel value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
            <option value="">All services</option>
            {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </SelectField>
        )}
        {filtered && <GhostButton onClick={() => { setQuery(""); setServiceId(""); }}>Clear</GhostButton>}
      </FilterBar>
      {error && <p className="bkg-error" role="alert">{error}</p>}
      {rows === null ? <div className="bkg-skeleton" aria-hidden /> : (
        <>
          <p className="bkg-list-count" aria-live="polite">{count === 0 ? "" : `${count} ${count === 1 ? "booking" : "bookings"} in ${span}`}</p>
          {days.length === 0 ? (
            <EmptyState inline title={filtered ? "No bookings match" : mode === "upcoming" ? "Nothing coming up" : mode === "past" ? "No past bookings yet" : "Nothing cancelled"}
              description={filtered ? "Try another name, or clear the search." : `This list covers ${span}.`}
              action={filtered ? <SecondaryButton onClick={() => { setQuery(""); setServiceId(""); }}>Clear search</SecondaryButton> : undefined} />
          ) : days.map((d) => (
            <section key={d.day} className="bkg-list-day" aria-label={dayText(d.day, "long")}>
              <h3 className="bkg-list-dayname" data-today={d.day === now || undefined}>
                {d.day === now ? "Today" : d.day === addDays(now, 1) ? "Tomorrow" : d.day === addDays(now, -1) ? "Yesterday" : dayText(d.day, "long")}
                <span>{d.rows.length}</span>
              </h3>
              <ul>
                {d.rows.map((b) => { const tag = listTag(b); return (
                  <li key={b.id}>
                    <button type="button" className="bkg-list-row" data-status={b.status} data-noshow={b.noShow || undefined} onClick={() => onOpen(b)}>
                      <span className="bkg-list-time">{timeText(b.start, ZONE)}</span>
                      <span className="bkg-list-who">{b.customer.name}<small>{b.customer.email}</small></span>
                      <span className="bkg-list-what">{b.serviceName}<small>{b.minutes} min</small></span>
                      <span className="bkg-list-pay">{paymentText(b)}</span>
                      {tag ? <StatusBadge tone={tag === "Cancelled" || tag === "No-show" ? "danger" : "warning"}>{tag}</StatusBadge> : <span aria-hidden />}
                    </button>
                  </li>
                ); })}
              </ul>
            </section>
          ))}
        </>
      )}
    </div>
  );
}

/** Who is coming on one day, for the door: read it here, print it, or take it as a spreadsheet. */
function DayListDialog({ day, list, onClose, onOpen }: { day: string; list: Booking[]; onClose: () => void; onOpen: (b: Booking) => void }) {
  const groups = useMemo(() => dayList(list, ZONE), [list]);
  const count = groups.reduce((n, g) => n + g.people.length, 0);
  const title = `Who's coming · ${dayText(day, "long")}`;
  return (
    <Dialog open onClose={onClose} title={title} description={`${count} ${count === 1 ? "person" : "people"}, in time order, with what they told you when they booked.`}
      footer={<>
        <SecondaryButton icon={<Download size={16} aria-hidden />} onClick={() => saveFile(`bookings-${day}.csv`, `\uFEFF${toCsv(dayListRows(groups))}`, "text/csv;charset=utf-8")}>Spreadsheet</SecondaryButton>
        <PrimaryButton icon={<Printer size={16} aria-hidden />} onClick={() => printDaySheet(daySheetHtml(groups, { title }))}>Print</PrimaryButton>
      </>}>
      {groups.length === 0 ? <p className="bkg-day-empty">Nobody is booked now.</p> : (
        <div className="bkg-daylist">
          {groups.map((g) => (
            <section key={g.key}>
              <h3><span>{g.time}</span>{g.serviceName}{g.people.length > 1 && <em>{g.people.length} people</em>}</h3>
              <ul>
                {g.people.map((p) => (
                  <li key={p.id}>
                    <button type="button" className="bkg-daylist-name" onClick={() => { const b = list.find((x) => x.id === p.id); if (b) onOpen(b); }}>{p.name}</button>
                    {p.tag && <StatusBadge tone="warning">{p.tag}</StatusBadge>}
                    <span className="bkg-daylist-contact">{[p.phone, p.email].filter(Boolean).join(" · ")}</span>
                    <span className="bkg-daylist-pay">{p.payment}</span>
                    {p.note && <p>{p.note}</p>}
                    {p.answers.map((a) => <p key={a.label}><strong>{a.label}</strong> {a.answer}</p>)}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Dialog>
  );
}

/** Who asked to hear when a day or a full class has room again. They are emailed by the shop itself, once. */
function WaitingDialog({ day, list, onClose, onRemoved }: { day: string; list: Waiting[]; onClose: () => void; onRemoved: (id: string) => void }) {
  const [removing, setRemoving] = useState("");
  const remove = async (w: Waiting) => {
    setRemoving(w.id);
    try { await bookingsAdmin("removeWaiting", { id: w.id }); onRemoved(w.id); toast.success(`${w.name} is off the waiting list`); }
    catch (e: any) { toast.error(e?.message || "That didn't save. Please try again."); }
    finally { setRemoving(""); }
  };
  return (
    <Dialog open onClose={onClose} title={`Waiting list · ${dayText(day, "long")}`} description="When a place opens, it is held for the first person in line and emailed to them. If they don't book it in time, it goes to the next. Set how long under Hours & rules."
      footer={<SecondaryButton onClick={onClose}>Done</SecondaryButton>}>
      {list.length === 0 ? <p className="bkg-day-empty">Nobody is waiting now.</p> : (
        <ul className="bkg-waitlist">
          {list.map((w) => (
            <li key={w.id}>
              <div>
                <strong>{w.name}</strong>
                <a href={`mailto:${w.email}`}>{w.email}</a>
                <span>{w.serviceName} · {w.start ? timeText(w.start, ZONE) : "any time"}</span>
                {w.heldUntil && <StatusBadge tone="warning">Place held until {timeText(w.heldUntil, ZONE)}</StatusBadge>}
              </div>
              <IconButton label={`Remove ${w.name}`} disabled={removing === w.id} onClick={() => void remove(w)}><X size={16} aria-hidden /></IconButton>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

// ── Figures ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Every pack of visits sold: who has visits left, which ones run out soon, and Close (with a refund) for one. */
function PacksPanel() {
  const [rows, setRows] = useState<PackRow[] | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [closing, setClosing] = useState<PackRow | null>(null);
  const load = () => bookingsAdmin<{ packs: PackRow[] }>("packs").then((a) => { setRows(a.packs || []); setError(""); }).catch((e) => setError(e?.message || "Packs couldn't be loaded."));
  useEffect(() => { void load(); }, []);
  const now = today();
  const list = useMemo(() => packList(rows || [], { query, today: now }), [rows, query, now]);
  const openCount = (rows || []).filter((p) => packState(p, now).tone !== "neutral").length;
  const visitsLeft = (rows || []).filter((p) => packState(p, now).tone !== "neutral").reduce((n, p) => n + Math.max(0, p.left), 0);
  if (error && !rows) return <ErrorState title="Packs couldn't be opened" description={error} onRetry={() => void load()} />;
  if (!rows) return <div className="bkg-skeleton" aria-hidden />;
  if (!rows.length) return <EmptyState title="No packs sold yet" description="Packs show here once a customer buys one from your bookings page." />;
  return (
    <div className="bkg-list bkg-packs">
      <p className="bkg-list-count">{openCount} open {openCount === 1 ? "pack" : "packs"} · {visitsLeft} {visitsLeft === 1 ? "visit" : "visits"} still to book</p>
      {rows.length > 6 && <FilterBar><div className="rp-grow"><SearchField label="Find a pack" placeholder="Name, email or the code's last four" value={query} onChange={(e) => setQuery(e.target.value)} /></div></FilterBar>}
      {list.length === 0 ? <EmptyState inline title="No packs match" description="Try another name, or clear the search." /> : (
        <ul className="bkg-list-day bkg-pack-rows">
          {list.map((p) => { const state = packState(p, now); return (
            <li key={p.id} className="bkg-pack-row" data-ended={state.tone === "neutral" || undefined}>
              <span className="bkg-list-who">{p.name || p.email}<small>{p.email} · ending {p.last4}</small></span>
              <span className="bkg-list-what">{p.serviceName}<small>{moneyText(p.priceMinor, p.currency)}{p.refundMinor ? `, ${moneyText(p.refundMinor, p.currency)} refunded` : ""}</small></span>
              <span className="bkg-pack-left">
                <strong>{packLeftText(p)}</strong>
                <span className="bkg-pack-meter" aria-hidden>{Array.from({ length: p.visits }, (_, i) => <i key={i} data-used={i >= p.left || undefined} />)}</span>
                <small>{p.expiresOn ? `Book by ${new Date(`${p.expiresOn}T12:00:00Z`).toLocaleDateString(undefined, { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" })}` : "No end date"}</small>
              </span>
              <StatusBadge tone={state.tone}>{state.label}</StatusBadge>
              {p.status === "active" && p.left > 0 ? <GhostButton onClick={() => setClosing(p)}>Close</GhostButton> : <span aria-hidden />}
            </li>
          ); })}
        </ul>
      )}
      {closing && <ClosePackDialog pack={closing} onClose={() => setClosing(null)} onClosed={() => { setClosing(null); void load(); }} />}
    </div>
  );
}

/** End a pack so no more visits can be booked with it, refunding all, part or none of it. Visits already booked stay. */
function ClosePackDialog({ pack: p, onClose, onClosed }: { pack: PackRow; onClose: () => void; onClosed: () => void }) {
  // A fair refund to suggest: the share of the visits not used yet.
  const unused = Math.round((p.priceMinor * Math.max(0, p.left)) / Math.max(1, p.visits));
  const [choice, setChoice] = useState<"unused" | "part" | "none">(unused > 0 ? "unused" : "none");
  const [part, setPart] = useState("");
  const [problem, setProblem] = useState("");
  const [saving, setSaving] = useState(false);
  const partMinor = Math.round(Number(part) * 100);
  const partProblem = choice !== "part" ? "" : !part || !Number.isFinite(partMinor) || partMinor <= 0 ? "Type how much to refund." : partMinor > p.priceMinor ? `Up to ${moneyText(p.priceMinor, p.currency)}.` : "";
  const refundMinor = choice === "unused" ? unused : choice === "none" ? 0 : partMinor;
  const save = async () => {
    setSaving(true); setProblem("");
    try {
      await bookingsAdmin("packClose", { id: p.id, refundMinor });
      toast.success(refundMinor ? `Pack closed, ${moneyText(refundMinor, p.currency)} refunded` : "Pack closed");
      onClosed();
    } catch (e: any) { setProblem(e?.message || "That didn't save. Please try again."); } finally { setSaving(false); }
  };
  const options = [
    ...(unused > 0 ? [{ id: "unused" as const, label: "Refund unused visits", note: moneyText(unused, p.currency) }] : []),
    { id: "part" as const, label: "Refund an amount", note: `Up to ${moneyText(p.priceMinor, p.currency)}` },
    { id: "none" as const, label: "No refund", note: "Close it only" },
  ];
  return (
    <Dialog open onClose={onClose} title="Close this pack?" description={`${p.name || p.email} has ${packLeftText(p)}. Once closed, the code books nothing more. Visits already booked stay booked.`}
      footer={<><SecondaryButton onClick={onClose}>Keep it open</SecondaryButton><DestructiveButton onClick={() => void save()} busy={saving} disabled={!!partProblem}>{refundMinor > 0 ? `Close and refund ${moneyText(refundMinor, p.currency)}` : "Close pack"}</DestructiveButton></>}>
      <div className="bkg-form">
        <fieldset className="bkg-refund">
          <legend>Refund</legend>
          {options.map((o) => (
            <button key={o.id} type="button" className="bkg-refund-choice" aria-pressed={choice === o.id} onClick={() => setChoice(o.id)}>
              <strong>{o.label}</strong><span>{o.note}</span>
            </button>
          ))}
        </fieldset>
        {choice === "part" && (
          <TextField label={`Amount to refund (${p.currency})`} inputMode="decimal" placeholder="0.00" autoFocus
            value={part} onChange={(e) => setPart(e.target.value.replace(/[^\d.]/g, ""))} error={part ? partProblem || undefined : undefined} />
        )}
        {problem && <p className="bkg-error" role="alert">{problem}</p>}
      </div>
    </Dialog>
  );
}

const FIGURE_MONTHS = 6;

/** The last six months at a glance: bookings and money month by month, the busiest days, the most booked services. */
function FiguresPanel() {
  const [figures, setFigures] = useState<BookingFigures | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let stale = false;
    setFigures(null); setError("");
    const months = lastMonths(today(), FIGURE_MONTHS);
    // A day's slack either side covers every time zone; each booking is then placed by its own day in the shop's zone.
    const from = new Date(Date.parse(`${months[0]}-01T00:00:00Z`) - 86_400_000).toISOString();
    const to = new Date(Date.parse(`${addDays(`${months[months.length - 1]}-28`, 4).slice(0, 7)}-01T00:00:00Z`) + 86_400_000).toISOString();
    readBookingsBetween(from, to)
      .then((rows) => { if (!stale) setFigures(bookingFigures(rows, ZONE, months, Date.now())); })
      .catch((e) => { if (!stale) setError(e?.message || "Couldn't load your figures."); });
    return () => { stale = true; };
  }, [attempt]);

  if (error) return <ErrorState title="Figures couldn't be loaded" description={error} onRetry={() => setAttempt((n) => n + 1)} />;
  if (!figures) return <LoadingState label="Adding up your bookings…" />;
  if (!figures.count && !figures.cancelled) return <EmptyState title="No figures yet" description="Once customers book, the last six months show here: bookings and money by month, your busiest days and what gets booked most." />;

  const topMonth = Math.max(1, ...figures.months.map((m) => m.count));
  const topDay = Math.max(1, ...figures.weekdays.map((w) => w.count));
  const topService = Math.max(1, ...figures.services.map((s) => s.count));
  const busiest = figures.weekdays.reduce((best, w) => (w.count > best.count ? w : best), figures.weekdays[0]);
  return (
    <div className="bkg-figs">
      <div className="bkg-tile bkg-figure">
        <p className="bkg-kicker">Bookings</p>
        <p className="bkg-big">{figures.count}</p>
        <p className="bkg-sub">last {FIGURE_MONTHS} months</p>
      </div>
      <div className="bkg-tile bkg-figure">
        <p className="bkg-kicker">Money taken</p>
        <p className="bkg-big bkg-big-money">{moneyText(figures.takenMinor, SHOP_CURRENCY)}</p>
        <p className="bkg-sub">after refunds</p>
      </div>
      <div className="bkg-tile bkg-figure">
        <p className="bkg-kicker">No-shows</p>
        <p className="bkg-big">{figures.noShows}</p>
        <p className="bkg-sub">{figures.noShowPercent === null ? "none marked yet" : `${figures.noShowPercent}% of past bookings`}</p>
      </div>
      <div className="bkg-tile bkg-figure">
        <p className="bkg-kicker">Cancelled</p>
        <p className="bkg-big">{figures.cancelled}</p>
        <p className="bkg-sub">by you or the customer</p>
      </div>

      <section className="bkg-tile bkg-figs-months" aria-labelledby="bkg-figs-months">
        <h2 id="bkg-figs-months" className="bkg-figs-title">Month by month</h2>
        <ol className="bkg-months">
          {figures.months.map((m) => (
            <li key={m.month} aria-label={`${monthText(m.month, "long")}: ${m.count} ${m.count === 1 ? "booking" : "bookings"}, ${moneyText(m.takenMinor, SHOP_CURRENCY)}`}>
              <strong aria-hidden>{m.count}</strong>
              <span className="bkg-months-bar" aria-hidden><i style={{ height: `${Math.round((m.count / topMonth) * 100)}%` }} /></span>
              <span className="bkg-months-name" aria-hidden>{monthText(m.month)}</span>
              <span className="bkg-months-money" aria-hidden>{moneyShort(m.takenMinor, SHOP_CURRENCY)}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="bkg-tile bkg-tile-mint bkg-figs-days" aria-labelledby="bkg-figs-days">
        <h2 id="bkg-figs-days" className="bkg-figs-title">Busiest days</h2>
        <p className="bkg-figs-lead">{busiest.count ? `${busiest.day}s are your busiest.` : "No bookings yet."}</p>
        <ul className="bkg-bars">
          {figures.weekdays.map((w) => (
            <li key={w.day}>
              <span>{w.day.slice(0, 3)}</span>
              <span className="bkg-bars-track" aria-hidden><i style={{ width: `${Math.round((w.count / topDay) * 100)}%` }} /></span>
              <strong>{w.count}</strong>
            </li>
          ))}
        </ul>
      </section>

      <section className="bkg-tile bkg-figs-services" aria-labelledby="bkg-figs-services">
        <h2 id="bkg-figs-services" className="bkg-figs-title">Most booked</h2>
        <ul className="bkg-bars bkg-bars-wide">
          {figures.services.map((s) => (
            <li key={s.name}>
              <span>{s.name}</span>
              <span className="bkg-bars-track" aria-hidden><i style={{ width: `${Math.round((s.count / topService) * 100)}%` }} /></span>
              <strong>{s.count}</strong>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

const PAY_MONTHS = 6;

/**
 * Team pay (Beta, Services plan 2 extras): one month's visits, takings before tax, commission and tips for each person,
 * to pay them by. Nothing is paid from here; the spreadsheet is for the owner's own payroll.
 */
function PayPanel({ staff, onEditTeam }: { staff: StaffMember[]; onEditTeam: () => void }) {
  const months = useMemo(() => lastMonths(today(), PAY_MONTHS).reverse(), []);
  const [month, setMonth] = useState(months[0]);
  const [rows, setRows] = useState<Booking[] | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let stale = false;
    setRows(null); setError("");
    // A day's slack either side covers every time zone; teamPay keeps only the month's own shop days.
    const from = new Date(Date.parse(`${month}-01T00:00:00Z`) - 86_400_000).toISOString();
    const to = new Date(Date.parse(`${addDays(`${month}-28`, 4).slice(0, 7)}-01T00:00:00Z`) + 86_400_000).toISOString();
    readBookingsBetween(from, to)
      .then((r) => { if (!stale) setRows(r); })
      .catch((e) => { if (!stale) setError(e?.message || "Couldn't load the month's bookings."); });
    return () => { stale = true; };
  }, [month, attempt]);
  const pay = useMemo(() => (rows ? teamPay(rows, staff, ZONE, month) : null), [rows, staff, month]);
  const noPercent = staff.filter((p) => p.active && !p.commissionPercent).length;
  const money = (minor: number) => moneyText(minor, SHOP_CURRENCY);
  const columns = [
    { key: "name", header: "Person", lead: true, render: (l: PayLine) => <span className={l.id ? undefined : "bkg-pay-nobody"}>{l.name}</span> },
    { key: "visits", header: "Visits", numeric: true, render: (l: PayLine) => l.visits },
    { key: "taken", header: "Taken before tax", numeric: true, render: (l: PayLine) => money(l.takenMinor) },
    { key: "percent", header: "Commission", numeric: true, render: (l: PayLine) => (l.id ? (l.percent ? <>{money(l.commissionMinor)} <span className="bkg-pay-pct">at {l.percent}%</span></> : <span className="bkg-pay-pct">No share set</span>) : "") },
    { key: "tips", header: "Tips", numeric: true, render: (l: PayLine) => money(l.tipsMinor) },
    { key: "total", header: "To pay them", numeric: true, render: (l: PayLine) => (l.id ? <strong>{money(l.commissionMinor + l.tipsMinor)}</strong> : "") },
  ];
  return (
    <div className="bkg-pay">
      <div className="bkg-pay-head">
        <div>
          <h2 className="bkg-figs-title">Team pay <StatusBadge tone="info" glyph={false}>Beta</StatusBadge></h2>
          <p className="bkg-figs-lead">Each person's commission and tips for the month, to pay them by. Nothing is paid from here.</p>
        </div>
        <div className="bkg-pay-actions">
          <SelectField label="Month" value={month} onChange={(e) => setMonth(e.target.value)}>
            {months.map((m) => <option key={m} value={m}>{monthText(m, "long")}</option>)}
          </SelectField>
          <SecondaryButton icon={<Download size={16} aria-hidden />} disabled={!pay || !pay.people.length}
            onClick={() => pay && saveFile(`team-pay-${month}.csv`, `\uFEFF${toCsv(teamPayRows(pay))}`, "text/csv;charset=utf-8")}>Spreadsheet</SecondaryButton>
        </div>
      </div>
      {noPercent > 0 && (
        <p className="bkg-pay-note">
          <span>{noPercent === 1 ? "One person on your team has" : `${noPercent} people on your team have`} no commission share yet, so only their tips show.</span>
          <GhostButton onClick={onEditTeam}>Set shares in Team &amp; rooms</GhostButton>
        </p>
      )}
      {error ? <ErrorState title="Team pay couldn't be loaded" description={error} onRetry={() => setAttempt((n) => n + 1)} />
        : !pay ? <LoadingState label="Adding up the month…" />
        : !pay.people.length ? <EmptyState title={`No bookings in ${monthText(month, "long")}`} description="Pick another month, or come back once your team has had visits." />
        : (<>
          <div className="bkg-pay-tiles">
            <div className="bkg-tile bkg-figure"><p className="bkg-kicker">Taken before tax</p><p className="bkg-big bkg-big-money">{money(pay.takenMinor)}</p><p className="bkg-sub">after refunds</p></div>
            <div className="bkg-tile bkg-figure"><p className="bkg-kicker">Commission</p><p className="bkg-big bkg-big-money">{money(pay.commissionMinor)}</p><p className="bkg-sub">at each person's share</p></div>
            <div className="bkg-tile bkg-tile-mint bkg-figure"><p className="bkg-kicker">Tips</p><p className="bkg-big bkg-big-money">{money(pay.tipsMinor)}</p><p className="bkg-sub">all goes to the person</p></div>
          </div>
          <DataTable caption={`Team pay for ${monthText(month, "long")}`} columns={columns} rows={pay.people} rowKey={(l) => l.id || "nobody"} stackOnPhone />
          <p className="bkg-questions-hint">Counts visits that happened, not no-shows. A kept fee counts as takings; refunds come off.</p>
        </>)}
    </div>
  );
}

function BookingDrawer({ booking: b, services, settings, onClose }: { booking: Booking; services: BookingService[]; settings: BookingSettings; onClose: () => void }) {
  const [busy, setBusy] = useState("");
  const [moving, setMoving] = useState(false);
  // Moving can hand the booking to someone else on the team; it stays with the same person unless changed.
  const [moveTo, setMoveTo] = useState(b.staffId || "");
  const [ask, confirmNode] = useConfirm();
  const day = dayOf(Date.parse(b.start), ZONE);
  const run = async (what: string, op: Parameters<typeof bookingsAdmin>[0], body: Record<string, unknown>, done: string) => {
    setBusy(what);
    try {
      await bookingsAdmin(op, { id: b.id, ...body });
      toast.success(done);
      if (op === "cancel") onClose();
    } catch (e: any) {
      toast.error(e?.message || "That didn't save. Please try again.");
    } finally {
      setBusy("");
    }
  };
  const paidByCard = cardTaken(b) > 0 && !b.refund;
  // A gift card's part not put back yet: the cancel dialog asks whether it goes back on the card.
  const giftHeld = b.giftCard && !b.giftCard.returned ? b.giftCard.amountMinor : 0;
  // A visit taken from a pack and not put back yet: the cancel dialog asks whether it goes back on the pack.
  const packHeld = !!b.pack?.id && !b.pack.returned && b.status !== "cancelled";
  const [cancelling, setCancelling] = useState(false);
  const [charging, setCharging] = useState(false);
  // A standing appointment with visits after this one: cancelling asks whether they go too.
  const laterVisits = b.series && b.status !== "cancelled" ? Math.max(0, b.series.visits - b.series.visit) : 0;
  const [runCancel, setRunCancel] = useState(false);
  const cancel = async () => {
    if (paidByCard || giftHeld || packHeld) { setCancelling(true); return; }
    if (laterVisits) { setRunCancel(true); return; }
    if (!(await ask({ title: "Cancel this booking?", message: `${b.customer.name} gets an email saying it's cancelled. The time opens up for others.`, confirmLabel: "Cancel booking" }))) return;
    await run("cancel", "cancel", { refundMinor: 0 }, "Booking cancelled");
  };
  const service = services.find((s) => s.id === b.serviceId);
  return (
    <Drawer open onClose={onClose} title={b.customer.name} description={`${b.serviceName} · ${dayText(day, "long")}`}
      footerStart={b.status !== "cancelled" ? <DestructiveButton onClick={() => void cancel()} busy={busy === "cancel"} disabled={!!busy}>Cancel booking</DestructiveButton> : undefined}
      footer={b.status === "confirmed" ? <PrimaryButton onClick={() => setMoving(true)} disabled={!!busy || !service}>Move</PrimaryButton> : undefined}>
      <div className="bkg-detail">
        <div className="bkg-detail-when">
          <Clock size={18} aria-hidden />
          <div>
            <strong>{timeText(b.start, ZONE)} – {timeText(b.end, ZONE)}</strong>
            <span>{b.minutes} minutes</span>
          </div>
          <StatusBadge tone={b.status === "confirmed" ? "success" : b.status === "held" ? "warning" : "neutral"}>
            {b.status === "confirmed" ? "Booked" : b.status === "held" ? (b.clearing ? "Payment clearing" : cardAsk(b) > 0 ? "Paying now" : "Saving a card") : "Cancelled"}
          </StatusBadge>
        </div>
        {!!b.extras?.length && <p className="bkg-detail-line"><Plus size={16} aria-hidden /> Add-ons: {b.extras.map((x) => x.name).join(", ")}</p>}
        {b.earlierWanted && b.status === "confirmed" && <p className="bkg-detail-line"><Clock size={16} aria-hidden /> Wants an earlier time if one opens. They're emailed when someone cancels.</p>}
        {b.series && <p className="bkg-detail-line"><CalendarPlus size={16} aria-hidden /> Standing appointment: visit {b.series.visit} of {b.series.visits}, {b.series.everyWeeks === 1 ? "every week" : `every ${b.series.everyWeeks} weeks`}</p>}
        {b.location && <p className="bkg-detail-line"><MapPin size={16} aria-hidden /> {b.location}</p>}
        {b.meetUrl && b.status === "confirmed" && <p className="bkg-detail-line"><Video size={16} aria-hidden /> <a href={b.meetUrl} target="_blank" rel="noopener noreferrer">Join the Google Meet call</a></p>}
        <dl className="bkg-facts">
          {b.staffName && <div><dt>With</dt><dd>{b.staffName}{b.roomName ? `, ${b.roomName}` : ""}</dd></div>}
          {!b.staffName && b.roomName && <div><dt>Room</dt><dd>{b.roomName}</dd></div>}
          <div><dt>Email</dt><dd><a href={`mailto:${b.customer.email}`}>{b.customer.email}</a></dd></div>
          <ClientFormFacts email={b.customer.email} wrap />
          {b.customer.phone && <div><dt>Phone</dt><dd><a href={`tel:${b.customer.phone}`}>{b.customer.phone}</a></dd></div>}
          <div><dt>Payment</dt><dd>{paymentText(b)}</dd></div>
          {b.giftCard && <div><dt>Gift card</dt><dd>Ending {b.giftCard.last4}, {moneyText(b.giftCard.amountMinor, b.currency)}{b.giftCard.returned ? " (put back on the card)" : ""}</dd></div>}
          {(b.taxMinor || 0) > 0 && <div><dt>Tax</dt><dd>{moneyText(b.taxMinor || 0, b.currency)} included{b.taxLines?.length ? ` (${b.taxLines.map((l) => l.name).join(", ")})` : ""}</dd></div>}
          {b.discount && <div><dt>Discount</dt><dd>{b.discount.code}, {moneyText(b.discount.amountMinor, b.currency)} off{b.discount.returned ? " (use given back)" : ""}</dd></div>}
          {b.cardHold && <div><dt>Card on file</dt><dd>{b.card ? `${cardText(b.card)}, ${moneyText(b.lateFeeMinor || 0, b.currency)} if missed` : b.status === "held" ? "Being saved" : "Not saved"}</dd></div>}
          {!!tipTaken(b) && <div><dt>Tip</dt><dd>{moneyText(tipTaken(b), b.currency)} by card</dd></div>}
          {b.fee && <div><dt>Fee</dt><dd>{moneyText(b.fee.amountMinor, b.currency)} charged{b.fee.reason ? ` for a ${b.fee.reason}` : ""}, {new Date(b.fee.at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</dd></div>}
          {b.checkInCode && b.status === "confirmed" && <div><dt>Check-in code</dt><dd className="bkg-code">{b.checkInCode}</dd></div>}
          <div><dt>Booked</dt><dd>{b.source === "admin" ? "By you" : "On your website"}{b.createdAt ? `, ${new Date(b.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}` : ""}</dd></div>
        </dl>
        {b.note && <blockquote className="bkg-note">“{b.note}”</blockquote>}
        {!!b.answers?.length && (
          <dl className="bkg-answers">
            {b.answers.map((a, i) => <div key={i}><dt>{a.label}</dt><dd>{a.answer}</dd></div>)}
          </dl>
        )}
        {b.status === "confirmed" && (
          <div className="bkg-detail-toggles">
            {(day === dayOf(Date.now(), ZONE) || !!b.checkedInAt) && <Toggle label={b.checkedInAt ? `Checked in at ${timeText(b.checkedInAt, ZONE)}` : "Checked in"} checked={!!b.checkedInAt} disabled={!!busy} onChange={(v) => void run("checkin", "checkIn", { value: v }, v ? "Checked in" : "Check-in taken off")} />}
            <Toggle label="Didn't turn up" checked={!!b.noShow} disabled={!!busy} onChange={(v) => void run("noshow", "noShow", { value: v }, v ? "Marked as a no-show" : "No-show taken off")} />
            {(b.payment === "atShop" || (b.payment === "deposit" && b.depositPaid)) && <Toggle label={b.payment === "deposit" ? `Rest paid at the shop (${moneyText(Math.max(0, b.priceMinor - (b.depositMinor || 0)), b.currency)})` : "Paid at the shop"} checked={b.paid} disabled={!!busy} onChange={(v) => void run("paid", "paidAtShop", { value: v }, v ? "Marked paid" : "Paid mark taken off")} />}
          </div>
        )}
        {restPayable(b) && <PayRestPanel booking={b} />}
        {feeChargeable(b, Date.now()) && (
          <div className="bkg-fee">
            <p>{b.status === "cancelled" ? "You cancelled this late." : b.noShow ? "They didn't turn up." : "If they didn't turn up,"} You can charge the {moneyText(b.lateFeeMinor || 0, b.currency)} fee they agreed to.</p>
            <SecondaryButton onClick={() => setCharging(true)} disabled={!!busy}>Charge fee</SecondaryButton>
          </div>
        )}
        {!!b.history?.length && (
          <details className="bkg-history">
            <summary>History</summary>
            <ul>{[...b.history].reverse().map((h, i) => <li key={i}>{new Date(h.at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}: {h.what.replace(/^moved from .*/, "moved")} ({h.by})</li>)}</ul>
          </details>
        )}
      </div>
      {cancelling && (
        <CancelDialog booking={b} laterVisits={laterVisits} onClose={() => setCancelling(false)}
          onCancel={async (refundMinor, giftBack, packBack, andLater) => {
            await bookingsAdmin("cancel", { id: b.id, refundMinor, giftBack, packBack, andLater });
            const gift = giftBack && giftHeld ? `${moneyText(giftHeld, b.currency)} back on their gift card` : "";
            const card = refundMinor === 0 ? "" : refundMinor < cardTaken(b) ? `${moneyText(refundMinor, b.currency)} refunded` : "refunded";
            const visit = packBack && packHeld ? "the visit back on their pack" : "";
            const done = [card, gift, visit].filter(Boolean);
            toast.success(done.length ? `Cancelled, ${done.join(" and ")}` : "Booking cancelled");
            setCancelling(false);
            onClose();
          }} />
      )}
      {runCancel && (
        <RunCancelDialog booking={b} laterVisits={laterVisits} onClose={() => setRunCancel(false)}
          onCancel={async (andLater) => {
            const r = await bookingsAdmin<{ laterCancelled?: number; laterSkipped?: number }>("cancel", { id: b.id, refundMinor: 0, andLater });
            toast.success(laterText(r));
            setRunCancel(false);
            onClose();
          }} />
      )}
      {charging && b.card && (
        <FeeDialog booking={b} onClose={() => setCharging(false)}
          onCharge={async (amountMinor) => {
            await bookingsAdmin("chargeFee", { id: b.id, amountMinor });
            toast.success(`${moneyText(amountMinor, b.currency)} charged. ${b.customer.name.split(" ")[0]} gets a receipt.`);
            setCharging(false);
          }} />
      )}
      {moving && service && (
        <TimeDialog title="Move booking" description={`${b.customer.name} gets an email with the new time.`} service={service} initialDay={day} except={b.id} confirmLabel="Move here"
          staffId={moveTo} onClose={() => setMoving(false)}
          onPick={async (start) => {
            await bookingsAdmin("move", { id: b.id, start, ...(moveTo !== (b.staffId || "") ? { staffId: moveTo } : {}) });
            toast.success("Booking moved"); setMoving(false);
          }}>
          <PersonPick settings={settings} serviceId={b.serviceId} value={moveTo} onChange={setMoveTo} />
        </TimeDialog>
      )}
      {confirmNode}
    </Drawer>
  );
}

/**
 * What is left to pay on a booking, and three ways to take it by card: copy the client's pay link, email it to them, or
 * show it as a QR code at the desk. The link is the same every time (the server keeps it), so a printed code keeps working.
 */
function PayRestPanel({ booking: b }: { booking: Booking }) {
  const [busy, setBusy] = useState("");
  const [qr, setQr] = useState<{ url: string; picture: string } | null>(null);
  const due = moneyText(balanceDue(b), b.currency);
  const first = b.customer.name.split(" ")[0] || "them";
  const link = async (what: "copy" | "send" | "qr") => {
    setBusy(what);
    try {
      const r = await bookingsAdmin<{ url: string }>("payLink", { id: b.id, send: what === "send" });
      if (what === "copy") await copyText(r.url, "Pay link");
      else if (what === "send") toast.success(`Sent to ${b.customer.email}`);
      else setQr({ url: r.url, picture: await qrPicture(r.url, 8) });
    } catch (e: any) {
      toast.error(e?.message || "The pay link couldn't be made. Please try again.");
    } finally {
      setBusy("");
    }
  };
  return (
    <div className="bkg-fee bkg-due">
      <p><strong>{due} left to pay.</strong> {first} can pay it by card from a link, before or at the visit.</p>
      <div className="bkg-due-actions">
        <SecondaryButton size="sm" onClick={() => void link("copy")} busy={busy === "copy"} disabled={!!busy}><Copy size={15} aria-hidden /> Copy pay link</SecondaryButton>
        <SecondaryButton size="sm" onClick={() => void link("send")} busy={busy === "send"} disabled={!!busy}><Mail size={15} aria-hidden /> Email it</SecondaryButton>
        <SecondaryButton size="sm" onClick={() => void link("qr")} busy={busy === "qr"} disabled={!!busy}><QrCode size={15} aria-hidden /> Show QR code</SecondaryButton>
      </div>
      {qr && (
        <Dialog open onClose={() => setQr(null)} title={`Pay ${due}`} description={`${first} points their phone camera at the code and pays by card. The booking shows as paid in full straight after.`}
          footer={<PrimaryButton onClick={() => setQr(null)}>Done</PrimaryButton>}>
          <div className="bkg-qr">
            <img src={qr.picture} alt={`QR code to pay ${due} for ${b.serviceName}`} width={264} height={264} />
            <p>{b.serviceName} · {b.customer.name}</p>
          </div>
        </Dialog>
      )}
    </div>
  );
}

/**
 * Tips: on or off, and the three or four choices clients see. Clients add one when paying what's left, or from an "Add a
 * tip" email a couple of hours after a paid visit. Saved with the rest of Hours & rules.
 */
function TipsTile({ tips, percents, onChange }: { tips: boolean; percents: number[]; onChange: (tips: boolean, percents: number[]) => void }) {
  const [text, setText] = useState(percents.join(", "));
  useEffect(() => setText(percents.join(", ")), [percents.join(",")]);
  const typed = text.split(/[^\d]+/).filter(Boolean).map(Number);
  const problem = typed.length === 0 || typed.length > 4 || typed.some((n) => n < 1 || n > 50) ? "Type one to four numbers from 1 to 50, like 15, 18, 20." : "";
  return (
    <section className="bkg-tile">
      <h2 className="bkg-tile-title">Tips</h2>
      <div className="bkg-form">
        <Toggle label="Ask clients for a tip" checked={tips} onChange={(v) => onChange(v, percents)} />
        <p className="bkg-cal-text">{tips ? "Clients can add a tip when they pay what's left. After a paid visit, they get a short email with an Add a tip button. Tips go to your card account with the rest." : "Clients aren't asked for tips."}</p>
        {tips && (
          <TextField label="Tip choices (% of the price)" hint="Clients can also type their own amount, or choose no tip." inputMode="numeric"
            value={text} onChange={(e) => setText(e.target.value)} error={problem || undefined}
            onBlur={() => { if (!problem) onChange(tips, cleanTipPercents(typed)); }} />
        )}
      </div>
    </section>
  );
}

/** After the visit: a thank-you email with Book again, reviews for the website, or a review link elsewhere. */
/**
 * Text-message reminders (Services plan phase 7): the reminders also go by text to clients who tick "Text me reminders".
 * The platform sends them and puts them on the monthly bill at cost; "Opening soon" until it can.
 */
function TextsTile({ on, reminders, onChange }: { on: boolean; reminders: boolean; onChange: (on: boolean) => void }) {
  const [status, setStatus] = useState<{ available: boolean; price: string } | null>(null);
  useEffect(() => {
    let live = true;
    bookingsAdmin<{ available: boolean; price: string }>("textStatus").then((s) => live && setStatus(s)).catch(() => live && setStatus({ available: false, price: "" }));
    return () => { live = false; };
  }, []);
  const open = status?.available === true;
  return (
    <section className="bkg-tile" data-texts-tile>
      <h2 className="bkg-tile-title">Text reminders</h2>
      {status && !open && <p className="bkg-texts-soon"><StatusBadge tone="info" glyph={false}>Opening soon</StatusBadge></p>}
      <div className="bkg-form">
        <Toggle label="Send reminders by text too" checked={open && on} disabled={!open} onChange={onChange} />
        <p className="bkg-cal-text">
          {!status ? "Checking…"
            : !open ? "Soon clients will be able to get their reminders by text as well as by email."
            : !on ? "Reminders go by email only."
            : !reminders ? "Turn on the reminder email above: texts go out at the same times."
            : `Clients who give a mobile number and tick "Text me reminders" get each reminder by text too. Each text costs ${status.price}, added to your monthly bill at cost. Long texts count as two.`}
        </p>
      </div>
    </section>
  );
}

const NO_FORM: IntakeForm = { on: false, title: "Before your first visit", text: "", questions: [], serviceIds: [] };

/** A form clients fill in once before their first visit (Services plan 2, B4): its words, questions and services. */
function FormTile({ form: saved, services, onChange }: { form?: IntakeForm; services: BookingService[]; onChange: (form: IntakeForm) => void }) {
  const form = saved || NO_FORM;
  const set = (patch: Partial<IntakeForm>) => onChange({ ...form, ...patch });
  const setQuestion = (i: number, change: Partial<IntakeForm["questions"][number]>) => set({ questions: form.questions.map((q, j) => (j === i ? { ...q, ...change } : q)) });
  const every = form.serviceIds.length === 0;
  const pick = (id: string, on: boolean) => {
    const next = on ? [...form.serviceIds, id] : form.serviceIds.filter((x) => x !== id);
    set({ serviceIds: next.length === services.length ? [] : next });
  };
  return (
    <section className="bkg-tile" data-form-tile>
      <h2 className="bkg-tile-title">Form before the first visit <StatusBadge tone="info" glyph={false}>Beta</StatusBadge></h2>
      <div className="bkg-form">
        <Toggle label="Ask clients to fill in a form" checked={form.on} onChange={(on) => set({ on })} />
        <p className="bkg-cal-text">{form.on
          ? "Clients fill it in once on their booking page, signed with their typed name and a tick. The confirmation and reminder ask until they do. You see it on their booking and client card. Changing the words asks everyone again."
          : "Like a health or consent form. Clients fill it in once, before their first visit."}</p>
        {form.on && (<>
          <TextField label="Name of the form" placeholder="Health form" value={form.title} maxLength={80} onChange={(e) => set({ title: e.target.value })} />
          <TextArea label="What it says" rows={6} maxLength={MAX_FORM_TEXT} placeholder="Please tell us about anything that could affect your visit, like allergies or a recent treatment." value={form.text} onChange={(e) => set({ text: e.target.value })} />
          <fieldset className="bkg-questions">
            <legend>Questions on it</legend>
            {form.questions.map((q, i) => (
              <div key={q.id} className="bkg-question">
                <TextField label={`Question ${i + 1}`} placeholder="Any allergies?" value={q.label} maxLength={140} onChange={(e) => setQuestion(i, { label: e.target.value })} />
                <div className="bkg-question-row">
                  <Toggle label="Must answer" checked={q.required} onChange={(v) => setQuestion(i, { required: v })} />
                  <Toggle label="Long answer" checked={q.long} onChange={(v) => setQuestion(i, { long: v })} />
                  <button type="button" className="bkg-question-remove" aria-label={`Remove question ${i + 1}`} onClick={() => set({ questions: form.questions.filter((_, j) => j !== i) })}><Trash2 size={16} aria-hidden /></button>
                </div>
              </div>
            ))}
            {form.questions.length < MAX_QUESTIONS
              ? <SecondaryButton icon={<Plus size={16} aria-hidden />} onClick={() => set({ questions: [...form.questions, { id: `q${Date.now().toString(36)}`, label: "", long: false, required: false }] })}>Add a question</SecondaryButton>
              : <p className="bkg-questions-hint">That's the most a form can ask ({MAX_QUESTIONS}).</p>}
          </fieldset>
          {services.length > 1 && (
            <fieldset className="bkg-questions">
              <legend>Which services ask for it</legend>
              <Toggle label="Every service" checked={every} onChange={(v) => set({ serviceIds: v ? [] : services.slice(0, 1).map((s) => s.id) })} />
              {!every && <div className="bkg-person-services">{services.map((s) => <Checkbox key={s.id} label={s.name} checked={form.serviceIds.includes(s.id)} onChange={(e) => pick(s.id, e.target.checked)} />)}</div>}
            </fieldset>
          )}
          {!form.text.trim() && !form.questions.some((q) => q.label.trim()) && <p className="bkg-questions-hint">Add the words or a question: a form with neither isn't saved.</p>}
        </>)}
      </div>
    </section>
  );
}

function ThanksTile({ form, onChange }: { form: BookingSettings; onChange: (patch: Partial<BookingSettings>) => void }) {
  const [text, setText] = useState(form.reviewUrl);
  useEffect(() => setText(form.reviewUrl), [form.reviewUrl]);
  const problem = text.trim() && !reviewLink(text) ? "Paste the full address, starting with https://" : "";
  return (
    <section className="bkg-tile" data-thanks-tile>
      <h2 className="bkg-tile-title">After the visit</h2>
      <div className="bkg-form">
        <Toggle label="Send a thank-you email" checked={form.thankYou} onChange={(v) => onChange({ thankYou: v })} />
        <p className="bkg-cal-text">{form.thankYou ? "A couple of hours after each visit, clients get a short thank-you with a Book again button. If you ask for tips, the tip email says thank you instead, so nobody gets two." : "Clients get no email after their visit."}</p>
        <Toggle label="Collect reviews for your website" checked={form.siteReviews === true} onChange={(v) => onChange({ siteReviews: v })} />
        <p className="bkg-cal-text">{form.siteReviews ? "Clients can review a visit from their booking page and from the thank-you email. You approve each one in Reviews, then add the Client reviews section in Studio to show them." : "Clients aren't asked for a review on your website."}</p>
        {form.thankYou && !form.siteReviews && (
          <TextField label="Review link (optional)" hint="Where clients can review you, like your Google review link. It shows as Leave a review." inputMode="url" placeholder="https://g.page/r/…/review"
            value={text} onChange={(e) => setText(e.target.value)} error={problem || undefined}
            onBlur={() => { if (!problem) onChange({ reviewUrl: reviewLink(text) }); }} />
        )}
      </div>
    </section>
  );
}

/** Pickup times at checkout: shoppers choosing "Pick up" pick a time inside the opening hours below. */
function PickupTile({ form, onChange }: { form: BookingSettings; onChange: (patch: Partial<BookingSettings>) => void }) {
  return (
    <section className="bkg-tile" data-pickup-tile>
      <h2 className="bkg-tile-title">Pickup times</h2>
      <div className="bkg-form">
        <Toggle label="Let shoppers choose a pickup time" checked={form.pickupTimes} onChange={(v) => onChange({ pickupTimes: v })} />
        <p className="bkg-cal-text">{form.pickupTimes ? "At checkout, shoppers who pick up choose a time from your opening hours and days off. The time shows on the order, in your emails and on their order page." : "Shoppers who pick up don't choose a time. They come when the order is ready."}</p>
        {form.pickupTimes && <>
          <SelectField label="A pickup time every" value={String(form.pickupSlotMinutes)} onChange={(e) => onChange({ pickupSlotMinutes: Number(e.target.value) })}>
            {PICKUP_SLOT_MINUTES.map((m) => <option key={m} value={m}>{m === 60 ? "hour" : `${m} minutes`}</option>)}
          </SelectField>
          <SelectField label="Orders in one time" hint="Once this many orders choose a time, it's full." value={String(form.pickupPerSlot)} onChange={(e) => onChange({ pickupPerSlot: Number(e.target.value) })}>
            {Array.from({ length: MAX_PICKUP_PER_SLOT }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n} order{n === 1 ? "" : "s"}</option>)}
          </SelectField>
          <SelectField label="Ready after" hint="The earliest time a shopper can choose, counted from when they order." value={String(form.pickupReadyHours)} onChange={(e) => onChange({ pickupReadyHours: Number(e.target.value) })}>
            {[0, 1, 2, 4, 12, 24, 48, 72].map((h) => <option key={h} value={h}>{h === 0 ? "Straight away" : h < 24 ? `${h} hour${h === 1 ? "" : "s"}` : `${h / 24} day${h === 24 ? "" : "s"}`}</option>)}
          </SelectField>
        </>}
      </div>
    </section>
  );
}

/** The owner's private calendar link: Google or Apple Calendar subscribes to it and shows every booking. */
function CalendarTile({ google, onGoogle }: { google: boolean; onGoogle: (on: boolean) => void }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState("");
  const [ask, confirmNode] = useConfirm();
  const fetchLink = async (renew: boolean) => {
    setBusy(renew ? "renew" : "get");
    try {
      const r = await bookingsAdmin<{ path: string }>("calendarFeed", { renew });
      setUrl(new URL(r.path, window.location.origin).toString());
      if (renew) toast.success("New link made. The old one has stopped working.");
    } catch (e: any) {
      toast.error(e?.message || "The calendar link couldn't be made. Please try again.");
    } finally {
      setBusy("");
    }
  };
  const renew = async () => {
    if (!(await ask({ title: "Make a new calendar link?", message: "The old link stops working, so any calendar using it stops getting bookings. Add the new link to your calendar afterwards.", confirmLabel: "Make new link" }))) return;
    await fetchLink(true);
  };
  const webcal = url.replace(/^https?:/, "webcal:");
  return (
    <section className="bkg-tile">
      <h2 className="bkg-tile-title">Your calendar</h2>
      <p className="bkg-cal-text">See every booking in Google Calendar or Apple Calendar. New and changed bookings show up there by themselves.</p>
      {!url ? (
        <PrimaryButton onClick={() => void fetchLink(false)} busy={busy === "get"}><CalendarPlus size={16} aria-hidden /> Connect a calendar</PrimaryButton>
      ) : (
        <div className="bkg-cal">
          <div className="bkg-cal-actions">
            <a className="bkg-cal-btn" href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`} target="_blank" rel="noopener noreferrer">Add to Google Calendar <ExternalLink size={14} aria-hidden /></a>
            <a className="bkg-cal-btn" href={webcal}>Add to Apple Calendar</a>
          </div>
          <div className="bkg-link">
            <code>{url}</code>
            <IconButton label="Copy calendar link" onClick={() => void copyText(url, "Calendar link")}><Copy size={16} aria-hidden /></IconButton>
          </div>
          <p className="bkg-cal-note">Keep this link private: anyone with it can see your bookings. Google can take a few hours to show changes; Apple checks every hour.</p>
          <GhostButton size="sm" onClick={() => void renew()} busy={busy === "renew"}>Make a new link</GhostButton>
        </div>
      )}
      <div className="bkg-gcal">
        <Toggle label="Put bookings straight into Google Calendar" checked={google} onChange={onGoogle} />
        <p className="bkg-cal-note">{google
          ? "Each booking appears at once in your shop's calendar in Google, with a Meet link for video-call services. Save to start."
          : "Uses the calendar Connect Google made for your shop, so tick Calendar there first. Needed for Google Meet links."}</p>
      </div>
      {confirmNode}
    </section>
  );
}

/** Charges the missed-booking fee to the saved card: the agreed fee, or less. `onCharge` throws to keep it open. */
function FeeDialog({ booking: b, onClose, onCharge }: { booking: Booking; onClose: () => void; onCharge: (amountMinor: number) => Promise<void> }) {
  const most = b.lateFeeMinor || 0;
  const [amount, setAmount] = useState((most / 100).toFixed(2));
  const [problem, setProblem] = useState("");
  const [saving, setSaving] = useState(false);
  const minor = Math.round(Number(amount) * 100);
  const amountProblem = !amount || !Number.isFinite(minor) || minor < 50 ? `Type an amount of at least ${moneyText(50, b.currency)}.` : minor > most ? `Up to ${moneyText(most, b.currency)}, the fee they agreed to.` : "";
  const save = async () => {
    setSaving(true); setProblem("");
    try { await onCharge(minor); } catch (e: any) { setProblem(e?.message || "That didn't go through. Please try again."); } finally { setSaving(false); }
  };
  return (
    <Dialog open onClose={onClose} title="Charge the missed-booking fee?" description={`${b.customer.name} agreed to a ${moneyText(most, b.currency)} fee when they booked. It goes on their ${cardText(b.card)}, and they get an email receipt.`}
      footer={<><SecondaryButton onClick={onClose}>Not now</SecondaryButton><PrimaryButton onClick={() => void save()} busy={saving} disabled={!!amountProblem}>{amountProblem ? "Charge fee" : `Charge ${moneyText(minor, b.currency)}`}</PrimaryButton></>}>
      <div className="bkg-form">
        <TextField label={`Amount (${b.currency})`} hint="You can charge less than the full fee." inputMode="decimal" placeholder="0.00"
          value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} error={amount ? amountProblem || undefined : undefined} />
        {problem && <p className="bkg-error" role="alert">{problem}</p>}
      </div>
    </Dialog>
  );
}

/** What the toast says after cancelling a visit of a standing appointment (visits with money on them are left). */
function laterText(r: { laterCancelled?: number; laterSkipped?: number }): string {
  const n = r.laterCancelled || 0;
  const kept = r.laterSkipped ? ` ${r.laterSkipped === 1 ? "1 later visit has" : `${r.laterSkipped} later visits have`} a payment on it, so cancel ${r.laterSkipped === 1 ? "it" : "them"} on ${r.laterSkipped === 1 ? "its" : "their"} own.` : "";
  return (n ? `Cancelled, with ${n === 1 ? "the next visit" : `${n} later visits`}.` : "Booking cancelled.") + kept;
}

/** Cancels one visit of a standing appointment, or it and every later one. */
function RunCancelDialog({ booking: b, laterVisits, onClose, onCancel }: { booking: Booking; laterVisits: number; onClose: () => void; onCancel: (andLater: boolean) => Promise<void> }) {
  const [saving, setSaving] = useState<"" | "one" | "all">("");
  const [problem, setProblem] = useState("");
  const go = async (andLater: boolean) => {
    setSaving(andLater ? "all" : "one"); setProblem("");
    try { await onCancel(andLater); } catch (e: any) { setProblem(e?.message || "That didn't save. Please try again."); } finally { setSaving(""); }
  };
  return (
    <Dialog open onClose={onClose} title="Cancel this visit?"
      description={`It's visit ${b.series?.visit} of ${b.series?.visits} of ${b.customer.name}'s standing appointment. They get an email saying what's cancelled, and the times open up for others.`}
      footer={<><SecondaryButton onClick={onClose}>Keep it</SecondaryButton>
        <DestructiveButton onClick={() => void go(false)} busy={saving === "one"} disabled={!!saving}>Just this visit</DestructiveButton>
        <DestructiveButton onClick={() => void go(true)} busy={saving === "all"} disabled={!!saving}>{laterVisits === 1 ? "This and the next one" : `This and the ${laterVisits} later ones`}</DestructiveButton></>}>
      {problem && <p className="bkg-error" role="alert">{problem}</p>}
    </Dialog>
  );
}

/**
 * Cancels a booking with money taken by card (all of it or a deposit), refunding all of that, part of it or none, and/or
 * paid with a gift card, whose part goes back on the card unless the owner keeps it.
 */
function CancelDialog({ booking: b, laterVisits = 0, onClose, onCancel }: { booking: Booking; laterVisits?: number; onClose: () => void; onCancel: (refundMinor: number, giftBack: boolean, packBack: boolean, andLater: boolean) => Promise<void> }) {
  const [andLater, setAndLater] = useState(false);
  const [choice, setChoice] = useState<"all" | "part" | "none">("all");
  const [part, setPart] = useState("");
  const [problem, setProblem] = useState("");
  const [saving, setSaving] = useState(false);
  const onCard = b.refund ? 0 : cardTaken(b);
  const gift = b.giftCard && !b.giftCard.returned ? b.giftCard.amountMinor : 0;
  const [giftBack, setGiftBack] = useState(true);
  const packVisit = !!b.pack?.id && !b.pack.returned;
  const [packBack, setPackBack] = useState(true);
  const deposit = b.payment === "deposit";
  const paid = moneyText(onCard, b.currency);
  const partMinor = Math.round(Number(part) * 100);
  const partProblem = choice !== "part" ? "" : !part || !Number.isFinite(partMinor) || partMinor <= 0 ? "Type how much to refund." : partMinor >= onCard ? `For ${paid} or more, choose Refund all.` : "";
  const refundMinor = choice === "all" ? onCard : choice === "none" ? 0 : partMinor;
  const save = async () => {
    setSaving(true); setProblem("");
    try { await onCancel(refundMinor, gift > 0 && giftBack, packVisit && packBack, laterVisits > 0 && andLater); } catch (e: any) { setProblem(e?.message || "That didn't save. Please try again."); } finally { setSaving(false); }
  };
  const options = [
    { id: "all", label: "Refund all", note: paid },
    { id: "part", label: "Refund part", note: deposit ? "Keep some of it" : "Keep a deposit" },
    { id: "none", label: "No refund", note: deposit ? "Keep the deposit" : "Keep the payment" },
  ] as const;
  return (
    <Dialog open onClose={onClose} title="Cancel this booking?" description={`${b.customer.name} ${onCard || gift ? `paid ${[onCard ? `${deposit ? `a ${paid} deposit` : paid} by card` : "", gift ? `${moneyText(gift, b.currency)} with a gift card` : ""].filter(Boolean).join(" and ")}` : "booked it with their pack"}. They get an email saying it's cancelled, and the time opens up for others.`}
      footer={<><SecondaryButton onClick={onClose}>Keep booking</SecondaryButton><DestructiveButton onClick={() => void save()} busy={saving} disabled={!!partProblem}>{refundMinor > 0 ? `Cancel and refund ${moneyText(refundMinor, b.currency)}` : "Cancel booking"}</DestructiveButton></>}>
      <div className="bkg-form">
        {onCard > 0 && <fieldset className="bkg-refund">
          <legend>Refund</legend>
          {options.map((o) => (
            <button key={o.id} type="button" className="bkg-refund-choice" aria-pressed={choice === o.id} onClick={() => setChoice(o.id)}>
              <strong>{o.label}</strong><span>{o.note}</span>
            </button>
          ))}
        </fieldset>}
        {laterVisits > 0 && <Toggle label={laterVisits === 1 ? "Cancel the next visit of their standing appointment too" : `Cancel the ${laterVisits} later visits of their standing appointment too`} checked={andLater} onChange={setAndLater} />}
        {packVisit && <Toggle label={`Put the visit back on their pack (ending ${b.pack?.last4 || ""})`} checked={packBack} onChange={setPackBack} />}
        {packVisit && !packBack && <p className="bkg-questions-hint">The visit counts as used, as for a late cancel.</p>}
        {gift > 0 && <Toggle label={`Put ${moneyText(gift, b.currency)} back on their gift card (ending ${b.giftCard?.last4 || ""})`} checked={giftBack} onChange={setGiftBack} />}
        {choice === "part" && onCard > 0 && (
          <TextField label={`Amount to refund (${b.currency})`} hint={`Up to ${paid}. The rest stays with you.`} inputMode="decimal" placeholder="0.00" autoFocus
            value={part} onChange={(e) => setPart(e.target.value.replace(/[^\d.]/g, ""))} error={part ? partProblem || undefined : undefined} />
        )}
        {problem && <p className="bkg-error" role="alert">{problem}</p>}
      </div>
    </Dialog>
  );
}

/** Picks a day and one of its free times for a service. `onPick` throws to keep the dialog open. */
function TimeDialog({ title, description, service, initialDay, except = "", staffId = "", extras = [], confirmLabel, onClose, onPick, children, ready = true, after }: {
  title: string; description?: string; service: BookingService; initialDay: string; except?: string;
  /** The add-ons ticked (New booking): the free times fit the longer booking. */ extras?: string[];
  /** Only this person's free times ("" = anyone on the team, or the shop's one calendar). */ staffId?: string; confirmLabel: string;
  onClose: () => void; onPick: (startIso: string) => Promise<void>; children?: React.ReactNode; ready?: boolean;
  /** Shown under the times once one is picked (New booking › Repeat lists the run's dates). */ after?: (startIso: string) => React.ReactNode;
}) {
  const [day, setDay] = useState(initialDay);
  const [times, setTimes] = useState<string[] | null>(null);
  const [picked, setPicked] = useState("");
  const [problem, setProblem] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let live = true;
    setTimes(null); setPicked("");
    bookingsAdmin<{ times: string[] }>("times", { serviceId: service.id, day, except, staffId, ...(extras.length ? { extras } : {}) }).then((r) => live && setTimes(r.times)).catch((e) => live && (setTimes([]), setProblem(e.message)));
    return () => { live = false; };
  }, [day, service.id, staffId, extras.join(",")]);
  const save = async () => {
    setSaving(true); setProblem("");
    try { await onPick(picked); } catch (e: any) { setProblem(e?.message || "That didn't save."); } finally { setSaving(false); }
  };
  return (
    <Dialog open onClose={onClose} title={title} description={description}
      footer={<><SecondaryButton onClick={onClose}>Close</SecondaryButton><PrimaryButton onClick={() => void save()} disabled={!picked || !ready} busy={saving}>{confirmLabel}</PrimaryButton></>}>
      <div className="bkg-form">
        {children}
        <div className="bkg-dayrow">
          <IconButton label="Day before" onClick={() => setDay(addDays(day, -1))}><ChevronLeft size={18} aria-hidden /></IconButton>
          <TextField label="Day" type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
          <IconButton label="Day after" onClick={() => setDay(addDays(day, 1))}><ChevronRight size={18} aria-hidden /></IconButton>
        </div>
        <fieldset className="bkg-times">
          <legend>{dayText(day, "long")}</legend>
          {times === null ? <LoadingState label="Finding free times…" /> : times.length === 0 ? <p className="bkg-day-empty">No free time this day.</p> : times.map((t) => (
            <button key={t} type="button" className="bkg-time" aria-pressed={picked === t} onClick={() => setPicked(t)}>{timeText(t, ZONE)}</button>
          ))}
        </fieldset>
        {picked && after?.(picked)}
        {problem && <p className="bkg-error" role="alert">{problem}</p>}
      </div>
    </Dialog>
  );
}

/** Books someone into a class start that still has room: someone who rang, or signed up at the counter. */
export function AddToClassDialog({ service, start, left, onClose }: { service: BookingService; start: string; left: number; onClose: () => void }) {
  const [who, setWho] = useState({ name: "", email: "", phone: "", note: "" });
  const [sendEmail, setSendEmail] = useState(true);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState("");
  const ready = who.name.trim().length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(who.email.trim());
  const save = async () => {
    setSaving(true); setProblem("");
    try {
      await bookingsAdmin("create", { serviceId: service.id, start, ...who, sendEmail });
      toast.success(`${who.name.trim()} is in ${service.name}`);
      onClose();
    } catch (e: any) { setProblem(e?.message || "That didn't save."); } finally { setSaving(false); }
  };
  return (
    <Dialog open onClose={onClose} title={`Add a person · ${service.name}`}
      description={`${dayText(dayOf(Date.parse(start), ZONE), "long")}, ${timeText(start, ZONE)}. ${left === 1 ? "1 place" : `${left} places`} left.`}
      footer={<><SecondaryButton onClick={onClose}>Close</SecondaryButton><PrimaryButton onClick={() => void save()} disabled={!ready} busy={saving}>Add to class</PrimaryButton></>}>
      <div className="bkg-form">
        <div className="bkg-two">
          <TextField label="Name" value={who.name} onChange={(e) => setWho({ ...who, name: e.target.value })} autoComplete="off" />
          <TextField label="Email" type="email" value={who.email} onChange={(e) => setWho({ ...who, email: e.target.value })} autoComplete="off" />
        </div>
        <div className="bkg-two">
          <TextField label="Phone (optional)" type="tel" value={who.phone} onChange={(e) => setWho({ ...who, phone: e.target.value })} autoComplete="off" />
          <TextField label="Note (optional)" value={who.note} onChange={(e) => setWho({ ...who, note: e.target.value })} />
        </div>
        <Toggle label="Email them the booking" checked={sendEmail} onChange={setSendEmail} />
        {problem && <p className="bkg-error" role="alert">{problem}</p>}
      </div>
    </Dialog>
  );
}

/** "With": anyone free or one person who does the service. Nothing in a shop that books as one calendar. */
function PersonPick({ settings, serviceId, value, onChange }: { settings: BookingSettings; serviceId: string; value: string; onChange: (id: string) => void }) {
  if (!booksByPerson(settings)) return null;
  const people = staffFor(settings, serviceId);
  // Someone who no longer does it (or left) stays listed for the booking they already have.
  const current = value && !people.some((p) => p.id === value) ? settings.staff.find((p) => p.id === value) : undefined;
  return (
    <SelectField label="With" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Anyone free</option>
      {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      {current && <option value={current.id} disabled>{current.name} (doesn't do this now)</option>}
    </SelectField>
  );
}

/** The dates of a standing appointment, each marked free or taken (op runCheck), under New booking's times. */
function RunDates({ serviceId, start, run, staffId, extras = [], onFree }: { serviceId: string; start: string; run: { everyWeeks: number; visits: number }; staffId: string; extras?: string[]; onFree: (free: boolean) => void }) {
  const [visits, setVisits] = useState<{ start: string; free: boolean }[] | null>(null);
  const [problem, setProblem] = useState("");
  useEffect(() => {
    let live = true;
    setVisits(null); setProblem(""); onFree(false);
    bookingsAdmin<{ visits: { start: string; free: boolean }[] }>("runCheck", { serviceId, start, run, staffId, ...(extras.length ? { extras } : {}) })
      .then((r) => { if (live) { setVisits(r.visits); onFree(r.visits.every((v) => v.free)); } })
      .catch((e) => live && setProblem(e?.message || "The dates couldn't be checked."));
    return () => { live = false; };
  }, [serviceId, start, run.everyWeeks, run.visits, staffId, extras.join(",")]);
  if (problem) return <p className="bkg-error" role="alert">{problem}</p>;
  if (!visits) return <LoadingState label="Checking every date…" />;
  const taken = visits.filter((v) => !v.free).length;
  return (
    <div className="bkg-run">
      <p className="bkg-run-head">{taken ? `${taken === 1 ? "1 date is" : `${taken} dates are`} already taken. Change the time, the gap or the number of visits.` : `All ${visits.length} dates are free.`}</p>
      <ol className="bkg-run-list">
        {visits.map((v, i) => (
          <li key={v.start} className={v.free ? "" : "is-taken"}>
            <span>Visit {i + 1}</span>
            <span>{dayText(dayOf(Date.parse(v.start), ZONE), "long")}, {timeText(v.start, ZONE)}</span>
            {!v.free && <StatusBadge tone="danger">Taken</StatusBadge>}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** What Book again fills in: the client and their last service and person (Customers › a client). */
export type BookAgain = { serviceId: string; staffId: string; name: string; email: string; phone: string };

function NewBookingDialog({ services, settings, onClose, initial, onBooked }: { services: BookingService[]; settings: BookingSettings; onClose: () => void; initial?: BookAgain; onBooked?: () => void }) {
  const [serviceId, setServiceId] = useState(() => services.find((s) => s.id === initial?.serviceId)?.id || services[0]?.id || "");
  // The same person again, if they still take this service.
  const [staffId, setStaffId] = useState(() => (initial?.staffId && staffFor(settings, serviceId).some((p) => p.id === initial.staffId) ? initial.staffId : ""));
  const [who, setWho] = useState({ name: initial?.name || "", email: initial?.email || "", phone: initial?.phone || "", note: "" });
  const [sendEmail, setSendEmail] = useState(true);
  const service = services.find((s) => s.id === serviceId) || services[0];
  // Repeat: a standing appointment, the same time every few weeks (one-to-one services only).
  const [everyWeeks, setEveryWeeks] = useState(0);
  const [visits, setVisits] = useState(6);
  const repeatable = service.places <= 1 && !(service.courseDates || []).length;
  const run = repeatable && everyWeeks ? { everyWeeks, visits } : null;
  const [runFree, setRunFree] = useState(false);
  // Add-ons ticked for this booking (ids of the service's extras).
  const [picked, setPicked] = useState<string[]>([]);
  const extras = (service.extras || []).filter((e) => picked.includes(e.id)).map((e) => e.id);
  // The picked person's own length and price for it, with the add-ons on top.
  const personal = forPerson(service, settings, staffId);
  const ownRate = personal.minutes !== service.minutes || personal.priceMinor !== service.priceMinor;
  const asBooked = withExtras(personal, extras);
  const length = "problem" in asBooked ? service.minutes : asBooked.service.minutes;
  const ready = who.name.trim().length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(who.email.trim());
  return (
    <TimeDialog key={service.id} title={initial ? "Book again" : "New booking"} service={service} initialDay={today()} staffId={staffId} extras={extras} confirmLabel={run ? `Book ${visits} visits` : "Book"} onClose={onClose} ready={ready && (!run || runFree) && !("problem" in asBooked)}
      after={run ? (start) => <RunDates serviceId={service.id} start={start} run={run} staffId={staffId} extras={extras} onFree={setRunFree} /> : undefined}
      onPick={async (start) => {
        await bookingsAdmin("create", { serviceId: service.id, start, ...who, sendEmail, ...(staffId ? { staffId } : {}), ...(run ? { run } : {}), ...(extras.length ? { extras } : {}) });
        toast.success(run ? `${who.name.trim()} is booked in for ${visits} visits` : `${who.name.trim()} is booked in`);
        onBooked?.();
        onClose();
      }}>
      <SelectField label="Service" value={service.id} onChange={(e) => { setServiceId(e.target.value); setPicked([]); if (!staffFor(settings, e.target.value).some((p) => p.id === staffId)) setStaffId(""); }}>
        {services.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.minutes} min</option>)}
      </SelectField>
      {(service.extras || []).length > 0 && (
        <fieldset className="bkg-extras-pick">
          <legend>Add-ons</legend>
          {(service.extras || []).map((x) => (
            <Toggle key={x.id} label={extraLabel(x)} checked={picked.includes(x.id)} onChange={(v) => setPicked((p) => (v ? [...p, x.id] : p.filter((id) => id !== x.id)))} />
          ))}
          <p className="bkg-questions-hint">{"problem" in asBooked ? asBooked.problem : `${length} minutes in all${asBooked.service.priceMinor ? `, ${moneyText(asBooked.service.priceMinor, SHOP_CURRENCY)}` : ""}.`}</p>
        </fieldset>
      )}
      <PersonPick settings={settings} serviceId={service.id} value={staffId} onChange={setStaffId} />
      {ownRate && !extras.length && <p className="bkg-questions-hint">Their own: {personal.minutes} minutes{personal.priceMinor ? `, ${moneyText(personal.priceMinor, SHOP_CURRENCY)}` : ""}.</p>}
      <div className="bkg-two">
        <TextField label="Name" value={who.name} onChange={(e) => setWho({ ...who, name: e.target.value })} autoComplete="off" />
        <TextField label="Email" type="email" value={who.email} onChange={(e) => setWho({ ...who, email: e.target.value })} autoComplete="off" />
      </div>
      <div className="bkg-two">
        <TextField label="Phone (optional)" type="tel" value={who.phone} onChange={(e) => setWho({ ...who, phone: e.target.value })} autoComplete="off" />
        <TextField label="Note (optional)" value={who.note} onChange={(e) => setWho({ ...who, note: e.target.value })} />
      </div>
      {repeatable && (
        <div className="bkg-two">
          <SelectField label="Repeat" value={String(everyWeeks)} onChange={(e) => { const w = Number(e.target.value); setEveryWeeks(w); if (w && (visits - 1) * w * 7 > MAX_RUN_DAYS) setVisits(Math.floor(MAX_RUN_DAYS / (w * 7)) + 1); }}>
            <option value="0">Just once</option>
            {Array.from({ length: MAX_RUN_WEEKS }, (_, i) => i + 1).map((w) => <option key={w} value={w}>{w === 1 ? "Every week" : `Every ${w} weeks`}</option>)}
          </SelectField>
          {everyWeeks > 0 && (
            <SelectField label="Visits" value={String(visits)} onChange={(e) => setVisits(Number(e.target.value))}>
              {Array.from({ length: MAX_RUN_VISITS - 1 }, (_, i) => i + 2).filter((n) => (n - 1) * everyWeeks * 7 <= MAX_RUN_DAYS).map((n) => <option key={n} value={n}>{n} visits</option>)}
            </SelectField>
          )}
        </div>
      )}
      {run && <p className="bkg-questions-hint">{service.priceMinor > 0 ? "Each visit is paid at the visit, gets its own reminder and can be moved on its own." : "Each visit gets its own reminder and can be moved on its own."}</p>}
      <Toggle label="Email them the booking" checked={sendEmail} onChange={setSendEmail} />
    </TimeDialog>
  );
}

/** An add-on as the owner sees it: "Deep conditioning · +15 min · +$20.00". */
function extraLabel(x: BookingExtra): string {
  return [x.name, x.minutes ? `+${x.minutes} min` : "", x.priceMinor ? `+${moneyText(x.priceMinor, SHOP_CURRENCY)}` : ""].filter(Boolean).join(" · ");
}

/**
 * Book again (services plan, phase 5), opened from a client's card on Customers: the New booking window, filled in with
 * the client and their last service and person. Reads the services itself, so Customers stays light until it is used.
 */
export function BookAgainDialog({ initial, onClose, onBooked }: { initial: BookAgain; onClose: () => void; onBooked?: () => void }) {
  const [setup, setSetup] = useState<{ services: BookingService[]; settings: BookingSettings } | null>(null);
  useEffect(() => {
    let live = true;
    readBookingSetup().then((s) => {
      if (!live) return;
      if (!s.services.length) { toast.error("Add a service in Bookings first."); onClose(); return; }
      setSetup(s);
    }).catch((e) => { if (live) { toast.error(e?.message || "Your services couldn't be loaded. Try again."); onClose(); } });
    return () => { live = false; };
  }, []);
  if (!setup) return null;
  return <NewBookingDialog services={setup.services} settings={setup.settings} initial={initial} onBooked={onBooked} onClose={onClose} />;
}

// ── Services ────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The next date of a course being typed: a week after the last one filled in, at the same time. */
export function nextCourseDate(dates: readonly string[]): string {
  const last = [...dates].reverse().find((d) => /^\d{4}-\d{2}-\d{2}T/.test(d));
  if (!last) return `T${dates[dates.length - 1]?.split("T")[1] || "18:00"}`;
  return `${addDays(last.slice(0, 10), 7)}T${last.slice(11, 16) || "18:00"}`;
}

export const EMPTY_SERVICE: BookingService = { id: "", name: "", description: "", minutes: 60, gapAfter: 0, priceMinor: 0, payment: "free", depositMinor: 0, depositPercent: 0, location: "", active: true, order: 0, questions: [], places: 1, classTimes: [], holdCard: false, lateFeeMinor: 0, meet: false, packVisits: 0, packPriceMinor: 0, packDays: 0, chargeTax: false, roomId: "", rebookWeeks: 0, repeats: false, extras: [] };

function ServicesPanel({ services, rooms, onChanged, startAdding = false, onStarted }: { services: BookingService[]; rooms: BookingRoom[]; onChanged: () => void; startAdding?: boolean; onStarted?: () => void }) {
  const [editing, setEditing] = useState<BookingService | null>(null);
  useEffect(() => { if (startAdding) { setEditing({ ...EMPTY_SERVICE, order: services.length }); onStarted?.(); } }, [startAdding]);
  const [ask, confirmNode] = useConfirm();
  const remove = async (s: BookingService) => {
    if (!(await ask({ title: `Delete ${s.name}?`, message: "Customers can't book it any more. Bookings already made stay as they are.", confirmLabel: "Delete" }))) return;
    try { await bookingsAdmin("deleteService", { id: s.id }); toast.success("Service deleted"); onChanged(); } catch (e: any) { toast.error(e.message); }
  };
  return (
    <div className="bkg-services">
      <div className="bkg-services-grid">
        {services.map((s) => (
          <article key={s.id} className="bkg-tile bkg-service" data-off={!s.active || undefined}>
            <div className="bkg-service-top">
              <h3>{s.name}</h3>
              {!s.active && <StatusBadge tone="neutral">Hidden</StatusBadge>}
            </div>
            <p className="bkg-service-meta">{s.minutes} min{s.gapAfter ? ` + ${s.gapAfter} min rest` : ""}{s.places > 1 ? ` · class of ${s.places}` : ""}{rooms.find((r) => r.id === s.roomId) ? ` · ${rooms.find((r) => r.id === s.roomId)!.name}` : ""}</p>
            <p className="bkg-service-price">{s.priceMinor > 0 ? moneyText(s.priceMinor, SHOP_CURRENCY) : "Free"}{s.payment === "deposit" ? <span className="bkg-service-pay">{moneyText(depositOf(s), SHOP_CURRENCY)} deposit</span> : s.payment === "atShop" ? <span className="bkg-service-pay">Paid at the visit</span> : null}{s.holdCard ? <span className="bkg-service-pay">Card on file · {moneyText(s.lateFeeMinor, SHOP_CURRENCY)} if missed</span> : null}{s.chargeTax && s.priceMinor > 0 ? <span className="bkg-service-pay">Plus tax</span> : null}{s.meet && s.places <= 1 ? <span className="bkg-service-pay">Video call</span> : null}{offersPack(s) ? <span className="bkg-service-pay">Pack of {s.packVisits} · {moneyText(s.packPriceMinor, SHOP_CURRENCY)}</span> : null}{s.rebookWeeks ? <span className="bkg-service-pay">Rebook reminder · {rebookSpan(s.rebookWeeks)}</span> : null}</p>
            {s.description && <p className="bkg-service-desc">{s.description}</p>}
            <div className="bkg-service-actions">
              <SecondaryButton size="sm" onClick={() => setEditing(s)}>Edit</SecondaryButton>
              <IconButton label={`Delete ${s.name}`} tone="danger" onClick={() => void remove(s)}><Trash2 size={16} aria-hidden /></IconButton>
            </div>
          </article>
        ))}
        <button type="button" className="bkg-tile bkg-add" onClick={() => setEditing({ ...EMPTY_SERVICE, order: services.length })}>
          <Plus size={22} aria-hidden />
          <span>Add a service</span>
        </button>
      </div>
      {editing && <ServiceDialog service={editing} rooms={rooms} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onChanged(); }} />}
      {confirmNode}
    </div>
  );
}

/** Under the deposit box: what the customer pays now and what is left for the visit. */
const PACK_DAY_CHOICES = [0, 30, 60, 90, 180, 365, MAX_PACK_DAYS];
// Rebook reminder choices, in weeks (0 = off).
const REBOOK_CHOICES = [0, 2, 3, 4, 5, 6, 8, 10, 12, 16, 26, 52];
/** When a class with a minimum is decided, in hours before it starts. */
const DECIDE_CHOICES = [2, 6, 12, 24, 48, 72, 168];
const decideText = (h: number) => (h === 168 ? "a week" : h % 24 === 0 ? (h === 24 ? "a day" : `${h / 24} days`) : `${h} hours`);
const rebookSpan = (w: number): string => (w === 52 ? "a year" : w === 26 ? "6 months" : `${w} week${w === 1 ? "" : "s"}`);
const rebookText = (w: number): string => (!w ? "Don't send a reminder" : `After ${rebookSpan(w)}`);
const packDaysText = (d: number): string => (!d ? "No end date" : d % 365 === 0 ? `${d / 365} year${d === 365 ? "" : "s"}` : d % 30 === 0 && d < 365 ? `${d / 30} month${d === 30 ? "" : "s"}` : `${d} days`);

/** What a pack saves on single visits ("5 visits for $180.00, saves $45.00"), or what's missing. */
function packHint(price: string, count: string, packPrice: string): string {
  const one = Math.round(Number(price || 0) * 100);
  const visits = Number(count) || 0;
  const pack = Math.round(Number(packPrice || 0) * 100);
  if (!pack) return `Say what the pack costs. ${visits} single visits come to ${moneyText(one * visits, SHOP_CURRENCY)}.`;
  const saves = one * visits - pack;
  return saves > 0 ? `${visits} visits for ${moneyText(pack, SHOP_CURRENCY)}, a saving of ${moneyText(saves, SHOP_CURRENCY)} on single visits.` : `${visits} visits for ${moneyText(pack, SHOP_CURRENCY)}. That's no cheaper than ${visits} single visits.`;
}

function depositHint(price: string, deposit: string, unit: "amount" | "percent"): string {
  const priceMinor = Math.round(Number(price || 0) * 100);
  const now = depositOf({ payment: "deposit", priceMinor, depositMinor: unit === "amount" ? Math.round(Number(deposit || 0) * 100) : 0, depositPercent: unit === "percent" ? Math.round(Number(deposit || 0)) : 0 });
  if (!now || now >= priceMinor) return "Less than the price.";
  return `${moneyText(now, SHOP_CURRENCY)} when they book, ${moneyText(priceMinor - now, SHOP_CURRENCY)} at the visit.`;
}

export function ServiceDialog({ service, rooms, onClose, onSaved }: { service: BookingService; rooms: BookingRoom[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    ...service, price: service.priceMinor ? (service.priceMinor / 100).toFixed(2) : "",
    // When they pay (only asked once there is a price), and the deposit as the owner types it: an amount or a percent.
    pay: (service.payment === "deposit" || service.payment === "atShop" ? service.payment : "full") as "full" | "deposit" | "atShop",
    depositUnit: (service.depositPercent ? "percent" : "amount") as "amount" | "percent",
    deposit: service.depositPercent ? String(service.depositPercent) : service.depositMinor ? (service.depositMinor / 100).toFixed(2) : "",
    lateFee: service.lateFeeMinor ? (service.lateFeeMinor / 100).toFixed(2) : "",
    // A pack of visits: on with the number of visits, its price and how long it lasts (0 = no end).
    pack: (service.packVisits || 0) >= 2,
    packCount: String(service.packVisits || 5),
    packPrice: service.packPriceMinor ? (service.packPriceMinor / 100).toFixed(2) : "",
    packLasts: String(service.packDays || 0),
    // A first-visit price for someone new to the shop, as typed ("" for none).
    intro: service.introPriceMinor ? (service.introPriceMinor / 100).toFixed(2) : "",
    // Add-ons and options as the owner types them: minutes and price as text until saved.
    extraRows: (service.extras || []).map((e) => ({ id: e.id, name: e.name, minutes: e.minutes ? String(e.minutes) : "", price: e.priceMinor ? (e.priceMinor / 100).toFixed(2) : "" })),
  });
  // Card on file: only where something is left to charge (not paid in full), and only on Stripe.
  const paidInFull = Number(form.price) > 0 && form.pay === "full";
  const square = paysOnSquare();
  const [problem, setProblem] = useState("");
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const questions = form.questions || [];
  const classTimes = form.classTimes || [];
  // A course: its own dates ("YYYY-MM-DDTHH:MM" on the shop's clock), sold as one sign-up for all of them.
  const courseDates = form.courseDates || [];
  const course = courseDates.length > 0;
  const setCourseDate = (i: number, day: string, time: string) => set("courseDates", courseDates.map((d, j) => (j === i ? `${day}T${time}` : d)));
  const group = form.places > 1;
  const setClassTime = (i: number, change: Partial<(typeof classTimes)[number]>) => set("classTimes", classTimes.map((t, j) => (j === i ? { ...t, ...change } : t)));
  const setQuestion = (i: number, change: Partial<(typeof questions)[number]>) => set("questions", questions.map((q, j) => (j === i ? { ...q, ...change } : q)));
  const extraRows = form.extraRows;
  const setExtra = (i: number, change: Partial<(typeof extraRows)[number]>) => set("extraRows", extraRows.map((x, j) => (j === i ? { ...x, ...change } : x)));
  const save = async () => {
    setSaving(true); setProblem("");
    try {
      const priceMinor = Math.round(Number(form.price || 0) * 100);
      const { pay, depositUnit, deposit, lateFee, price: _price, pack, packCount, packPrice, packLasts, intro, extraRows: rows, ...rest } = form;
      const sellPack = pack && priceMinor > 0;
      const holdCard = form.holdCard && !paidInFull && !square;
      const share = pay === "deposit" && priceMinor > 0;
      await bookingsAdmin("saveService", { service: {
        ...rest, priceMinor, payment: priceMinor > 0 ? pay : "free",
        depositMinor: share && depositUnit === "amount" ? Math.round(Number(deposit || 0) * 100) : 0,
        depositPercent: share && depositUnit === "percent" ? Math.round(Number(deposit || 0)) : 0,
        holdCard, lateFeeMinor: holdCard ? Math.round(Number(lateFee || 0) * 100) : 0,
        meet: !!rest.meet && rest.places <= 1,
        repeats: !!rest.repeats && rest.places <= 1 && !(rest.courseDates || []).length,
        chargeTax: priceMinor > 0 && !!rest.chargeTax,
        packVisits: sellPack ? Number(packCount) || 0 : 0,
        packPriceMinor: sellPack ? Math.round(Number(packPrice || 0) * 100) : 0,
        packDays: sellPack ? Number(packLasts) || 0 : 0,
        packAnyClass: sellPack && !!rest.packAnyClass,
        introPriceMinor: priceMinor > 0 ? Math.round(Number(intro || 0) * 100) : 0,
        extras: rest.places > 1 || (rest.courseDates || []).length ? [] : rows.filter((x) => x.name.trim()).map((x) => ({
          id: x.id, name: x.name.trim(), minutes: Math.round(Number(x.minutes || 0)), priceMinor: priceMinor > 0 ? Math.round(Number(x.price || 0) * 100) : 0,
        })),
      } });
      toast.success(service.id ? "Service saved" : "Service added");
      onSaved();
    } catch (e: any) { setProblem(e.message); } finally { setSaving(false); }
  };
  return (
    <Dialog open onClose={onClose} title={service.id ? `Edit ${service.name}` : "Add a service"}
      footer={<><SecondaryButton onClick={onClose}>Cancel</SecondaryButton><PrimaryButton onClick={() => void save()} busy={saving}>Save</PrimaryButton></>}>
      <div className="bkg-form">
        <TextField label="Name" placeholder="Studio visit" value={form.name} onChange={(e) => set("name", e.target.value)} />
        <div className="bkg-two">
          <SelectField label="How long" value={String(form.minutes)} onChange={(e) => set("minutes", Number(e.target.value))}>
            {[15, 20, 30, 45, 60, 75, 90, 120, 150, 180, 240].concat(form.minutes && ![15, 20, 30, 45, 60, 75, 90, 120, 150, 180, 240].includes(form.minutes) ? [form.minutes] : [])
              .map((m) => <option key={m} value={m}>{m < 60 ? `${m} minutes` : `${m / 60} hour${m === 60 ? "" : "s"}`}</option>)}
          </SelectField>
          <SelectField label="Rest after" hint="Keeps you from being booked back to back." value={String(form.gapAfter)} onChange={(e) => set("gapAfter", Number(e.target.value))}>
            {[0, 5, 10, 15, 30, 45, 60].map((m) => <option key={m} value={m}>{m ? `${m} minutes` : "None"}</option>)}
          </SelectField>
        </div>
        <TextField label={`Price (${SHOP_CURRENCY})`} hint="Leave blank for free." inputMode="decimal" placeholder="0.00" value={form.price} onChange={(e) => set("price", e.target.value.replace(/[^\d.]/g, ""))} />
        {Number(form.price) > 0 && (
          <fieldset className="bkg-questions">
            <legend>When they pay</legend>
            <div className="bkg-seg bkg-seg-3" role="radiogroup" aria-label="When they pay">
              <button type="button" role="radio" aria-checked={form.pay === "full"} onClick={() => set("pay", "full")}>When they book</button>
              <button type="button" role="radio" aria-checked={form.pay === "deposit"} onClick={() => set("pay", "deposit")}>A deposit now</button>
              <button type="button" role="radio" aria-checked={form.pay === "atShop"} onClick={() => set("pay", "atShop")}>At the visit</button>
            </div>
            <p className="bkg-questions-hint">{form.pay === "full" ? "The whole price is paid by card when they book." : form.pay === "deposit" ? "A deposit is paid by card when they book. The rest is paid at the visit." : "Nothing is paid online. You take payment at the visit and mark it paid."}</p>
            {form.pay === "deposit" && (
              <div className="bkg-two">
                <TextField label={form.depositUnit === "percent" ? "Deposit (% of the price)" : `Deposit (${SHOP_CURRENCY})`} inputMode="decimal" placeholder={form.depositUnit === "percent" ? "25" : "0.00"} value={form.deposit}
                  hint={depositHint(form.price, form.deposit, form.depositUnit)}
                  onChange={(e) => set("deposit", e.target.value.replace(form.depositUnit === "percent" ? /\D/g : /[^\d.]/g, ""))} />
                <SelectField label="Deposit is" value={form.depositUnit} onChange={(e) => { set("depositUnit", e.target.value as "amount" | "percent"); set("deposit", ""); }}>
                  <option value="amount">An amount</option>
                  <option value="percent">A share of the price</option>
                </SelectField>
              </div>
            )}
          </fieldset>
        )}
        {Number(form.price) > 0 && (
          <TextField label={`First-visit price (${SHOP_CURRENCY}, optional)`} inputMode="decimal" placeholder="0.00" value={form.intro}
            hint={Number(form.intro) > 0 ? `People who have never booked with you pay this the first time, then ${moneyText(Math.round(Number(form.price) * 100), SHOP_CURRENCY)}.` : "An intro offer for people who have never booked with you."}
            onChange={(e) => set("intro", e.target.value.replace(/[^\d.]/g, ""))} />
        )}
        {Number(form.price) > 0 && (
          <fieldset className="bkg-questions">
            <legend>Pack of visits</legend>
            <Toggle label="Sell a pack of visits" checked={form.pack} onChange={(v) => set("pack", v)} />
            <p className="bkg-questions-hint">{form.pack
              ? packHint(form.price, form.packCount, form.packPrice)
              : "Customers pay once for several visits, get a code by email and book each visit with it."}</p>
            {form.pack && group && !course && (
              <Toggle label="A class pass: use it for any weekly class" checked={!!form.packAnyClass} onChange={(v) => set("packAnyClass", v)} />
            )}
            {form.pack && (
              <div className="bkg-three">
                <SelectField label="Visits" value={form.packCount} onChange={(e) => set("packCount", e.target.value)}>
                  {Array.from({ length: MAX_PACK_VISITS - 1 }, (_, i) => i + 2).filter((n) => n <= 12 || n % 5 === 0 || String(n) === form.packCount)
                    .map((n) => <option key={n} value={n}>{n} visits</option>)}
                </SelectField>
                <TextField label={`Pack price (${SHOP_CURRENCY})`} inputMode="decimal" placeholder="0.00" value={form.packPrice}
                  onChange={(e) => set("packPrice", e.target.value.replace(/[^\d.]/g, ""))} />
                <SelectField label="Use within" value={form.packLasts} onChange={(e) => set("packLasts", e.target.value)}>
                  {[0, 30, 60, 90, 180, 365, MAX_PACK_DAYS].concat(PACK_DAY_CHOICES.includes(Number(form.packLasts)) ? [] : [Number(form.packLasts)])
                    .map((d) => <option key={d} value={d}>{packDaysText(d)}</option>)}
                </SelectField>
              </div>
            )}
          </fieldset>
        )}
        {!paidInFull && (
          <fieldset className="bkg-questions">
            <legend>Missed bookings</legend>
            {square ? (
              <p className="bkg-questions-hint">Keeping a card on file for a missed-booking fee needs Stripe. Your shop takes cards through Square.</p>
            ) : (
              <>
                <Toggle label="Keep a card on file" checked={!!form.holdCard} onChange={(v) => set("holdCard", v)} />
                <p className="bkg-questions-hint">{form.holdCard
                  ? "Customers save a card when they book. Nothing is taken unless they don't turn up, or you cancel for them late. Then you can charge the fee once, from the booking."
                  : "Customers book without a card. Turn this on to charge a fee when someone doesn't turn up."}</p>
                {form.holdCard && (
                  <TextField label={`Fee for a missed booking (${SHOP_CURRENCY})`} inputMode="decimal" placeholder="0.00" value={form.lateFee}
                    hint={Number(form.price) > 0 ? `Up to the price, ${moneyText(Math.round(Number(form.price) * 100), SHOP_CURRENCY)}. Customers see it before they book.` : `Up to ${moneyText(MAX_FREE_LATE_FEE, SHOP_CURRENCY)}. Customers see it before they book.`}
                    onChange={(e) => set("lateFee", e.target.value.replace(/[^\d.]/g, ""))} />
                )}
              </>
            )}
          </fieldset>
        )}
        {Number(form.price) > 0 && (
          <div className="bkg-meet">
            <Toggle label="Charge sales tax" checked={!!form.chargeTax} onChange={(v) => set("chargeTax", v)} />
            <p className="bkg-questions-hint">{form.chargeTax
              ? "Your shop's sales tax rate is added on top of the price. Customers see it before they pay, and it shows in the Tax centre."
              : "The price is all they pay. Turn this on to add your sales tax on top."}</p>
          </div>
        )}
        <TextField label="Where (optional)" placeholder="The studio, 12 Ink Lane" value={form.location} onChange={(e) => set("location", e.target.value)} />
        {(rooms.length > 0 || form.roomId) && (
          <SelectField label="Room or chair" hint="Only one booking can use it at a time, whoever does it." value={form.roomId} onChange={(e) => set("roomId", e.target.value)}>
            <option value="">No room needed</option>
            {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            {form.roomId && !rooms.some((r) => r.id === form.roomId) && <option value={form.roomId}>A room you removed</option>}
          </SelectField>
        )}
        {!group && (
          <div className="bkg-meet">
            <Toggle label="Video call with Google Meet" checked={!!form.meet} onChange={(v) => set("meet", v)} />
            <p className="bkg-questions-hint">{form.meet
              ? "Each booking gets its own Meet link, in the customer's emails and on their booking page. It needs Google Calendar turned on under Hours & rules."
              : "For times held online: each booking gets its own Google Meet link."}</p>
          </div>
        )}
        <div className="bkg-meet">
          <SelectField label="Remind them to come back" value={String(form.rebookWeeks || 0)} onChange={(e) => set("rebookWeeks", Number(e.target.value))}>
            {REBOOK_CHOICES.concat(REBOOK_CHOICES.includes(form.rebookWeeks || 0) ? [] : [form.rebookWeeks || 0])
              .map((w) => <option key={w} value={w}>{rebookText(w)}</option>)}
          </SelectField>
          <p className="bkg-questions-hint">{form.rebookWeeks
            ? `${rebookSpan(form.rebookWeeks).replace(/^a/, "A")} after a visit, customers get one email with a button to book again, unless they've already booked. It has an unsubscribe link.`
            : "Send customers one email to book again a set time after their visit."}</p>
        </div>
        {!group && (
          <div className="bkg-meet">
            <Toggle label="Clients can book a standing appointment" checked={!!form.repeats} onChange={(v) => set("repeats", v)} />
            <p className="bkg-questions-hint">{!form.repeats
              ? `Clients book the same time every few weeks, up to ${MAX_RUN_VISITS} visits, in one go. You can always set one up yourself from New booking.`
              : runsOnline({ payment: Number(form.price) > 0 ? form.pay : "free", places: 1, holdCard: form.holdCard && !paidInFull && !square, repeats: true })
                ? "Clients choose how often and how many visits when they book. Each visit gets its own reminder and can be moved on its own."
                : "Clients can only book a run when it's free or paid at the visit, with no card on file. You can still set one up from New booking."}</p>
          </div>
        )}
        <fieldset className="bkg-questions">
          <legend>Who can book a time</legend>
          <div className="bkg-seg" role="radiogroup" aria-label="Who can book a time">
            <button type="button" role="radio" aria-checked={!group} onClick={() => set("places", 1)}>One customer</button>
            <button type="button" role="radio" aria-checked={group} onClick={() => { if (!group) set("places", 8); }}>A group class</button>
          </div>
          {group && (
            <>
              <TextField label="Places at each time" inputMode="numeric" value={String(form.places)} hint="Each booking takes one place."
                onChange={(e) => set("places", Math.min(MAX_PLACES, Math.max(2, Number(e.target.value.replace(/\D/g, "")) || 2)))} />
              <div className="bkg-seg" role="radiogroup" aria-label="When it runs">
                <button type="button" role="radio" aria-checked={!course} onClick={() => set("courseDates", [])}>Every week</button>
                <button type="button" role="radio" aria-checked={course} onClick={() => { if (!course) set("courseDates", ["T18:00", "T18:00"]); }}>A course with set dates</button>
              </div>
              {course && (
                <>
                  <p className="bkg-questions-hint">People sign up once, pay one price and get a place on every date. {form.lateJoin ? "Once it starts, people can still join while 2 or more dates are left, paying only for those." : "Sign-ups close when the first date starts."}</p>
                  <Toggle label="Let people join after it starts, paying for the dates left" checked={!!form.lateJoin} onChange={(v) => set("lateJoin", v)} />
                  {courseDates.map((d, i) => (
                    <div key={i} className="bkg-classtime">
                      <TextField label={`Date ${i + 1}`} type="date" value={d.split("T")[0]} onChange={(e) => setCourseDate(i, e.target.value, d.split("T")[1] || "18:00")} />
                      <TextField label="Starts" type="time" value={d.split("T")[1] || ""} onChange={(e) => setCourseDate(i, d.split("T")[0], e.target.value)} />
                      <button type="button" className="bkg-question-remove" aria-label={`Remove date ${i + 1}`} disabled={courseDates.length <= 2} onClick={() => set("courseDates", courseDates.filter((_, j) => j !== i))}><Trash2 size={16} aria-hidden /></button>
                    </div>
                  ))}
                  {courseDates.length < MAX_COURSE_DATES && (
                    <SecondaryButton icon={<Plus size={16} aria-hidden />} onClick={() => set("courseDates", [...courseDates, nextCourseDate(courseDates)])}>Add a date</SecondaryButton>
                  )}
                </>
              )}
              {!course && <p className="bkg-questions-hint">{classTimes.length ? "The class runs at these times each week." : "Add the times the class runs each week, or leave this empty to offer every free time in your hours."}</p>}
              {!course && classTimes.map((t, i) => (
                <div key={i} className="bkg-classtime">
                  <SelectField label="Day" value={String(t.weekday)} onChange={(e) => setClassTime(i, { weekday: Number(e.target.value) })}>
                    {ORDERED_DAYS.map((d) => <option key={d} value={d}>{WEEKDAYS[d]}</option>)}
                  </SelectField>
                  <TextField label="Starts" type="time" value={t.time} onChange={(e) => setClassTime(i, { time: e.target.value })} />
                  <button type="button" className="bkg-question-remove" aria-label={`Remove ${WEEKDAYS[t.weekday]} ${t.time}`} onClick={() => set("classTimes", classTimes.filter((_, j) => j !== i))}><Trash2 size={16} aria-hidden /></button>
                </div>
              ))}
              {!course && classTimes.length < MAX_CLASS_TIMES && (
                <SecondaryButton icon={<Plus size={16} aria-hidden />} onClick={() => set("classTimes", [...classTimes, { weekday: classTimes[classTimes.length - 1]?.weekday ?? 6, time: classTimes[classTimes.length - 1]?.time ?? "14:00" }])}>Add a class time</SecondaryButton>
              )}
              {(course || classTimes.length > 0) && (
                <div className="bkg-meet">
                  <SelectField label="Minimum to run" value={String(form.minPlaces || 0)}
                    onChange={(e) => { const n = Number(e.target.value); setForm((f) => ({ ...f, minPlaces: n || undefined, decideHours: n ? f.decideHours || DECIDE_HOURS : undefined })); }}>
                    <option value="0">It always runs</option>
                    {Array.from({ length: Math.max(0, form.places - 1) }, (_, i) => i + 2).map((n) => <option key={n} value={n}>{n} people</option>)}
                  </SelectField>
                  {!!form.minPlaces && (
                    <SelectField label="Decide" value={String(form.decideHours || DECIDE_HOURS)} onChange={(e) => set("decideHours", Number(e.target.value))}>
                      {DECIDE_CHOICES.concat(DECIDE_CHOICES.includes(form.decideHours || DECIDE_HOURS) ? [] : [form.decideHours || DECIDE_HOURS])
                        .map((h) => <option key={h} value={h}>{decideText(h)} before it starts</option>)}
                    </SelectField>
                  )}
                  <p className="bkg-questions-hint">{form.minPlaces
                    ? `If fewer than ${form.minPlaces} have signed up ${decideText(form.decideHours || DECIDE_HOURS)} before ${course ? "the first date" : "a class"}, it's cancelled: everyone is refunded in full and emailed, and you get an email too.`
                    : `Pick a number to cancel ${course ? "the course" : "a class"} automatically when too few sign up.`}</p>
                </div>
              )}
            </>
          )}
        </fieldset>
        <TextArea label="About it (optional)" rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} />
        {!group && !course && (
          <fieldset className="bkg-questions">
            <legend>Add-ons and options <StatusBadge tone="info" glyph={false}>Beta</StatusBadge></legend>
            <p className="bkg-questions-hint">{Number(form.price) > 0
              ? "Extras clients can tick when they book, like a deep conditioning or long hair. Each adds its time and price, and the calendar keeps the longer time."
              : "Extras clients can tick when they book. Each adds its time, and the calendar keeps the longer time. Add a price above to charge for them."}</p>
            {extraRows.map((x, i) => (
              <div key={x.id} className="bkg-question bkg-extra">
                <TextField label={`Extra ${i + 1}`} placeholder="Deep conditioning" value={x.name} maxLength={80} onChange={(e) => setExtra(i, { name: e.target.value })} />
                <div className="bkg-question-row">
                  <TextField label="Adds minutes" type="number" inputMode="numeric" min={0} max={MAX_EXTRA_MINUTES} step={5} placeholder="0" value={x.minutes} onChange={(e) => setExtra(i, { minutes: e.target.value })} />
                  {Number(form.price) > 0 && <TextField label="Adds to the price" type="number" inputMode="decimal" min={0} step="0.01" placeholder="0.00" value={x.price} onChange={(e) => setExtra(i, { price: e.target.value })} />}
                  <button type="button" className="bkg-question-remove" aria-label={`Remove extra ${i + 1}`} onClick={() => set("extraRows", extraRows.filter((_, j) => j !== i))}><Trash2 size={16} aria-hidden /></button>
                </div>
              </div>
            ))}
            {extraRows.length < MAX_EXTRAS
              ? <SecondaryButton icon={<Plus size={16} aria-hidden />} onClick={() => set("extraRows", [...extraRows, { id: `x${Date.now().toString(36)}`, name: "", minutes: "", price: "" }])}>Add an extra</SecondaryButton>
              : <p className="bkg-questions-hint">That's the most extras a service can have ({MAX_EXTRAS}).</p>}
          </fieldset>
        )}
        <fieldset className="bkg-questions">
          <legend>Questions to ask</legend>
          <p className="bkg-questions-hint">Customers answer these when they book, after their name and email.</p>
          {questions.map((q, i) => (
            <div key={q.id} className="bkg-question">
              <TextField label={`Question ${i + 1}`} placeholder="What would you like to work on?" value={q.label} maxLength={140}
                onChange={(e) => setQuestion(i, { label: e.target.value })} />
              <div className="bkg-question-row">
                <Toggle label="Must answer" checked={q.required} onChange={(v) => setQuestion(i, { required: v })} />
                <Toggle label="Long answer" checked={q.long} onChange={(v) => setQuestion(i, { long: v })} />
                <button type="button" className="bkg-question-remove" aria-label={`Remove question ${i + 1}`} onClick={() => set("questions", questions.filter((_, j) => j !== i))}><Trash2 size={16} aria-hidden /></button>
              </div>
            </div>
          ))}
          {questions.length < MAX_QUESTIONS
            ? <SecondaryButton icon={<Plus size={16} aria-hidden />} onClick={() => set("questions", [...questions, { id: `q${Date.now().toString(36)}`, label: "", long: false, required: false }])}>Add a question</SecondaryButton>
            : <p className="bkg-questions-hint">That's the most a service can ask ({MAX_QUESTIONS}).</p>}
        </fieldset>
        <Toggle label="Customers can book it" checked={form.active} onChange={(v) => set("active", v)} />
        {problem && <p className="bkg-error" role="alert">{problem}</p>}
      </div>
    </Dialog>
  );
}

// ── Hours & rules ───────────────────────────────────────────────────────────────────────────────────────────────────

const ORDERED_DAYS = [1, 2, 3, 4, 5, 6, 0];

function HoursPanel({ settings, services, saved, onSaved, active }: { settings: BookingSettings; services: BookingService[]; saved: boolean; onSaved: () => void; active: boolean }) {
  const [form, setForm] = useState<BookingSettings>(settings);
  const [saving, setSaving] = useState(false);
  // The on/off switch lives at the top of the page and saves by itself, so flipping it never throws away hours being edited.
  const hoursOf = JSON.stringify({ ...settings, live: false });
  useEffect(() => setForm(settings), [hoursOf]);
  const dirty = !saved || JSON.stringify({ ...form, live: false }) !== hoursOf;
  const save = async () => {
    setSaving(true);
    try {
      const r = await bookingsAdmin<{ googleCalendar?: { available: boolean; filled: number } }>("saveSettings", { settings: { ...form, live: settings.live } });
      const g = r?.googleCalendar;
      if (g && !g.available) toast.error("Saved, but Google Calendar isn't linked yet. Tick Calendar in Settings › Google, then save again.");
      else toast.success(g?.filled ? `Saved. ${g.filled} coming ${g.filled === 1 ? "booking is" : "bookings are"} now in Google Calendar.` : "Hours saved");
      onSaved();
    }
    catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };
  return (
    <div className="bkg-hours">
      <section className="bkg-tile">
        <h2 className="bkg-tile-title">Opening hours</h2>
        <WeekHoursEditor hours={form.hours} onChange={(hours) => setForm((f) => ({ ...f, hours }))} />
      </section>

      <div className="bkg-hours-side">
        <section className="bkg-tile">
          <h2 className="bkg-tile-title">Rules</h2>
          <div className="bkg-form">
            <SelectField label="Book at least" value={String(form.minNoticeHours)} onChange={(e) => setForm({ ...form, minNoticeHours: Number(e.target.value) })}>
              {[0, 1, 2, 4, 12, 24, 48, 72].map((h) => <option key={h} value={h}>{h === 0 ? "Any time before" : h < 24 ? `${h} hour${h === 1 ? "" : "s"} ahead` : `${h / 24} day${h === 24 ? "" : "s"} ahead`}</option>)}
            </SelectField>
            <SelectField label="Book up to" value={String(form.maxDaysAhead)} onChange={(e) => setForm({ ...form, maxDaysAhead: Number(e.target.value) })}>
              {[7, 14, 30, 60, 90, 180, 365].map((d) => <option key={d} value={d}>{d < 30 ? `${d / 7} week${d === 7 ? "" : "s"} ahead` : d === 365 ? "a year ahead" : `${Math.round(d / 30)} months ahead`}</option>)}
            </SelectField>
            <SelectField label="Customers can cancel or move" hint="Paid bookings cancelled online in time are refunded in full. Later, they contact you." value={String(form.cancelHours)} onChange={(e) => setForm({ ...form, cancelHours: Number(e.target.value) })}>
              {[0, 2, 12, 24, 48, 72].map((h) => <option key={h} value={h}>{h === 0 ? "Until it starts" : `Up to ${h < 24 ? `${h} hours` : `${h / 24} day${h === 24 ? "" : "s"}`} before`}</option>)}
            </SelectField>
            <SelectField label="Reminder email" hint="Sent to customers before their booking, with a link to cancel or move it." value={String(form.reminderHours)} onChange={(e) => { const first = Number(e.target.value); setForm({ ...form, reminderHours: first, secondReminderHours: first && form.secondReminderHours >= first ? 0 : form.secondReminderHours }); }}>
              {REMINDER_HOURS.map((h) => <option key={h} value={h}>{h === 0 ? "Don't send" : h < 24 ? `${h} hours before` : `${h / 24} day${h === 24 ? "" : "s"} before`}</option>)}
            </SelectField>
            <SelectField label="Second reminder" hint="A short note on the day, for people who booked well ahead." value={String(form.secondReminderHours)} onChange={(e) => setForm({ ...form, secondReminderHours: Number(e.target.value) })}>
              {SECOND_REMINDER_HOURS.filter((h) => !form.reminderHours || h < form.reminderHours).map((h) => <option key={h} value={h}>{h === 0 ? "Don't send" : `${h} hour${h === 1 ? "" : "s"} before`}</option>)}
            </SelectField>
            <SelectField label="Your morning list" hint="The day's bookings in one email to you, on days there are any." value={form.dailySummary ? "on" : "off"} onChange={(e) => setForm({ ...form, dailySummary: e.target.value === "on" })}>
              <option value="off">Don't send</option>
              <option value="on">Email me at 7 am</option>
            </SelectField>
            <SelectField label="Hold a freed place for" hint="When a place opens, the first person on the waiting list has this long to book it before it goes to the next." value={String(form.waitHoldMinutes)} onChange={(e) => setForm({ ...form, waitHoldMinutes: Number(e.target.value) })}>
              {WAIT_HOLD_MINUTES.map((m) => <option key={m} value={m}>{m < 60 ? `${m} minutes` : m === 60 ? "1 hour" : `${m / 60} hours`}</option>)}
            </SelectField>
            <SelectField label="Start times every" value={String(form.step)} onChange={(e) => setForm({ ...form, step: Number(e.target.value) })}>
              {BOOKING_STEPS.map((m) => <option key={m} value={m}>{m === 60 ? "hour" : `${m} minutes`}</option>)}
            </SelectField>
          </div>
        </section>
        <TextsTile on={form.textReminders === true} reminders={form.reminderHours > 0 || form.secondReminderHours > 0} onChange={(textReminders) => setForm({ ...form, textReminders })} />
        <TipsTile tips={form.tips} percents={form.tipPercents} onChange={(tips, tipPercents) => setForm({ ...form, tips, tipPercents })} />
        <ThanksTile form={form} onChange={(patch) => setForm({ ...form, ...patch })} />
        <FormTile form={form.intakeForm} services={services} onChange={(intakeForm) => setForm({ ...form, intakeForm })} />
        <PickupTile form={form} onChange={(patch) => setForm({ ...form, ...patch })} />
        <section className="bkg-tile">
          <h2 className="bkg-tile-title">Days off</h2>
          <DaysOffEditor days={form.daysOff} onChange={(daysOff) => setForm({ ...form, daysOff })} />
        </section>
        <CalendarTile google={form.googleCalendar} onGoogle={(on) => setForm({ ...form, googleCalendar: on })} />
      </div>
      {active && <SaveBar dirty={dirty} saving={saving} onSave={() => void save()} onDiscard={() => setForm(saved ? settings : DEFAULT_BOOKING_SETTINGS)} message={saved ? undefined : "Save your hours to start taking bookings."} />}
    </div>
  );
}

/** A week of hours, Monday first: a day is open with one or more windows, or closed. */
function WeekHoursEditor({ hours, onChange, who = "" }: { hours: HoursWindow[][]; onChange: (hours: HoursWindow[][]) => void; who?: string }) {
  const setDay = (wd: number, windows: HoursWindow[]) => onChange(hours.map((h, i) => (i === wd ? windows : h)));
  const name = (wd: number) => `${who ? `${who} ` : ""}${WEEKDAYS[wd]}`;
  return (
    <ul className="bkg-week-hours">
      {ORDERED_DAYS.map((wd) => {
        const windows = hours[wd] || [];
        const open = windows.length > 0;
        return (
          <li key={wd} className="bkg-hours-row" data-closed={!open || undefined}>
            <Toggle label={WEEKDAYS[wd]} checked={open} onChange={(v) => setDay(wd, v ? [{ start: "10:00", end: "17:00" }] : [])} />
            <div className="bkg-hours-windows">
              {open ? windows.map((w, i) => (
                <div key={i} className="bkg-window">
                  <TextField label={`${name(wd)} from`} hideLabel type="time" step={300} value={w.start} onChange={(e) => setDay(wd, windows.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} />
                  <span aria-hidden>–</span>
                  <TextField label={`${name(wd)} until`} hideLabel type="time" step={300} value={w.end} onChange={(e) => setDay(wd, windows.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} />
                  {windows.length > 1 && <IconButton label="Remove these hours" onClick={() => setDay(wd, windows.filter((_, j) => j !== i))}><Trash2 size={15} aria-hidden /></IconButton>}
                </div>
              )) : <span className="bkg-closed">{who ? "Off" : "Closed"}</span>}
              {open && windows.length < 3 && (
                <GhostButton size="sm" onClick={() => setDay(wd, [...windows, { start: windows[windows.length - 1].end, end: "18:00" }])}>Add hours</GhostButton>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Days off coming up, with a day to add; past ones are kept but not shown. */
function DaysOffEditor({ days, onChange, label = "Add a day off" }: { days: string[]; onChange: (days: string[]) => void; label?: string }) {
  const [adding, setAdding] = useState("");
  const coming = days.filter((d) => d >= today());
  return (
    <>
      <div className="bkg-dayoff-add">
        <TextField label={label} type="date" min={today()} value={adding} onChange={(e) => setAdding(e.target.value)} />
        <SecondaryButton disabled={!adding} onClick={() => { onChange([...new Set([...days, adding])].sort()); setAdding(""); }}>Add</SecondaryButton>
      </div>
      {coming.length === 0 ? <p className="bkg-day-empty">No days off coming up.</p> : (
        <ul className="bkg-chips">
          {coming.map((d) => (
            <li key={d}><span>{dayText(d, "long")}</span><IconButton label={`Remove ${dayText(d, "long")}`} onClick={() => onChange(days.filter((x) => x !== d))}><Trash2 size={14} aria-hidden /></IconButton></li>
          ))}
        </ul>
      )}
    </>
  );
}

// ── Team & rooms ────────────────────────────────────────────────────────────────────────────────────────────────────

const shortId = (prefix: string) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** What one person does, in a line: their services and whose hours. */
function personLine(p: StaffMember, services: BookingService[]): string {
  const does = !p.serviceIds.length ? "Every service" : services.filter((s) => p.serviceIds.includes(s.id)).map((s) => s.name).join(", ") || "No services yet";
  return `${does} · ${p.ownHours ? "Their own hours" : "Your opening hours"}${p.email ? " · Gets their day by email" : ""}`;
}

/**
 * The people clients can book and the rooms only one booking can use at a time. With nobody listed the shop books as
 * one calendar, as before. Saved with the rest of Hours & rules through the server (op saveSettings).
 */
function TeamPanel({ settings, services, onSaved }: { settings: BookingSettings; services: BookingService[]; onSaved: () => void }) {
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [roomName, setRoomName] = useState("");
  const [saving, setSaving] = useState(false);
  const [ask, confirmNode] = useConfirm();
  const save = async (change: Partial<Pick<BookingSettings, "staff" | "rooms">>, done: string) => {
    setSaving(true);
    try { await bookingsAdmin("saveSettings", { settings: { ...settings, ...change } }); toast.success(done); onSaved(); return true; }
    catch (e: any) { toast.error(e?.message || "That didn't save. Please try again."); return false; }
    finally { setSaving(false); }
  };
  const addRoom = async () => {
    const name = roomName.trim();
    if (!name) return;
    if (await save({ rooms: [...settings.rooms, { id: shortId("room"), name }] }, `${name} added`)) setRoomName("");
  };
  const removeRoom = async (r: BookingRoom) => {
    const using = services.filter((s) => s.roomId === r.id).map((s) => s.name);
    if (!(await ask({ title: `Remove ${r.name}?`, message: using.length ? `${using.join(", ")} won't need a room any more. Bookings already made stay.` : "Bookings already made stay as they are.", confirmLabel: "Remove" }))) return;
    await save({ rooms: settings.rooms.filter((x) => x.id !== r.id) }, `${r.name} removed`);
  };
  const newPerson = (): StaffMember => ({ id: "", name: "", active: true, serviceIds: [], ownHours: false, hours: settings.hours.map((d) => d.map((w) => ({ ...w }))), daysOff: [], email: "" });
  return (
    <div className="bkg-team">
      <section className="bkg-tile">
        <div className="bkg-team-head">
          <h2 className="bkg-tile-title">People clients can book</h2>
          {settings.staff.length < MAX_STAFF && <SecondaryButton size="sm" icon={<Plus size={16} aria-hidden />} onClick={() => setEditing(newPerson())}>Add a person</SecondaryButton>}
        </div>
        {settings.staff.length === 0 ? (
          <div className="bkg-team-empty">
            <UserRound size={22} aria-hidden />
            <p>Just you? Leave this empty and clients book your one calendar. Add the people who see clients and each booking goes to someone who does that service and is free.</p>
          </div>
        ) : (
          <ul className="bkg-people">
            {settings.staff.map((p) => (
              <li key={p.id}>
                <button type="button" className="bkg-person" onClick={() => setEditing(p)} data-off={!p.active || undefined}>
                  <span className="bkg-person-initial" aria-hidden>{p.name.slice(0, 1).toUpperCase()}</span>
                  <span className="bkg-person-text">
                    <strong>{p.name}</strong>
                    <span>{personLine(p, services)}</span>
                  </span>
                  {!p.active && <StatusBadge tone="neutral">Not taking bookings</StatusBadge>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="bkg-tile">
        <h2 className="bkg-tile-title">Rooms and chairs</h2>
        <p className="bkg-questions-hint">A room only one booking can use at a time. Pick it on each service that needs it.</p>
        {settings.rooms.length > 0 && (
          <ul className="bkg-chips">
            {settings.rooms.map((r) => (
              <li key={r.id}><span className="bkg-room-name"><DoorOpen size={14} aria-hidden /> {r.name}</span><IconButton label={`Remove ${r.name}`} disabled={saving} onClick={() => void removeRoom(r)}><Trash2 size={14} aria-hidden /></IconButton></li>
            ))}
          </ul>
        )}
        {settings.rooms.length < MAX_ROOMS && (
          <div className="bkg-dayoff-add bkg-room-add">
            <TextField label="Add a room or chair" placeholder="Treatment room" value={roomName} maxLength={60} onChange={(e) => setRoomName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addRoom(); } }} />
            <SecondaryButton disabled={!roomName.trim() || saving} onClick={() => void addRoom()}>Add</SecondaryButton>
          </div>
        )}
      </section>
      {editing && (
        <PersonDialog person={editing} services={services}
          onClose={() => setEditing(null)}
          onSave={async (p) => {
            const staff = p.id ? settings.staff.map((x) => (x.id === p.id ? p : x)) : [...settings.staff, { ...p, id: shortId("p") }];
            if (await save({ staff }, p.id ? `${p.name} saved` : `${p.name} added`)) setEditing(null);
          }}
          onRemove={editing.id ? async () => {
            if (!(await ask({ title: `Remove ${editing.name}?`, message: editing.commissionPercent ? "Clients can't pick them any more. Their bookings stay, with their name on them, but Team pay will no longer know their commission. To keep it, turn off Taking bookings instead." : "Clients can't pick them any more. Their bookings stay, with their name on them.", confirmLabel: "Remove" }))) return;
            if (await save({ staff: settings.staff.filter((x) => x.id !== editing.id) }, `${editing.name} removed`)) setEditing(null);
          } : undefined} />
      )}
      {confirmNode}
    </div>
  );
}

function PersonDialog({ person, services, onClose, onSave, onRemove }: {
  person: StaffMember; services: BookingService[]; onClose: () => void; onSave: (p: StaffMember) => Promise<void>; onRemove?: () => Promise<void>;
}) {
  const [form, setForm] = useState<StaffMember>(person);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof StaffMember>(k: K, v: StaffMember[K]) => setForm((f) => ({ ...f, [k]: v }));
  const every = form.serviceIds.length === 0;
  const pick = (id: string, on: boolean) => {
    const next = on ? [...form.serviceIds, id] : form.serviceIds.filter((x) => x !== id);
    // Ticking every service is the same as Every service.
    set("serviceIds", next.length === services.length ? [] : next);
  };
  // Their own price and length for each one-to-one service they do, as typed (blank = the service's own).
  const [rateRows, setRateRows] = useState<Record<string, { minutes: string; price: string }>>(() => Object.fromEntries((person.rates || []).map((r) => [r.serviceId, {
    minutes: r.minutes ? String(r.minutes) : "", price: r.priceMinor != null ? (r.priceMinor / 100).toFixed(2) : "",
  }])));
  const rated = services.filter((s) => (s.places || 1) <= 1 && !(s.courseDates || []).length && (every || form.serviceIds.includes(s.id)));
  const setRate = (id: string, change: Partial<{ minutes: string; price: string }>) => setRateRows((r) => ({ ...r, [id]: { ...(r[id] || { minutes: "", price: "" }), ...change } }));
  const rates = (): PersonRate[] => rated.flatMap((s) => {
    const row = rateRows[s.id];
    const minutes = row?.minutes.trim() ? Math.round(Number(row.minutes)) : null;
    const priceMinor = s.payment !== "free" && row?.price.trim() ? Math.round(Number(row.price) * 100) : null;
    return minutes == null && priceMinor == null ? [] : [{ serviceId: s.id, minutes, priceMinor }];
  });
  // Their commission share as typed (blank = none): shown on Team pay, never paid from the shop.
  const [share, setShare] = useState(person.commissionPercent ? String(person.commissionPercent) : "");
  const shareProblem = share.trim() && (!commissionOf(share) || Number(share) > 100) ? "A share from 0.5 to 100, like 40." : "";
  const save = async () => {
    setSaving(true);
    try {
      const { commissionPercent: _old, ...rest } = form;
      const percent = commissionOf(share);
      await onSave({ ...rest, name: form.name.trim(), rates: rates(), ...(percent ? { commissionPercent: percent } : {}) });
    } finally { setSaving(false); }
  };
  return (
    <Dialog open onClose={onClose} title={person.id ? `Edit ${person.name}` : "Add a person"}
      footerStart={onRemove ? <DestructiveButton onClick={() => void onRemove()} disabled={saving}>Remove</DestructiveButton> : undefined}
      footer={<><SecondaryButton onClick={onClose}>Cancel</SecondaryButton><PrimaryButton onClick={() => void save()} busy={saving} disabled={!form.name.trim() || (!!form.email && !EMAIL_SHAPE.test(form.email)) || !!shareProblem}>Save</PrimaryButton></>}>
      <div className="bkg-form">
        <TextField label="Name" placeholder="Sam" hint="Clients see it when they book." value={form.name} maxLength={60} onChange={(e) => set("name", e.target.value)} />
        <Toggle label="Taking bookings" checked={form.active} onChange={(v) => set("active", v)} />
        <fieldset className="bkg-questions">
          <legend>What they do</legend>
          <Toggle label="Every service" checked={every} onChange={(v) => set("serviceIds", v ? [] : services.slice(0, 1).map((s) => s.id))} />
          {!every && (
            <div className="bkg-person-services">
              {services.map((s) => <Checkbox key={s.id} label={s.name} checked={form.serviceIds.includes(s.id)} onChange={(e) => pick(s.id, e.target.checked)} />)}
            </div>
          )}
        </fieldset>
        {rated.length > 0 && (
          <fieldset className="bkg-questions">
            <legend>Their prices and lengths <StatusBadge tone="info" glyph={false}>Beta</StatusBadge></legend>
            <p className="bkg-questions-hint">Leave empty to use the service's own. Clients see {form.name.trim() || "their"}{form.name.trim() ? "'s" : ""} price when they pick {form.name.trim() ? "them" : "this person"}.</p>
            {rated.map((s) => (
              <div key={s.id} className="bkg-question bkg-rate">
                <div className="bkg-question-row">
                  <TextField label={`${s.name}: minutes`} type="number" inputMode="numeric" min={5} max={480} step={5} placeholder={String(s.minutes)}
                    value={rateRows[s.id]?.minutes || ""} onChange={(e) => setRate(s.id, { minutes: e.target.value })} />
                  {s.payment !== "free" && <TextField label={`${s.name}: price`} type="number" inputMode="decimal" min={0} step="0.01" placeholder={(s.priceMinor / 100).toFixed(2)}
                    value={rateRows[s.id]?.price || ""} onChange={(e) => setRate(s.id, { price: e.target.value })} />}
                </div>
              </div>
            ))}
          </fieldset>
        )}
        <fieldset className="bkg-questions">
          <legend>Their pay <StatusBadge tone="info" glyph={false}>Beta</StatusBadge></legend>
          <TextField label="Commission (%)" type="number" inputMode="decimal" min={0.5} max={100} step={0.5} placeholder="40" className="bkg-share"
            value={share} onChange={(e) => setShare(e.target.value)} error={shareProblem || undefined}
            hint="Their share of what their bookings take before tax. Team pay adds it up with their tips each month. Leave empty for none." />
        </fieldset>
        <fieldset className="bkg-questions">
          <legend>When they work</legend>
          <div className="bkg-seg" role="radiogroup" aria-label="When they work">
            <button type="button" role="radio" aria-checked={!form.ownHours} onClick={() => set("ownHours", false)}>Your opening hours</button>
            <button type="button" role="radio" aria-checked={form.ownHours} onClick={() => set("ownHours", true)}>Their own hours</button>
          </div>
          {form.ownHours && <WeekHoursEditor hours={form.hours} onChange={(hours) => set("hours", hours)} who={form.name.trim() || "Their"} />}
        </fieldset>
        <fieldset className="bkg-questions">
          <legend>Their days off</legend>
          <p className="bkg-questions-hint">On top of the shop's days off.</p>
          <DaysOffEditor days={form.daysOff} onChange={(days) => set("daysOff", days)} label="Add a day off for them" />
        </fieldset>
        <fieldset className="bkg-questions">
          <legend>Their own day</legend>
          <TextField label="Email" type="email" placeholder="sam@example.com" value={form.email} maxLength={320} onChange={(e) => set("email", e.target.value.trim())}
            hint="Each morning they have bookings, they get their day by email. Leave empty for none."
            error={form.email && !EMAIL_SHAPE.test(form.email) ? "Check this email address." : undefined} />
          {person.id ? <PersonCalendar person={person} /> : <p className="bkg-questions-hint">Save first to make their own calendar link.</p>}
        </fieldset>
      </div>
    </Dialog>
  );
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** One person's private calendar link: only their bookings, for their phone's calendar. A new link stops the old. */
function PersonCalendar({ person }: { person: StaffMember }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState("");
  const [ask, confirmNode] = useConfirm();
  const fetchLink = async (renew: boolean) => {
    setBusy(renew ? "renew" : "get");
    try {
      const r = await bookingsAdmin<{ path: string }>("calendarFeed", { staffId: person.id, renew });
      setUrl(new URL(r.path, window.location.origin).toString());
      if (renew) toast.success("New link made. The old one has stopped working.");
    } catch (e: any) {
      toast.error(e?.message || "The calendar link couldn't be made. Please try again.");
    } finally { setBusy(""); }
  };
  const renew = async () => {
    if (!(await ask({ title: `Make a new link for ${person.name}?`, message: "Their old link stops working. Send them the new one.", confirmLabel: "Make new link" }))) return;
    await fetchLink(true);
  };
  return (
    <div className="bkg-person-cal">
      <p className="bkg-questions-hint">Their calendar: only their bookings, in Google or Apple Calendar on their phone.</p>
      {!url ? (
        <SecondaryButton size="sm" icon={<CalendarPlus size={16} aria-hidden />} onClick={() => void fetchLink(false)} busy={busy === "get"}>Get their calendar link</SecondaryButton>
      ) : (<>
        <div className="bkg-link">
          <code>{url}</code>
          <IconButton label={`Copy ${person.name}'s calendar link`} onClick={() => void copyText(url, "Calendar link")}><Copy size={16} aria-hidden /></IconButton>
        </div>
        <p className="bkg-cal-note">Send it to {person.name} only: anyone with it can see their bookings.</p>
        <GhostButton size="sm" onClick={() => void renew()} busy={busy === "renew"}>Make a new link</GhostButton>
      </>)}
      {confirmNode}
    </div>
  );
}
