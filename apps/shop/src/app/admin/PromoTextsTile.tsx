// Bookings › Hours & rules › Promo texts (plan 4, 5.6, Beta): one text to a group of clients who ticked "Text me offers"
// on a booking, such as "Openings this Friday". Sent by the server only (ops promoAudience, promoSend, promoHistory in
// functions/bookings.js), in the daytime on the shop's clock, at most one a day, with the shop's name and how to stop.
import { useEffect, useState } from "react";
import { Send } from "lucide-react";
import toast from "react-hot-toast";
import { Dialog, GhostButton, PrimaryButton, SecondaryButton, SelectField, StatusBadge, TextArea, Toggle } from "./riso/components";
import { bookingsAdmin } from "./bookingsApi";
import { cleanPromo, MAX_PROMO, PROMO_FROM_HOUR, PROMO_GROUPS, PROMO_UNTIL_HOUR, promoBody, textParts, type PromoGroup } from "../../shared/promoTexts";
import type { BookingService } from "../../shared/bookingTimes";

type Audience = { available: boolean; price: string; count: number; open: boolean; lastAt: string | null; nextAt: string | null };
type Promo = { id: string; text: string; group: PromoGroup; serviceId: string; at: string; status: string; people: number; sent: number; failed: number; stopped: number };

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const HOURS = `between ${PROMO_FROM_HOUR} a.m. and ${PROMO_UNTIL_HOUR - 12} p.m.`;

function SendDialog({ services, shop, onClose, onSent }: { services: BookingService[]; shop: string; onClose: () => void; onSent: () => void }) {
  const [group, setGroup] = useState<PromoGroup>("all");
  const [serviceId, setServiceId] = useState(services[0]?.id || "");
  const [text, setText] = useState("");
  const [aud, setAud] = useState<Audience | null>(null);
  const [checking, setChecking] = useState(false);
  const [sending, setSending] = useState(false);
  const words = cleanPromo(text);
  const body = "text" in words ? promoBody(words.text, shop) : "";

  useEffect(() => {
    let live = true;
    setChecking(true);
    bookingsAdmin<Audience>("promoAudience", { group, serviceId }).then((a) => live && setAud(a), () => live && setAud(null)).finally(() => live && setChecking(false));
    return () => { live = false; };
  }, [group, serviceId]);

  const parts = body ? textParts(body) : 0;
  const tooSoon = aud?.nextAt && Date.parse(aud.nextAt) > Date.now();
  const problem = !aud ? null
    : tooSoon ? `You sent one in the last day. The next can go from ${when(aud.nextAt!)}.`
    : !aud.open ? `Promo texts go out ${HOURS} your time.`
    : !aud.count ? "Nobody in this group said yes to offers by text yet."
    : null;
  const send = async () => {
    setSending(true);
    try {
      const r = await bookingsAdmin<{ sent: number; failed: number; stopped: number }>("promoSend", { group, serviceId, text });
      toast.success(`Sent to ${r.sent} client${r.sent === 1 ? "" : "s"}.${r.failed ? ` ${r.failed} didn't go.` : ""}`);
      onSent();
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "The text couldn't be sent. Try again.");
      setSending(false);
    }
  };
  return (
    <Dialog open onClose={onClose} title="Send a promo text" description="One text to clients who said yes to offers. Your shop's name goes first and how to stop goes last."
      footer={<><GhostButton onClick={onClose}>Cancel</GhostButton><PrimaryButton onClick={send} disabled={!body || !!problem || !aud || sending || checking}>{sending ? "Sending…" : aud?.count ? `Send to ${aud.count}` : "Send"}</PrimaryButton></>}>
      <div className="rp-stack">
        <SelectField label="Who gets it" value={group} onChange={(e) => setGroup(e.target.value as PromoGroup)}>
          {PROMO_GROUPS.filter((g) => g.id !== "service" || services.length).map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
        </SelectField>
        {group === "service" && (
          <SelectField label="Service" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
            {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </SelectField>
        )}
        <TextArea label="Your message" rows={3} maxLength={MAX_PROMO} placeholder="Openings this Friday afternoon. Grab one online any time." value={text} onChange={(e) => setText(e.target.value)}
          hint={`${text.trim().length} of ${MAX_PROMO} letters`} error={text.trim() && "problem" in words ? words.problem : undefined} />
        {body && (
          <div className="bkg-promo-preview" data-promo-preview>
            <p className="bkg-promo-preview-label">What they get</p>
            <p className="bkg-promo-bubble">{body}</p>
          </div>
        )}
        <p className="bkg-cal-text" data-promo-count aria-live="polite">
          {checking || !aud ? "Counting…"
            : problem ? problem
            : `${aud.count} client${aud.count === 1 ? "" : "s"}. Each text costs ${aud.price}${parts > 1 ? `, and this one counts as ${parts}` : ""}, added to your monthly bill at cost.`}
        </p>
      </div>
    </Dialog>
  );
}

export function PromoTextsTile({ on, services, shop, onChange }: { on: boolean; services: BookingService[]; shop: string; onChange: (on: boolean) => void }) {
  const [status, setStatus] = useState<{ available: boolean } | null>(null);
  const [promos, setPromos] = useState<Promo[] | null>(null);
  const [sending, setSending] = useState(false);
  const load = () => bookingsAdmin<{ promos: Promo[] }>("promoHistory").then((r) => setPromos(r.promos), () => setPromos([]));
  useEffect(() => {
    let live = true;
    bookingsAdmin<{ available: boolean }>("textStatus").then((s) => live && setStatus(s), () => live && setStatus({ available: false }));
    return () => { live = false; };
  }, []);
  const open = status?.available === true;
  useEffect(() => { if (open && on) void load(); }, [open, on]);
  const serviceName = (id: string) => services.find((s) => s.id === id)?.name || "one service";
  const groupName = (p: Promo) => (p.group === "service" ? `Clients who booked ${serviceName(p.serviceId)}` : PROMO_GROUPS.find((g) => g.id === p.group)?.label || "");
  return (
    <section className="bkg-tile" data-promo-tile>
      <h2 className="bkg-tile-title">Promo texts <StatusBadge tone="info" glyph={false}>Beta</StatusBadge></h2>
      {status && !open && <p className="bkg-texts-soon"><StatusBadge tone="info" glyph={false}>Opening soon</StatusBadge></p>}
      <div className="bkg-form">
        <Toggle label={'Offer "Text me offers" on the booking form'} checked={open && on} disabled={!open} onChange={onChange} />
        <p className="bkg-cal-text">
          {!status ? "Checking…"
            : !open ? "Soon you'll be able to text clients who say yes, for openings and offers."
            : on ? `Only clients who tick it get promo texts. They go out ${HOURS}, at most one a day, and every one says how to stop.`
            : "Clients aren't asked, and no promo texts go out."}
        </p>
        {open && on && <div><SecondaryButton onClick={() => setSending(true)}><Send size={16} aria-hidden /> Send a promo text</SecondaryButton></div>}
        {open && on && promos && promos.length > 0 && (
          <ul className="bkg-promo-list" data-promo-history>
            {promos.map((p) => (
              <li key={p.id} className="bkg-promo-row">
                <span className="bkg-promo-text">{p.text}<small>{when(p.at)} · {groupName(p)}</small></span>
                <span className="bkg-promo-sent">{p.status === "sending" ? "Sending…" : `${p.sent} sent`}{p.stopped ? <small>{p.stopped} said stop</small> : null}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {sending && <SendDialog services={services} shop={shop} onClose={() => setSending(false)} onSent={() => { setSending(false); void load(); }} />}
    </section>
  );
}
