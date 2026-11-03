// A pretend billing export for the costs page (costs.js), shaped like Cloud Billing's standard usage cost export to
// BigQuery. Nothing here reaches Google.

/** One export row: a charge to a project, with its credits (negative amounts), in a currency. */
export const exportRow = ({ projectId, cost, credits = [], at, currency = "CAD" }) => ({
  project: projectId === null ? null : { id: projectId },
  cost,
  credits: credits.map((amount) => ({ amount, name: "Free tier" })),
  usage_start_time: at,
  currency,
});

/** `fetchRows({ month })` over fixed rows; `asked` lists each month read, `fail` makes the next read throw. */
export function fakeBillingExport(rows = []) {
  const fake = {
    asked: [],
    fail: false,
    rows,
    // A plain function (no `this`), so it can be handed on as `fetchRows`.
    fetchRows: async ({ month }) => {
      if (fake.fail) {
        fake.fail = false;
        throw new Error("the billing export didn't answer (pretend error)");
      }
      fake.asked.push(month);
      // Like the real query, only that month's rows come back (by usage start, UTC).
      return structuredClone(rows.filter((row) => String(row.usage_start_time).slice(0, 7) === month));
    },
  };
  return fake;
}
