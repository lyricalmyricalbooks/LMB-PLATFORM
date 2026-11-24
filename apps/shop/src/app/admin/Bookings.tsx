// Admin › Orders › Bookings (beta, 14 November 2026; tasks/todo/2026-11-14-bookings-beta.md). The week's bookings, the
// services customers can book and the opening hours, in the Colophon bento look (bookings.css, tokens only). Shown only
// when the platform turned Bookings on for the shop (Dashboard.tsx hides the page otherwise). Reads come from the shop's
// folder; every change goes through the server (bookingsApi.ts), which keeps two bookings from ever taking one time.
import { serviceFromText } from "./bookFromMessage";
import { BookingMessagesTile } from "./BookingMessagesTile";
import { AwayReplyTile } from "./AwayReplyTile";
import { PastVisitsDialog } from "./PastVisitsDialog";
import { useEffect, useMemo, useRef, useState } from "react";
import { BellRing, CalendarOff, CheckCircle2, CircleHelp, CalendarPlus, DoorOpen, UserRound, UserPlus, ChevronLeft, ChevronRight, ClipboardList, Clock, Copy, Download, ExternalLink, FileSpreadsheet, Hourglass, Mail, MapPin, Plus, Printer, QrCode, Trash2, Video, X } from "lucide-react";
import toast from "react-hot-toast";
import {
  Checkbox, DataTable, DestructiveButton, Dialog, Drawer, EmptyState, ErrorState, FilterBar, GhostButton, IconButton, LoadingState, PageActions, PrimaryButton,
  SaveBar, SearchField, SecondaryButton, SelectField, StatusBadge, TabPanel, Tabs, TextArea, TextField, Toggle, useConfirm,
} from "./riso/components";
import { ClientFormFacts } from "./clientForm";
import { bookingsAdmin, followBookings, followRequests, readBookingSetup, readBookingsBetween, type Booking, type PackRow, type Waiting } from "./bookingsApi";
import { ShiftsPanel } from "./ShiftsPanel";
import { RotaPanel } from "./RotaPanel";
import type { ShiftRow } from "./shifts";
import { hoursText } from "../../shared/timeClock";
import { answerWithin, requestsWaiting, expandParts, packLeftText, packList, packState, bookingFigures, bookingList, LIST_AHEAD_DAYS, LIST_BACK_DAYS, listRange, listTag, type ListMode, lastMonths, monthText, moneyShort, teamPay, teamPayRows, CLOCK_ONLY, type PayLine, bookingShareLink, bookButtonHtml, bookButtonScript, bookingPosterHtml, bookedThrough, SOCIAL_PLACES, type BookingFigures, byDay, cardText, classCount, dayList, dayListRows, heldPlaces, placeHolds, waitingByDay, waitingText, dayText, hoursLine, specialHoursLine, teamDay, hourLabel, moneyText, nextUp, paymentText, timeText, weekDays, WEEKDAYS, weekFigures, weekGrid, tappedTime, draggedTo, draggable, DRAG_SLOP_PX, blockedBands, blockHours, blockWhen, processingBand, processingText, type BlockedBand, type WeekBlock, type HeldPlace, weekStartOf, weekText, whenFromNow } from "./bookingsView";
import { addDays, zonedTime, DAILY_CAPS, hoursOnDay, specialOn, MAX_SPECIAL_HOURS, MAX_SPECIAL_DAYS, type SpecialHours, balanceDue, BOOKING_STEPS, cardAsk, cardTaken, dayOf, depositOf, feeChargeable, restPayable, MAX_FREE_LATE_FEE, REMINDER_HOURS, SECOND_REMINDER_HOURS, WAIT_HOLD_MINUTES, PICKUP_SLOT_MINUTES, MAX_PICKUP_PER_SLOT, cleanTipPercents, commissionOf, cleanCommissionSteps, MAX_COMMISSION_STEPS, commissionStepsText, reviewLink, tipTaken, offersPack, MAX_PACK_VISITS, MAX_PACK_DAYS, DEFAULT_BOOKING_SETTINGS, MAX_CLASS_TIMES, MAX_COURSE_DATES, MAX_PLACES, DECIDE_HOURS, MAX_QUESTIONS, MAX_STAFF, MAX_ROOMS, ROOM_UNIT_CHOICES, roomUnitsText, staffFor, booksByPerson, runsOnline, MAX_RUN_VISITS, MAX_RUN_WEEKS, MAX_RUN_DAYS, MAX_EXTRAS, MAX_EXTRA_MINUTES, MAX_LENGTHS, MAX_GROUP_LENGTH, groupServices, lengthName, withLength, withExtras, forPerson, processingStretch, visitName, visitPlan, type BookingExtra, type BookingService, type BookingSettings, type HoursWindow, type StaffMember, type PersonRate, type BookingRoom, type IntakeForm, type TimeBlock, MAX_FORM_TEXT, MAX_FORMS, FORM_RENEW_CHOICES, MAX_BIO_LENGTH, type TeamShown, approvalAllowed, APPROVAL_HOURS, cleanAreas, confirmState } from "../../shared/bookingTimes";
import { shopTimeZone } from "../../shared/shopTimeZone";
import { MONEY_SIGN, SHOP_CURRENCY } from "./moneySign";
import { paysOnSquare } from "../../lib/shopProfile";
import { copyText } from "./clipboard";
import { daySheetHtml, printDaySheet } from "./bookingsDaySheet";
import { toCsv } from "./spreadsheetFile";
import { qrPicture } from "./stockroom/qrCodesStore";
import { saveFile } from "./xlsxWriter";
import { PhotoField } from "./PhotoField";
import { ServiceImportDialog } from "./ServiceImportDialog";
import "./bookings.css";

type Tab = "calendar" | "services" | "packs" | "team" | "hours" | "figures" | "pay" | "rota";
type CalendarView = "week" | "day" | "list";
const VIEW_KEY = "colophon.bookings.view";
const ZONE = shopTimeZone();
const today = () => dayOf(Date.now(), ZONE);
const bookPageUrl = () => new URL(`${(import.meta.env.BASE_URL || "/").replace(/\/?$/, "/")}book`, window.location.origin).toString();

export function Bookings({ shopName = "" }: { shopName?: string } = {}) {
  const [tab, setTab] = useState<Tab>("calendar");
  // The empty Calendar's "Add a service" opens the form straight away, not just the tab.
  const [adding, setAdding] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [setup, setSetup] = useState<{ services: BookingService[]; settings: BookingSettings; saved: boolean } | null>(null);
  const [setupError, setSetupError] = useState("");
  const [monday, setMonday] = useState(() => weekStartOf(today()));
  const [rows, setRows] = useState<Booking[] | null>(null);
  const [upcoming, setUpcoming] = useState<Booking[]>([]);
  // Requests waiting for the owner's answer (plan 4, 2.5), whatever week they fall in.
  const [requested, setRequested] = useState<Booking[]>([]);
  const [rowsError, setRowsError] = useState("");
  const [open, setOpen] = useState<Booking | null>(null);
  // A service of a visit drawn on its own (plan 4, 2.1) opens the whole visit.
  const openWhole = (b: Booking) => setOpen(b.whole || b);
  const [creating, setCreating] = useState(false);
  // A tap on an empty time on the week grid: New booking, starting there.
  const [bookAt, setBookAt] = useState<{ start: string; staffId?: string } | null>(null);
  // Block time (plan 4, 1.3): the form to block a stretch, and the block clicked on the calendar.
  const [blocking, setBlocking] = useState<{ start?: string; staffId?: string } | null>(null);
  const [blockShown, setBlockShown] = useState<BlockedBand | null>(null);
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
  useEffect(() => followRequests(setRequested, () => setRequested([])), []);
  // Keep the open booking in step with live changes.
  useEffect(() => { if (open && rows) { const fresh = rows.find((r) => r.id === open.id); if (fresh && fresh !== open) setOpen(fresh); } }, [rows]);
  useEffect(() => { if (open?.status === "requested") { const fresh = requested.find((r) => r.id === open.id); if (fresh && fresh !== open) setOpen(fresh); } }, [requested]);

  if (setupError) return <ErrorState title="Bookings couldn't be opened" description={setupError} onRetry={() => void reloadSetup()} />;
  if (!setup) return <LoadingState label="Opening bookings…" />;

  const weekRows = (rows || []).filter((b) => { const d = dayOf(Date.parse(b.start), ZONE); return d >= monday && d <= addDays(monday, 6); });
  const figures = weekFigures(weekRows);
  // The figures follow the week on show, so say which week that is.
  const thisWeek = monday === weekStartOf(today());
  const weekLabel = thisWeek ? "This week" : `Week of ${dayText(monday)}`;
  const next = nextUp(upcoming, Date.now());
  const noServices = setup.services.length === 0;
  const setBlocks = (blocks: TimeBlock[]) => setSetup((s) => (s ? { ...s, settings: { ...s.settings, blocks } } : s));
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
        <SecondaryButton icon={<CalendarOff size={16} aria-hidden />} onClick={() => setBlocking({})}>Block time</SecondaryButton>
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
              <span className="bkg-next-what">{visitName(next)} · {next.minutes} min</span>
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
            <button type="button" className="bkg-pill" onClick={() => setSharing(true)} disabled={noServices}><QrCode size={14} aria-hidden /> Share</button>
            <a className="bkg-pill" href={bookPageUrl()} target="_blank" rel="noreferrer"><ExternalLink size={14} aria-hidden /> View</a>
          </div>
          {sharing && <ShareDialog services={setup.services} settings={setup.settings} live={live} shopName={shopName} onClose={() => setSharing(false)} />}
        </div>
      </section>

      <RequestsPanel rows={requestsWaiting(requested, Date.now())} onOpen={setOpen} />

      <Tabs<Tab> label="Bookings" variant="page" value={tab} onChange={setTab}
        tabs={[{ id: "calendar", label: "Calendar" }, { id: "services", label: "Services", count: setup.services.length },
          ...(sellsPacks ? [{ id: "packs" as const, label: "Packs" }] : []),
          { id: "team", label: "Team & rooms", ...(setup.settings.staff.length ? { count: setup.settings.staff.filter((p) => p.active).length } : {}) }, { id: "hours", label: "Hours & rules" }, { id: "figures", label: "Figures" },
          ...(setup.settings.staff.length ? [{ id: "rota" as const, label: "Shifts & time off" }, { id: "pay" as const, label: "Team pay" }] : [])]} />

      <TabPanel tabId="calendar" active={tab === "calendar"}>
        {noServices ? (
          <EmptyState sketch="cards" title="Add what customers can book" description="A studio visit, a class for one, a portfolio review: give it a length and a price, then turn on your bookings page."
            action={<PrimaryButton icon={<Plus size={16} aria-hidden />} onClick={() => { setAdding(true); setTab("services"); }}>Add a service</PrimaryButton>} />
        ) : (<>
          <div className="bkg-view-switch">
            <Tabs<CalendarView> label="Show bookings as" idPrefix="bkg-view-" value={shownView} onChange={pickView}
              tabs={[{ id: "week", label: "Week" }, ...(hasTeam ? [{ id: "day" as const, label: "Team day" }] : []), { id: "list", label: "List" }]} />
          </div>
          {shownView === "week"
            ? <WeekView monday={monday} setMonday={setMonday} rows={rows} error={rowsError} settings={setup.settings} services={setup.services} onOpen={openWhole} onBlock={setBlockShown} onBookAt={(start) => { setBookAt({ start }); setCreating(true); }} />
            : shownView === "day"
              ? <TeamDayView day={teamDayShown} setDay={showDay} rows={rows} error={rowsError} settings={setup.settings} onOpen={openWhole} onBlock={setBlockShown} onBookAt={(start, staffId) => { setBookAt({ start, staffId }); setCreating(true); }} />
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
        <TabPanel tabId="rota" active={tab === "rota"}>
          {tab === "rota" && <RotaPanel today={today()} onSettingsChanged={reloadSetup} />}
        </TabPanel>
      )}
      {setup.settings.staff.length > 0 && (
        <TabPanel tabId="pay" active={tab === "pay"}>
          {tab === "pay" && <PayPanel staff={setup.settings.staff} onEditTeam={() => setTab("team")} />}
        </TabPanel>
      )}
      <TabPanel tabId="hours" active={tab === "hours"}>
        <HoursPanel settings={setup.settings} services={setup.services} saved={setup.saved} onSaved={reloadSetup} active={tab === "hours"} />
      </TabPanel>

      {open && <BookingDrawer booking={open} services={setup.services} settings={setup.settings} onClose={() => setOpen(null)} />}
      {creating && <NewBookingDialog services={setup.services} settings={setup.settings} startAt={bookAt?.start} initial={bookAt?.staffId ? { staffId: bookAt.staffId } : undefined} onClose={() => { setCreating(false); setBookAt(null); }}
        onBlockInstead={bookAt ? () => { setBlocking(bookAt); setCreating(false); setBookAt(null); } : undefined} />}
      {blocking && <BlockDialog settings={setup.settings} start={blocking.start} staffId={blocking.staffId} onClose={() => setBlocking(null)} onSaved={(blocks) => { setBlocks(blocks); setBlocking(null); }} />}
      {blockShown && <BlockInfoDialog band={blockShown} onClose={() => setBlockShown(null)} onRemoved={(blocks) => { setBlocks(blocks); setBlockShown(null); }} />}
    </div>
  );
}

// ── Calendar ────────────────────────────────────────────────────────────────────────────────────────────────────────

