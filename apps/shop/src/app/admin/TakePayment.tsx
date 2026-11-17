// Take a payment (Services plan, phase 3, 16 November 2026; tasks/todo/2026-11-16-take-a-payment.md). The desk's one
// screen: someone with no booking (pick the service, their name, the amount) or a booking with something left to pay
// today, then a QR code the client scans to pay on their own phone, a tip included. The money goes through the shop's
// own card account from the same booking pay page as every other payment; nothing here charges anyone. The dialog
// follows the booking live and says Paid the moment the payment lands.
import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Mail, QrCode } from "lucide-react";
import toast from "react-hot-toast";
import { Dialog, EmptyState, ErrorState, GhostButton, LoadingState, PrimaryButton, SecondaryButton, SelectField, TextField } from "./riso/components";
import { bookingsAdmin, followBookings, readBookingSetup, type Booking } from "./bookingsApi";
import { moneyText, timeText } from "./bookingsView";
import { amountMinor, deskState, dueToday } from "./deskPayment";
import { dayOf, MIN_CARD_MINOR, type BookingService, type BookingSettings } from "../../shared/bookingTimes";
import { shopTimeZone } from "../../shared/shopTimeZone";
import { SHOP_CURRENCY } from "./moneySign";
import { copyText } from "./clipboard";
import { qrPicture } from "./stockroom/qrCodesStore";
import "./bookings.css";

const ZONE = shopTimeZone();
const HOUR = 3_600_000;

export function TakePayment() {
  const [setup, setSetup] = useState<{ services: BookingService[]; settings: BookingSettings } | null>(null);
  const [setupError, setSetupError] = useState("");
  const [rows, setRows] = useState<Booking[] | null>(null);
  const [paying, setPaying] = useState<{ id: string; url: string; picture: string; fallback: Booking } | null>(null);

  const load = () => readBookingSetup().then((s) => { setSetup(s); setSetupError(""); }).catch((e) => setSetupError(e?.message || "Couldn't load your services."));
  useEffect(() => { void load(); }, []);
  // Today in the shop's time zone, with a day either side so no time zone ever drops a booking.
  useEffect(() => followBookings(new Date(Date.now() - 26 * HOUR).toISOString(), new Date(Date.now() + 26 * HOUR).toISOString(), setRows, () => setRows([])), []);

  const today = dayOf(Date.now(), ZONE);
  const due = useMemo(() => dueToday(rows || [], today, ZONE), [rows, today]);
  const services = (setup?.services || []).filter((s) => s.active);

  const showQr = async (id: string, url: string, fallback: Booking) => setPaying({ id, url, picture: await qrPicture(url, 8), fallback });

  if (setupError) return <ErrorState title="Couldn't open Take a payment" description={setupError} onRetry={() => void load()} />;
  if (!setup) return <LoadingState label="Loading your services…" />;

  return (
    <div className="bkg-page tp-page">
      <div className="tp-grid">
        <WalkIn services={services} onReady={showQr} />
        <section className="bkg-tile">
          <p className="bkg-kicker">Still to pay today</p>
          {rows === null ? <LoadingState /> : due.length === 0 ? (
            <p className="tp-quiet">Nothing left to pay today.</p>
          ) : (
            <ul className="tp-due">
              {due.map((b) => <DueRow key={b.id} booking={b} onReady={showQr} />)}
            </ul>
          )}
        </section>
      </div>
      {paying && (
        <PayDialog url={paying.url} picture={paying.picture} booking={(rows || []).find((r) => r.id === paying.id) || paying.fallback}
          tips={setup.settings.tips} onClose={() => setPaying(null)} />
      )}
    </div>
  );
}

