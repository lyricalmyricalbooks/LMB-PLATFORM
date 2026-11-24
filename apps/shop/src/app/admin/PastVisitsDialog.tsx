// Bookings › List › Past › Spreadsheet (plan 4, 3.8, Beta): pick the days, see the counts, take the spreadsheet.
import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Dialog, PrimaryButton, SecondaryButton, StatusBadge, TextField, Toggle } from "./riso/components";
import { addDays, dayOf, zonedTime } from "../../shared/bookingTimes";
import { readBookingsBetween, type Booking } from "./bookingsApi";
import { MAX_PAST_DAYS, pastRange, pastVisitCounts, pastVisitRows, pastVisits } from "./pastVisits";
import { toCsv } from "./spreadsheetFile";
import { saveFile } from "./xlsxWriter";

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

export function PastVisitsDialog({ zone, onClose }: { zone: string; onClose: () => void }) {
  const today = dayOf(Date.now(), zone);
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01` === today ? `${addDays(today, -1).slice(0, 7)}-01` : `${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(today);
  const [cancelled, setCancelled] = useState(true);
  const [onlyNoShows, setOnlyNoShows] = useState(false);
  const [rows, setRows] = useState<Booking[] | null>(null);
  const [error, setError] = useState("");
  const problem = !from || !to ? "Pick both days." : to < from ? "The last day comes before the first." : daysBetween(from, to) >= MAX_PAST_DAYS ? "Pick a year or less." : to > today ? "Pick days up to today." : "";
  useEffect(() => {
    if (problem) return;
    let live = true;
    setRows(null); setError("");
    const { fromIso, toIso } = pastRange(from, to, (d) => zonedTime(d, "00:00", zone));
    readBookingsBetween(fromIso, toIso).then((r) => { if (live) setRows(r); }, (e) => { if (live) setError(e?.message || "Couldn't read the bookings."); });
    return () => { live = false; };
  }, [from, to, problem, zone]);
  const list = useMemo(() => pastVisits(rows || [], { zone, nowMs: Date.now(), cancelled, onlyNoShows }), [rows, zone, cancelled, onlyNoShows]);
  const counts = pastVisitCounts(list);
  const save = () => saveFile(`past-visits-${from}-to-${to}.csv`, `﻿${toCsv(pastVisitRows(list, zone))}`, "text/csv;charset=utf-8");
  return (
    <Dialog open onClose={onClose} title="Past visits spreadsheet"
      description="Every visit in the days you pick, with who came, who didn't turn up and what was paid. It opens in Excel, Numbers or Google Sheets."
      footer={<>
        <SecondaryButton onClick={onClose}>Close</SecondaryButton>
        <PrimaryButton icon={<Download size={16} aria-hidden />} disabled={!!problem || rows === null || !list.length} onClick={save}>Download spreadsheet</PrimaryButton>
      </>}>
      <div className="bkg-form" data-past-visits>
        <p className="bkg-cal-text"><StatusBadge tone="info" glyph={false}>Beta</StatusBadge> Use it to follow up the people who didn't turn up, or hand the figures to your bookkeeper.</p>
        <div className="bkg-past-days">
          <TextField label="From" type="date" value={from} max={today} onChange={(e) => setFrom(e.target.value)} />
          <TextField label="To" type="date" value={to} max={today} onChange={(e) => setTo(e.target.value)} error={problem || undefined} />
        </div>
        <Toggle label="Include cancelled bookings" checked={cancelled && !onlyNoShows} disabled={onlyNoShows} onChange={setCancelled} />
        <Toggle label="Only people who didn't turn up" checked={onlyNoShows} onChange={setOnlyNoShows} />
        {error ? <p className="bkg-error" role="alert">{error}</p>
          : problem ? null
          : rows === null ? <div className="bkg-skeleton" aria-hidden />
          : (
            <p className="bkg-past-count" aria-live="polite">
              {!list.length ? "No visits in these days."
                : onlyNoShows ? `${counts.noShows} ${counts.noShows === 1 ? "no-show" : "no-shows"}.`
                : `${counts.visits} ${counts.visits === 1 ? "visit" : "visits"}, ${counts.noShows} ${counts.noShows === 1 ? "no-show" : "no-shows"}${cancelled ? `, ${counts.cancelled} cancelled` : ""}.`}
            </p>
          )}
      </div>
    </Dialog>
  );
}
