// Admin › Orders › Bookings (beta, 14 November 2026; tasks/todo/2026-11-14-bookings-beta.md). The week's bookings, the
// services customers can book and the opening hours, in the Colophon bento look (bookings.css, tokens only). Shown only
// when the platform turned Bookings on for the shop (Dashboard.tsx hides the page otherwise). Reads come from the shop's
// folder; every change goes through the server (bookingsApi.ts), which keeps two bookings from ever taking one time.
import { useEffect, useMemo, useState } from "react";
import { CalendarPlus, ChevronLeft, ChevronRight, Clock, Copy, ExternalLink, MapPin, Plus, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import {
  DestructiveButton, Dialog, Drawer, EmptyState, ErrorState, GhostButton, IconButton, LoadingState, PageActions, PrimaryButton,
  SaveBar, SecondaryButton, SelectField, StatusBadge, TabPanel, Tabs, TextArea, TextField, Toggle, useConfirm,
} from "./riso/components";
import { bookingsAdmin, followBookings, readBookingSetup, type Booking } from "./bookingsApi";
import { byDay, dayText, hoursLine, moneyText, nextUp, paymentText, timeText, weekDays, WEEKDAYS, weekFigures, weekStartOf, weekText, whenFromNow } from "./bookingsView";
import { addDays, BOOKING_STEPS, dayOf, DEFAULT_BOOKING_SETTINGS, type BookingService, type BookingSettings } from "../../shared/bookingTimes";
import { shopTimeZone } from "../../shared/shopTimeZone";
import { SHOP_CURRENCY } from "./moneySign";
import { copyText } from "./clipboard";
import "./bookings.css";

type Tab = "calendar" | "services" | "hours";
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
              <span className="bkg-next-what">{!setup.services.length ? "Add what customers can book under Services." : setup.settings.live ? "New bookings show here the moment they're made." : "Turn on your bookings page under Hours & rules to take bookings."}</span>
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
        <div className="bkg-tile bkg-tile-ink bkg-pagecard">
          <p className="bkg-kicker">Bookings page</p>
          <p className="bkg-page-state">{setup.settings.live ? "Taking bookings" : "Hidden"}</p>
          <div className="bkg-pill-row">
            <button type="button" className="bkg-pill" onClick={() => void copyText(bookPageUrl(), "Link")}><Copy size={14} aria-hidden /> Copy link</button>
            <a className="bkg-pill" href={bookPageUrl()} target="_blank" rel="noreferrer"><ExternalLink size={14} aria-hidden /> View</a>
          </div>
        </div>
      </section>

      <Tabs<Tab> label="Bookings" variant="page" value={tab} onChange={setTab}
        tabs={[{ id: "calendar", label: "Calendar" }, { id: "services", label: "Services", count: setup.services.length }, { id: "hours", label: "Hours & rules" }]} />

      <TabPanel tabId="calendar" active={tab === "calendar"}>
        {noServices ? (
          <EmptyState title="Add what customers can book" description="A studio visit, a class for one, a portfolio review: give it a length and a price, then turn on your bookings page."
            action={<PrimaryButton icon={<Plus size={16} aria-hidden />} onClick={() => { setAdding(true); setTab("services"); }}>Add a service</PrimaryButton>} />
        ) : (
          <WeekView monday={monday} setMonday={setMonday} rows={rows} error={rowsError} settings={setup.settings} onOpen={setOpen} />
        )}
      </TabPanel>
      <TabPanel tabId="services" active={tab === "services"}>
        <ServicesPanel services={setup.services} onChanged={reloadSetup} startAdding={adding} onStarted={() => setAdding(false)} />
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

function WeekView({ monday, setMonday, rows, error, settings, onOpen }: {
  monday: string; setMonday: (d: string) => void; rows: Booking[] | null; error: string; settings: BookingSettings; onOpen: (b: Booking) => void;
}) {
  const days = weekDays(monday);
  const groups = useMemo(() => byDay(rows || [], ZONE), [rows]);
  const now = today();
  const [phoneDay, setPhoneDay] = useState(() => (days.includes(now) ? now : monday));
  useEffect(() => { setPhoneDay(days.includes(now) ? now : monday); }, [monday]);
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
              ) : list.map((b) => (
                <button key={b.id} type="button" className="bkg-slot" data-status={b.status} data-noshow={b.noShow || undefined} onClick={() => onOpen(b)}>
                  <span className="bkg-slot-time">{timeText(b.start, ZONE)}</span>
                  <span className="bkg-slot-who">{b.customer.name}</span>
                  <span className="bkg-slot-what">{b.serviceName}</span>
                  {b.status === "held" && <span className="bkg-slot-tag">Paying now</span>}
                  {b.noShow && <span className="bkg-slot-tag">No-show</span>}
                </button>
              ))}
            </section>
          );
        })}
      </div>
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
  const cancel = async () => {
    const paidByCard = b.payment === "card" && b.paid && !b.refund;
    if (!(await ask({ title: "Cancel this booking?", message: `${b.customer.name} gets an email saying it's cancelled${paidByCard ? ", and their card payment is refunded in full" : ""}. The time opens up for others.`, confirmLabel: "Cancel booking" }))) return;
    await run("cancel", "cancel", { refund: paidByCard }, paidByCard ? "Cancelled and refunded" : "Booking cancelled");
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
            {b.status === "confirmed" ? "Booked" : b.status === "held" ? "Paying now" : "Cancelled"}
          </StatusBadge>
        </div>
        {b.location && <p className="bkg-detail-line"><MapPin size={16} aria-hidden /> {b.location}</p>}
        <dl className="bkg-facts">
          <div><dt>Email</dt><dd><a href={`mailto:${b.customer.email}`}>{b.customer.email}</a></dd></div>
          {b.customer.phone && <div><dt>Phone</dt><dd><a href={`tel:${b.customer.phone}`}>{b.customer.phone}</a></dd></div>}
          <div><dt>Payment</dt><dd>{paymentText(b)}</dd></div>
          <div><dt>Booked</dt><dd>{b.source === "admin" ? "By you" : "On your website"}{b.createdAt ? `, ${new Date(b.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}` : ""}</dd></div>
        </dl>
        {b.note && <blockquote className="bkg-note">“{b.note}”</blockquote>}
        {b.status === "confirmed" && (
          <div className="bkg-detail-toggles">
            <Toggle label="Didn't turn up" checked={!!b.noShow} disabled={!!busy} onChange={(v) => void run("noshow", "noShow", { value: v }, v ? "Marked as a no-show" : "No-show taken off")} />
            {b.payment === "atShop" && <Toggle label="Paid at the shop" checked={b.paid} disabled={!!busy} onChange={(v) => void run("paid", "paidAtShop", { value: v }, v ? "Marked paid" : "Paid mark taken off")} />}
          </div>
        )}
        {!!b.history?.length && (
          <details className="bkg-history">
            <summary>History</summary>
            <ul>{[...b.history].reverse().map((h, i) => <li key={i}>{new Date(h.at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}: {h.what.replace(/^moved from .*/, "moved")} ({h.by})</li>)}</ul>
          </details>
        )}
      </div>
      {moving && service && (
        <TimeDialog title="Move booking" description={`${b.customer.name} gets an email with the new time.`} service={service} initialDay={day} except={b.id} confirmLabel="Move here"
          onClose={() => setMoving(false)}
          onPick={async (start) => { await bookingsAdmin("move", { id: b.id, start }); toast.success("Booking moved"); setMoving(false); }} />
      )}
      {confirmNode}
    </Drawer>
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

const EMPTY_SERVICE: BookingService = { id: "", name: "", description: "", minutes: 60, gapAfter: 0, priceMinor: 0, payment: "free", location: "", active: true, order: 0 };

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
            <p className="bkg-service-meta">{s.minutes} min{s.gapAfter ? ` + ${s.gapAfter} min rest` : ""}</p>
            <p className="bkg-service-price">{s.payment === "full" ? moneyText(s.priceMinor, SHOP_CURRENCY) : "Free"}</p>
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

function ServiceDialog({ service, onClose, onSaved }: { service: BookingService; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ ...service, price: service.priceMinor ? (service.priceMinor / 100).toFixed(2) : "" });
  const [problem, setProblem] = useState("");
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const save = async () => {
    setSaving(true); setProblem("");
    try {
      const priceMinor = Math.round(Number(form.price || 0) * 100);
      await bookingsAdmin("saveService", { service: { ...form, priceMinor, payment: priceMinor > 0 ? "full" : "free" } });
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
        <TextField label={`Price (${SHOP_CURRENCY})`} hint="Leave blank for free. Paid bookings are paid by card when booked." inputMode="decimal" placeholder="0.00" value={form.price} onChange={(e) => set("price", e.target.value.replace(/[^\d.]/g, ""))} />
        <TextField label="Where (optional)" placeholder="The studio, 12 Ink Lane" value={form.location} onChange={(e) => set("location", e.target.value)} />
        <TextArea label="About it (optional)" rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} />
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
  useEffect(() => setForm(settings), [settings]);
  const dirty = !saved || JSON.stringify(form) !== JSON.stringify(settings);
  const setDay = (wd: number, windows: { start: string; end: string }[]) => setForm((f) => ({ ...f, hours: f.hours.map((h, i) => (i === wd ? windows : h)) }));
  const save = async () => {
    setSaving(true);
    try { await bookingsAdmin("saveSettings", { settings: form }); toast.success(form.live && !settings.live ? "Your bookings page is live" : "Hours saved"); onSaved(); }
    catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };
  return (
    <div className="bkg-hours">
      <div className="bkg-tile bkg-tile-mint bkg-live">
        <div>
          <p className="bkg-kicker">Bookings page</p>
          <p className="bkg-live-words">{form.live ? "Customers can book on your website." : "Hidden from customers."}</p>
        </div>
        <Toggle label="Show on my website" checked={form.live} onChange={(v) => setForm({ ...form, live: v })} />
      </div>

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
            <SelectField label="Customers can cancel or move" hint="Paid bookings cancelled in time are refunded in full. Later, they contact you." value={String(form.cancelHours)} onChange={(e) => setForm({ ...form, cancelHours: Number(e.target.value) })}>
              {[0, 2, 12, 24, 48, 72].map((h) => <option key={h} value={h}>{h === 0 ? "Until it starts" : `Up to ${h < 24 ? `${h} hours` : `${h / 24} day${h === 24 ? "" : "s"}`} before`}</option>)}
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
      </div>
      {active && <SaveBar dirty={dirty} saving={saving} onSave={() => void save()} onDiscard={() => setForm(saved ? settings : DEFAULT_BOOKING_SETTINGS)} message={saved ? undefined : "Save your hours to start taking bookings."} />}
    </div>
  );
}