/** Someone at the desk with no booking: the service, their name (an email for the receipt, if they like) and the amount. */
function WalkIn({ services, onReady }: { services: BookingService[]; onReady: (id: string, url: string, fallback: Booking) => Promise<void> }) {
  const [serviceId, setServiceId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const service = services.find((s) => s.id === serviceId) || services[0];
  useEffect(() => { if (service) setAmount(service.priceMinor ? (service.priceMinor / 100).toFixed(2) : ""); }, [service?.id]);

  if (!services.length) {
    return (
      <section className="bkg-tile bkg-tile-mint">
        <p className="bkg-kicker">Someone at the desk</p>
        <EmptyState inline title="Add a service first" description="Calendar › Services. Then you can take payment for it here." />
      </section>
    );
  }
  const typed = amountMinor(amount);
  const amountProblem = typed === null ? "Enter the amount." : Number.isNaN(typed) ? "Enter an amount like 45 or 45.50." : typed < MIN_CARD_MINOR ? `The smallest card payment is ${moneyText(MIN_CARD_MINOR, SHOP_CURRENCY)}.` : "";
  const start = async () => {
    if (!name.trim()) { setError("Add the client's name."); return; }
    if (amountProblem) { setError(amountProblem); return; }
    setBusy(true);
    setError("");
    try {
      const r = await bookingsAdmin<{ id: string; url: string; dueMinor: number }>("walkIn", { serviceId: service.id, name: name.trim(), email: email.trim(), priceMinor: typed });
      const now = new Date().toISOString();
      await onReady(r.id, r.url, {
        id: r.id, serviceId: service.id, serviceName: service.name, minutes: service.minutes, start: now, end: now, customer: { name: name.trim(), email: email.trim() },
        status: "confirmed", payment: "atShop", priceMinor: r.dueMinor, currency: SHOP_CURRENCY, paid: false,
      });
      setName(""); setEmail("");
    } catch (e: any) {
      setError(e?.message || "The payment couldn't be started. Please try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="bkg-tile bkg-tile-mint">
      <p className="bkg-kicker">Someone at the desk</p>
      <div className="bkg-form">
        <SelectField label="Service" value={service.id} onChange={(e) => setServiceId(e.target.value)}>
          {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </SelectField>
        <TextField label="Client's name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        <TextField label="Email (optional)" hint="For their receipt." type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
        <TextField label={`Amount (${SHOP_CURRENCY})`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        {error && <p className="bkg-error" role="alert">{error}</p>}
        <PrimaryButton onClick={() => void start()} busy={busy}><QrCode size={16} aria-hidden /> Show QR code</PrimaryButton>
      </div>
    </section>
  );
}

function DueRow({ booking: b, onReady }: { booking: Booking; onReady: (id: string, url: string, fallback: Booking) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const open = async () => {
    setBusy(true);
    try {
      const r = await bookingsAdmin<{ url: string }>("payLink", { id: b.id });
      await onReady(b.id, r.url, b);
    } catch (e: any) {
      toast.error(e?.message || "The pay link couldn't be made. Please try again.");
    } finally {
      setBusy(false);
    }
  };
  const state = deskState(b);
  return (
    <li className="tp-row">
      <span className="tp-time">{timeText(b.start, ZONE)}</span>
      <span className="tp-who"><strong>{b.customer.name}</strong><span>{b.serviceName}</span></span>
      <span className="tp-amount">{state.state === "waiting" ? moneyText(state.dueMinor, b.currency) : ""}</span>
      <SecondaryButton size="sm" onClick={() => void open()} busy={busy}>Take payment</SecondaryButton>
    </li>
  );
}

/** The QR code, followed live: it turns to Paid when the client's payment lands, or the owner marks it paid another way. */
function PayDialog({ url, picture, booking: b, tips, onClose }: { url: string; picture: string; booking: Booking; tips: boolean; onClose: () => void }) {
  const [busy, setBusy] = useState("");
  const state = deskState(b);
  const first = b.customer.name.split(" ")[0] || "They";
  const act = async (what: "send" | "paid") => {
    setBusy(what);
    try {
      if (what === "send") { await bookingsAdmin("payLink", { id: b.id, send: true }); toast.success(`Sent to ${b.customer.email}`); }
      else await bookingsAdmin("paidAtShop", { id: b.id });
    } catch (e: any) {
      toast.error(e?.message || "That didn't work. Please try again.");
    } finally {
      setBusy("");
    }
  };
  if (state.state === "paid") {
    return (
      <Dialog open onClose={onClose} title="Paid" footer={<PrimaryButton onClick={onClose}>Done</PrimaryButton>}>
        <div className="tp-paid" role="status">
          <span className="tp-paid-mark" aria-hidden><Check size={28} /></span>
          <p className="tp-paid-sum">{state.otherWay ? "Marked paid" : moneyText(state.byCard + state.tipMinor, b.currency)}</p>
          <p>{b.customer.name} · {b.serviceName}{state.tipMinor ? ` · ${moneyText(state.tipMinor, b.currency)} tip` : ""}</p>
        </div>
      </Dialog>
    );
  }
  return (
    <Dialog open onClose={onClose} title={`Pay ${moneyText(state.dueMinor, b.currency)}`}
      description={`${first} points their phone camera at the code and pays by card${tips ? ", with a tip if they like" : ""}.`}
      footerStart={<GhostButton onClick={() => void act("paid")} busy={busy === "paid"} disabled={!!busy}>Paid another way</GhostButton>}
      footer={<SecondaryButton onClick={onClose}>Close</SecondaryButton>}>
      <div className="bkg-qr">
        <img src={picture} alt={`QR code to pay ${moneyText(state.dueMinor, b.currency)} for ${b.serviceName}`} width={264} height={264} />
        <p>{b.serviceName} · {b.customer.name}</p>
        <p className="tp-waiting" role="status">Waiting for the payment…</p>
        <div className="bkg-due-actions">
          <SecondaryButton size="sm" onClick={() => void copyText(url, "Pay link")}><Copy size={15} aria-hidden /> Copy link</SecondaryButton>
          {b.customer.email && <SecondaryButton size="sm" onClick={() => void act("send")} busy={busy === "send"} disabled={!!busy}><Mail size={15} aria-hidden /> Email it</SecondaryButton>}
        </div>
      </div>
    </Dialog>
  );
}
