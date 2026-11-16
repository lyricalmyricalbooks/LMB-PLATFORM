// Admin › Orders › Bookings (beta, 14 November 2026; tasks/todo/2026-11-14-bookings-beta.md). The week's bookings, the
// services customers can book and the opening hours, in the Colophon bento look (bookings.css, tokens only). Shown only
// when the platform turned Bookings on for the shop (Dashboard.tsx hides the page otherwise). Reads come from the shop's
// folder; every change goes through the server (bookingsApi.ts), which keeps two bookings from ever taking one time.
import { useEffect, useMemo, useState } from "react";
import { BellRing, CalendarPlus, ChevronLeft, ChevronRight, Clock, Copy, ExternalLink, MapPin, Plus, Trash2, Users, X } from "lucide-react";
import toast from "react-hot-toast";
import {
  DestructiveButton, Dialog, Drawer, EmptyState, ErrorState, GhostButton, IconButton, LoadingState, PageActions, PrimaryButton,
  SaveBar, SecondaryButton, SelectField, StatusBadge, TabPanel, Tabs, TextArea, TextField, Toggle, useConfirm,
} from "./riso/components";
import { bookingsAdmin, followBookings, readBookingSetup, readBookingsBetween, type Booking, type Waiting } from "./bookingsApi";
import { bookingFigures, lastMonths, monthText, moneyShort, type BookingFigures, byDay, cardText, classCount, daySlots, waitingByDay, waitingText, dayText, hoursLine, moneyText, nextUp, paymentText, timeText, weekDays, WEEKDAYS, weekFigures, weekStartOf, weekText, whenFromNow } from "./bookingsView";
import { addDays, BOOKING_STEPS, cardAsk, cardTaken, dayOf, depositOf, feeChargeable, MAX_FREE_LATE_FEE, REMINDER_HOURS, DEFAULT_BOOKING_SETTINGS, MAX_CLASS_TIMES, MAX_PLACES, MAX_QUESTIONS, type BookingService, type BookingSettings } from "../../shared/bookingTimes";
import { shopTimeZone } from "../../shared/shopTimeZone";
import { SHOP_CURRENCY } from "./moneySign";
import { paysOnSquare } from "../../lib/shopProfile";
import { copyText } from "./clipboard";
import "./bookings.css";

type Tab = "calendar" | "services" | "hours" | "figures";
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
        tabs={[{ id: "calendar", label: "Calendar" }, { id: "services", label: "Services", count: setup.services.length }, { id: "hours", label: "Hours & rules" }, { id: "figures", label: "Figures" }]} />

      <TabPanel tabId="calendar" active={tab === "calendar"}>
        {noServices ? (
          <EmptyState title="Add what customers can book" description="A studio visit, a class for one, a portfolio review: give it a length and a price, then turn on your bookings page."
            action={<PrimaryButton icon={<Plus size={16} aria-hidden />} onClick={() => { setAdding(true); setTab("services"); }}>Add a service</PrimaryButton>} />
        ) : (
          <WeekView monday={monday} setMonday={setMonday} rows={rows} error={rowsError} settings={setup.settings} services={setup.services} onOpen={setOpen} />
        )}
      </TabPanel>
      <TabPanel tabId="services" active={tab === "services"}>
        <ServicesPanel services={setup.services} onChanged={reloadSetup} startAdding={adding} onStarted={() => setAdding(false)} />
      </TabPanel>
      <TabPanel tabId="figures" active={tab === "figures"}>
        {tab === "figures" && <FiguresPanel />}
      </TabPanel>
      <TabPanel tabId="hours" active={tab === "hours"}>
        <HoursPanel settings={setup.settings} saved={setup.saved} onSaved={reloadSetup} active={tab === "hours"} />
      </TabPanel>

      {open && <BookingDrawer booking={open} services={setup.services} onClose={() => setOpen(null)} />}
      {creating && <NewBookingDialog services={setup.services} onClose={() => setCreating(false)} />}
    </div>
  );
}

