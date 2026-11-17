// Take a payment (Services plan, phase 3, 16 November 2026; tasks/todo/2026-11-16-take-a-payment.md). The desk's one
// screen: someone with no booking (pick the service, their name, the amount) or a booking with something left to pay
// today, then a QR code the client scans to pay on their own phone, a tip included. The money goes through the shop's
// own card account from the same booking pay page as every other payment; nothing here charges anyone. The dialog
// follows the booking live and says Paid the moment the payment lands.
// Card readers (phase 3 part 2, 17 November 2026; tasks/todo/2026-11-17-card-readers.md): a Stripe shop adds its smart
// readers here with the code each one shows, and the dialog sends what is left to one of them. The server keeps the
// payment; this page only asks it to check every two seconds while the client taps.
import { useEffect, useMemo, useState } from "react";
import { Check, Copy, CreditCard, Mail, Plus, QrCode } from "lucide-react";
import toast from "react-hot-toast";
import { Dialog, EmptyState, ErrorState, GhostButton, LoadingState, PrimaryButton, SecondaryButton, SelectField, StatusBadge, TextField, useConfirm } from "./riso/components";
import { bookingsAdmin, followBookings, readBookingSetup, type Booking, type CardReader, type CardReaders, type ReaderState } from "./bookingsApi";
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
/** How often the dialog asks the server about a payment waiting on a reader. */
const READER_CHECK_MS = 2_000;

