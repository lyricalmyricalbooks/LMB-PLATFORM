// The money year (Tax centre + Bookkeeping mockups, 12 November 2026): one year for both pages, picked in the header
// with ‹ 2023 2024 2025 2026 ›. Kept for this tab (sessionStorage), so moving between the two pages keeps it.
import { useSyncExternalStore } from "react";

const KEY = "lm:money-year";
const listeners = new Set<() => void>();
let picked: string | null = (() => { try { return sessionStorage.getItem(KEY); } catch { return null; } })();

/** The years the switcher offers: the earliest year with a record (or last year) to this one, oldest first. Pure. */
export function moneyYears(dates: Array<string | null | undefined>, now: Date = new Date()): string[] {
  const thisYear = now.getFullYear();
  let first = thisYear - 1;
  for (const d of dates) {
    const y = Number(String(d || "").slice(0, 4));
    if (y >= 2000 && y < first) first = y;
  }
  return Array.from({ length: thisYear - first + 1 }, (_, i) => String(first + i));
}

/** The year both money pages show, and a way to change it. Falls back to this year when the pick isn't offered. */
export function useMoneyYear(years: string[]): [string, (y: string) => void] {
  const value = useSyncExternalStore((on) => { listeners.add(on); return () => { listeners.delete(on); }; }, () => picked);
  const year = value && years.includes(value) ? value : years[years.length - 1];
  const set = (y: string) => {
    picked = y;
    try { sessionStorage.setItem(KEY, y); } catch { /* storage blocked */ }
    listeners.forEach((l) => l());
  };
  return [year, set];
}

const SHOWN = 4;

/** ‹ 2023 2024 2025 2026 ›: the newest four years around the pick; the arrows step one year (and clamp). */
export function YearSwitch({ years, year, onYear }: { years: string[]; year: string; onYear: (y: string) => void }) {
  const at = Math.max(0, years.indexOf(year));
  const end = Math.min(years.length, Math.max(at + 1, SHOWN));
  const shown = years.slice(Math.max(0, end - SHOWN), end);
  return (
    <div className="rp-yearswitch" role="group" aria-label="Year">
      <button type="button" className="rp-yearswitch-arrow" aria-label="Year before" disabled={at === 0} onClick={() => onYear(years[at - 1])}>‹</button>
      {shown.map((y) => (
        <button key={y} type="button" className="rp-yearswitch-year" aria-pressed={y === year} onClick={() => onYear(y)}>{y}</button>
      ))}
      <button type="button" className="rp-yearswitch-arrow" aria-label="Year after" disabled={at === years.length - 1} onClick={() => onYear(years[at + 1])}>›</button>
    </div>
  );
}
