// Tax centre › Profit for the year: the old Financial Centre's figures (sales, cost of goods sold, expenses, artist
// shares, profit) and its "Download tax report" spreadsheet (yearReport.ts).
import { useState } from "react";
import { downloadCsv } from "@stockroom/download.js";

import { hasPublisherTools } from "../../../shared/shopSells";
import { useShopSells } from "../shopWords";
import { MetricCard, SecondaryButton, SectionCard } from "../riso/components";
import type { TaxSeasonInput } from "./taxSeason";
import { yearFigures, yearReportCsv } from "./yearReport";

export function YearReportCard({ input, year, money }: { input: TaxSeasonInput; year: string; money: (n: number) => string }) {
  const [note, setNote] = useState("");
  const f = yearFigures(input, year);
  // Artist shares are a publisher's; another kind of shop sees them only if its records hold some.
  const shares = hasPublisherTools(useShopSells()) || f.shares !== 0;
  function download() {
    const file = yearReportCsv(input, year);
    downloadCsv(file.text, file.name);
    setNote(file.waiting ? `Downloaded. ${file.waiting} ${file.waiting === 1 ? "expense is" : "expenses are"} still waiting for an exchange rate, so the totals are not final.` : "Downloaded.");
  }
  return (
    <SectionCard title={`Profit for ${year}`} description={shares ? "Sales less the cost of the copies sold, expenses and artist shares." : "Sales less the cost of what sold and expenses."}
      actions={<SecondaryButton size="sm" onClick={download}>Download tax report</SecondaryButton>}>
      <div className="rp-grid-metrics">
        <MetricCard label="Sales" value={money(f.revenue)} />
        <MetricCard label={shares ? "Cost of copies sold" : "Cost of goods sold"} value={money(f.cogs)} />
        <MetricCard label="Expenses" value={money(f.opex)} footer={f.missingReceiptsCount ? `${f.missingReceiptsCount} without a receipt` : undefined} />
        {shares && <MetricCard label="Artist shares" value={money(f.shares)} />}
        <MetricCard label="Profit" value={money(f.profit)} />
      </div>
      {note && <p className="rp-sr-save" data-tone={f.fxWaitingCount ? "warn" : "ok"} role="status">{note}</p>}
    </SectionCard>
  );
}
