// Stockroom › Sheets, drawn by the admin itself as the mockup shows it: one "Google Sheet" card with the sheet and the
// "Copy sales to sheet" switch, and Send now by the title. The sheet lives in the press's own Drive through the shop's
// one Google sign-in (Settings › Google with Drive on): Stock is read by the server, Sales and Expenses come from the
// stockroom's records (sheets.ts). With the switch on, opening the page sends the sheet again once it is six hours old.
import { useEffect, useRef, useState } from "react";

import { googleConnectApi, useGoogleConnect, type GoogleStatus } from "../googleConnect";
import { EmptyState, ErrorState, LoadingState, PageActions, PrimaryButton, SecondaryButton, SectionCard, Toggle } from "../riso/components";
import { friendlyError } from "../settingsLayout";
import { RecordsGate } from "./RecordsGate";
import { SaveNoteLine, type SaveNote } from "./SaleWriter";
import { sheetCounts, sheetDue, sheetState, sheetTabs } from "./sheets";
import { sheetsStore } from "./sheetsStore";
import type { StockroomRecords } from "./stockroomData";
import { sentWords } from "@stockroom/google-sheet.js";
import "./stockroom.css";
import "./sales.css";

const GOOGLE_SETTINGS = "#settings/google";

export function SheetsCard({ records, status, send = googleConnectApi.sendStockSheet, loadCopy = sheetsStore.load, saveCopy = sheetsStore.save, now = Date.now }: {
  records: StockroomRecords; status: GoogleStatus;
  send?: typeof googleConnectApi.sendStockSheet; loadCopy?: () => Promise<boolean>; saveCopy?: (copy: boolean) => Promise<void>; now?: () => number;
}) {
  const [sheet, setSheet] = useState(status.sheet ?? null);
  const [copy, setCopy] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<SaveNote | null>(null);
  const tried = useRef(false);
  const state = sheetState(status);

  const sendNow = async (quiet = false) => {
    setBusy(true);
    if (!quiet) setNote({ tone: "busy", text: "Sending to your sheet…" });
    try {
      const next = await send(sheetTabs(records));
      if (!next.available) setNote({ tone: "warn", text: "Google didn't allow your Drive. Switch on Your Google Drive in Settings › Google." });
      else if (next.gone) setNote({ tone: "warn", text: "Your sheet was deleted in Google Drive. Send again to make a new one.", retry: () => void sendNow() });
      else {
        setSheet({ url: next.url, writtenAt: next.writtenAt, rows: next.rows, sales: next.sales ?? null, expenses: next.expenses ?? null });
        setNote(quiet ? null : { tone: "ok", text: "Your Google Sheet is up to date." });
      }
    } catch (err) {
      setNote({ tone: "error", text: friendlyError(err, "send your sheet"), retry: () => void sendNow() });
    } finally { setBusy(false); }
  };

  useEffect(() => {
    let alive = true;
    loadCopy().then((on) => { if (alive) setCopy(on); }, () => { if (alive) setCopy(true); });
    return () => { alive = false; };
  }, []);
  // The stockroom's old habit: with the switch on, a sheet over six hours old is sent again when the page opens.
  useEffect(() => {
    if (copy === null || tried.current) return;
    tried.current = true;
    if (sheetDue({ ...status, sheet }, copy, now())) void sendNow(true);
  }, [copy]);

  const flip = async (on: boolean) => {
    const was = copy;
    setCopy(on);
    try { await saveCopy(on); } catch (err) {
      setCopy(was);
      setNote({ tone: "error", text: friendlyError(err, "save that switch") });
    }
  };

  if (state !== "ready") {
    return (
      <EmptyState icon="📄" title={state === "off" ? "Connect Google to get your sheet" : "Switch on Google Drive"}
        description={state === "off"
          ? "Connect Google once and your stock, sales and costs go into a sheet in your own Drive."
          : "Your shop is linked to Google. Switch on Your Google Drive in Settings › Google to get your sheet."}
        action={<SecondaryButton onClick={() => { window.location.hash = GOOGLE_SETTINGS; }}>Open Google settings</SecondaryButton>} />
    );
  }
  const sent = sentWords(sheet?.writtenAt, now());
  return (
    <div className="rp-sr">
      <PageActions>
        {sheet?.url ? <a className="rp-btn rp-btn-secondary" href={sheet.url} target="_blank" rel="noreferrer noopener">Open sheet</a> : null}
        <PrimaryButton onClick={() => void sendNow()} busy={busy}>{busy ? "Sending…" : sheet?.url ? "Send now" : "Make my sheet"}</PrimaryButton>
      </PageActions>
      <SaveNoteLine note={note} />
      <SectionCard title="Google Sheet" description="Sales are copied to your sheet." collapsible={false} bodyClassName="rp-formrows">
        <div className="rp-field">
          <span className="rp-label">Sheet</span>
          <span className="rp-field-control">
            {sheet?.url ? <a href={sheet.url} target="_blank" rel="noreferrer noopener">Open in Google Sheets</a> : <span className="rp-hint">Not made yet</span>}
          </span>
          <p className="rp-hint">{sheet?.url ? [sent, sheetCounts(sheet)].filter(Boolean).join(" · ") : "Made in your own Drive the first time you send."}</p>
        </div>
        <div className="rp-field">
          <span className="rp-label">Copy sales to sheet</span>
          <span className="rp-field-control">
            <Toggle label={copy === false ? "Off" : "On"} checked={copy !== false} disabled={copy === null} onChange={(on) => void flip(on)} />
          </span>
          <p className="rp-hint">Sent again by itself when you open this page, at most every six hours.</p>
        </div>
      </SectionCard>
      <p className="rp-hint rp-sheet-foot">One way only: typing in the sheet never changes your stock.</p>
    </div>
  );
}

export function SheetsPage() {
  const google = useGoogleConnect();
  if (google.mode === "loading") return <LoadingState label="Checking your Google link…" />;
  if (google.mode === "error") return <ErrorState title="Your Google link didn't load" description={google.error ?? "Check your connection, then try again."} onRetry={google.reload} />;
  const status: GoogleStatus = google.status ?? { enabled: false };
  return <RecordsGate what="your sheet">{(records) => <SheetsCard records={records} status={status} />}</RecordsGate>;
}
