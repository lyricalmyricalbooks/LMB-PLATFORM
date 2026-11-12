// The exchange rate for a press billed in another currency than the platform's own (12 November 2026). Google bills
// Colophon in Canadian dollars; a press billed in US dollars pays the same running cost converted, with no markup, at
// the Bank of Canada's daily US-dollar rate for the last business day of the month (its free public Valet service,
// no key). Kept on the press's billing record and on the bill's line with the Canadian amount, so either can be checked.
//
//   createExchange({ fetch }).rate({ from: "CAD", to: "USD", month: "2026-10" }) -> 0.721500 | null
//
// null when the bank has no rate for the month yet (the 1st, a holiday) or can't be reached: billing waits a day.
const VALET = "https://www.bankofcanada.ca/valet/observations";

/** The Bank of Canada series for a currency against the Canadian dollar: Canadian dollars for one unit of it. */
const SERIES = Object.freeze({ USD: "FXUSDCAD" });

const lastDay = (month) => {
  const [year, m] = month.split("-").map(Number);
  return new Date(Date.UTC(year, m, 0)).toISOString().slice(0, 10);
};

/** The rate from `from` to `to`, out of the bank's observations for one series (Canadian dollars per unit). */
export function rateFromObservations(observations, series, { from, to }) {
  const last = (observations ?? []).filter((o) => Number(o?.[series]?.v) > 0).sort((a, b) => (a.d < b.d ? -1 : 1)).at(-1);
  if (!last) return null;
  const cadPerUnit = Number(last[series].v);
  const rate = from === "CAD" ? 1 / cadPerUnit : cadPerUnit;
  return { rate: Math.round(rate * 1e6) / 1e6, day: last.d };
}

export function createExchange({ fetch = globalThis.fetch } = {}) {
  const kept = new Map();
  return {
    async rate({ from, to, month }) {
      from = String(from).toUpperCase();
      to = String(to).toUpperCase();
      if (from === to) return 1;
      if (!/^\d{4}-\d{2}$/.test(month ?? "")) throw new Error("month must look like 2026-10");
      const other = from === "CAD" ? to : to === "CAD" ? from : null;
      const series = other && SERIES[other];
      if (!series) throw new Error(`No exchange rate between ${from} and ${to}`);
      const key = `${from}-${to}-${month}`;
      if (kept.has(key)) return kept.get(key);
      const url = `${VALET}/${series}/json?start_date=${month}-01&end_date=${lastDay(month)}`;
      const response = await fetch(url, { headers: { accept: "application/json" } });
      if (!response.ok) return null;
      const found = rateFromObservations((await response.json())?.observations, series, { from, to });
      // Only a month that has ended keeps its rate: this month's changes from day to day.
      if (found && found.day === lastBusinessDayReached(month, found.day)) kept.set(key, found.rate);
      return found?.rate ?? null;
    },
  };
}

/** The day itself once the month is over (any later observation would be next month's), else null. */
function lastBusinessDayReached(month, day) {
  return Date.now() > Date.parse(`${lastDay(month)}T23:59:59Z`) ? day : null;
}
