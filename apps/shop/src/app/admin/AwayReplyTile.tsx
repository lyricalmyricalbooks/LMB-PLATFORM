// Bookings › Hours & rules › Away reply (plan 4, 3.7, Beta): while the shop is closed, a message from the website's
// contact form is answered with these words and the time the shop opens again (functions/awayReply.js).
import { StatusBadge, TextArea, Toggle } from "./riso/components";
import { awayNow, MAX_AWAY_WORDS, type BookingSettings } from "../../shared/bookingTimes";

const STANDARD = "Thanks for your message. We're closed right now, and we'll answer as soon as we're back.";

/** "Tuesday at 10:00 a.m." on the shop's clock. */
function openText(ms: number, zone: string): string {
  const d = new Date(ms);
  return `${d.toLocaleDateString("en-CA", { timeZone: zone, weekday: "long", month: "long", day: "numeric" })} at ${d.toLocaleTimeString("en-CA", { timeZone: zone, hour: "numeric", minute: "2-digit" })}`;
}

export function AwayReplyTile({ form, zone, onChange }: {
  form: BookingSettings;
  zone: string;
  onChange: (patch: Pick<BookingSettings, "awayReply" | "awayWords">) => void;
}) {
  const on = form.awayReply === true;
  const away = awayNow(form, Date.now(), zone);
  const now = !away ? "You're open right now, so messages get the usual \"Message received\" email."
    : away.backAt ? `You're closed right now. A message sent now gets your away words and "We're back ${openText(away.backAt, zone)}."`
    : "You're closed right now, with no opening hours in the next three weeks. A message sent now gets your away words.";
  return (
    <section className="bkg-tile" data-away-tile>
      <h2 className="bkg-tile-title">Away reply <StatusBadge tone="info" glyph={false}>Beta</StatusBadge></h2>
      <div className="bkg-form">
        <Toggle label="Answer website messages while you're closed" checked={on} onChange={(awayReply) => onChange({ awayReply, awayWords: form.awayWords })} />
        <p className="bkg-cal-text">
          {on ? "Outside your opening hours, on days off and on holiday hours, people who write through your contact form hear back at once, with the time you open again."
            : "People who write while you're closed get the usual \"Message received\" email."}
        </p>
        {on && (
          <>
            <TextArea label="Your away words" rows={3} maxLength={MAX_AWAY_WORDS} value={form.awayWords || ""} placeholder={STANDARD}
              onChange={(e) => onChange({ awayReply: true, awayWords: e.target.value })}
              hint="A blank box keeps the standard words. The time you open again is added below them." />
            <p className="bkg-cal-text" data-away-now>{now}</p>
          </>
        )}
      </div>
    </section>
  );
}
