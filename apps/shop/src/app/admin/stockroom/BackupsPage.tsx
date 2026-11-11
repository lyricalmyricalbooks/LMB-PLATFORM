// Stockroom › Backups, as the mockup shows it: "Back up now" by the title and one "Backups" list. It is the one place
// for backups, downloads and exports in the combined admin (Settings › General points here): the nightly copy of the
// whole shop, the stockroom's own daily copies (StockroomCopies.tsx), Download all your data (one zip), a second copy in a folder on this computer, and the spreadsheets.
// Each row opens a drawer with its details; the parts are the same ones Settings › General shows on a shop-only admin.
import { useState } from "react";

import { ExportDownloads, NightlyBackupDays, NightlyBackupStatus, useNightlyBackup, type ExportRun } from "../BackupsExportCard";
import { useShopDownload } from "../DownloadShopCard";
import { LocalBackupCard } from "../LocalBackupCard";
import { readMeta, supported } from "../localBackup";
import { Drawer, PageActions, PrimaryButton, SecondaryButton, StatusBadge } from "../riso/components";
import { folderRow, nightlyRow } from "./backups";
import { StockroomCopiesList, copiesLine, useStockroomCopies } from "./StockroomCopies.tsx";
import { isTestBook, stockroomApi } from "./stockroomData";
import { stockLocationsCsv } from "@stockroom/stock-locations.js";
import "./stockroom.css";

type Open = "" | "nightly" | "copies" | "folder" | "sheets";

/** The stock counts for another shop system, from the stockroom's own records (real books only). */
export async function stockCountsFile(load = stockroomApi.load): Promise<[string, string, string] | null> {
  const { books, states } = await load();
  const entries = books.filter((b) => !isTestBook(b) && states[b.id]).map((b) => ({ book: b, state: states[b.id] }));
  if (!entries.length) return null;
  return [`stock-counts-${new Date().toISOString().slice(0, 10)}.csv`, stockLocationsCsv(entries), "text/csv;charset=utf-8"];
}

export function BackupsPage() {
  const nightly = useNightlyBackup();
  const shop = useShopDownload();
  const copies = useStockroomCopies();
  const [open, setOpen] = useState<Open>("");
  const [, setSeen] = useState(0);
  const close = () => { setOpen(""); setSeen((n) => n + 1); };
  const row = nightlyRow(nightly.record);
  const folder = folderRow(readMeta(), supported());
  const view = nightly.view;
  const stockCounts = (run: ExportRun, busy: string) => (
    <SecondaryButton size="sm" disabled={!!busy} onClick={() => run("stock-counts", () => stockCountsFile())}>{busy === "stock-counts" ? "Preparing…" : "Stock counts for another shop system (CSV)"}</SecondaryButton>
  );

  return (
    <div className="rp-sr">
      <PageActions>
        <PrimaryButton busy={nightly.busy === "backup"} disabled={!!nightly.busy || view?.running} onClick={() => void nightly.runBackup()}>{nightly.busy === "backup" ? "Backing up…" : "Back up now"}</PrimaryButton>
      </PageActions>

      <section className="rp-cardbox" aria-labelledby="sr-backups">
        <h2 id="sr-backups" className="rp-cardbox-title">Backups</h2>
        <ul className="rp-listcard">
          <li>
            <button type="button" className="rp-listcard-main" onClick={() => setOpen("nightly")} aria-label="Show the nightly backups">
              <span className="rp-listcard-name">{row.name}</span>
              <span className="rp-listcard-sub">{row.sub}</span>
            </button>
            {nightly.loadFailed ? <StatusBadge tone="warning">Unknown</StatusBadge>
              : view ? <StatusBadge tone={view.tone}>{view.running ? "Backing up…" : view.label}</StatusBadge>
              : <span className="rp-hint">Checking…</span>}
          </li>
          <li>
            <button type="button" className="rp-listcard-main" onClick={() => setOpen("copies")} aria-label="Show the stockroom copies">
              <span className="rp-listcard-name">Stockroom copies</span>
              <span className="rp-listcard-sub">{copiesLine(copies.list, copies.failed)}</span>
            </button>
            <SecondaryButton size="sm" onClick={() => setOpen("copies")}>Open</SecondaryButton>
          </li>
          <li>
            <div className="rp-listcard-main">
              <span className="rp-listcard-name">Download all your data</span>
              <span className="rp-listcard-sub">{shop.summary ? `Saved: ${shop.summary}` : "Spreadsheet files and one zip"}</span>
            </div>
            <SecondaryButton size="sm" busy={shop.busy} onClick={() => void shop.run()}>{shop.busy ? shop.label : "Download"}</SecondaryButton>
          </li>
          <li>
            <button type="button" className="rp-listcard-main" onClick={() => setOpen("folder")} aria-label="Set up the folder on this computer">
              <span className="rp-listcard-name">Back up to a folder</span>
              <span className="rp-listcard-sub">{folder.sub}</span>
            </button>
            <StatusBadge tone={folder.tone}>{folder.label}</StatusBadge>
          </li>
          <li>
            <button type="button" className="rp-listcard-main" onClick={() => setOpen("sheets")} aria-label="Show the spreadsheet downloads">
              <span className="rp-listcard-name">Spreadsheets</span>
              <span className="rp-listcard-sub">Catalog, customers, orders, bookkeeping</span>
            </button>
            <SecondaryButton size="sm" onClick={() => setOpen("sheets")}>Choose</SecondaryButton>
          </li>
        </ul>
      </section>

      <Drawer open={open === "nightly"} onClose={close} title="Nightly backups" description="Every night. Kept 30 days.">
        <NightlyBackupStatus nightly={nightly} />
        <NightlyBackupDays nightly={nightly} />
      </Drawer>
      <Drawer open={open === "copies"} onClose={close} title="Stockroom copies" description="Bring back one item, or everything.">
        <StockroomCopiesList copies={copies} />
      </Drawer>
      <Drawer open={open === "folder"} onClose={close} title="Back up to a folder" description="A second copy on this computer.">
        <LocalBackupCard bare />
      </Drawer>
      <Drawer open={open === "sheets"} onClose={close} title="Spreadsheets" description="Made in this browser. Nothing is sent anywhere.">
        <ExportDownloads extra={stockCounts} />
      </Drawer>
    </div>
  );
}
