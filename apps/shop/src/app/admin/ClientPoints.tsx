// Loyalty points on the client card (plan 4, 5.5, Beta): the balance, how far to the next reward, the newest earnings and
// rewards, and a way to add or take points by hand. Read and written through the server (ops points, pointsAdjust).
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Dialog, GhostButton, PrimaryButton, SecondaryButton, StatusBadge, TextField } from "./riso/components";
import { bookingsAdmin } from "./bookingsApi";
import { moneyText } from "./bookingsView";
import { SHOP_CURRENCY } from "./moneySign";
import { cleanAdjust, MAX_ADJUST_POINTS } from "../../shared/loyalty";
import "./clientCard.css";

type PointsRow = { id: string; kind: "visit" | "order" | "reward" | "adjust"; points: number; at: string; note: string; code: string };
type Points = { on: boolean; points: number; earned: number; rewards: number; toNext: number; rewardPoints: number; rewardMinor: number; rows: PointsRow[]; rewardsSent?: number };

const shortDay = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

function rowText(r: PointsRow, rewardMinor: number): string {
  if (r.kind === "visit") return r.note ? `Visit: ${r.note}` : "Visit";
  if (r.kind === "order") return "Shop order";
  if (r.kind === "reward") return `Reward sent${r.code ? `: ${r.code}` : ""} (${moneyText(rewardMinor, SHOP_CURRENCY)} off)`;
  return r.note ? `Changed by hand: ${r.note}` : "Changed by hand";
}

function AdjustDialog({ email, onClose, onDone }: { email: string; onClose: () => void; onDone: (p: Points) => void }) {
  const [points, setPoints] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const n = cleanAdjust(points);
  const problem = points.trim() && n === null ? `Type a whole number between -${MAX_ADJUST_POINTS} and ${MAX_ADJUST_POINTS}, not zero.` : undefined;
  const save = async () => {
    if (n === null) return;
    setSaving(true);
    try {
      const p = await bookingsAdmin<Points>("pointsAdjust", { email, points: n, note });
      toast.success(p.rewardsSent ? `Points saved. ${p.rewardsSent === 1 ? "A reward was" : `${p.rewardsSent} rewards were`} emailed to them.` : "Points saved");
      onDone(p);
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "The points couldn't be saved. Try again.");
      setSaving(false);
    }
  };
  return (
    <Dialog open onClose={onClose} title="Add or take points" description="Type a number to add, or put a minus sign in front to take points away. If they reach a reward, its code is emailed to them."
      footer={<><GhostButton onClick={onClose}>Cancel</GhostButton><PrimaryButton onClick={save} disabled={n === null || saving}>{saving ? "Saving…" : "Save points"}</PrimaryButton></>}>
      <div className="rp-stack">
        <TextField label="Points" inputMode="numeric" placeholder="25 or -25" value={points} onChange={(e) => setPoints(e.target.value)} error={problem} autoFocus />
        <TextField label="Why (optional)" hint="Only you see this." maxLength={120} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
    </Dialog>
  );
}

export function ClientPoints({ email }: { email: string }) {
  const [data, setData] = useState<Points | null>(null);
  const [failed, setFailed] = useState(false);
  const [adjusting, setAdjusting] = useState(false);

  useEffect(() => {
    let alive = true;
    setData(null);
    setFailed(false);
    if (!email) return;
    bookingsAdmin<Points>("points", { email }).then((p) => { if (alive) setData(p); }, () => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [email]);

  // Points off and none ever earned: nothing to show.
  if (failed || !data || (!data.on && !data.earned)) return null;
  const share = data.rewardPoints ? Math.min(100, Math.round((data.points / data.rewardPoints) * 100)) : 0;
  return (
    <section className="cv cp" aria-labelledby="cp-title" data-client-points>
      <div className="cv-head">
        <h3 id="cp-title" className="cv-title">Loyalty points <StatusBadge tone="info" glyph={false}>Beta</StatusBadge></h3>
        {data.on && <SecondaryButton onClick={() => setAdjusting(true)}>Add or take points</SecondaryButton>}
      </div>
      <div className="cp-balance">
        <p className="cp-number"><strong>{data.points}</strong> point{data.points === 1 ? "" : "s"}</p>
        <div className="cp-meter" role="img" aria-label={`${data.points} of ${data.rewardPoints} points to the next reward`}><span style={{ width: `${share}%` }} /></div>
        <p className="cp-foot">
          {data.on ? `${data.toNext} more to the next ${moneyText(data.rewardMinor, SHOP_CURRENCY)} reward.` : "Points are switched off, so they aren't earning."}
          {data.rewards ? ` ${data.rewards} reward${data.rewards === 1 ? "" : "s"} sent so far.` : ""}
        </p>
      </div>
      {data.rows.length > 0 ? (
        <ul className="cp-rows">
          {data.rows.map((r) => (
            <li key={r.id} className="cp-row">
              <span className="cp-row-what">{rowText(r, data.rewardMinor)}<small>{shortDay(r.at)}</small></span>
              <span className="cp-row-points" data-minus={r.points < 0 || undefined}>{r.points > 0 ? `+${r.points}` : r.points}</span>
            </li>
          ))}
        </ul>
      ) : !data.points && !data.earned ? <p className="rp-hint" style={{ margin: 0 }}>No points yet. They start the day after their next visit.</p> : null}
      {adjusting && <AdjustDialog email={email} onClose={() => setAdjusting(false)} onDone={(p) => { setData(p); setAdjusting(false); }} />}
    </section>
  );
}