function WeekView({ monday, setMonday, rows, error, settings, services, onOpen, onBlock, onBookAt }: {
  monday: string; setMonday: (d: string) => void; rows: Booking[] | null; error: string; settings: BookingSettings; services: BookingService[]; onOpen: (b: Booking) => void;
  /** A click on blocked time: what it is, and Remove. */ onBlock: (band: BlockedBand) => void;
  /** A tap on an empty time: New booking, starting there. */ onBookAt: (startIso: string) => void;
}) {
  const serviceOf = (serviceId: string) => services.find((s) => s.id === serviceId);
  const days = weekDays(monday);
  const groups = useMemo(() => byDay(rows || [], ZONE), [rows]);
  // The week as an hour grid (plan 4, 1.1): each booking placed by its time, in its person's (or service's) ink.
  const grid = useMemo(() => weekGrid(expandParts(rows || []), settings, services, monday, ZONE), [rows, settings, services, monday]);
  const span = grid.endMin - grid.startMin;
  const hourMarks = Array.from({ length: span / 60 }, (_, i) => grid.startMin + i * 60);
  const at = (min: number) => `calc(var(--bkg-min) * ${min})`;
  const now = today();
  // The red line for now: minutes since midnight in the shop's day, ticking each minute.
  const [nowMin, setNowMin] = useState(() => Math.round((Date.now() - zonedTime(now, "00:00", ZONE)) / 60_000));
  useEffect(() => {
    const id = window.setInterval(() => setNowMin(Math.round((Date.now() - zonedTime(today(), "00:00", ZONE)) / 60_000)), 60_000);
    return () => window.clearInterval(id);
  }, []);
  // A class card opens its list of people (the grid card is too small to list them).
  const [classOpen, setClassOpen] = useState<{ day: string; key: string } | null>(null);
  const [landing, setLanding] = useState<Landing | null>(null);
  const dragging = useBookingDrag(setLanding);
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
  const shownClass = useMemo(() => {
    if (!classOpen) return null;
    const blk = grid.days.find((x) => x.day === classOpen.day)?.blocks.find((x) => x.key === classOpen.key);
    if (!blk) return null;
    const held = placeHolds(heldPlaces(waitingDays.get(classOpen.day) || []), [{ serviceId: blk.serviceId, start: blk.start }]).inClass(blk.serviceId, blk.start);
    return { day: classOpen.day, blk, held };
  }, [classOpen, grid, waitingDays]);
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
      {rows === null ? <div className="bkg-skeleton bkg-skeleton-tall" aria-hidden /> : (
        <div className="bkg-wgrid-scroll">
          <div className="bkg-wgrid">
            <div className="bkg-tday-corner" aria-hidden />
            {grid.days.map(({ day: d, closed }) => {
              const list = groups.get(d) || [];
              const waitingHere = waitingDays.get(d)?.length || 0;
              const special = settings.daysOff.includes(d) ? undefined : specialOn(settings.specialHours, d);
              return (
                <div key={d} className="bkg-wgrid-head" data-phone-shown={phoneDay === d || undefined} data-today={d === now || undefined} data-closed={closed || undefined} data-special={special ? "" : undefined}>
                  <span className="bkg-day-name">{dayText(d)}</span>
                  <span className="bkg-day-hours" title={special ? `${special.label || "Holiday hours"}: ${hoursLine(special.hours)}` : undefined}>{settings.daysOff.includes(d) ? "Day off" : hoursLine(hoursOnDay(settings, d))}</span>
                  <span className="bkg-wgrid-tools">
                    {waitingHere > 0 && <button type="button" className="bkg-waiting" onClick={() => setWaitingDay(d)}><BellRing size={13} aria-hidden /> {waitingText(waitingHere)}</button>}
                    {list.length > 0 && <IconButton label={`Who's coming on ${dayText(d, "long")}`} onClick={() => setListDay(d)}><ClipboardList size={16} aria-hidden /></IconButton>}
                  </span>
                </div>
              );
            })}
            <div className="bkg-tday-times" aria-hidden style={{ height: at(span) }}>
              {hourMarks.map((h) => <span key={h} style={{ top: at(h - grid.startMin) }}>{hourLabel(h)}</span>)}
            </div>
            {grid.days.map(({ day: d, closed, hours, blocks }) => {
              // Places held for the waiting list: on their class card, or a dashed card of their own.
              const holds = placeHolds(heldPlaces(waitingDays.get(d) || []), blocks.filter((x) => x.places > 1).map((x) => ({ serviceId: x.serviceId, start: x.start })));
              const dayStart = zonedTime(d, "00:00", ZONE);
              const minute = (iso: string) => Math.round((Date.parse(iso) - dayStart) / 60_000) - grid.startMin;
              return (
                <section key={d} className="bkg-wgrid-col" data-drop-day={d} aria-label={`${dayText(d, "long")}: ${blocks.length ? `${blocks.length} booked` : closed ? "closed" : "nothing booked"}`}
                  data-phone-shown={phoneDay === d || undefined} data-today={d === now || undefined} data-past={d < now || undefined} data-closed={closed || undefined} style={{ height: at(span) }}
                  onClick={(e) => {
                    // A tap on an empty part of the day books that time (any card stops the tap first).
                    if (e.target !== e.currentTarget && !(e.target as HTMLElement).classList.contains("bkg-tday-open")) return;
                    const box = e.currentTarget.getBoundingClientRect();
                    const min = grid.startMin + ((e.clientY - box.top) / box.height) * span;
                    onBookAt(tappedTime(d, min, ZONE));
                  }}>
                  {hours.map((w) => (
                    <i key={w.start} className="bkg-tday-open" aria-hidden style={{ top: at(Math.max(0, minutesText(w.start) - grid.startMin)), height: at(minutesText(w.end) - Math.max(grid.startMin, minutesText(w.start))) }} />
                  ))}
                  {blockedBands(settings.blocks, d, grid.startMin, grid.endMin, settings.staff).map((band) => (
                    <BlockedBandButton key={band.block.id} band={band} at={at} showWho onBlock={onBlock} />
                  ))}
                  {blocks.map((blk) => {
                    const first = blk.people[0];
                    const isClass = blk.places > 1;
                    const held = isClass ? holds.inClass(blk.serviceId, blk.start) : [];
                    const taken = blk.people.length + held.length;
                    return (
                      <button key={blk.key} type="button" className="bkg-tday-block" data-ink={blk.ink} data-status={isClass ? undefined : first.status} data-noshow={(!isClass && first.noShow) || undefined} data-short={blk.height < 45 || undefined}
                        data-lifted={dragging.ghost?.booking.id === first.id || undefined} {...dragging.props(first, blk.places, span)}
                        style={{ top: at(blk.top), height: at(blk.height), left: `calc(${(blk.lane / blk.lanes) * 100}% + 3px)`, width: `calc(${100 / blk.lanes}% - 6px)` }}
                        aria-label={`${timeText(blk.start, ZONE)}, ${isClass ? `${blk.serviceName}, ${classCount(taken, blk.places)}` : `${first.customer.name}, ${blk.serviceName}${first.staffName ? ` with ${first.staffName}` : ""}`}`}
                        onClick={dragging.clicked(() => (isClass ? setClassOpen({ day: d, key: blk.key }) : onOpen(first)))}>
                        {!isClass && <ProcessingBand booking={first} heightMin={blk.height} />}
                        <span className="bkg-slot-time">{timeText(blk.start, ZONE)}</span>
                        <span className="bkg-slot-who">{isClass ? blk.serviceName : first.customer.name}</span>
                        <span className="bkg-slot-what">{isClass ? classCount(taken, blk.places) : `${blk.serviceName}${first.staffName ? ` · ${first.staffName}` : ""}`}</span>
                        {!isClass && first.status === "held" && <span className="bkg-slot-tag">{first.clearing ? "Clearing" : "Paying"}</span>}
                        {!isClass && first.status === "requested" && <span className="bkg-slot-tag">Request</span>}
                        {!isClass && first.noShow && <span className="bkg-slot-tag">No-show</span>}
                        {!isClass && !first.noShow && first.checkedInAt && first.status === "confirmed" && <span className="bkg-slot-tag" data-here>Here</span>}
                        {!isClass && !first.noShow && !first.checkedInAt && <ConfirmTag booking={first} settings={settings} />}
                        {!isClass && draggable(first, blk.places, Date.now()) && <span className="bkg-drag-edge" data-edge aria-hidden />}
                      </button>
                    );
                  })}
                  {dragging.ghost?.day === d && <i className="bkg-tday-ghost" aria-hidden style={{ top: at(Math.max(0, minute(dragging.ghost.start))), height: at(dragging.ghost.minutes) }}>
                    <span>{timeText(dragging.ghost.start, ZONE)}–{timeText(new Date(Date.parse(dragging.ghost.start) + dragging.ghost.minutes * 60_000).toISOString(), ZONE)}</span>
                  </i>}
                  {holds.loose.map((h) => (
                    <button key={h.id} type="button" className="bkg-tday-block" data-status="offer" data-short style={{ top: at(Math.max(0, minute(h.heldStart))), height: at(30), left: "3px", width: "calc(100% - 6px)" }}
                      onClick={() => setWaitingDay(d)}>
                      <span className="bkg-slot-time">{timeText(h.heldStart, ZONE)}</span>
                      <span className="bkg-slot-who">{h.name}</span>
                      <span className="bkg-slot-what">Held until {timeText(h.heldUntil, ZONE)}</span>
                    </button>
                  ))}
                  {d === now && nowMin >= grid.startMin && nowMin <= grid.endMin && <i className="bkg-tday-now" aria-hidden style={{ top: at(nowMin - grid.startMin) }} />}
                </section>
              );
            })}
          </div>
        </div>
      )}
      <p className="bkg-wgrid-hint">Click an empty time to book it. Drag a booking to move it, or pull its bottom edge to change its length. Striped time is blocked: clients can't book it.</p>
      {landing && <MoveDialog landing={landing} settings={settings} onClose={() => setLanding(null)} />}
      {shownClass && <ClassDialog slot={shownClass.blk} held={shownClass.held} service={serviceOf(shownClass.blk.serviceId)} onClose={() => setClassOpen(null)} onOpen={(b) => { setClassOpen(null); onOpen(b); }}
        onWaiting={() => { setClassOpen(null); setWaitingDay(shownClass.day); }} onJoin={(left) => { setClassOpen(null); setJoining({ service: serviceOf(shownClass.blk.serviceId)!, start: shownClass.blk.start, left }); }} />}
      {joining && <AddToClassDialog {...joining} onClose={() => setJoining(null)} />}
      {listDay && <DayListDialog day={listDay} list={groups.get(listDay) || []} onClose={() => setListDay("")} onOpen={(b) => { setListDay(""); onOpen(b); }} />}
      {waitingDay && (
        <WaitingDialog day={waitingDay} list={waitingDays.get(waitingDay) || []} onClose={() => setWaitingDay("")}
          onRemoved={(id) => setWaiting((all) => all.filter((w) => w.id !== id))} />
      )}
    </div>
  );
}

// ── Blocked time (bookings plan 4, step 1.3) ─────────────────────────────────────────────────────────────────────

/** A striped stretch on a calendar column. On the week, a person's block names them. */
function BlockedBandButton({ band, at, showWho = false, onBlock }: { band: BlockedBand; at: (min: number) => string; showWho?: boolean; onBlock: (band: BlockedBand) => void }) {
  const { block } = band;
  const title = block.title || "Blocked";
  return (
    <button type="button" className="bkg-blocked" data-person={block.staffId ? "" : undefined} data-short={band.height < 40 || undefined}
      style={{ top: at(band.top), height: at(band.height) }}
      aria-label={`Blocked, ${blockHours(block)}: ${title}${block.staffId ? `, ${band.who}` : ""}`} onClick={() => onBlock(band)}>
      <span className="bkg-blocked-title">{title}</span>
      {showWho && block.staffId && <span className="bkg-blocked-who">{band.who}</span>}
    </button>
  );
}

/** The shop's clock time of a moment ("09:30"), for the time boxes. */
const clockOf = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const clockPlus = (hhmm: string, minutes: number) => {
  const [h, m] = hhmm.split(":").map(Number);
  const total = Math.min(24 * 60, h * 60 + m + minutes);
  return total === 24 * 60 ? "24:00" : `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

/** Block time: lunch, a dentist visit, a weekly meeting. Clients can't book it; the owner still can. */
function BlockDialog({ settings, start, staffId = "", onClose, onSaved }: {
  settings: BookingSettings; start?: string; staffId?: string; onClose: () => void; onSaved: (blocks: TimeBlock[]) => void;
}) {
  const from0 = start ? clockOf(start) : "12:00";
  const [title, setTitle] = useState("");
  const [who, setWho] = useState(staffId);
  const [day, setDay] = useState(start ? dayOf(Date.parse(start), ZONE) : today());
  const [allDay, setAllDay] = useState(false);
  const [from, setFrom] = useState(from0);
  const [to, setTo] = useState(clockPlus(from0, 60) === "24:00" ? "23:59" : clockPlus(from0, 60));
  const [weekly, setWeekly] = useState(false);
  const [until, setUntil] = useState("");
  const [problem, setProblem] = useState("");
  const [saving, setSaving] = useState(false);
  const people = settings.staff.filter((p) => p.active || p.id === staffId);
  const badTimes = !allDay && !(from && to && from < to);
  const badUntil = weekly && !!until && until < day;
  const save = async () => {
    setSaving(true); setProblem("");
    try {
      const answer = await bookingsAdmin<{ blocks: TimeBlock[] }>("addBlock", { block: {
        title: title.trim(), staffId: who, day, start: allDay ? "00:00" : from, end: allDay ? "24:00" : to, weekly, until: weekly ? until : "",
      } });
      toast.success(weekly ? "Blocked every week" : "Time blocked");
      onSaved(answer.blocks);
    } catch (e: any) { setProblem(e?.message || "That didn't save. Please try again."); } finally { setSaving(false); }
  };
  return (
    <Dialog open onClose={onClose} title="Block time" description="Clients can't book blocked time. You can still book over it yourself."
      footer={<><SecondaryButton onClick={onClose}>Close</SecondaryButton><PrimaryButton onClick={() => void save()} disabled={!day || badTimes || badUntil} busy={saving}>Block time</PrimaryButton></>}>
      <div className="bkg-form">
        <TextField label="What it's for (optional)" placeholder="Lunch, dentist, team meeting" value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} />
        {people.length > 0 && (
          <SelectField label="Who" value={who} onChange={(e) => setWho(e.target.value)} hint={who ? "Only their times are blocked." : "Nobody can be booked then."}>
            <option value="">Everyone</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </SelectField>
        )}
        <TextField label={weekly ? "Starting" : "Day"} type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
        <Toggle label="All day" checked={allDay} onChange={setAllDay} />
        {!allDay && (
          <div className="bkg-two">
            <TextField label="From" type="time" step={300} value={from} onChange={(e) => setFrom(e.target.value)} />
            <TextField label="To" type="time" step={300} value={to} onChange={(e) => setTo(e.target.value)} error={badTimes ? "Pick an end after the start." : undefined} />
          </div>
        )}
        <div className="bkg-two">
          <SelectField label="Repeat" value={weekly ? "weekly" : "once"} onChange={(e) => setWeekly(e.target.value === "weekly")}>
            <option value="once">Just this day</option>
            <option value="weekly">Every {WEEKDAYS[new Date(`${day}T12:00:00Z`).getUTCDay()]}</option>
          </SelectField>
          {weekly && <TextField label="Until (optional)" type="date" value={until} min={day} onChange={(e) => setUntil(e.target.value)} error={badUntil ? "Pick a day after it starts." : undefined} />}
        </div>
        {problem && <p className="bkg-error" role="alert">{problem}</p>}
      </div>
    </Dialog>
  );
}

/** The processing stretch inside a booking's card: light stripes, so the free time inside it shows at a glance. */
/** Confirm requests (plan 4, 3.3): "Confirmed" once the client tapped "Yes, I'll be there", else "Not confirmed" after the reminder asked. */
function ConfirmTag({ booking, settings }: { booking: Booking; settings: BookingSettings }) {
  const state = confirmState(booking, settings, Date.now());
  if (!state) return null;
  return <span className="bkg-slot-tag" data-confirm={state}>{state === "confirmed" ? "Confirmed" : "Not confirmed"}</span>;
}
function ConfirmLine({ booking: b, settings }: { booking: Booking; settings: BookingSettings }) {
  const state = confirmState(b, settings, Date.now());
  if (!state) return null;
  return (
    <p className="bkg-detail-line" data-confirm-line={state}>
      {state === "confirmed" ? <CheckCircle2 size={16} aria-hidden /> : <CircleHelp size={16} aria-hidden />}
      {state === "confirmed"
        ? ` Said they'll be there${b.clientConfirmedAt ? `, ${new Date(b.clientConfirmedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })} at ${timeText(b.clientConfirmedAt, ZONE)}` : ""}.`
        : ` Not confirmed yet. The reminder asked them to. You might give them a call.`}
    </p>
  );
}

function ProcessingBand({ booking, heightMin }: { booking: Booking; heightMin: number }) {
  const band = processingBand(booking, heightMin);
  return band ? <i className="bkg-processing" aria-hidden style={band}><span>Processing</span></i> : null;
}

