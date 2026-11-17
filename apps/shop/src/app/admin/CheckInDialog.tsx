// Check someone in (Bookings plan phase 4, 17 November 2026). Each confirmed booking has a check-in code in its emails
// and, as a QR code, on the client's booking page. At the Fair till or Take a payment the shop types it, scans it with
// a hand scanner (which types into the box) or with the camera, and the server marks the booking as arrived (op
// checkIn). The answer says who it is, when they're booked and what is left to pay, so the desk can take it next.
import { useEffect, useState } from "react";
import { CalendarCheck2 } from "lucide-react";
import { Dialog, GhostButton, PrimaryButton, SecondaryButton, TextField } from "./riso/components";
import { checkInBooking, type CheckInResult } from "./bookingsApi";
import { moneyText, timeText } from "./bookingsView";
import { cleanCheckInCode } from "../../shared/bookingTimes";
import { shopTimeZone } from "../../shared/shopTimeZone";
import { ScanBarcodeButton } from "./ScanBarcodeButton";
import "./bookings.css";

const ZONE = shopTimeZone();

/** The "Check in" button and its dialog. `code` opens it straight away with that code (scanned into the till's box). */
export function CheckInButton({ code = "", onCodeUsed, onTakePayment }: { code?: string; onCodeUsed?: () => void; onTakePayment?: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  useEffect(() => { if (code) setOpen(true); }, [code]);
  return (
    <>
      <SecondaryButton onClick={() => setOpen(true)}><CalendarCheck2 size={15} aria-hidden /> Check in</SecondaryButton>
      {open && <CheckInDialog first={code} onClose={() => { setOpen(false); onCodeUsed?.(); }} onTakePayment={onTakePayment} />}
    </>
  );
}

export function CheckInDialog({ first = "", onClose, onTakePayment }: { first?: string; onClose: () => void; onTakePayment?: (id: string) => void }) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CheckInResult | null>(null);

  const send = async (raw: string) => {
    const code = cleanCheckInCode(raw);
    if (!code) { setResult({ ok: false, error: "A check-in code is eight letters and numbers, like K7QM-2XPA.", code: "bad_code" }); return; }
    setBusy(true);
    const r = await checkInBooking({ code });
    setBusy(false);
    setResult(r);
    setTyped("");
    // Ready for the next person straight away.
    window.setTimeout(() => document.querySelector<HTMLInputElement>(".bkg-checkin-input")?.focus(), 0);
  };
  useEffect(() => { if (first) void send(first); }, []);

  const undo = async (id: string) => {
    setBusy(true);
    const r = await checkInBooking({ id, value: false });
    setBusy(false);
    setResult(r.ok ? null : r);
  };

  const who = result?.booking;
  return (
    <Dialog open onClose={onClose} title="Check someone in" description="Type or scan the code from their booking email or booking page.">
      <form className="bkg-checkin-form" onSubmit={(e) => { e.preventDefault(); void send(typed); }}>
        <TextField label="Check-in code" placeholder="K7QM-2XPA" autoFocus autoComplete="off" autoCapitalize="characters" spellCheck={false}
          className="bkg-checkin-input" value={typed} onChange={(e) => setTyped(e.target.value)} />
        <div className="bkg-checkin-actions">
          <PrimaryButton type="submit" busy={busy} disabled={busy || !typed.trim()}>Check in</PrimaryButton>
          <ScanBarcodeButton label="Scan their code" title="Scan their check-in code" description="Hold the QR code on their phone inside the picture. It checks them in by itself."
            qr={(raw) => cleanCheckInCode(raw)} onCode={(code) => void send(code)} />
        </div>
      </form>
      {result && (
        <div className="bkg-arrival" data-state={result.ok ? (result.already ? "already" : "in") : "refused"} role="status" aria-live="polite">
          {who && <p className="bkg-arrival-name">{who.name}</p>}
          {who && <p className="bkg-arrival-what">{who.serviceName} · {timeText(who.start, ZONE)} – {timeText(who.end, ZONE)}</p>}
          <p className="bkg-arrival-say">
            {result.ok
              ? result.already ? `Already checked in at ${timeText(result.booking.checkedInAt || result.booking.start, ZONE)}.` : "Checked in."
              : result.error}
          </p>
          {result.ok && who && who.dueMinor > 0 && (
            <p className="bkg-arrival-due">{moneyText(who.dueMinor, who.currency)} left to pay{onTakePayment ? "" : ". Take it in Take a payment."}</p>
          )}
          {result.ok && who?.note && <p className="bkg-arrival-note">“{who.note}”</p>}
          {result.ok && who && (
            <div className="bkg-arrival-actions">
              {who.dueMinor > 0 && onTakePayment && <SecondaryButton size="sm" onClick={() => { onClose(); onTakePayment(who.id); }}>Take {moneyText(who.dueMinor, who.currency)}</SecondaryButton>}
              <GhostButton size="sm" disabled={busy} onClick={() => void undo(who.id)}>Undo check-in</GhostButton>
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}