// ── Calendar ────────────────────────────────────────────────────────────────────────────────────────────────────────

function WeekView({ monday, setMonday, rows, error, settings, services, onOpen }: {
  monday: string; setMonday: (d: string) => void; rows: Booking[] | null; error: string; settings: BookingSettings; services: BookingService[]; onOpen: (b: Booking) => void;
}) {
  const placesOf = (serviceId: string) => services.find((s) => s.id === serviceId)?.places || 1;
  const days = weekDays(monday);
  const groups = useMemo(() => byDay(rows || [], ZONE), [rows]);
  const now = today();
  const [phoneDay, setPhoneDay] = useState(() => (days.includes(now) ? now : monday));
  useEffect(() => { setPhoneDay(days.includes(now) ? now : monday); }, [monday]);
  // The waiting list for the week on show. Read again whenever the bookings change, because a freed place empties it.
  const [waiting, setWaiting] = useState<Waiting[]>([]);
  const [waitingDay, setWaitingDay] = useState("");
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
          return (
            <section key={d} className="bkg-day" data-phone-shown={phoneDay === d || undefined} data-today={d === now || undefined} data-past={d < now || undefined} aria-label={dayText(d, "long")}>
              <header className="bkg-day-head">
                <span className="bkg-day-name">{dayText(d)}</span>
                <span className="bkg-day-hours">{settings.daysOff.includes(d) ? "Day off" : hoursLine(settings.hours[wd])}</span>
              </header>
              {rows === null ? <div className="bkg-skeleton" aria-hidden /> : list.length === 0 ? (
                <p className="bkg-day-empty">{closed ? "Closed" : "Nothing booked"}</p>
              ) : daySlots(list, placesOf).map((slot) => slot.kind === "class" ? (
                <div key={slot.key} className="bkg-class" data-full={slot.people.length >= slot.places || undefined}>
                  <span className="bkg-slot-time">{timeText(slot.start, ZONE)}</span>
                  <span className="bkg-slot-who">{slot.serviceName}</span>
                  <span className="bkg-class-count"><Users size={13} aria-hidden /> {classCount(slot.people.length, slot.places)}</span>
                  <span className="bkg-class-bar" aria-hidden><i style={{ width: `${Math.min(100, Math.round((slot.people.length / slot.places) * 100))}%` }} /></span>
                  <ul className="bkg-class-people">
                    {slot.people.map((b) => (
                      <li key={b.id}>
                        <button type="button" data-status={b.status} data-noshow={b.noShow || undefined} onClick={() => onOpen(b)}>
                          {b.customer.name}{b.status === "held" ? <em>{b.clearing ? "clearing" : "paying"}</em> : b.noShow ? <em>no-show</em> : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <button key={slot.booking.id} type="button" className="bkg-slot" data-status={slot.booking.status} data-noshow={slot.booking.noShow || undefined} onClick={() => onOpen(slot.booking)}>
                  <span className="bkg-slot-time">{timeText(slot.booking.start, ZONE)}</span>
                  <span className="bkg-slot-who">{slot.booking.customer.name}</span>
                  <span className="bkg-slot-what">{slot.booking.serviceName}</span>
                  {slot.booking.status === "held" && <span className="bkg-slot-tag">{slot.booking.clearing ? "Payment clearing" : "Paying now"}</span>}
                  {slot.booking.noShow && <span className="bkg-slot-tag">No-show</span>}
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
      {waitingDay && (
        <WaitingDialog day={waitingDay} list={waitingDays.get(waitingDay) || []} onClose={() => setWaitingDay("")}
          onRemoved={(id) => setWaiting((all) => all.filter((w) => w.id !== id))} />
      )}
    </div>
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
    <Dialog open onClose={onClose} title={`Waiting list · ${dayText(day, "long")}`} description="Each person gets one email the moment a place opens. Nothing is held: the first to book gets it."
      footer={<SecondaryButton onClick={onClose}>Done</SecondaryButton>}>
      {list.length === 0 ? <p className="bkg-day-empty">Nobody is waiting now.</p> : (
        <ul className="bkg-waitlist">
          {list.map((w) => (
            <li key={w.id}>
              <div>
                <strong>{w.name}</strong>
                <a href={`mailto:${w.email}`}>{w.email}</a>
                <span>{w.serviceName} · {w.start ? timeText(w.start, ZONE) : "any time"}</span>
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

function BookingDrawer({ booking: b, services, onClose }: { booking: Booking; services: BookingService[]; onClose: () => void }) {
  const [busy, setBusy] = useState("");
  const [moving, setMoving] = useState(false);
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
  const [cancelling, setCancelling] = useState(false);
  const [charging, setCharging] = useState(false);
  const cancel = async () => {
    if (paidByCard) { setCancelling(true); return; }
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
        {b.location && <p className="bkg-detail-line"><MapPin size={16} aria-hidden /> {b.location}</p>}
        <dl className="bkg-facts">
          <div><dt>Email</dt><dd><a href={`mailto:${b.customer.email}`}>{b.customer.email}</a></dd></div>
          {b.customer.phone && <div><dt>Phone</dt><dd><a href={`tel:${b.customer.phone}`}>{b.customer.phone}</a></dd></div>}
          <div><dt>Payment</dt><dd>{paymentText(b)}</dd></div>
          {b.cardHold && <div><dt>Card on file</dt><dd>{b.card ? `${cardText(b.card)}, ${moneyText(b.lateFeeMinor || 0, b.currency)} if missed` : b.status === "held" ? "Being saved" : "Not saved"}</dd></div>}
          {b.fee && <div><dt>Fee</dt><dd>{moneyText(b.fee.amountMinor, b.currency)} charged{b.fee.reason ? ` for a ${b.fee.reason}` : ""}, {new Date(b.fee.at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</dd></div>}
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
            <Toggle label="Didn't turn up" checked={!!b.noShow} disabled={!!busy} onChange={(v) => void run("noshow", "noShow", { value: v }, v ? "Marked as a no-show" : "No-show taken off")} />
            {(b.payment === "atShop" || (b.payment === "deposit" && b.depositPaid)) && <Toggle label={b.payment === "deposit" ? `Rest paid at the shop (${moneyText(Math.max(0, b.priceMinor - (b.depositMinor || 0)), b.currency)})` : "Paid at the shop"} checked={b.paid} disabled={!!busy} onChange={(v) => void run("paid", "paidAtShop", { value: v }, v ? "Marked paid" : "Paid mark taken off")} />}
          </div>
        )}
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
        <CancelDialog booking={b} onClose={() => setCancelling(false)}
          onCancel={async (refundMinor) => {
            await bookingsAdmin("cancel", { id: b.id, refundMinor });
            toast.success(refundMinor === 0 ? "Booking cancelled" : refundMinor < cardTaken(b) ? `Cancelled, ${moneyText(refundMinor, b.currency)} refunded` : "Cancelled and refunded");
            setCancelling(false);
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
          onClose={() => setMoving(false)}
          onPick={async (start) => { await bookingsAdmin("move", { id: b.id, start }); toast.success("Booking moved"); setMoving(false); }} />
      )}
      {confirmNode}
    </Drawer>
  );
}

/** The owner's private calendar link: Google or Apple Calendar subscribes to it and shows every booking. */
function CalendarTile() {
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

/** Cancels a booking with money taken by card (all of it or a deposit), refunding all of that, part of it or none. */
function CancelDialog({ booking: b, onClose, onCancel }: { booking: Booking; onClose: () => void; onCancel: (refundMinor: number) => Promise<void> }) {
  const [choice, setChoice] = useState<"all" | "part" | "none">("all");
  const [part, setPart] = useState("");
  const [problem, setProblem] = useState("");
  const [saving, setSaving] = useState(false);
  const onCard = cardTaken(b);
  const deposit = b.payment === "deposit";
  const paid = moneyText(onCard, b.currency);
  const partMinor = Math.round(Number(part) * 100);
  const partProblem = choice !== "part" ? "" : !part || !Number.isFinite(partMinor) || partMinor <= 0 ? "Type how much to refund." : partMinor >= onCard ? `For ${paid} or more, choose Refund all.` : "";
  const refundMinor = choice === "all" ? onCard : choice === "none" ? 0 : partMinor;
  const save = async () => {
    setSaving(true); setProblem("");
    try { await onCancel(refundMinor); } catch (e: any) { setProblem(e?.message || "That didn't save. Please try again."); } finally { setSaving(false); }
  };
  const options = [
    { id: "all", label: "Refund all", note: paid },
    { id: "part", label: "Refund part", note: deposit ? "Keep some of it" : "Keep a deposit" },
    { id: "none", label: "No refund", note: deposit ? "Keep the deposit" : "Keep the payment" },
  ] as const;
  return (
    <Dialog open onClose={onClose} title="Cancel this booking?" description={`${b.customer.name} paid ${deposit ? `a ${paid} deposit` : paid} by card. They get an email saying it's cancelled, and the time opens up for others.`}
      footer={<><SecondaryButton onClick={onClose}>Keep booking</SecondaryButton><DestructiveButton onClick={() => void save()} busy={saving} disabled={!!partProblem}>{refundMinor > 0 ? `Cancel and refund ${moneyText(refundMinor, b.currency)}` : "Cancel booking"}</DestructiveButton></>}>
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
          <TextField label={`Amount to refund (${b.currency})`} hint={`Up to ${paid}. The rest stays with you.`} inputMode="decimal" placeholder="0.00" autoFocus
            value={part} onChange={(e) => setPart(e.target.value.replace(/[^\d.]/g, ""))} error={part ? partProblem || undefined : undefined} />
        )}
        {problem && <p className="bkg-error" role="alert">{problem}</p>}
      </div>
    </Dialog>
  );
}

/** Picks a day and one of its free times for a service. `onPick` throws to keep the dialog open. */
function TimeDialog({ title, description, service, initialDay, except = "", confirmLabel, onClose, onPick, children, ready = true }: {
  title: string; description?: string; service: BookingService; initialDay: string; except?: string; confirmLabel: string;
  onClose: () => void; onPick: (startIso: string) => Promise<void>; children?: React.ReactNode; ready?: boolean;
}) {
  const [day, setDay] = useState(initialDay);
  const [times, setTimes] = useState<string[] | null>(null);
  const [picked, setPicked] = useState("");
  const [problem, setProblem] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let live = true;
    setTimes(null); setPicked("");
    bookingsAdmin<{ times: string[] }>("times", { serviceId: service.id, day, except }).then((r) => live && setTimes(r.times)).catch((e) => live && (setTimes([]), setProblem(e.message)));
    return () => { live = false; };
  }, [day, service.id]);
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
        {problem && <p className="bkg-error" role="alert">{problem}</p>}
      </div>
    </Dialog>
  );
}

function NewBookingDialog({ services, onClose }: { services: BookingService[]; onClose: () => void }) {
  const [serviceId, setServiceId] = useState(services[0]?.id || "");
  const [who, setWho] = useState({ name: "", email: "", phone: "", note: "" });
  const [sendEmail, setSendEmail] = useState(true);
  const service = services.find((s) => s.id === serviceId) || services[0];
  const ready = who.name.trim().length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(who.email.trim());
  return (
    <TimeDialog key={service.id} title="New booking" service={service} initialDay={today()} confirmLabel="Book" onClose={onClose} ready={ready}
      onPick={async (start) => {
        await bookingsAdmin("create", { serviceId: service.id, start, ...who, sendEmail });
        toast.success(`${who.name.trim()} is booked in`);
        onClose();
      }}>
      <SelectField label="Service" value={service.id} onChange={(e) => setServiceId(e.target.value)}>
        {services.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.minutes} min</option>)}
      </SelectField>
      <div className="bkg-two">
        <TextField label="Name" value={who.name} onChange={(e) => setWho({ ...who, name: e.target.value })} autoComplete="off" />
        <TextField label="Email" type="email" value={who.email} onChange={(e) => setWho({ ...who, email: e.target.value })} autoComplete="off" />
      </div>
      <div className="bkg-two">
        <TextField label="Phone (optional)" type="tel" value={who.phone} onChange={(e) => setWho({ ...who, phone: e.target.value })} autoComplete="off" />
        <TextField label="Note (optional)" value={who.note} onChange={(e) => setWho({ ...who, note: e.target.value })} />
      </div>
      <Toggle label="Email them the booking" checked={sendEmail} onChange={setSendEmail} />
    </TimeDialog>
  );
}

// ── Services ────────────────────────────────────────────────────────────────────────────────────────────────────────

const EMPTY_SERVICE: BookingService = { id: "", name: "", description: "", minutes: 60, gapAfter: 0, priceMinor: 0, payment: "free", depositMinor: 0, depositPercent: 0, location: "", active: true, order: 0, questions: [], places: 1, classTimes: [], holdCard: false, lateFeeMinor: 0 };

function ServicesPanel({ services, onChanged, startAdding = false, onStarted }: { services: BookingService[]; onChanged: () => void; startAdding?: boolean; onStarted?: () => void }) {
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
            <p className="bkg-service-meta">{s.minutes} min{s.gapAfter ? ` + ${s.gapAfter} min rest` : ""}{s.places > 1 ? ` · class of ${s.places}` : ""}</p>
            <p className="bkg-service-price">{s.priceMinor > 0 ? moneyText(s.priceMinor, SHOP_CURRENCY) : "Free"}{s.payment === "deposit" ? <span className="bkg-service-pay">{moneyText(depositOf(s), SHOP_CURRENCY)} deposit</span> : s.payment === "atShop" ? <span className="bkg-service-pay">Paid at the visit</span> : null}{s.holdCard ? <span className="bkg-service-pay">Card on file · {moneyText(s.lateFeeMinor, SHOP_CURRENCY)} if missed</span> : null}</p>
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
      {editing && <ServiceDialog service={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onChanged(); }} />}
      {confirmNode}
    </div>
  );
}

/** Under the deposit box: what the customer pays now and what is left for the visit. */
function depositHint(price: string, deposit: string, unit: "amount" | "percent"): string {
  const priceMinor = Math.round(Number(price || 0) * 100);
  const now = depositOf({ payment: "deposit", priceMinor, depositMinor: unit === "amount" ? Math.round(Number(deposit || 0) * 100) : 0, depositPercent: unit === "percent" ? Math.round(Number(deposit || 0)) : 0 });
  if (!now || now >= priceMinor) return "Less than the price.";
  return `${moneyText(now, SHOP_CURRENCY)} when they book, ${moneyText(priceMinor - now, SHOP_CURRENCY)} at the visit.`;
}

function ServiceDialog({ service, onClose, onSaved }: { service: BookingService; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    ...service, price: service.priceMinor ? (service.priceMinor / 100).toFixed(2) : "",
    // When they pay (only asked once there is a price), and the deposit as the owner types it: an amount or a percent.
    pay: (service.payment === "deposit" || service.payment === "atShop" ? service.payment : "full") as "full" | "deposit" | "atShop",
    depositUnit: (service.depositPercent ? "percent" : "amount") as "amount" | "percent",
    deposit: service.depositPercent ? String(service.depositPercent) : service.depositMinor ? (service.depositMinor / 100).toFixed(2) : "",
    lateFee: service.lateFeeMinor ? (service.lateFeeMinor / 100).toFixed(2) : "",
  });
  // Card on file: only where something is left to charge (not paid in full), and only on Stripe.
  const paidInFull = Number(form.price) > 0 && form.pay === "full";
  const square = paysOnSquare();
  const [problem, setProblem] = useState("");
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const questions = form.questions || [];
  const classTimes = form.classTimes || [];
  const group = form.places > 1;
  const setClassTime = (i: number, change: Partial<(typeof classTimes)[number]>) => set("classTimes", classTimes.map((t, j) => (j === i ? { ...t, ...change } : t)));
  const setQuestion = (i: number, change: Partial<(typeof questions)[number]>) => set("questions", questions.map((q, j) => (j === i ? { ...q, ...change } : q)));
  const save = async () => {
    setSaving(true); setProblem("");
    try {
      const priceMinor = Math.round(Number(form.price || 0) * 100);
      const { pay, depositUnit, deposit, lateFee, price: _price, ...rest } = form;
      const holdCard = form.holdCard && !paidInFull && !square;
      const share = pay === "deposit" && priceMinor > 0;
      await bookingsAdmin("saveService", { service: {
        ...rest, priceMinor, payment: priceMinor > 0 ? pay : "free",
        depositMinor: share && depositUnit === "amount" ? Math.round(Number(deposit || 0) * 100) : 0,
        depositPercent: share && depositUnit === "percent" ? Math.round(Number(deposit || 0)) : 0,
        holdCard, lateFeeMinor: holdCard ? Math.round(Number(lateFee || 0) * 100) : 0,
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
        <TextField label="Where (optional)" placeholder="The studio, 12 Ink Lane" value={form.location} onChange={(e) => set("location", e.target.value)} />
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
              <p className="bkg-questions-hint">{classTimes.length ? "The class runs at these times each week." : "Add the times the class runs each week, or leave this empty to offer every free time in your hours."}</p>
              {classTimes.map((t, i) => (
                <div key={i} className="bkg-classtime">
                  <SelectField label="Day" value={String(t.weekday)} onChange={(e) => setClassTime(i, { weekday: Number(e.target.value) })}>
                    {ORDERED_DAYS.map((d) => <option key={d} value={d}>{WEEKDAYS[d]}</option>)}
                  </SelectField>
                  <TextField label="Starts" type="time" value={t.time} onChange={(e) => setClassTime(i, { time: e.target.value })} />
                  <button type="button" className="bkg-question-remove" aria-label={`Remove ${WEEKDAYS[t.weekday]} ${t.time}`} onClick={() => set("classTimes", classTimes.filter((_, j) => j !== i))}><Trash2 size={16} aria-hidden /></button>
                </div>
              ))}
              {classTimes.length < MAX_CLASS_TIMES && (
                <SecondaryButton icon={<Plus size={16} aria-hidden />} onClick={() => set("classTimes", [...classTimes, { weekday: classTimes[classTimes.length - 1]?.weekday ?? 6, time: classTimes[classTimes.length - 1]?.time ?? "14:00" }])}>Add a class time</SecondaryButton>
              )}
            </>
          )}
        </fieldset>
        <TextArea label="About it (optional)" rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} />
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

function HoursPanel({ settings, saved, onSaved, active }: { settings: BookingSettings; saved: boolean; onSaved: () => void; active: boolean }) {
  const [form, setForm] = useState<BookingSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [newDayOff, setNewDayOff] = useState("");
  // The on/off switch lives at the top of the page and saves by itself, so flipping it never throws away hours being edited.
  const hoursOf = JSON.stringify({ ...settings, live: false });
  useEffect(() => setForm(settings), [hoursOf]);
  const dirty = !saved || JSON.stringify({ ...form, live: false }) !== hoursOf;
  const setDay = (wd: number, windows: { start: string; end: string }[]) => setForm((f) => ({ ...f, hours: f.hours.map((h, i) => (i === wd ? windows : h)) }));
  const save = async () => {
    setSaving(true);
    try { await bookingsAdmin("saveSettings", { settings: { ...form, live: settings.live } }); toast.success("Hours saved"); onSaved(); }
    catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };
  return (
    <div className="bkg-hours">
      <section className="bkg-tile">
        <h2 className="bkg-tile-title">Opening hours</h2>
        <ul className="bkg-week-hours">
          {ORDERED_DAYS.map((wd) => {
            const windows = form.hours[wd];
            const open = windows.length > 0;
            return (
              <li key={wd} className="bkg-hours-row" data-closed={!open || undefined}>
                <Toggle label={WEEKDAYS[wd]} checked={open} onChange={(v) => setDay(wd, v ? [{ start: "10:00", end: "17:00" }] : [])} />
                <div className="bkg-hours-windows">
                  {open ? windows.map((w, i) => (
                    <div key={i} className="bkg-window">
                      <TextField label={`${WEEKDAYS[wd]} from`} hideLabel type="time" step={300} value={w.start} onChange={(e) => setDay(wd, windows.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} />
                      <span aria-hidden>–</span>
                      <TextField label={`${WEEKDAYS[wd]} until`} hideLabel type="time" step={300} value={w.end} onChange={(e) => setDay(wd, windows.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} />
                      {windows.length > 1 && <IconButton label="Remove these hours" onClick={() => setDay(wd, windows.filter((_, j) => j !== i))}><Trash2 size={15} aria-hidden /></IconButton>}
                    </div>
                  )) : <span className="bkg-closed">Closed</span>}
                  {open && windows.length < 3 && (
                    <GhostButton size="sm" onClick={() => setDay(wd, [...windows, { start: windows[windows.length - 1].end, end: "18:00" }])}>Add hours</GhostButton>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
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
            <SelectField label="Reminder email" hint="Sent to customers before their booking, with a link to cancel or move it." value={String(form.reminderHours)} onChange={(e) => setForm({ ...form, reminderHours: Number(e.target.value) })}>
              {REMINDER_HOURS.map((h) => <option key={h} value={h}>{h === 0 ? "Don't send" : h < 24 ? `${h} hours before` : `${h / 24} day${h === 24 ? "" : "s"} before`}</option>)}
            </SelectField>
            <SelectField label="Start times every" value={String(form.step)} onChange={(e) => setForm({ ...form, step: Number(e.target.value) })}>
              {BOOKING_STEPS.map((m) => <option key={m} value={m}>{m === 60 ? "hour" : `${m} minutes`}</option>)}
            </SelectField>
          </div>
        </section>
        <section className="bkg-tile">
          <h2 className="bkg-tile-title">Days off</h2>
          <div className="bkg-dayoff-add">
            <TextField label="Add a day off" type="date" min={today()} value={newDayOff} onChange={(e) => setNewDayOff(e.target.value)} />
            <SecondaryButton disabled={!newDayOff} onClick={() => { setForm({ ...form, daysOff: [...new Set([...form.daysOff, newDayOff])].sort() }); setNewDayOff(""); }}>Add</SecondaryButton>
          </div>
          {form.daysOff.filter((d) => d >= today()).length === 0 ? <p className="bkg-day-empty">No days off coming up.</p> : (
            <ul className="bkg-chips">
              {form.daysOff.filter((d) => d >= today()).map((d) => (
                <li key={d}><span>{dayText(d, "long")}</span><IconButton label={`Remove ${dayText(d, "long")}`} onClick={() => setForm({ ...form, daysOff: form.daysOff.filter((x) => x !== d) })}><Trash2 size={14} aria-hidden /></IconButton></li>
              ))}
            </ul>
          )}
        </section>
        <CalendarTile />
      </div>
      {active && <SaveBar dirty={dirty} saving={saving} onSave={() => void save()} onDiscard={() => setForm(saved ? settings : DEFAULT_BOOKING_SETTINGS)} message={saved ? undefined : "Save your hours to start taking bookings."} />}
    </div>
  );
}