/** A block clicked on the calendar: what, who, when, and Remove. */
function BlockInfoDialog({ band, onClose, onRemoved }: { band: BlockedBand; onClose: () => void; onRemoved: (blocks: TimeBlock[]) => void }) {
  const { block } = band;
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState("");
  const remove = async () => {
    setSaving(true); setProblem("");
    try {
      const answer = await bookingsAdmin<{ blocks: TimeBlock[] }>("removeBlock", { id: block.id });
      toast.success("Block removed");
      onRemoved(answer.blocks);
    } catch (e: any) { setProblem(e?.message || "That didn't save. Please try again."); } finally { setSaving(false); }
  };
  return (
    <Dialog open onClose={onClose} title={block.title || "Blocked time"}
      footerStart={<DestructiveButton onClick={() => void remove()} busy={saving}>{block.weekly ? "Remove every week" : "Remove block"}</DestructiveButton>}
      footer={<SecondaryButton onClick={onClose}>Close</SecondaryButton>}>
      <dl className="bkg-move-facts">
        <dt>When</dt><dd>{blockWhen(block)}</dd>
        <dt>Time</dt><dd>{blockHours(block)}</dd>
        <dt>Who</dt><dd>{band.who}</dd>
      </dl>
      <p className="bkg-questions-hint">Clients can't book this time. You can still book over it yourself.</p>
      {problem && <p className="bkg-error" role="alert">{problem}</p>}
    </Dialog>
  );
}

// ── Dragging on the calendar (bookings plan 4, step 1.2) ──────────────────────────────────────────────────────────────

/** Where a dragged booking would land, before the owner says yes. */
type Landing = { booking: Booking; start: string; minutes: number; day: string; staffId?: string };

/**
 * Drag a booking to move it (to another day or person too) or pull its bottom edge to change its length, with a mouse or
 * pen. A tap or a small wobble stays a click. A column takes drops when it carries `data-drop-day` (and `data-drop-staff`
 * on the team day). Phones move a booking from its drawer instead: a finger on the grid scrolls it.
 */
function useBookingDrag(onLand: (l: Landing) => void) {
  const [ghost, setGhost] = useState<Landing | null>(null);
  const drag = useRef<{ booking: Booking; mode: "move" | "stretch"; x: number; y: number; perMin: number; on: boolean } | null>(null);
  const justDragged = useRef(false);
  const landed = useRef<Landing | null>(null);
  const columnAt = (x: number, y: number) => document.elementsFromPoint(x, y).find((el) => (el as HTMLElement).dataset?.dropDay) as HTMLElement | undefined;
  const props = (booking: Booking, places: number, spanMin: number) => {
    if (!draggable(booking, places, Date.now())) return {};
    return {
      "data-draggable": true,
      onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
        if (e.pointerType === "touch" || e.button !== 0) return;
        const col = (e.currentTarget.closest("[data-drop-day]") as HTMLElement | null)?.getBoundingClientRect();
        if (!col) return;
        drag.current = { booking, mode: (e.target as HTMLElement).dataset.edge ? "stretch" : "move", x: e.clientX, y: e.clientY, perMin: col.height / spanMin, on: false };
        e.currentTarget.setPointerCapture(e.pointerId);
      },
      onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
        const d = drag.current;
        if (!d) return;
        if (!d.on && Math.hypot(e.clientX - d.x, e.clientY - d.y) < DRAG_SLOP_PX) return;
        d.on = true;
        const col = d.mode === "move" ? columnAt(e.clientX, e.clientY) : undefined;
        const day = col?.dataset.dropDay || dayOf(Date.parse(d.booking.start), ZONE);
        const staffId = col?.dataset.dropStaff;
        const to = draggedTo(d.booking, day, (e.clientY - d.y) / d.perMin, d.mode, ZONE);
        const next = { booking: d.booking, ...to, day, ...(staffId !== undefined && staffId !== (d.booking.staffId || "") ? { staffId } : {}) };
        landed.current = next;
        setGhost(next);
      },
      onPointerUp: () => {
        const d = drag.current;
        const g = landed.current;
        drag.current = null;
        landed.current = null;
        if (!d?.on) return;
        // The click that follows this drag is swallowed; one that never comes mustn't swallow the next real click.
        justDragged.current = true;
        window.setTimeout(() => { justDragged.current = false; }, 60);
        setGhost(null);
        if (g && (g.start !== d.booking.start || g.minutes !== d.booking.minutes || g.staffId !== undefined)) onLand(g);
      },
      onPointerCancel: () => { drag.current = null; landed.current = null; setGhost(null); },
    };
  };
  /** A click that ended a drag isn't a click. */
  const clicked = (open: () => void) => () => { if (justDragged.current) { justDragged.current = false; return; } open(); };
  return { ghost, props, clicked };
}

/** "Move this booking?": the new time (and length), and whether the client hears about it. */
/** The warning before booking over a taken time (plan 4, 1.4): plain, and the choice stays the owner's. */
function OverWarning({ what }: { what: string }) {
  return (
    <div className="bkg-over" role="alert">
      <strong>{what}</strong>
      <span>You can still book over it. Both bookings stay on your calendar, so make sure someone can see both clients.</span>
    </div>
  );
}

function MoveDialog({ landing: l, settings, onClose }: { landing: Landing; settings: BookingSettings; onClose: () => void }) {
  const b = l.booking;
  const [tell, setTell] = useState(Boolean(b.customer.email));
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState("");
  // The time is taken (plan 4, 1.4): say so, and let the owner move it there anyway.
  const [clash, setClash] = useState(false);
  const end = new Date(Date.parse(l.start) + l.minutes * 60_000).toISOString();
  const person = l.staffId !== undefined ? (settings.staff.find((p) => p.id === l.staffId)?.name || "Not assigned") : "";
  const first = b.customer.name.split(" ")[0] || "them";
  const save = async (over = false) => {
    setSaving(true); setProblem("");
    try {
      await bookingsAdmin("move", { id: b.id, start: l.start, ...(l.minutes !== b.minutes ? { minutes: l.minutes } : {}), ...(l.staffId !== undefined ? { staffId: l.staffId } : {}), notify: tell, ...(over ? { over: true } : {}) });
      toast.success(tell ? `Moved. ${first} has an email with the new time.` : "Moved");
      onClose();
    } catch (e: any) {
      setSaving(false);
      if (e?.code === "taken" && !over) { setClash(true); return; }
      setProblem(e?.message || "That didn't save. Please try again.");
    }
  };
  const label = l.start === b.start && l.minutes !== b.minutes ? "Change length" : "Move";
  return (
    <Dialog open onClose={onClose} title={l.minutes !== b.minutes && l.start === b.start ? "Change the length?" : "Move this booking?"} description={`${b.customer.name} · ${b.serviceName}`}
      footer={<><SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
        {clash
          ? <PrimaryButton onClick={() => void save(true)} busy={saving}>{label} anyway</PrimaryButton>
          : <PrimaryButton onClick={() => void save()} busy={saving}>{label}</PrimaryButton>}</>}>
      <dl className="bkg-move-facts">
        <dt>Was</dt><dd>{dayText(dayOf(Date.parse(b.start), ZONE), "long")}, {timeText(b.start, ZONE)}–{timeText(b.end, ZONE)}{b.staffName ? ` · ${b.staffName}` : ""}</dd>
        <dt>Now</dt><dd><strong>{dayText(l.day, "long")}, {timeText(l.start, ZONE)}–{timeText(end, ZONE)}{person ? ` · ${person}` : b.staffName ? ` · ${b.staffName}` : ""}</strong></dd>
      </dl>
      {l.minutes !== b.minutes && <p className="bkg-questions-hint">{l.minutes} minutes instead of {b.minutes}. The price stays as booked.</p>}
      {b.customer.email ? <Toggle label={`Email ${first} the new time`} checked={tell} onChange={setTell} /> : <p className="bkg-questions-hint">No email on this booking, so tell them yourself.</p>}
      {clash && <OverWarning what={person || b.staffName ? `${person || b.staffName} already has a booking then.` : "That time already has a booking."} />}
      {problem && <p className="bkg-error" role="alert">{problem}</p>}
    </Dialog>
  );
}