export function TakePayment() {
  const [setup, setSetup] = useState<{ services: BookingService[]; settings: BookingSettings } | null>(null);
  const [setupError, setSetupError] = useState("");
  const [rows, setRows] = useState<Booking[] | null>(null);
  const [paying, setPaying] = useState<{ id: string; url: string; picture: string; fallback: Booking } | null>(null);

  const [readers, setReaders] = useState<CardReaders | null>(null);
  const [readersError, setReadersError] = useState("");
  const loadReaders = () => bookingsAdmin<CardReaders>("readers")
    .then((r) => { setReaders(r); setReadersError(""); })
    .catch((e) => setReadersError(e?.message || "The card readers couldn't be reached just now."));
  useEffect(() => { void loadReaders(); }, []);

  const load = () => readBookingSetup().then((s) => { setSetup(s); setSetupError(""); }).catch((e) => setSetupError(e?.message || "Couldn't load your services."));
  useEffect(() => { void load(); }, []);
  // Today in the shop's time zone, with a day either side so no time zone ever drops a booking.
  useEffect(() => followBookings(new Date(Date.now() - 26 * HOUR).toISOString(), new Date(Date.now() + 26 * HOUR).toISOString(), setRows, () => setRows([])), []);

  const today = dayOf(Date.now(), ZONE);
  const due = useMemo(() => dueToday(rows || [], today, ZONE), [rows, today]);
  const services = (setup?.services || []).filter((s) => s.active);

  const showQr = async (id: string, url: string, fallback: Booking) => {
    setPaying({ id, url, picture: await qrPicture(url, 8), fallback });
    if (readers?.available) void loadReaders(); // fresh online/offline for the dialog
  };

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
        <ReadersTile readers={readers} error={readersError} onChange={setReaders} onRetry={() => void loadReaders()} />
      </div>
      {paying && (
        <PayDialog url={paying.url} picture={paying.picture} booking={(rows || []).find((r) => r.id === paying.id) || paying.fallback}
          tips={setup.settings.tips} readers={readers?.available ? readers.readers : []} testMode={readers?.testMode === true}
          onClose={() => setPaying(null)} />
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

/** The shop's card readers: online or not, add one with the code it shows, take one away. */
function ReadersTile({ readers, error, onChange, onRetry }: { readers: CardReaders | null; error: string; onChange: (r: CardReaders) => void; onRetry: () => void }) {
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState("");
  const [confirm, confirmNode] = useConfirm();
  const remove = async (r: CardReader) => {
    if (!(await confirm({ title: `Remove ${r.label}?`, message: "Payments can't go to it until you add it again with a new code.", confirmLabel: "Remove" }))) return;
    setRemoving(r.id);
    try {
      onChange(await bookingsAdmin<CardReaders>("readerRemove", { readerId: r.id }));
    } catch (e: any) {
      toast.error(e?.message || "The reader couldn't be removed. Please try again.");
    } finally {
      setRemoving("");
    }
  };
  return (
    <section className="bkg-tile tp-readers">
      <div className="tp-readers-head">
        <p className="bkg-kicker">Card readers</p>
        {readers?.available && <SecondaryButton size="sm" onClick={() => setAdding(true)}><Plus size={15} aria-hidden /> Add a reader</SecondaryButton>}
      </div>
      {error && !readers ? (
        <div className="tp-quiet-row"><p className="tp-quiet">{error}</p><GhostButton size="sm" onClick={onRetry}>Try again</GhostButton></div>
      ) : !readers ? <LoadingState /> : !readers.available ? (
        <p className="tp-quiet">Card readers work with Stripe for now. Clients can still pay with the QR code.</p>
      ) : readers.readers.length === 0 ? (
        <p className="tp-quiet">No reader yet. Add one and payments go straight to it: the client taps, inserts or swipes their card.</p>
      ) : (
        <ul className="tp-reader-list">
          {readers.readers.map((r) => (
            <li key={r.id} className="tp-reader">
              <span className="tp-reader-icon" aria-hidden><CreditCard size={18} /></span>
              <span className="tp-who"><strong>{r.label}</strong>{r.device && <span>{r.device}</span>}</span>
              <StatusBadge tone={r.online ? "success" : "neutral"}>{r.online ? "Online" : "Offline"}</StatusBadge>
              <GhostButton size="sm" onClick={() => void remove(r)} busy={removing === r.id} disabled={!!removing}>Remove</GhostButton>
            </li>
          ))}
        </ul>
      )}
      {adding && <AddReader testMode={readers?.testMode === true} onClose={() => setAdding(false)} onAdded={(r) => { onChange(r); setAdding(false); }} />}
      {confirmNode}
    </section>
  );
}

function AddReader({ testMode, onClose, onAdded }: { testMode: boolean; onClose: () => void; onAdded: (r: CardReaders) => void }) {
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const add = async () => {
    if (!code.trim()) { setError("Enter the code the reader shows."); return; }
    setBusy(true);
    setError("");
    try {
      const r = await bookingsAdmin<CardReaders>("readerAdd", { code: code.trim(), label: label.trim() || "Front desk" });
      toast.success(`${label.trim() || "Front desk"} is ready`);
      onAdded(r);
    } catch (e: any) {
      setError(e?.message || "The reader couldn't be added just now. Please try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={onClose} title="Add a card reader"
      description="On the reader, open Settings and choose Generate pairing code. Type the three words it shows."
      footer={<><SecondaryButton onClick={onClose}>Cancel</SecondaryButton><PrimaryButton onClick={() => void add()} busy={busy}>Add reader</PrimaryButton></>}>
      <div className="bkg-form">
        <TextField label="Pairing code" placeholder="apple-grape-orange" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" data-autofocus
          hint={testMode ? "Test mode: enter simulated-wpe for a pretend reader." : undefined} />
        <TextField label="Name" placeholder="Front desk" hint="So you can tell your readers apart." value={label} onChange={(e) => setLabel(e.target.value)} autoComplete="off" />
        {error && <p className="bkg-error" role="alert">{error}</p>}
      </div>
    </Dialog>
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
function PayDialog({ url, picture, booking: b, tips, readers, testMode, onClose }: {
  url: string; picture: string; booking: Booking; tips: boolean; readers: CardReader[]; testMode: boolean; onClose: () => void;
}) {
  const [busy, setBusy] = useState("");
  const [readerId, setReaderId] = useState(() => (readers.find((r) => r.online) || readers[0])?.id || "");
  const [readerProblem, setReaderProblem] = useState("");
  const [sentHere, setSentHere] = useState(false);
  const state = deskState(b);
  const first = b.customer.name.split(" ")[0] || "They";
  const waiting = b.readerOpen === true && state.state === "waiting";
  const chosen = readers.find((r) => r.id === readerId) || readers[0];
  useEffect(() => { if (!readers.some((r) => r.id === readerId)) setReaderId((readers.find((r) => r.online) || readers[0])?.id || ""); }, [readers]);

  // While a payment sits on a reader, ask the server to look every two seconds; the booking itself follows live.
  useEffect(() => {
    if (!waiting) return;
    let asking = false;
    const timer = window.setInterval(() => {
      if (asking) return;
      asking = true;
      bookingsAdmin<ReaderState>("readerCheck", { id: b.id })
        .then((r) => { if (r.state === "idle" && r.error) setReaderProblem(r.error); })
        .catch(() => {})
        .finally(() => { asking = false; });
    }, READER_CHECK_MS);
    return () => window.clearInterval(timer);
  }, [waiting, b.id]);
  // A stop the server saw (declined card, timed out) shows here once this dialog sent the payment.
  useEffect(() => { if (sentHere && !b.readerOpen && b.readerError) setReaderProblem(b.readerError); }, [sentHere, b.readerOpen, b.readerError]);

  const reader = async (what: "readerCharge" | "readerCancel" | "readerTest") => {
    setBusy(what);
    if (what === "readerCharge") { setReaderProblem(""); setSentHere(true); }
    try {
      const r = await bookingsAdmin<ReaderState>(what, what === "readerCharge" ? { id: b.id, readerId: chosen?.id } : { id: b.id });
      if (r.state === "idle" && r.error && what !== "readerCancel") setReaderProblem(r.error);
      if (what === "readerCancel") setReaderProblem("");
    } catch (e: any) {
      setReaderProblem(e?.message || "The card reader couldn't be reached just now. Please try again.");
    } finally {
      setBusy("");
    }
  };
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
  if (waiting) {
    const on = readers.find((r) => r.id === (b.readerCharge?.readerId || readerId))?.label || "the card reader";
    return (
      <Dialog open onClose={onClose} title={`Pay ${moneyText(state.dueMinor, b.currency)}`}
        description={`${first} taps, inserts or swipes their card on ${on}.`}
        footerStart={testMode ? <GhostButton onClick={() => void reader("readerTest")} busy={busy === "readerTest"} disabled={!!busy}>Pay with a test card</GhostButton> : undefined}
        footer={<SecondaryButton onClick={() => void reader("readerCancel")} busy={busy === "readerCancel"} disabled={!!busy}>Cancel payment</SecondaryButton>}>
        <div className="tp-on-reader" role="status">
          <span className="tp-on-reader-mark" aria-hidden><CreditCard size={30} /></span>
          <p className="tp-on-reader-sum">{moneyText(state.dueMinor, b.currency)}</p>
          <p>Waiting for the card…</p>
          <p className="tp-quiet">{b.serviceName} · {b.customer.name}</p>
        </div>
      </Dialog>
    );
  }
  const several = readers.length > 1;
  return (
    <Dialog open onClose={onClose} title={`Pay ${moneyText(state.dueMinor, b.currency)}`}
      description={readers.length
        ? `${first} pays on the card reader, or points their phone camera at the code${tips ? " and adds a tip if they like" : ""}.`
        : `${first} points their phone camera at the code and pays by card${tips ? ", with a tip if they like" : ""}.`}
      footerStart={<GhostButton onClick={() => void act("paid")} busy={busy === "paid"} disabled={!!busy}>Paid another way</GhostButton>}
      footer={<SecondaryButton onClick={onClose}>Close</SecondaryButton>}>
      {readers.length > 0 && (
        <div className="tp-send">
          {several && (
            <SelectField label="Card reader" value={chosen?.id || ""} onChange={(e) => setReaderId(e.target.value)}>
              {readers.map((r) => <option key={r.id} value={r.id}>{r.label}{r.online ? "" : " (offline)"}</option>)}
            </SelectField>
          )}
          <PrimaryButton onClick={() => void reader("readerCharge")} busy={busy === "readerCharge"} disabled={!!busy}>
            <CreditCard size={16} aria-hidden /> {readerProblem ? "Try again" : several || !chosen ? "Send to card reader" : `Send to ${chosen.label}`}
          </PrimaryButton>
          {readerProblem && <p className="bkg-error" role="alert">{readerProblem}</p>}
          <p className="tp-or"><span>or scan to pay</span></p>
        </div>
      )}
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
