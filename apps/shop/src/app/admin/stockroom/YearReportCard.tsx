// Tax centre › Profit for the year: the old Financial Centre's figures (sales, cost of goods sold, expenses, artist
// shares, profit) and its "Download tax report" spreadsheet (yearReport.ts).
import { useState } from "react";
import { downloadCsv } from "@stockroom/download.js";

import { MetricCard, SecondaryButton, SectionCard } from "../riso/components";
import type { TaxSeasonInput } from "./taxSeason";
import { yearFigures, yearReportCsv } from "./yearReport";

export function YearReportCard({ input, year, money }: { input: TaxSeasonInput; year: string; money: (n: number) => string }) {
  const [note, setNote] = useState("");
  const f = yearFigures(input, year);
  function download() {
    const file = yearReportCsv(input, year);
    downloadCsv(file.text, file.name);
    setNote(file.waiting ? `Downloaded. ${file.waiting} ${file.waiting === 1 ? "expense is" : "expenses are"} still waiting for an exchange rate, so the totals are not final.` : "Downloaded.");
  }
  return (
    <SectionCard title={`Profit for ${year}`} description="Sales less the cost of the copies sold, expenses and artist shares."
      actions={<SecondaryButton size="sm" onClick={download}>Download tax report</SecondaryButton>}>
      <div className="rp-grid-metrics">
        <MetricCard label="Sales" value={money(f.revenue)} />
        <MetricCard label="Cost of copies sold" value={money(f.cogs)} />
        <MetricCard label="Expenses" value={money(f.opex)} footer={f.missingReceiptsCount ? `${f.missingReceiptsCount} without a receipt` : undefined} />
        <MetricCard label="Artist shares" value={money(f.shares)} />
        <MetricCard label="Profit" value={money(f.profit)} />
      </div>
      {note && <p className="rp-sr-save" data-tone={f.fxWaitingCount ? "warn" : "ok"} role="status">{note}</p>}
    </SectionCard>
  );
}