/** Everyone in one start of a class, opened from its card on the week grid: open a person, see held places, add someone. */
function ClassDialog({ slot, held, service, onClose, onOpen, onWaiting, onJoin }: {
  slot: WeekBlock; held: HeldPlace[]; service?: BookingService; onClose: () => void; onOpen: (b: Booking) => void; onWaiting: () => void; onJoin: (left: number) => void;
}) {
  const left = slot.places - slot.people.length - held.length;
  return (
    <Dialog open onClose={onClose} title={slot.serviceName} description={`${dayText(dayOf(Date.parse(slot.start), ZONE), "long")}, ${timeText(slot.start, ZONE)} · ${classCount(slot.people.length + held.length, slot.places)}`}
      footer={<><SecondaryButton onClick={onClose}>Close</SecondaryButton>
        {left > 0 && Date.parse(slot.start) > Date.now() && service && <PrimaryButton icon={<UserPlus size={16} aria-hidden />} onClick={() => onJoin(left)}>Add a person</PrimaryButton>}</>}>
      <span className="bkg-class-bar" aria-hidden><i style={{ width: `${Math.min(100, Math.round((slot.people.length / slot.places) * 100))}%` }} /></span>
      <ul className="bkg-class-people bkg-class-people-big">
        {slot.people.map((b) => (
          <li key={b.id}>
            <button type="button" data-status={b.status} data-noshow={b.noShow || undefined} onClick={() => onOpen(b)}>
              {b.customer.name}{b.status === "held" ? <em>{b.clearing ? "clearing" : "paying"}</em> : b.noShow ? <em>no-show</em> : b.checkedInAt && b.status === "confirmed" ? <em>here</em> : null}
            </button>
          </li>
        ))}
        {held.map((h) => (
          <li key={h.id}>
            <button type="button" data-status="offer" onClick={onWaiting}>{h.name}<em>held until {timeText(h.heldUntil, ZONE)}</em></button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

/**
 * The team's day (Services plan phase 4 part 2): one column per person across the opening hours, each booking placed by
 * its time, a person who isn't working that day shaded, and the bookings that name nobody in a column of their own.
 */
function TeamDayView({ day, setDay, rows, error, settings, onOpen, onBlock, onBookAt }: {
  day: string; setDay: (d: string) => void; rows: Booking[] | null; error: string; settings: BookingSettings; onOpen: (b: Booking) => void;
  /** A click on blocked time: what it is, and Remove. */ onBlock: (band: BlockedBand) => void;
  /** A tap on an empty time in a person's column: New booking with them, starting there. */ onBookAt: (startIso: string, staffId: string) => void;
}) {
  const t = useMemo(() => teamDay(expandParts(rows || []), settings, day, ZONE), [rows, settings, day]);
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
  // Drag a booking to another time or person (plan 4, 1.2).
  const [landing, setLanding] = useState<Landing | null>(null);
  const dragging = useBookingDrag(setLanding);
  const dayStart = zonedTime(day, "00:00", ZONE);
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
              <section key={c.id || "nobody"} className="bkg-tday-col" data-drop-day={day} data-drop-staff={c.id} aria-label={`${c.name}: ${c.blocks.length ? `${c.blocks.length} booked` : c.off ? "not working" : "nothing booked"}`}
                data-off={c.off || undefined} data-nobody={c.id === "" || undefined} style={{ height: at(span) }}
                onClick={(e) => {
                  if (e.target !== e.currentTarget && !(e.target as HTMLElement).classList.contains("bkg-tday-open")) return;
                  const box = e.currentTarget.getBoundingClientRect();
                  onBookAt(tappedTime(day, t.startMin + ((e.clientY - box.top) / box.height) * span, ZONE), c.id);
                }}>
                {!c.off && c.id !== "" && c.hours.map((w) => (
                  <i key={w.start} className="bkg-tday-open" aria-hidden style={{ top: at(Math.max(0, minutesText(w.start) - t.startMin)), height: at(minutesText(w.end) - Math.max(t.startMin, minutesText(w.start))) }} />
                ))}
                {blockedBands(settings.blocks, day, t.startMin, t.endMin, settings.staff, c.id).map((band) => (
                  <BlockedBandButton key={band.block.id} band={band} at={at} onBlock={onBlock} />
                ))}
                {c.blocks.map((blk) => {
                  const first = blk.people[0];
                  const many = blk.people.length > 1;
                  return (
                    <button key={blk.key} type="button" className="bkg-tday-block" data-status={first.status} data-noshow={(!many && first.noShow) || undefined} data-short={blk.height < 45 || undefined}
                      data-lifted={dragging.ghost?.booking.id === first.id || undefined} {...(many ? {} : dragging.props(first, 1, span))}
                      style={{ top: at(blk.top), height: at(blk.height), left: `calc(${(blk.lane / blk.lanes) * 100}% + 3px)`, width: `calc(${100 / blk.lanes}% - 6px)` }}
                      aria-label={`${timeText(blk.start, ZONE)}, ${many ? `${blk.serviceName}, ${blk.people.length} people` : `${first.customer.name}, ${blk.serviceName}`}`}
                      onClick={dragging.clicked(() => onOpen(first))}>
                      {!many && <ProcessingBand booking={first} heightMin={blk.height} />}
                      <span className="bkg-slot-time">{timeText(blk.start, ZONE)}</span>
                      <span className="bkg-slot-who">{many ? `${blk.serviceName} · ${blk.people.length}` : first.customer.name}</span>
                      {!many && <span className="bkg-slot-what">{blk.serviceName}{first.roomName ? ` · ${first.roomName}` : ""}</span>}
                      {!many && first.status === "held" && <span className="bkg-slot-tag">{first.clearing ? "Clearing" : "Paying"}</span>}
                      {!many && first.status === "requested" && <span className="bkg-slot-tag">Request</span>}
                      {!many && !first.noShow && first.checkedInAt && first.status === "confirmed" && <span className="bkg-slot-tag" data-here>Here</span>}
                      {!many && !first.noShow && !first.checkedInAt && <ConfirmTag booking={first} settings={settings} />}
                      {!many && draggable(first, 1, Date.now()) && <span className="bkg-drag-edge" data-edge aria-hidden />}
                    </button>
                  );
                })}
                {dragging.ghost && (dragging.ghost.staffId ?? (dragging.ghost.booking.staffId || "")) === c.id && dragging.ghost.day === day && (
                  <i className="bkg-tday-ghost" aria-hidden style={{ top: at(Math.max(0, Math.round((Date.parse(dragging.ghost.start) - dayStart) / 60_000) - t.startMin)), height: at(dragging.ghost.minutes) }}>
                    <span>{timeText(dragging.ghost.start, ZONE)}–{timeText(new Date(Date.parse(dragging.ghost.start) + dragging.ghost.minutes * 60_000).toISOString(), ZONE)}</span>
                  </i>
                )}
                {showNow && <i className="bkg-tday-now" aria-hidden style={{ top: at(nowMin - t.startMin) }} />}
              </section>
            ))}
          </div>
        </div>
      )}
      {landing && <MoveDialog landing={landing} settings={settings} onClose={() => setLanding(null)} />}
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
  const [sheet, setSheet] = useState(false);
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
        {mode === "past" && <SecondaryButton icon={<FileSpreadsheet size={16} aria-hidden />} onClick={() => setSheet(true)}>Spreadsheet</SecondaryButton>}
      </FilterBar>
      {sheet && <PastVisitsDialog zone={ZONE} onClose={() => setSheet(false)} />}
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
                      <span className="bkg-list-what">{visitName(b)}<small>{b.minutes} min</small></span>
                      <span className="bkg-list-pay">{paymentText(b)}</span>
                      {tag ? <StatusBadge tone={tag === "Cancelled" || tag === "No-show" || tag === "Declined" ? "danger" : "warning"}>{tag}</StatusBadge> : <span aria-hidden />}
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
  const topChannel = Math.max(1, ...figures.channels.map((ch) => ch.count));
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

      <section className="bkg-tile bkg-figs-channels" aria-labelledby="bkg-figs-channels">
        <h2 id="bkg-figs-channels" className="bkg-figs-title">Where bookings came from <StatusBadge tone="info" glyph={false}>Beta</StatusBadge></h2>
        <p className="bkg-figs-lead">{figures.channels.some((ch) => !["Your website", "By you", "At the desk"].includes(ch.name))
          ? "Counted from the links in Share."
          : "Put the links from Share on Instagram, Facebook, Google and your QR code, and each one counts here."}</p>
        <ul className="bkg-bars bkg-bars-wide">
          {figures.channels.map((ch) => (
            <li key={ch.name}>
              <span>{ch.name}</span>
              <span className="bkg-bars-track" aria-hidden><i style={{ width: `${Math.round((ch.count / topChannel) * 100)}%` }} /></span>
              <strong>{ch.count}</strong>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/**
 * Share your booking page (Beta): the link, a QR code to print and a Book now button for another website, each opening
 * the whole page, one service, or one person for it.
 */
function ShareDialog({ services, settings, live, shopName, onClose }: { services: BookingService[]; settings: BookingSettings; live: boolean; shopName: string; onClose: () => void }) {
  const offered = services.filter((s) => s.active);
  const [service, setService] = useState("");
  const [person, setPerson] = useState("");
  const [words, setWords] = useState("Book now");
  const [look, setLook] = useState<"dark" | "light">("dark");
  const [opens, setOpens] = useState<"over" | "tab">("over");
  const [qr, setQr] = useState("");
  const [posterWords, setPosterWords] = useState("Book online");
  const people = booksByPerson(settings) && service ? staffFor(settings, service) : [];
  const chosen = offered.find((s) => s.id === service);
  const who = people.find((p) => p.id === person);
  const pick = { service, person: who ? person : "" };
  const link = bookingShareLink(bookPageUrl(), pick);
  // Each place gets its own link (plan 4, 2.7), so Figures can say where bookings came from.
  const qrLink = bookingShareLink(bookPageUrl(), { ...pick, from: "qr" });
  const buttonLink = bookingShareLink(bookPageUrl(), { ...pick, from: "button" });
  const button = bookButtonHtml(buttonLink, words, look, opens === "over" ? bookButtonScript(bookPageUrl()) : "");
  // The preview shows the button alone: the script only matters on the other website.
  const shown = bookButtonHtml(buttonLink, words, look);
  useEffect(() => {
    let alive = true;
    setQr("");
    qrPicture(qrLink, 8).then((pic) => { if (alive) setQr(pic); }, () => undefined);
    return () => { alive = false; };
  }, [qrLink]);
  const what = chosen ? `${chosen.name}${who ? ` with ${who.name}` : ""}` : "your booking page";
  const fileName = `book-${(chosen?.name || "page").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "page"}-qr.gif`;
  return (
    <Dialog open onClose={onClose} size="lg" title="Share your booking page"
      description="Put it in your Instagram bio, an email, a flyer by the till or on another website."
      footer={<PrimaryButton onClick={onClose}>Done</PrimaryButton>}>
      <div className="bkg-form bkg-share-dialog">
        <StatusBadge tone="info" glyph={false}>Beta</StatusBadge>
        {!live && <p className="bkg-pay-note">Bookings are off, so the link shows that you aren't taking bookings yet. Turn Bookings on before you share it.</p>}
        <div className="bkg-question-row">
          <SelectField label="It opens" value={service} onChange={(e) => { setService(e.target.value); setPerson(""); }}>
            <option value="">Your booking page</option>
            {offered.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </SelectField>
          {people.length > 1 && (
            <SelectField label="With" value={person} onChange={(e) => setPerson(e.target.value)}>
              <option value="">Whoever is free</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </SelectField>
          )}
        </div>
        <section className="bkg-share-part" aria-labelledby="bkg-share-link">
          <h3 id="bkg-share-link" className="bkg-share-title">Link</h3>
          <div className="bkg-share-link"><code>{link}</code><SecondaryButton size="sm" icon={<Copy size={15} aria-hidden />} onClick={() => void copyText(link, "Link")}>Copy</SecondaryButton></div>
        </section>
        <section className="bkg-share-part" aria-labelledby="bkg-share-social">
          <h3 id="bkg-share-social" className="bkg-share-title">Instagram, Facebook and Google <StatusBadge tone="info" glyph={false}>Beta</StatusBadge></h3>
          <p className="bkg-questions-hint">Each has its own link, so Figures shows where your bookings came from.</p>
          <ul className="bkg-share-places">
            {SOCIAL_PLACES.map((place) => {
              const placeLink = bookingShareLink(bookPageUrl(), { ...pick, from: place.from });
              return (
                <li key={place.from}>
                  <strong>{place.name}</strong>
                  <p>{place.where}</p>
                  <div className="bkg-share-link"><code>{placeLink}</code><SecondaryButton size="sm" icon={<Copy size={15} aria-hidden />} aria-label={`Copy the ${place.name} link`} onClick={() => void copyText(placeLink, `${place.name} link`)}>Copy</SecondaryButton></div>
                </li>
              );
            })}
          </ul>
        </section>
        <section className="bkg-share-part bkg-share-qr" aria-labelledby="bkg-share-qr">
          <div>
            <h3 id="bkg-share-qr" className="bkg-share-title">QR code</h3>
            <p className="bkg-questions-hint">For a flyer, your window or the till. A phone camera opens {what}. The poster puts it on a page with your words.</p>
            <TextField label="Poster words" value={posterWords} maxLength={40} onChange={(e) => setPosterWords(e.target.value)} />
            <div className="bkg-share-qr-actions">
              <SecondaryButton size="sm" icon={<Printer size={15} aria-hidden />} disabled={!qr}
                onClick={() => printDaySheet(bookingPosterHtml({ shop: shopName, heading: posterWords, what: chosen ? what : "", qr, link }))}>Print a poster</SecondaryButton>
              {qr && <a className="rp-btn rp-btn-secondary rp-btn-sm" href={qr} download={fileName}><Download size={15} aria-hidden /> Download</a>}
            </div>
          </div>
          {qr ? <img src={qr} alt={`QR code that opens ${what}`} width={160} height={160} /> : <span className="bkg-share-qr-wait" aria-hidden />}
        </section>
        <section className="bkg-share-part" aria-labelledby="bkg-share-button">
          <h3 id="bkg-share-button" className="bkg-share-title">Book now button for another website <StatusBadge tone="info" glyph={false}>Beta</StatusBadge></h3>
          <p className="bkg-questions-hint">Paste the code where your other website takes HTML, such as an Embed or Code block.</p>
          <div className="bkg-seg bkg-share-opens" role="radiogroup" aria-label="Where booking opens">
            <button type="button" role="radio" aria-checked={opens === "over"} onClick={() => setOpens("over")}>On top of your page</button>
            <button type="button" role="radio" aria-checked={opens === "tab"} onClick={() => setOpens("tab")}>In a new tab</button>
          </div>
          <p className="bkg-questions-hint">{opens === "over"
            ? `Clients book ${what} without leaving your website. On phones it opens in a new tab.`
            : `The button opens ${what} in a new tab. Use this if your website doesn't take code with a script.`}</p>
          <div className="bkg-question-row">
            <TextField label="Button words" value={words} maxLength={40} onChange={(e) => setWords(e.target.value)} />
            <div className="bkg-seg bkg-share-look" role="radiogroup" aria-label="Button colour">
              <button type="button" role="radio" aria-checked={look === "dark"} onClick={() => setLook("dark")}>Dark</button>
              <button type="button" role="radio" aria-checked={look === "light"} onClick={() => setLook("light")}>Light</button>
            </div>
          </div>
          {/* The button as it will look: our own generated link, its words made safe by bookButtonHtml. */}
          <div className="bkg-share-preview" dangerouslySetInnerHTML={{ __html: shown }} />
          <div className="bkg-share-link"><code>{button}</code><SecondaryButton size="sm" icon={<Copy size={15} aria-hidden />} onClick={() => void copyText(button, "Button code")}>Copy code</SecondaryButton></div>
        </section>
      </div>
    </Dialog>
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
  // Hours on the clock (plan 4, 4.2): read with the month; a failure leaves the bookings side of Team pay standing.
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [shiftsAt, setShiftsAt] = useState(0);
  useEffect(() => {
    let stale = false;
    bookingsAdmin<{ shifts: ShiftRow[] }>("shifts", { from: `${month}-01`, to: `${month}-31` })
      .then((r) => { if (!stale) setShifts((r.shifts || []).filter((x) => x.day.slice(0, 7) === month || (!x.out && x.forgotten))); })
      .catch(() => { if (!stale) setShifts([]); });
    return () => { stale = true; };
  }, [month, shiftsAt, attempt]);
  const pay = useMemo(() => (rows ? teamPay(rows, staff, ZONE, month, Date.now(), shifts) : null), [rows, staff, month, shifts]);
  const clocked = !!pay?.people.some((l) => l.minutes || l.hourlyMinor);
  const noPercent = staff.filter((p) => p.active && !p.commissionPercent && !p.hourlyMinor).length;
  const money = (minor: number) => moneyText(minor, SHOP_CURRENCY);
  const columns = [
    { key: "name", header: "Person", lead: true, render: (l: PayLine) => <span className={l.id ? undefined : "bkg-pay-nobody"}>{l.name}</span> },
    { key: "visits", header: "Visits", numeric: true, render: (l: PayLine) => l.visits },
    { key: "taken", header: "Taken before tax", numeric: true, render: (l: PayLine) => money(l.takenMinor) },
    { key: "percent", header: "Commission", numeric: true, render: (l: PayLine) => (l.id && !l.id.startsWith(CLOCK_ONLY) ? (l.percent ? <span className="bkg-pay-cell">{money(l.commissionMinor)}<span className="bkg-pay-pct">at {l.percent}%{l.steps.map((x) => `, then ${x.percent}% over ${money(x.overMinor)}`).join("")}</span></span> : <span className="bkg-pay-pct">No share set</span>) : "") },
    { key: "tips", header: "Tips", numeric: true, render: (l: PayLine) => money(l.tipsMinor) },
    ...(clocked ? [{ key: "hours", header: "Hours", numeric: true, render: (l: PayLine) => (l.id ? <>{hoursText(l.minutes)}{l.hourlyMinor ? <span className="bkg-pay-pct"> at {money(l.hourlyMinor)}/h</span> : null}</> : "") }] : []),
    { key: "total", header: "To pay them", numeric: true, render: (l: PayLine) => (l.id ? <strong>{money(l.commissionMinor + l.tipsMinor + l.wagesMinor)}</strong> : "") },
  ];
  return (
    <div className="bkg-pay">
      <div className="bkg-pay-head">
        <div>
          <h2 className="bkg-figs-title">Team pay <StatusBadge tone="info" glyph={false}>Beta</StatusBadge></h2>
          <p className="bkg-figs-lead">Each person's commission, tips and hours for the month, to pay them by. Nothing is paid from here.</p>
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
          <span>{noPercent === 1 ? "One person on your team has" : `${noPercent} people on your team have`} no commission share or hourly rate yet, so only their tips show.</span>
          <GhostButton onClick={onEditTeam}>Set their pay in Team &amp; rooms</GhostButton>
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
            {clocked && <div className="bkg-tile bkg-figure"><p className="bkg-kicker">Hours on the clock</p><p className="bkg-big">{hoursText(pay.minutes)}</p><p className="bkg-sub">{pay.wagesMinor ? `${money(pay.wagesMinor)} at hourly rates` : "breaks taken off"}</p></div>}
          </div>
          <DataTable caption={`Team pay for ${monthText(month, "long")}`} columns={columns} rows={pay.people} rowKey={(l) => l.id || "nobody"} stackOnPhone />
          <p className="bkg-questions-hint">Counts visits that happened, not no-shows. A kept fee counts as takings; refunds come off.</p>
        </>)}
      {!error && pay && <ShiftsPanel rows={shifts} staff={staff} zone={ZONE} month={month} today={today()} onChanged={() => setShiftsAt((n) => n + 1)} />}
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
  // A request (plan 4, 2.5): the owner accepts or declines it instead of moving or cancelling.
  const asking = b.status === "requested";
  const [declining, setDeclining] = useState(false);
  const accept = async () => {
    setBusy("accept");
    try {
      await bookingsAdmin("accept", { id: b.id });
      toast.success(`Accepted. ${b.customer.name.split(" ")[0] || "They"} gets the confirmation email.`);
    } catch (e: any) {
      toast.error(e?.message || "That didn't save. Please try again.");
    } finally { setBusy(""); }
  };
  return (
    <Drawer open onClose={onClose} title={b.customer.name} description={`${visitName(b)} · ${dayText(day, "long")}`}
      footerStart={asking ? <DestructiveButton onClick={() => setDeclining(true)} disabled={!!busy}>Decline</DestructiveButton>
        : b.status !== "cancelled" ? <DestructiveButton onClick={() => void cancel()} busy={busy === "cancel"} disabled={!!busy}>Cancel booking</DestructiveButton> : undefined}
      footer={asking ? <PrimaryButton onClick={() => void accept()} busy={busy === "accept"} disabled={!!busy}>Accept</PrimaryButton>
        : b.status === "confirmed" ? <PrimaryButton onClick={() => setMoving(true)} disabled={!!busy || !service}>Move</PrimaryButton> : undefined}>
      <div className="bkg-detail">
        <div className="bkg-detail-when">
          <Clock size={18} aria-hidden />
          <div>
            <strong>{timeText(b.start, ZONE)} – {timeText(b.end, ZONE)}</strong>
            <span>{b.minutes} minutes</span>
          </div>
          <StatusBadge tone={b.status === "confirmed" ? "success" : b.status === "held" || asking ? "warning" : "neutral"}>
            {b.status === "confirmed" ? "Booked" : asking ? "Request" : b.status === "held" ? (b.clearing ? "Payment clearing" : cardAsk(b) > 0 ? "Paying now" : "Saving a card") : b.declined ? "Declined" : "Cancelled"}
          </StatusBadge>
        </div>
        {asking && <p className="bkg-ask-line"><strong>{answerWithin(b, Date.now())}.</strong> If you don't, it's declined for you and {b.customer.name.split(" ")[0] || "they"} gets an email.</p>}
        {!!b.parts?.length && (
          <ol className="bkg-visit" aria-label="Services in this visit">
            {visitPlan(b).map((p, i) => (
              <li key={i}><span className="bkg-visit-time">{timeText(p.start, ZONE)}</span><strong>{p.serviceName}</strong>{p.staffName && <span>with {p.staffName}</span>}</li>
            ))}
          </ol>
        )}
        {!!b.gapBefore && <p className="bkg-detail-line"><Clock size={16} aria-hidden /> {b.gapBefore} minutes kept free before it</p>}
        {!!processingText(b) && <p className="bkg-detail-line"><Hourglass size={16} aria-hidden /> {processingText(b)}: you're free for a short booking then</p>}
        {!!b.extras?.length && <p className="bkg-detail-line"><Plus size={16} aria-hidden /> Add-ons: {b.extras.map((x) => x.name).join(", ")}</p>}
        <ConfirmLine booking={b} settings={settings} />
        {b.earlierWanted && b.status === "confirmed" && <p className="bkg-detail-line"><Clock size={16} aria-hidden /> Wants an earlier time if one opens. They're emailed when someone cancels.</p>}
        {b.series && <p className="bkg-detail-line"><CalendarPlus size={16} aria-hidden /> Standing appointment: visit {b.series.visit} of {b.series.visits}, {b.series.everyWeeks === 1 ? "every week" : `every ${b.series.everyWeeks} weeks`}</p>}
        {b.location && <p className="bkg-detail-line"><MapPin size={16} aria-hidden /> {b.location}</p>}
        {b.meetUrl && b.status === "confirmed" && <p className="bkg-detail-line"><Video size={16} aria-hidden /> <a href={b.meetUrl} target="_blank" rel="noopener noreferrer">Join the Google Meet call</a></p>}
        <dl className="bkg-facts">
          {b.staffName && !b.parts?.length && <div><dt>With</dt><dd>{b.staffName}{b.roomName ? `, ${b.roomName}` : ""}</dd></div>}
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
          <div><dt>Booked</dt><dd>{bookedThrough(b)}{b.createdAt ? `, ${new Date(b.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}` : ""}</dd></div>
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
        <TimeDialog title="Move booking" description={b.parts?.length ? `The whole visit moves together. ${b.customer.name} gets an email with the new time.` : `${b.customer.name} gets an email with the new time.`} service={service} initialDay={day} except={b.id} confirmLabel="Move here"
          staffId={moveTo} onClose={() => setMoving(false)}
          onPick={async (start) => {
            await bookingsAdmin("move", { id: b.id, start, ...(moveTo !== (b.staffId || "") ? { staffId: moveTo } : {}) });
            toast.success("Booking moved"); setMoving(false);
          }}>
          {!b.parts?.length && <PersonPick settings={settings} serviceId={b.serviceId} value={moveTo} onChange={setMoveTo} />}
        </TimeDialog>
      )}
      {declining && <DeclineDialog booking={b} onClose={() => setDeclining(false)} onDeclined={() => { setDeclining(false); onClose(); }} />}
      {confirmNode}
    </Drawer>
  );
}

/** Requests waiting for an answer (plan 4, 2.5), soonest deadline first. Nothing shows when there are none. */
function RequestsPanel({ rows, onOpen }: { rows: Booking[]; onOpen: (b: Booking) => void }) {
  if (!rows.length) return null;
  return (
    <section className="bkg-tile bkg-tile-apricot bkg-requests" aria-label="Requests to answer">
      <h2 className="bkg-tile-title">{rows.length === 1 ? "1 request to answer" : `${rows.length} requests to answer`}</h2>
      <ul>
        {rows.slice(0, 8).map((b) => (
          <li key={b.id}>
            <button type="button" onClick={() => onOpen(b)}>
              <strong>{b.customer.name}</strong>
              <span>{visitName(b)} · {dayText(dayOf(Date.parse(b.start), ZONE))}, {timeText(b.start, ZONE)}</span>
              <em>{answerWithin(b, Date.now())}</em>
            </button>
          </li>
        ))}
      </ul>
      {rows.length > 8 && <p className="bkg-sub">And {rows.length - 8} more. They're on the calendar too.</p>}
    </section>
  );
}

/** Decline a request, with an optional reason the client reads in their email. */
function DeclineDialog({ booking: b, onClose, onDeclined }: { booking: Booking; onClose: () => void; onDeclined: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const first = b.customer.name.split(" ")[0] || "They";
  const decline = async () => {
    setBusy(true);
    try {
      await bookingsAdmin("decline", { id: b.id, reason: reason.trim() });
      toast.success(`Declined. ${first} gets an email.`);
      onDeclined();
    } catch (e: any) {
      toast.error(e?.message || "That didn't save. Please try again.");
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={onClose} title="Decline this request?" description={`${first} gets an email saying you can't take it. The time opens up for others.`}
      footer={<><SecondaryButton onClick={onClose} disabled={busy}>Keep it</SecondaryButton><DestructiveButton onClick={() => void decline()} busy={busy}>Decline</DestructiveButton></>}>
      <TextArea label="A note for them (optional)" value={reason} maxLength={300} rows={3} onChange={(e) => setReason(e.target.value)}
        hint="Say why, or suggest another time. It goes in their email." />
    </Dialog>
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
function TextsTile({ on, reminders, replies, onChange, onReplies }: { on: boolean; reminders: boolean; replies: boolean; onChange: (on: boolean) => void; onReplies: (on: boolean) => void }) {
  const [status, setStatus] = useState<{ available: boolean; price: string; replies?: boolean } | null>(null);
  useEffect(() => {
    let live = true;
    bookingsAdmin<{ available: boolean; price: string; replies?: boolean }>("textStatus").then((s) => live && setStatus(s)).catch(() => live && setStatus({ available: false, price: "" }));
    return () => { live = false; };
  }, []);
  const open = status?.available === true;
  const answersOpen = open && status?.replies === true;
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
        {open && on && (
          <div className="bkg-texts-replies" data-text-replies>
            <Toggle label="Let clients answer by text" checked={answersOpen && replies} disabled={!answersOpen} onChange={onReplies} />
            <p className="bkg-cal-text">
              <StatusBadge tone="info" glyph={false}>Beta</StatusBadge>{" "}
              {!answersOpen ? "Opening soon: clients will answer a reminder with Y, C or M."
                : replies ? "The reminder text asks them to reply Y to confirm, C to cancel or M to move. Your calendar changes within a few minutes, and they get a text back. Cancelling by text follows your cancel rule."
                : "Reminder texts carry a link to change or cancel."}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

const NO_FORM: IntakeForm = { id: "main", on: true, title: "Before your first visit", text: "", questions: [], serviceIds: [], renewMonths: 0 };
/** Starting points for a new form (plan 4, 3.1): the words are the owner's to write. */
const FORM_STARTERS: Array<{ label: string; form: Partial<IntakeForm> }> = [
  { label: "Health form", form: { title: "Health form", renewMonths: 12 } },
  { label: "Waiver", form: { title: "Waiver", renewMonths: 12 } },
  { label: "Contract", form: { title: "Agreement", renewMonths: 0 } },
];
const renewText = (m: number) => (!m ? "Only when you change the words" : m === 12 ? "Every year" : m === 24 ? "Every 2 years" : `Every ${m} months`);

/**
 * Forms before a visit (Services plan 2, B4; several, plan 4, 3.1): a health form, a waiver or a contract, each with
 * its words, questions, services and how often clients sign it again.
 */
function FormsTile({ forms, services, onChange }: { forms: IntakeForm[]; services: BookingService[]; onChange: (forms: IntakeForm[]) => void }) {
  const [open, setOpen] = useState<string | null>(forms.length === 1 ? forms[0].id : null);
  const [ask, confirmNode] = useConfirm();
  const set = (id: string, patch: Partial<IntakeForm>) => onChange(forms.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  const add = (start: Partial<IntakeForm>) => {
    const id = forms.some((f) => f.id === "main") ? `f${Date.now().toString(36)}` : "main";
    onChange([...forms, { ...NO_FORM, ...start, id }]);
    setOpen(id);
  };
  const remove = async (f: IntakeForm) => {
    if (!(await ask({ title: `Remove ${f.title || "this form"}?`, message: "Clients aren't asked for it any more. Forms already signed stay on their client cards.", confirmLabel: "Remove" }))) return;
    onChange(forms.filter((x) => x.id !== f.id));
  };
  const servicesText = (f: IntakeForm) => (!f.serviceIds.length ? "Every service" : services.filter((s) => f.serviceIds.includes(s.id)).map((s) => s.name).join(", ") || "No service yet");
  return (
    <section className="bkg-tile" data-form-tile>
      <h2 className="bkg-tile-title">Forms before a visit <StatusBadge tone="info" glyph={false}>Beta</StatusBadge></h2>
      <p className="bkg-cal-text">{forms.length
        ? "Clients sign each one on their booking page with their typed name and a tick. The confirmation and reminders ask until they do, and you see them on the booking and the client card."
        : "Like a health form, a waiver or an agreement. Clients sign it on their booking page before they come."}</p>
      {forms.length > 0 && (
        <ul className="bkg-forms">
          {forms.map((f) => (
            <li key={f.id} className="bkg-forms-item" data-open={open === f.id || undefined}>
              <div className="bkg-forms-head">
                <div>
                  <h3>{f.title || "Untitled form"} {!f.on && <StatusBadge tone="neutral">Off</StatusBadge>}</h3>
                  <p className="bkg-cal-text">{servicesText(f)} · Sign again: {renewText(f.renewMonths).toLowerCase()}</p>
                </div>
                <div className="bkg-forms-actions">
                  <SecondaryButton size="sm" aria-expanded={open === f.id} onClick={() => setOpen(open === f.id ? null : f.id)}>{open === f.id ? "Close" : "Edit"}</SecondaryButton>
                  <IconButton label={`Remove ${f.title || "form"}`} tone="danger" onClick={() => void remove(f)}><Trash2 size={16} aria-hidden /></IconButton>
                </div>
              </div>
              {open === f.id && <FormEditor form={f} services={services} onChange={(patch) => set(f.id, patch)} />}
            </li>
          ))}
        </ul>
      )}
      {forms.length < MAX_FORMS ? (
        <div className="bkg-forms-add">
          <span className="bkg-cal-text">Add a form:</span>
          {FORM_STARTERS.map((st) => <SecondaryButton key={st.label} size="sm" icon={<Plus size={16} aria-hidden />} onClick={() => add(st.form)}>{st.label}</SecondaryButton>)}
        </div>
      ) : <p className="bkg-questions-hint">That's the most forms a shop can ask for ({MAX_FORMS}).</p>}
      {confirmNode}
    </section>
  );
}

/** One form's words, questions, services and renewal. */
function FormEditor({ form, services, onChange }: { form: IntakeForm; services: BookingService[]; onChange: (patch: Partial<IntakeForm>) => void }) {
  const set = onChange;
  const setQuestion = (i: number, change: Partial<IntakeForm["questions"][number]>) => set({ questions: form.questions.map((q, j) => (j === i ? { ...q, ...change } : q)) });
  const every = form.serviceIds.length === 0;
  const pick = (id: string, on: boolean) => {
    const next = on ? [...form.serviceIds, id] : form.serviceIds.filter((x) => x !== id);
    set({ serviceIds: next.length === services.length ? [] : next });
  };
  return (
    <div className="bkg-form">
      <Toggle label="Ask clients for this form" checked={form.on} onChange={(on) => set({ on })} />
      <TextField label="Name of the form" placeholder="Health form" value={form.title} maxLength={80} onChange={(e) => set({ title: e.target.value })} />
      <TextArea label="What it says" rows={6} maxLength={MAX_FORM_TEXT} placeholder="Please tell us about anything that could affect your visit, like allergies or a recent treatment." value={form.text} onChange={(e) => set({ text: e.target.value })} />
      <SelectField label="Ask clients to sign it again" value={form.renewMonths} onChange={(e) => set({ renewMonths: Number(e.target.value) })}
        hint={form.renewMonths ? "A signature counts for a visit up to this long after it was signed. Changing the words asks everyone again too." : "Changing the words asks everyone again."}>
        {FORM_RENEW_CHOICES.map((m) => <option key={m} value={m}>{renewText(m)}</option>)}
      </SelectField>
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
    </div>
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
function TimeDialog({ title, description, service, initialDay, wanted = "", except = "", staffId = "", extras = [], length = "", confirmLabel, onClose, onPick, children, ready = true, after, allowOver = false }: {
  title: string; description?: string; service: BookingService; initialDay: string; except?: string;
  /** A start asked for (a tap on the calendar): picked as soon as the times load, if it is free. */ wanted?: string;
  /** The add-ons ticked (New booking): the free times fit the longer booking. */ extras?: string[];
  /** The length chosen (New booking, a service sold in several lengths). */ length?: string;
  /** Only this person's free times ("" = anyone on the team, or the shop's one calendar). */ staffId?: string; confirmLabel: string;
  onClose: () => void; onPick: (startIso: string, over: boolean) => Promise<void>; children?: React.ReactNode; ready?: boolean;
  /** The tapped time may be booked even when it isn't free (plan 4, 1.4: book over, after a warning). One-to-one only. */ allowOver?: boolean;
  /** Shown under the times once one is picked (New booking › Repeat lists the run's dates). */ after?: (startIso: string) => React.ReactNode;
}) {
  const [day, setDay] = useState(initialDay);
  const [times, setTimes] = useState<string[] | null>(null);
  const [picked, setPicked] = useState("");
  // Picked the tapped time though it isn't free: booked over, with the warning shown.
  const [over, setOver] = useState(false);
  const [problem, setProblem] = useState("");
  const [saving, setSaving] = useState(false);
  const pick = (t: string, isOver = false) => { setPicked(t); setOver(isOver); };
  useEffect(() => {
    let live = true;
    setTimes(null); setPicked(""); setOver(false);
    bookingsAdmin<{ times: string[] }>("times", { serviceId: service.id, day, except, staffId, ...(extras.length ? { extras } : {}), ...(length ? { length } : {}) }).then((r) => {
      if (!live) return;
      setTimes(r.times);
      const asked = wanted && r.times.find((t) => Date.parse(t) === Date.parse(wanted));
      if (asked) setPicked(asked);
    }).catch((e) => live && (setTimes([]), setProblem(e.message)));
    return () => { live = false; };
  }, [day, service.id, staffId, extras.join(","), length]);
  const save = async () => {
    setSaving(true); setProblem("");
    try { await onPick(picked, over); } catch (e: any) { setProblem(e?.message || "That didn't save."); } finally { setSaving(false); }
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
        {times !== null && wanted && dayOf(Date.parse(wanted), ZONE) === day && !times.some((t) => Date.parse(t) === Date.parse(wanted)) && (
          over ? <OverWarning what={`${timeText(wanted, ZONE)} isn't free for ${service.name}.`} /> : (
            <div className="bkg-over-ask" role="status">
              <span>{timeText(wanted, ZONE)} isn't free for {service.name}. Pick another time{allowOver ? ", or book over it." : "."}</span>
              {allowOver && <SecondaryButton size="sm" onClick={() => pick(wanted, true)}>Book at {timeText(wanted, ZONE)} anyway</SecondaryButton>}
            </div>
          )
        )}
        <fieldset className="bkg-times">
          <legend>{dayText(day, "long")}</legend>
          {times === null ? <LoadingState label="Finding free times…" /> : times.length === 0 ? <p className="bkg-day-empty">No free time this day.</p> : times.map((t) => (
            <button key={t} type="button" className="bkg-time" aria-pressed={picked === t} onClick={() => pick(t)}>{timeText(t, ZONE)}</button>
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
function RunDates({ serviceId, start, run, staffId, extras = [], length = "", onFree }: { serviceId: string; start: string; run: { everyWeeks: number; visits: number }; staffId: string; extras?: string[]; length?: string; onFree: (free: boolean) => void }) {
  const [visits, setVisits] = useState<{ start: string; free: boolean }[] | null>(null);
  const [problem, setProblem] = useState("");
  useEffect(() => {
    let live = true;
    setVisits(null); setProblem(""); onFree(false);
    bookingsAdmin<{ visits: { start: string; free: boolean }[] }>("runCheck", { serviceId, start, run, staffId, ...(extras.length ? { extras } : {}), ...(length ? { length } : {}) })
      .then((r) => { if (live) { setVisits(r.visits); onFree(r.visits.every((v) => v.free)); } })
      .catch((e) => live && setProblem(e?.message || "The dates couldn't be checked."));
    return () => { live = false; };
  }, [serviceId, start, run.everyWeeks, run.visits, staffId, extras.join(","), length]);
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
export type BookAgain = {
  serviceId: string; staffId: string; name: string; email: string; phone: string;
  /** Book from a message (plan 4, 3.6): the booking's note, the window's title, and words to find the service in. */
  note?: string; title?: string; serviceHint?: string;
};

function NewBookingDialog({ services, settings, onClose, initial, onBooked, startAt, onBlockInstead }: {
  services: BookingService[]; settings: BookingSettings; onClose: () => void; initial?: Partial<BookAgain>; onBooked?: () => void;
  /** From a tap on the calendar: switch to blocking that time instead (lunch, a break). */ onBlockInstead?: () => void;
  /** The time tapped on the calendar: its day opens, and the time is picked when it is free. */ startAt?: string;
}) {
  // The service asked for, else the first one the person tapped on the calendar does, else the first.
  const [serviceId, setServiceId] = useState(() => services.find((s) => s.id === initial?.serviceId)?.id
    || (initial?.staffId ? services.find((s) => staffFor(settings, s.id).some((p) => p.id === initial.staffId))?.id : "")
    || services[0]?.id || "");
  // The same person again, if they still take this service.
  const [staffId, setStaffId] = useState(() => (initial?.staffId && staffFor(settings, serviceId).some((p) => p.id === initial.staffId) ? initial.staffId : ""));
  const [who, setWho] = useState({ name: initial?.name || "", email: initial?.email || "", phone: initial?.phone || "", note: initial?.note || "" });
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
  // A service sold in several lengths: the one chosen (none = the first).
  const [lengthId, setLengthId] = useState("");
  const lengths = service.lengths || [];
  const lengthPick = lengths.some((l) => l.id === lengthId) ? lengthId : "";
  const sized = withLength(service, lengthPick);
  // The picked person's own length and price for it, with the add-ons on top.
  const personal = forPerson("problem" in sized ? service : sized.service, settings, staffId);
  const ownRate = !lengths.length && (personal.minutes !== service.minutes || personal.priceMinor !== service.priceMinor);
  const asBooked = withExtras(personal, extras);
  const length = "problem" in asBooked ? service.minutes : asBooked.service.minutes;
  const ready = who.name.trim().length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(who.email.trim());
  return (
    <TimeDialog key={service.id} title={initial?.title || (initial?.name ? "Book again" : "New booking")} service={service} initialDay={startAt ? dayOf(Date.parse(startAt), ZONE) : today()} wanted={startAt} staffId={staffId} extras={extras} length={lengthPick} confirmLabel={run ? `Book ${visits} visits` : "Book"} onClose={onClose} ready={ready && (!run || runFree) && !("problem" in asBooked)}
      allowOver={!!startAt && !run && service.places <= 1 && !(service.courseDates || []).length}
      after={run ? (start) => <RunDates serviceId={service.id} start={start} run={run} staffId={staffId} extras={extras} length={lengthPick} onFree={setRunFree} /> : undefined}
      onPick={async (start, over) => {
        await bookingsAdmin("create", { serviceId: service.id, start, ...who, sendEmail, ...(staffId ? { staffId } : {}), ...(run ? { run } : {}), ...(extras.length ? { extras } : {}), ...(lengthPick ? { length: lengthPick } : {}), ...(over ? { over: true } : {}) });
        toast.success(run ? `${who.name.trim()} is booked in for ${visits} visits` : `${who.name.trim()} is booked in`);
        onBooked?.();
        onClose();
      }}>
      <SelectField label="Service" value={service.id} onChange={(e) => { setServiceId(e.target.value); setPicked([]); setLengthId(""); if (!staffFor(settings, e.target.value).some((p) => p.id === staffId)) setStaffId(""); }}>
        {services.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.minutes} min</option>)}
      </SelectField>
      {lengths.length >= 2 && (
        <SelectField label="How long" value={lengthPick || lengths[0].id} onChange={(e) => setLengthId(e.target.value)}>
          {lengths.map((l) => <option key={l.id} value={l.id}>{lengthName(l)}{l.priceMinor ? ` · ${moneyText(l.priceMinor, SHOP_CURRENCY)}` : ""}</option>)}
        </SelectField>
      )}
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
      {onBlockInstead && (
        <p className="bkg-block-instead">Not a booking? <button type="button" className="rp-link" onClick={onBlockInstead}>Block this time instead</button></p>
      )}
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
  // Book from a message: the service the message names, found once the services are read.
  const [picked, setPicked] = useState("");
  useEffect(() => {
    let live = true;
    readBookingSetup().then((s) => {
      if (!live) return;
      if (!s.services.length) { toast.error("Add a service in Bookings first."); onClose(); return; }
      if (!initial.serviceId && initial.serviceHint) {
        const found = serviceFromText(initial.serviceHint, s.services);
        if (found) setPicked(found);
      }
      setSetup(s);
    }).catch((e) => { if (live) { toast.error(e?.message || "Your services couldn't be loaded. Try again."); onClose(); } });
    return () => { live = false; };
  }, []);
  if (!setup) return null;
  return <NewBookingDialog services={setup.services} settings={setup.settings} initial={picked ? { ...initial, serviceId: picked } : initial} onBooked={onBooked} onClose={onClose} />;
}

// ── Services ────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The next date of a course being typed: a week after the last one filled in, at the same time. */
export function nextCourseDate(dates: readonly string[]): string {
  const last = [...dates].reverse().find((d) => /^\d{4}-\d{2}-\d{2}T/.test(d));
  if (!last) return `T${dates[dates.length - 1]?.split("T")[1] || "18:00"}`;
  return `${addDays(last.slice(0, 10), 7)}T${last.slice(11, 16) || "18:00"}`;
}

/** Time before choices (bookings plan 4, step 1.6), up to MAX_GAP_BEFORE. */
const GAP_BEFORE_CHOICES = [0, 5, 10, 15, 30, 45, 60, 90, 120];
const minutesWords = (m: number) => m < 60 || m % 60 ? `${m} minutes` : `${m / 60} hour${m === 60 ? "" : "s"}`;

export const EMPTY_SERVICE: BookingService = { id: "", name: "", description: "", minutes: 60, gapAfter: 0, priceMinor: 0, payment: "free", depositMinor: 0, depositPercent: 0, location: "", active: true, order: 0, questions: [], places: 1, classTimes: [], holdCard: false, lateFeeMinor: 0, meet: false, packVisits: 0, packPriceMinor: 0, packDays: 0, chargeTax: false, roomId: "", rebookWeeks: 0, repeats: false, extras: [] };

function ServicesPanel({ services, rooms, onChanged, startAdding = false, onStarted }: { services: BookingService[]; rooms: BookingRoom[]; onChanged: () => void; startAdding?: boolean; onStarted?: () => void }) {
  const [editing, setEditing] = useState<BookingService | null>(null);
  const [importing, setImporting] = useState(false);
  useEffect(() => { if (startAdding) { setEditing({ ...EMPTY_SERVICE, order: services.length }); onStarted?.(); } }, [startAdding]);
  const [ask, confirmNode] = useConfirm();
  const remove = async (s: BookingService) => {
    if (!(await ask({ title: `Delete ${s.name}?`, message: "Customers can't book it any more. Bookings already made stay as they are.", confirmLabel: "Delete" }))) return;
    try { await bookingsAdmin("deleteService", { id: s.id }); toast.success("Service deleted"); onChanged(); } catch (e: any) { toast.error(e.message); }
  };
  // Grouped as the booking page shows them (plan 4, 2.3); one list with no headings until a service has a group.
  const grouped = groupServices(services);
  const heads = grouped.some((g) => g.group);
  const sections = grouped.length ? grouped : [{ group: "", services: [] as BookingService[] }];
  const groupNames = grouped.map((g) => g.group).filter(Boolean);
  return (
    <div className="bkg-services">
      <div className="bkg-services-bar">
        <SecondaryButton size="sm" icon={<FileSpreadsheet size={16} aria-hidden />} onClick={() => setImporting(true)}>Bring your services from a spreadsheet</SecondaryButton>
        <StatusBadge tone="info" glyph={false}>Beta</StatusBadge>
      </div>
      {sections.map(({ group, services: inGroup }, i) => (
        <section key={group || "-"} className="bkg-service-group" aria-label={heads ? group || "No group" : undefined}>
          {heads && <h3 className="bkg-service-group-name">{group || "No group"} <span>{inGroup.length}</span></h3>}
          <div className="bkg-services-grid">
            {inGroup.map((s) => (
              <article key={s.id} className="bkg-tile bkg-service" data-off={!s.active || undefined}>
                <div className="bkg-service-top">
                  {s.photo && <img className="bkg-service-photo" src={s.photo} alt="" loading="lazy" />}
                  <h3>{s.name}</h3>
                  {!s.active && <StatusBadge tone="neutral">Hidden</StatusBadge>}
                </div>
                <p className="bkg-service-meta">{s.gapBefore ? `${s.gapBefore} min before + ` : ""}{(s.lengths || []).length >= 2 ? (s.lengths || []).map((l) => lengthName(l)).join(" / ") : `${s.minutes} min`}{s.gapAfter ? ` + ${s.gapAfter} min rest` : ""}{processingStretch(s, 0) ? ` · ${s.processMinutes} min processing` : ""}{s.places > 1 ? ` · class of ${s.places}` : ""}{rooms.find((r) => r.id === s.roomId) ? ` · ${rooms.find((r) => r.id === s.roomId)!.name}` : ""}</p>
                <p className="bkg-service-price">{(s.lengths || []).length >= 2 && s.priceMinor > 0 ? `From ${moneyText(Math.min(...(s.lengths || []).map((l) => l.priceMinor)), SHOP_CURRENCY)}` : s.priceMinor > 0 ? moneyText(s.priceMinor, SHOP_CURRENCY) : "Free"}{s.payment === "deposit" ? <span className="bkg-service-pay">{moneyText(depositOf(s), SHOP_CURRENCY)} deposit</span> : s.payment === "atShop" ? <span className="bkg-service-pay">Paid at the visit</span> : null}{s.holdCard ? <span className="bkg-service-pay">Card on file · {moneyText(s.lateFeeMinor, SHOP_CURRENCY)} if missed</span> : null}{s.chargeTax && s.priceMinor > 0 ? <span className="bkg-service-pay">Plus tax</span> : null}{s.meet && s.places <= 1 ? <span className="bkg-service-pay">Video call</span> : null}{s.atClient ? <span className="bkg-service-pay">At the client's place</span> : null}{offersPack(s) ? <span className="bkg-service-pay">Pack of {s.packVisits} · {moneyText(s.packPriceMinor, SHOP_CURRENCY)}</span> : null}{s.rebookWeeks ? <span className="bkg-service-pay">Rebook reminder · {rebookSpan(s.rebookWeeks)}</span> : null}</p>
                {s.description && <p className="bkg-service-desc">{s.description}</p>}
                <div className="bkg-service-actions">
                  <SecondaryButton size="sm" onClick={() => setEditing(s)}>Edit</SecondaryButton>
                  <IconButton label={`Delete ${s.name}`} tone="danger" onClick={() => void remove(s)}><Trash2 size={16} aria-hidden /></IconButton>
                </div>
              </article>
            ))}
            {i === sections.length - 1 && (
              <button type="button" className="bkg-tile bkg-add" onClick={() => setEditing({ ...EMPTY_SERVICE, order: services.length })}>
                <Plus size={22} aria-hidden />
                <span>Add a service</span>
              </button>
            )}
          </div>
        </section>
      ))}
      {importing && <ServiceImportDialog existing={services.map((s) => s.name)} onClose={() => setImporting(false)} onDone={onChanged} />}
      {editing && <ServiceDialog service={editing} rooms={rooms} groups={groupNames} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onChanged(); }} />}
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

/** Choices for when processing starts and how long it lasts, in minutes. */
const PROCESS_STARTS = [5, 10, 15, 20, 30, 45, 60, 90, 120, 150, 180];
const PROCESS_LENGTHS = [10, 15, 20, 30, 45, 60, 75, 90, 120, 150, 180, 240];

/**
 * Processing time (bookings plan 4, step 1.5): a stretch inside the service when the owner is free for someone else
 * (colour setting, a glaze drying). Off by default; turning it on picks a stretch that fits.
 */
function ProcessingFields({ minutes, after, length, onChange }: { minutes: number; after: number; length: number; onChange: (after: number, length: number) => void }) {
  const on = length > 0;
  const fits = after + length < minutes;
  const turnOn = (v: boolean) => {
    if (!v) return onChange(0, 0);
    // A third of the way in, for about a third of the time, never past the end.
    const start = PROCESS_STARTS.filter((m) => m < minutes - 15).reduce((best, m) => (Math.abs(m - minutes / 3) < Math.abs(best - minutes / 3) ? m : best), 5);
    const room = minutes - start - 5;
    const long = PROCESS_LENGTHS.filter((m) => m <= room).reduce((best, m) => (Math.abs(m - minutes / 3) < Math.abs(best - minutes / 3) ? m : best), 10);
    onChange(start, Math.min(long, Math.max(10, room)));
  };
  const withOwn = (list: number[], v: number) => (v && !list.includes(v) ? [...list, v].sort((x, y) => x - y) : list);
  return (
    <fieldset className="bkg-questions">
      <legend>Processing time <StatusBadge tone="info" glyph={false}>Beta</StatusBadge></legend>
      <Toggle label="You're free for part of it" checked={on} onChange={turnOn} />
      <p className="bkg-questions-hint">{on
        ? fits
          ? `From ${after} to ${after + length} minutes in, another short booking can go in your calendar. The room stays in use.`
          : "Processing has to end before the service does. Make it shorter or start it earlier."
        : "Like colour setting or a glaze drying: while it runs, clients can book a short service with you."}</p>
      {on && (
        <div className="bkg-two">
          <SelectField label="Starts after" value={String(after)} onChange={(e) => onChange(Number(e.target.value), length)}>
            {withOwn(PROCESS_STARTS, after).filter((m) => m < minutes || m === after).map((m) => <option key={m} value={m}>{m} minutes</option>)}
          </SelectField>
          <SelectField label="Lasts" value={String(length)} onChange={(e) => onChange(after, Number(e.target.value))}>
            {withOwn(PROCESS_LENGTHS, length).filter((m) => m < minutes || m === length).map((m) => <option key={m} value={m}>{m} minutes</option>)}
          </SelectField>
        </div>
      )}
    </fieldset>
  );
}

export function ServiceDialog({ service, rooms, groups = [], onClose, onSaved }: { service: BookingService; rooms: BookingRoom[]; /** The groups other services use, offered as the owner types. */ groups?: string[]; onClose: () => void; onSaved: () => void }) {
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
    // Lengths and prices clients choose from (two or more), as typed: the first is the service's own.
    lengthRows: (service.lengths || []).map((l) => ({ id: l.id, name: l.name, minutes: String(l.minutes), price: l.priceMinor ? (l.priceMinor / 100).toFixed(2) : "" })),
    // The postal code starts a visit at the client's place travels to, as typed ("M6G, M5V").
    areasText: (service.areas || []).join(", "),
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
  const lengthRows = form.lengthRows;
  // The first length is the service's own time and price, so every rule below (paying, deposits, packs) follows it.
  const setLength = (i: number, change: Partial<(typeof lengthRows)[number]>) => setForm((f) => {
    const rows = f.lengthRows.map((x, j) => (j === i ? { ...x, ...change } : x));
    return { ...f, lengthRows: rows, ...(rows[0] ? { price: rows[0].price, minutes: Number(rows[0].minutes) || f.minutes } : {}) };
  });
  const save = async () => {
    setSaving(true); setProblem("");
    try {
      const { pay, depositUnit, deposit, lateFee, price: _price, pack, packCount, packPrice, packLasts, intro, extraRows: rows, lengthRows: sizes, areasText, ...rest } = form;
      // Lengths only for one-to-one services; the rows that have minutes, with the first one's time and price as the service's.
      const lengths = rest.places > 1 || (rest.courseDates || []).length ? [] : sizes.filter((x) => Number(x.minutes) > 0).map((x) => ({
        id: x.id, name: x.name.trim(), minutes: Math.round(Number(x.minutes)), priceMinor: Math.round(Number(x.price || 0) * 100),
      }));
      const sized = lengths.length >= 2;
      if (sized && lengths.some((l) => l.priceMinor > 0) && lengths.some((l) => l.priceMinor < 50)) throw new Error("Give every length a price of at least 0.50, or leave them all blank for free.");
      const priceMinor = sized ? lengths[0].priceMinor : Math.round(Number(form.price || 0) * 100);
      if (sized) rest.minutes = lengths[0].minutes;
      const sellPack = pack && priceMinor > 0;
      const holdCard = form.holdCard && !paidInFull && !square;
      const share = pay === "deposit" && priceMinor > 0;
      await bookingsAdmin("saveService", { service: {
        ...rest, priceMinor, payment: priceMinor > 0 ? pay : "free",
        depositMinor: share && depositUnit === "amount" ? Math.round(Number(deposit || 0) * 100) : 0,
        depositPercent: share && depositUnit === "percent" ? Math.round(Number(deposit || 0)) : 0,
        holdCard, lateFeeMinor: holdCard ? Math.round(Number(lateFee || 0) * 100) : 0,
        meet: !!rest.meet && rest.places <= 1,
        // A visit at the client's place: one-to-one only, with the postal code starts it travels to.
        atClient: !!rest.atClient && rest.places <= 1 && !(rest.courseDates || []).length,
        areas: rest.atClient && rest.places <= 1 && !(rest.courseDates || []).length ? cleanAreas(areasText) : [],
        repeats: !!rest.repeats && rest.places <= 1 && !(rest.courseDates || []).length && !(rest.approval && approvalAllowed({ ...rest, payment: priceMinor > 0 ? pay : "free", holdCard })),
        approval: !!rest.approval && approvalAllowed({ ...rest, payment: priceMinor > 0 ? pay : "free", holdCard }),
        // Processing time is one person's: a class or course never sends it.
        ...(rest.places <= 1 && !(rest.courseDates || []).length && (rest.processMinutes || 0) > 0
          ? { processAfter: rest.processAfter || 0, processMinutes: rest.processMinutes || 0 } : { processAfter: 0, processMinutes: 0 }),
        // Time before is one person's set-up or travel: a class or course never sends it.
        gapBefore: rest.places <= 1 && !(rest.courseDates || []).length ? rest.gapBefore || 0 : 0,
        chargeTax: priceMinor > 0 && !!rest.chargeTax,
        packVisits: sellPack ? Number(packCount) || 0 : 0,
        packPriceMinor: sellPack ? Math.round(Number(packPrice || 0) * 100) : 0,
        packDays: sellPack ? Number(packLasts) || 0 : 0,
        packAnyClass: sellPack && !!rest.packAnyClass,
        introPriceMinor: priceMinor > 0 ? Math.round(Number(intro || 0) * 100) : 0,
        lengths: sized ? lengths : [],
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
          {!lengthRows.length && <SelectField label="How long" value={String(form.minutes)} onChange={(e) => set("minutes", Number(e.target.value))}>
            {[15, 20, 30, 45, 60, 75, 90, 120, 150, 180, 240].concat(form.minutes && ![15, 20, 30, 45, 60, 75, 90, 120, 150, 180, 240].includes(form.minutes) ? [form.minutes] : [])
              .map((m) => <option key={m} value={m}>{m < 60 ? `${m} minutes` : `${m / 60} hour${m === 60 ? "" : "s"}`}</option>)}
          </SelectField>}
          <SelectField label="Rest after" hint="Keeps you from being booked back to back." value={String(form.gapAfter)} onChange={(e) => set("gapAfter", Number(e.target.value))}>
            {[0, 5, 10, 15, 30, 45, 60].map((m) => <option key={m} value={m}>{m ? `${m} minutes` : "None"}</option>)}
          </SelectField>
        </div>
        {!group && !course && (
          <SelectField label="Time before" hint="Set-up or travel time, kept free before each booking." value={String(form.gapBefore || 0)} onChange={(e) => set("gapBefore", Number(e.target.value))}>
            {GAP_BEFORE_CHOICES.concat(form.gapBefore && !GAP_BEFORE_CHOICES.includes(form.gapBefore) ? [form.gapBefore] : [])
              .map((m) => <option key={m} value={m}>{m ? minutesWords(m) : "None"}</option>)}
          </SelectField>
        )}
        {!group && !course && <ProcessingFields minutes={form.minutes} after={form.processAfter || 0} length={form.processMinutes || 0}
          onChange={(after, length) => setForm((f) => ({ ...f, processAfter: after, processMinutes: length }))} />}
        {!lengthRows.length && <TextField label={`Price (${SHOP_CURRENCY})`} hint="Leave blank for free." inputMode="decimal" placeholder="0.00" value={form.price} onChange={(e) => set("price", e.target.value.replace(/[^\d.]/g, ""))} />}
        {!group && !course && (
          <fieldset className="bkg-questions">
            <legend>Lengths and prices <StatusBadge tone="info" glyph={false}>Beta</StatusBadge></legend>
            <p className="bkg-questions-hint">{lengthRows.length
              ? "Clients choose one when they book. Leave the prices blank for free. Remove them all to go back to one length and price."
              : "One service in several lengths, like a 30, 60 or 90 minute massage. Clients choose one when they book."}</p>
            {lengthRows.map((x, i) => (
              <div key={x.id} className="bkg-question bkg-extra">
                <div className="bkg-question-row">
                  <TextField label={`Length ${i + 1} (minutes)`} type="number" inputMode="numeric" min={5} max={480} step={5} placeholder="60" value={x.minutes} onChange={(e) => setLength(i, { minutes: e.target.value })} />
                  <TextField label={`Price (${SHOP_CURRENCY})`} inputMode="decimal" placeholder="0.00" value={x.price} onChange={(e) => setLength(i, { price: e.target.value.replace(/[^\d.]/g, "") })} />
                  <button type="button" className="bkg-question-remove" aria-label={`Remove length ${i + 1}`} onClick={() => setForm((f) => { const rows = f.lengthRows.filter((_, j) => j !== i); return { ...f, lengthRows: rows, ...(rows[0] ? { price: rows[0].price, minutes: Number(rows[0].minutes) || f.minutes } : {}) }; })}><Trash2 size={16} aria-hidden /></button>
                </div>
                <TextField label="Name (optional)" placeholder={Number(x.minutes) > 0 ? lengthName({ name: "", minutes: Number(x.minutes) }) : "Full session"} value={x.name} maxLength={40} onChange={(e) => setLength(i, { name: e.target.value })} />
              </div>
            ))}
            {lengthRows.length === 1 && <p className="bkg-questions-hint">Add one more: a service needs two or more lengths to offer a choice.</p>}
            {lengthRows.length < MAX_LENGTHS
              ? <SecondaryButton icon={<Plus size={16} aria-hidden />} onClick={() => set("lengthRows", lengthRows.length
                ? [...lengthRows, { id: `l${Date.now().toString(36)}`, name: "", minutes: "", price: "" }]
                : [{ id: `l${Date.now().toString(36)}a`, name: "", minutes: String(form.minutes), price: form.price }, { id: `l${Date.now().toString(36)}b`, name: "", minutes: "", price: "" }])}>{lengthRows.length ? "Add a length" : "Offer several lengths"}</SecondaryButton>
              : <p className="bkg-questions-hint">That's the most lengths a service can have ({MAX_LENGTHS}).</p>}
          </fieldset>
        )}
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
        {!form.atClient && <TextField label="Where (optional)" placeholder="The studio, 12 Ink Lane" value={form.location} onChange={(e) => set("location", e.target.value)} />}
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
        {!group && !course && (
          <div className="bkg-meet">
            <div className="flex items-center gap-2"><Toggle label="Visit them at their place" checked={!!form.atClient} onChange={(v) => set("atClient", v)} /><StatusBadge tone="info" glyph={false}>Beta</StatusBadge></div>
            <p className="bkg-questions-hint">{form.atClient
              ? "Clients give their address when they book. Set Time before to your travel time, so you get there."
              : "For mobile work: you go to the client instead of them coming to you."}</p>
            {form.atClient && (
              <TextField label="Postal codes you travel to (optional)" hint="The start of each code, with commas: M6G, M5V. Leave blank to go anywhere."
                value={form.areasText} onChange={(e) => set("areasText", e.target.value)} />
            )}
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
        {(() => {
          // Ask me first (plan 4, 2.5): only where nothing is charged online when they book.
          const askable = approvalAllowed({ places: form.places, courseDates, payment: Number(form.price) > 0 ? form.pay : "free", holdCard: form.holdCard && !paidInFull && !square });
          return (
            <div className="bkg-meet">
              <Toggle label="Ask me before confirming (Beta)" checked={!!form.approval && askable} disabled={!askable} onChange={(v) => set("approval", v)} />
              <p className="bkg-questions-hint">{!askable
                ? "Works for one-to-one services that are free or paid at the visit, with no card on file."
                : form.approval
                  ? `Clients send a request. You have ${APPROVAL_HOURS} hours to accept or decline it; if you don't, it's declined for you and they get an email.`
                  : "Clients send a request instead of booking straight away. The time is kept for them while you decide."}</p>
            </div>
          );
        })()}
        {!group && !(form.approval) && (
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
        <div className="bkg-look">
          <TextField label="Group (optional)" placeholder="Cuts, Colour, Treatments" maxLength={MAX_GROUP_LENGTH} list="bkg-group-names" value={form.group || ""} onChange={(e) => set("group", e.target.value)}
            hint="Services in the same group sit together under its name on your booking page." />
          <datalist id="bkg-group-names">{groups.filter((g) => g !== service.group).map((g) => <option key={g} value={g} />)}</datalist>
          <PhotoField photo={form.photo || ""} onChange={(photo) => set("photo", photo)} folder="services" shape="square" hint="Shown on the service's card when clients book. A square picture works best." />
        </div>
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
            <SelectField label="Most online bookings a day" hint="Once a day has this many, clients can't book it online. You can still add more yourself." value={String(form.dailyCap || 0)} onChange={(e) => setForm({ ...form, dailyCap: Number(e.target.value) })}>
              {DAILY_CAPS.map((n) => <option key={n} value={n}>{n ? `${n} booking${n === 1 ? "" : "s"}` : "No limit"}</option>)}
            </SelectField>
          </div>
        </section>
        <section className="bkg-tile" data-confirm-tile>
          <h2 className="bkg-tile-title">Ask clients to confirm <StatusBadge tone="info" glyph={false}>Beta</StatusBadge></h2>
          <div className="bkg-form">
            <Toggle label={'Add a "Yes, I\'ll be there" button to the reminder'} checked={form.askToConfirm === true && form.reminderHours > 0} disabled={!form.reminderHours} onChange={(askToConfirm) => setForm({ ...form, askToConfirm })} />
            <p className="bkg-cal-text">
              {!form.reminderHours ? "Turn on the reminder email above first: the button goes in it."
                : form.askToConfirm ? "Your calendar shows who has confirmed and who hasn't yet, so you know who to call."
                : "Clients get the reminder as it is now, with no button."}
            </p>
          </div>
        </section>
        <AwayReplyTile form={form} zone={ZONE} onChange={(patch) => setForm({ ...form, ...patch })} />
        <TextsTile on={form.textReminders === true} reminders={form.reminderHours > 0 || form.secondReminderHours > 0} replies={form.textReplies === true} onChange={(textReminders) => setForm({ ...form, textReminders })} onReplies={(textReplies) => setForm({ ...form, textReplies })} />
        <TipsTile tips={form.tips} percents={form.tipPercents} onChange={(tips, tipPercents) => setForm({ ...form, tips, tipPercents })} />
        <ThanksTile form={form} onChange={(patch) => setForm({ ...form, ...patch })} />
        <FormsTile forms={form.intakeForms || []} services={services} onChange={(intakeForms) => setForm({ ...form, intakeForms })} />
        <BookingMessagesTile messages={form.messages} onChange={(messages) => setForm({ ...form, messages })} />
        <PickupTile form={form} onChange={(patch) => setForm({ ...form, ...patch })} />
        <section className="bkg-tile">
          <h2 className="bkg-tile-title">Days off</h2>
          <DaysOffEditor days={form.daysOff} onChange={(daysOff) => setForm({ ...form, daysOff })} />
        </section>
        <section className="bkg-tile">
          <h2 className="bkg-tile-title">Holiday hours <StatusBadge tone="info" glyph={false}>Beta</StatusBadge></h2>
          <p className="bkg-cal-text">Shorter or longer hours for a few dates, like December or a long weekend. They replace your weekly hours on those days.</p>
          <SpecialHoursEditor list={form.specialHours} onChange={(specialHours) => setForm({ ...form, specialHours })} />
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

/**
 * Holiday hours (plan 4, 1.7): different hours for a stretch of dates, or closed, for the shop or one person. Coming
 * stretches are listed with a remove button; ended ones are kept but not shown. Saved with the form around it.
 */
function SpecialHoursEditor({ list = [], onChange, who = "" }: { list?: SpecialHours[]; onChange: (list: SpecialHours[]) => void; who?: string }) {
  const blank = { label: "", from: "", to: "", open: false, hours: [{ start: "10:00", end: "14:00" }] as HoursWindow[] };
  const [draft, setDraft] = useState(blank);
  const coming = list.filter((h) => h.to >= today());
  const to = draft.to || draft.from;
  const problem = !draft.from ? "" : to < draft.from ? "The last day comes before the first."
    : to > addDays(draft.from, MAX_SPECIAL_DAYS - 1) ? `Keep it to ${MAX_SPECIAL_DAYS} days or fewer.`
    : draft.open && draft.hours.some((w) => !w.start || !w.end || w.start >= w.end) ? "Each closing time has to come after its opening time." : "";
  const add = () => {
    const id = `h${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    onChange([...list, { id, label: draft.label.trim(), from: draft.from, to, hours: draft.open ? draft.hours : [] }].sort((a, b) => a.from.localeCompare(b.from)));
    setDraft(blank);
  };
  const name = who ? `${who} ` : "";
  return (
    <>
      {coming.length === 0 ? <p className="bkg-day-empty">No holiday hours coming up.</p> : (
        <ul className="bkg-special-list">
          {coming.map((h) => (
            <li key={h.id}>
              <span className="bkg-special-what"><strong>{h.label || (h.hours.length ? "Holiday hours" : "Closed")}</strong><span>{specialHoursLine(h)}</span></span>
              <IconButton label={`Remove ${h.label || specialHoursLine(h)}`} onClick={() => onChange(list.filter((x) => x.id !== h.id))}><Trash2 size={14} aria-hidden /></IconButton>
            </li>
          ))}
        </ul>
      )}
      {list.length < MAX_SPECIAL_HOURS && (
        <div className="bkg-special-add">
          <TextField label="Name (optional)" placeholder="December hours" maxLength={60} value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
          <div className="bkg-two">
            <TextField label="First day" type="date" min={today()} value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value, to: draft.to && draft.to < e.target.value ? "" : draft.to })} />
            <TextField label="Last day" hint="Leave empty for one day." type="date" min={draft.from || today()} value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
          </div>
          <div className="bkg-hours-row" data-closed={!draft.open || undefined}>
            <Toggle label={who ? "Working" : "Open"} checked={draft.open} onChange={(open) => setDraft({ ...draft, open })} />
            <div className="bkg-hours-windows">
              {draft.open ? draft.hours.map((w, i) => (
                <div key={i} className="bkg-window">
                  <TextField label={`${name}holiday hours from`} hideLabel type="time" step={300} value={w.start} onChange={(e) => setDraft({ ...draft, hours: draft.hours.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)) })} />
                  <span aria-hidden>–</span>
                  <TextField label={`${name}holiday hours until`} hideLabel type="time" step={300} value={w.end} onChange={(e) => setDraft({ ...draft, hours: draft.hours.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)) })} />
                  {draft.hours.length > 1 && <IconButton label="Remove these hours" onClick={() => setDraft({ ...draft, hours: draft.hours.filter((_, j) => j !== i) })}><Trash2 size={15} aria-hidden /></IconButton>}
                </div>
              )) : <span className="bkg-closed">{who ? "Off all day" : "Closed all day"}</span>}
              {draft.open && draft.hours.length < 3 && (
                <GhostButton size="sm" onClick={() => setDraft({ ...draft, hours: [...draft.hours, { start: draft.hours[draft.hours.length - 1].end, end: "18:00" }] })}>Add hours</GhostButton>
              )}
            </div>
          </div>
          {problem && <p className="bkg-error" role="alert">{problem}</p>}
          <div><SecondaryButton disabled={!draft.from || !!problem} onClick={add}><Plus size={15} aria-hidden /> Add holiday hours</SecondaryButton></div>
        </div>
      )}
    </>
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
 * The people clients can book and the rooms they use (each takes one booking at a time, or its count). With nobody listed the shop books as
 * one calendar, as before. Saved with the rest of Hours & rules through the server (op saveSettings).
 */
const TEAM_SHOWN_HINT: Record<"pick" | TeamShown, string> = {
  pick: "Clients see each person's photo and bio, and can choose or take anyone free.",
  anyone: "Clients book a time and get whoever is free. Names still show in their emails.",
  hidden: "Clients never see who takes their booking, here or in emails.",
};

function TeamPanel({ settings, services, onSaved }: { settings: BookingSettings; services: BookingService[]; onSaved: () => void }) {
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [roomName, setRoomName] = useState("");
  const [roomUnits, setRoomUnits] = useState(1);
  const [saving, setSaving] = useState(false);
  const [ask, confirmNode] = useConfirm();
  const save = async (change: Partial<Pick<BookingSettings, "staff" | "rooms" | "teamShown">>, done: string) => {
    setSaving(true);
    try { await bookingsAdmin("saveSettings", { settings: { ...settings, ...change } }); toast.success(done); onSaved(); return true; }
    catch (e: any) { toast.error(e?.message || "That didn't save. Please try again."); return false; }
    finally { setSaving(false); }
  };
  const addRoom = async () => {
    const name = roomName.trim();
    if (!name) return;
    if (await save({ rooms: [...settings.rooms, { id: shortId("room"), name, ...(roomUnits > 1 ? { units: roomUnits } : {}) }] }, `${name} added`)) { setRoomName(""); setRoomUnits(1); }
  };
  const setUnits = async (r: BookingRoom, units: number) => {
    const rooms = settings.rooms.map((x) => (x.id === r.id ? { id: x.id, name: x.name, ...(units > 1 ? { units } : {}) } : x));
    await save({ rooms }, `${r.name} now ${roomUnitsText(units)}`);
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
                  {p.photo ? <img className="bkg-person-initial bkg-person-photo" src={p.photo} alt="" /> : <span className="bkg-person-initial" aria-hidden>{p.name.slice(0, 1).toUpperCase()}</span>}
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
        {settings.staff.length > 0 && (
          <div className="bkg-team-shown">
            <SelectField label="On your booking page" value={settings.teamShown || "pick"} disabled={saving}
              hint={TEAM_SHOWN_HINT[settings.teamShown || "pick"]}
              onChange={(e) => { const v = e.target.value; void save({ teamShown: v === "pick" ? undefined : v as TeamShown }, "Booking page updated"); }}>
              <option value="pick">Clients pick who they see</option>
              <option value="anyone">Anyone available, no picking</option>
              <option value="hidden">Hide names from clients</option>
            </SelectField>
          </div>
        )}
      </section>
      <section className="bkg-tile">
        <h2 className="bkg-tile-title">Rooms and equipment</h2>
        <p className="bkg-questions-hint">Pick a room on each service that needs it. One that takes several bookings at once, like three tables or two kilns, fills only when all are in use.</p>
        {settings.rooms.length > 0 && (
          <ul className="bkg-rooms">
            {settings.rooms.map((r) => (
              <li key={r.id}>
                <span className="bkg-room-name"><DoorOpen size={16} aria-hidden /> {r.name}</span>
                <SelectField label={`How many bookings ${r.name} takes at once`} hideLabel className="bkg-room-units" value={r.units || 1} disabled={saving}
                  onChange={(e) => void setUnits(r, Number(e.target.value))}>
                  {ROOM_UNIT_CHOICES.map((n) => <option key={n} value={n}>{roomUnitsText(n)}</option>)}
                </SelectField>
                <IconButton label={`Remove ${r.name}`} disabled={saving} onClick={() => void removeRoom(r)}><Trash2 size={14} aria-hidden /></IconButton>
              </li>
            ))}
          </ul>
        )}
        {settings.rooms.length > 0 && !booksByPerson(settings) && settings.rooms.some((r) => (r.units || 1) > 1) && (
          <p className="bkg-questions-hint">With no people listed, your one calendar still takes one booking at a time. Add your team to share a room.</p>
        )}
        {settings.rooms.length < MAX_ROOMS && (
          <div className="bkg-dayoff-add bkg-room-add">
            <TextField label="Add a room or equipment" placeholder="Treatment room" value={roomName} maxLength={60} onChange={(e) => setRoomName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addRoom(); } }} />
            <SelectField label="Takes at once" value={roomUnits} onChange={(e) => setRoomUnits(Number(e.target.value))}>
              {ROOM_UNIT_CHOICES.map((n) => <option key={n} value={n}>{roomUnitsText(n)}</option>)}
            </SelectField>
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
  // A higher share over an amount a month (plan 4, 4.4), as typed: rows of "over" (in the shop's money) and "percent".
  const [steps, setSteps] = useState<{ over: string; percent: string }[]>((person.commissionSteps || []).map((x) => ({ over: String(x.overMinor / 100), percent: String(x.percent) })));
  const stepsClean = cleanCommissionSteps(steps.map((x) => ({ overMinor: Math.round(Number(x.over) * 100), percent: Number(x.percent) })));
  const stepsProblem = steps.length && stepsClean.length !== steps.length ? "Each step needs a bigger amount than the one before and a share from 0.5 to 100." : "";
  // Their hourly rate as typed (plan 4, 4.2; blank = none): Team pay multiplies their hours on the clock by it.
  const [hourly, setHourly] = useState(person.hourlyMinor ? (person.hourlyMinor / 100).toFixed(2) : "");
  const hourlyProblem = hourly.trim() && !(Number(hourly) > 0 && Number(hourly) <= 1000) ? "An amount an hour, like 22.50." : "";
  const save = async () => {
    setSaving(true);
    try {
      const { commissionPercent: _old, hourlyMinor: _oldHourly, commissionSteps: _oldSteps, ...rest } = form;
      const percent = commissionOf(share);
      const hourlyMinor = hourly.trim() ? Math.round(Number(hourly) * 100) : 0;
      await onSave({ ...rest, name: form.name.trim(), rates: rates(), ...(percent ? { commissionPercent: percent, ...(stepsClean.length ? { commissionSteps: stepsClean } : {}) } : {}), ...(hourlyMinor > 0 ? { hourlyMinor } : {}) });
    } finally { setSaving(false); }
  };
  return (
    <Dialog open onClose={onClose} title={person.id ? `Edit ${person.name}` : "Add a person"}
      footerStart={onRemove ? <DestructiveButton onClick={() => void onRemove()} disabled={saving}>Remove</DestructiveButton> : undefined}
      footer={<><SecondaryButton onClick={onClose}>Cancel</SecondaryButton><PrimaryButton onClick={() => void save()} busy={saving} disabled={!form.name.trim() || (!!form.email && !EMAIL_SHAPE.test(form.email)) || !!shareProblem || !!hourlyProblem || !!stepsProblem}>Save</PrimaryButton></>}>
      <div className="bkg-form">
        <TextField label="Name" placeholder="Sam" hint="Clients see it when they book." value={form.name} maxLength={60} onChange={(e) => set("name", e.target.value)} />
        <Toggle label="Taking bookings" checked={form.active} onChange={(v) => set("active", v)} />
        <fieldset className="bkg-questions">
          <legend>How clients see them <StatusBadge tone="info" glyph={false}>Beta</StatusBadge></legend>
          <div className="bkg-look">
            <PhotoField photo={form.photo || ""} onChange={(url) => set("photo", url || undefined)} folder="team" shape="square" label="Photo (optional)" hint="A clear face works best." />
            <TextArea label="Short bio (optional)" placeholder="Ten years at the bench. Ask about paper." value={form.bio || ""} maxLength={MAX_BIO_LENGTH} rows={3}
              onChange={(e) => set("bio", e.target.value)} hint={`Shown on your booking page. ${MAX_BIO_LENGTH - (form.bio || "").length} characters left.`} />
          </div>
        </fieldset>
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
          {commissionOf(share) > 0 && (
            <div className="bkg-steps">
              {steps.map((x, i) => (
                <div className="bkg-step" key={i}>
                  <TextField label={`Over (${MONEY_SIGN})`} type="number" inputMode="decimal" min={1} step={1} placeholder={i ? "6000" : "3000"} value={x.over}
                    onChange={(e) => setSteps(steps.map((y, j) => (j === i ? { ...y, over: e.target.value } : y)))} />
                  <TextField label="Share (%)" type="number" inputMode="decimal" min={0.5} max={100} step={0.5} placeholder={i ? "55" : "50"} value={x.percent}
                    onChange={(e) => setSteps(steps.map((y, j) => (j === i ? { ...y, percent: e.target.value } : y)))} />
                  <GhostButton icon={<Trash2 size={16} aria-hidden />} aria-label="Remove this step" onClick={() => setSteps(steps.filter((_, j) => j !== i))} />
                </div>
              ))}
              {stepsProblem && <p className="bkg-shift-error" role="alert">{stepsProblem}</p>}
              {steps.length < MAX_COMMISSION_STEPS && (
                <GhostButton icon={<Plus size={16} aria-hidden />} onClick={() => setSteps([...steps, { over: "", percent: "" }])}>{steps.length ? "Add another step" : "Pay a higher share in a good month"}</GhostButton>
              )}
              {stepsClean.length > 0 && <p className="bkg-questions-hint">{commissionStepsText(commissionOf(share), stepsClean, MONEY_SIGN)} Each share is only on the part above its amount.</p>}
            </div>
          )}
          <TextField label={`Hourly rate (${MONEY_SIGN})`} type="number" inputMode="decimal" min={0.01} max={1000} step={0.01} placeholder="22.50" className="bkg-share"
            value={hourly} onChange={(e) => setHourly(e.target.value)} error={hourlyProblem || undefined}
            hint="For people paid by the hour. They clock in and out on their own sign-in, and Team pay adds up their hours. Leave empty for none." />
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
          <legend>Their holiday hours <StatusBadge tone="info" glyph={false}>Beta</StatusBadge></legend>
          <p className="bkg-questions-hint">Different hours for a few dates. They replace their usual hours on those days.</p>
          <SpecialHoursEditor list={form.specialHours} onChange={(list) => set("specialHours", list)} who={form.name.trim() || "Their"} />
        </fieldset>
        <fieldset className="bkg-questions">
          <legend>Their own day</legend>
          <TextField label="Email" type="email" placeholder="sam@example.com" value={form.email} maxLength={320} onChange={(e) => set("email", e.target.value.trim())}
            hint="Each morning they have bookings, they get their day by email. Leave empty for none."
            error={form.email && !EMAIL_SHAPE.test(form.email) ? "Check this email address." : undefined} />
          {person.id ? <PersonCalendar person={person} /> : <p className="bkg-questions-hint">Save first to make their own calendar link.</p>}
        </fieldset>
        {person.id && (
          <fieldset className="bkg-questions">
            <legend>Their Google Calendar <StatusBadge tone="info" glyph={false}>Beta</StatusBadge></legend>
            <PersonGoogle person={person} email={form.email} />
          </fieldset>
        )}
      </div>
    </Dialog>
  );
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type PersonLink = { linked: boolean; accountEmail?: string; needsReconnect?: boolean };
/**
 * A person's own Google Calendar (Beta, Services plan 2, B6): once they link it with their own Google account, clients
 * can't book them when it shows them busy (only busy or free is shared). The owner sends them a one-use link.
 */
function PersonGoogle({ person, email }: { person: StaffMember; email: string }) {
  const [state, setState] = useState<{ available: boolean; link?: PersonLink } | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState("");
  const [url, setUrl] = useState("");
  const [ask, confirmNode] = useConfirm();
  const load = () => {
    setFailed(false);
    bookingsAdmin<{ available: boolean; people?: Record<string, PersonLink> }>("teamCalendar", { step: "status" })
      .then((r) => setState({ available: r.available, link: r.people?.[person.id] }), () => setFailed(true));
  };
  useEffect(load, [person.id]);
  const first = person.name.split(" ")[0] || person.name;
  const link = async (send: boolean) => {
    setBusy(send ? "send" : "copy");
    try {
      const r = await bookingsAdmin<{ available: boolean; url?: string; sent?: boolean }>("teamCalendar", { step: "link", staffId: person.id, send });
      if (!r.available || !r.url) { setState({ available: false }); return; }
      setUrl(r.url);
      if (r.sent) toast.success(`Sent to ${email}`);
      else await copyText(r.url, "Link");
    } catch (e: any) {
      toast.error(e?.message || "The link couldn't be made. Please try again.");
    } finally { setBusy(""); }
  };
  const unlink = async () => {
    if (!(await ask({ title: `Unlink ${first}'s calendar?`, message: `Clients can book ${first} by your hours again, even when their own calendar shows them busy.`, confirmLabel: "Unlink" }))) return;
    setBusy("unlink");
    try {
      await bookingsAdmin("teamCalendar", { step: "unlink", staffId: person.id });
      setState((s) => ({ available: s?.available ?? true, link: { linked: false } }));
      setUrl("");
      toast.success(`${first}'s calendar is unlinked`);
    } catch (e: any) {
      toast.error(e?.message || "That didn't work. Please try again.");
    } finally { setBusy(""); }
  };
  if (failed) return <p className="bkg-questions-hint">Their calendar link couldn't be checked. <button type="button" className="bkg-inline-link" onClick={load}>Try again</button></p>;
  if (!state) return <p className="bkg-questions-hint">Checking…</p>;
  if (!state.available) return <p className="bkg-questions-hint">Coming soon: {first} will link their own Google Calendar, and clients won't be able to book them when it shows them busy.</p>;
  const l = state.link;
  return (
    <div className="bkg-person-cal">
      {l?.linked ? (<>
        <p className="bkg-google-state"><StatusBadge tone={l.needsReconnect ? "warning" : "success"}>{l.needsReconnect ? "Needs linking again" : "Linked"}</StatusBadge> {l.accountEmail}</p>
        <p className="bkg-questions-hint">{l.needsReconnect
          ? `Google stopped sharing ${first}'s busy times. Send them a new link.`
          : `Clients can't book ${first} when their Google Calendar shows them busy. Only busy or free is shared, never what their events are. Changes show within 15 minutes.`}</p>
      </>) : (
        <p className="bkg-questions-hint">{first} signs in with their own Google account and allows Colophon to see when they're busy. Clients then can't book them at those times. Only busy or free is shared.</p>
      )}
      <div className="bkg-due-actions">
        {(!l?.linked || l.needsReconnect) && (<>
          {EMAIL_SHAPE.test(email) && <SecondaryButton size="sm" icon={<Mail size={15} aria-hidden />} onClick={() => void link(true)} busy={busy === "send"} disabled={!!busy}>Email {first} a link</SecondaryButton>}
          <SecondaryButton size="sm" icon={<Copy size={15} aria-hidden />} onClick={() => void link(false)} busy={busy === "copy"} disabled={!!busy}>Copy a link</SecondaryButton>
        </>)}
        {l?.linked && <GhostButton size="sm" onClick={() => void unlink()} busy={busy === "unlink"} disabled={!!busy}>Unlink</GhostButton>}
      </div>
      {url && !l?.linked && <p className="bkg-cal-note">The link works once, for a day. Send it to {first} only.</p>}
      {confirmNode}
    </div>
  );
}

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
