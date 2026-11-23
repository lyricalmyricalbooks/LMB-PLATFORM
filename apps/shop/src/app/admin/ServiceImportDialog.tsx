// Bookings › Services › Bring your services from a spreadsheet (plan 4, step 2.11, Beta). The owner picks a sheet (their
// own list, or another booking tool's export), sees what will come in and what is left out, and adds them in one go.
// The server checks every service again and skips names the shop already has, so bringing the same sheet twice adds
// nothing. New services start hidden unless the owner says to show them now.
import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { bookingsAdmin } from "./bookingsApi";
import { Checkbox, DataTable, Dialog, GhostButton, PrimaryButton, SecondaryButton, StatusBadge, type Column } from "./riso/components";
import { SPREADSHEET_ACCEPT, readProblem, readSpreadsheet, type SpreadsheetRead } from "./spreadsheetFile";
import { GoogleSheetLink } from "./GoogleSheetLink";
import { SheetChoice } from "./SheetChoice";
import { SHOP_CURRENCY } from "./moneySign";
import { moneyText } from "./bookingsView";
import { saveFile } from "./xlsxWriter";
import { planImport, SAMPLE_SHEET, type ImportedService, type ImportPlan } from "./serviceImport";

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en")} ${n === 1 ? one : many}`;
const MISSING_WORDS: Record<string, string> = { minutes: "length", price: "price" };

const COLUMNS: Column<ImportedService>[] = [
  { key: "name", header: "Service", lead: true, render: (s) => <>{s.name}{s.places > 1 && <span className="bkg-import-sub">Class of {s.places}</span>}</> },
  { key: "length", header: "Length", render: (s) => `${s.minutes} min` },
  { key: "price", header: "Price", numeric: true, render: (s) => (s.priceMinor ? moneyText(s.priceMinor, SHOP_CURRENCY) : "Free") },
  { key: "group", header: "Group", render: (s) => s.group || "None" },
];

type Result = { added: { id: string; name: string }[]; skipped: { name: string; why: string }[] };

export function ServiceImportDialog({ existing, onClose, onDone }: { existing: string[]; onClose: () => void; onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [book, setBook] = useState<({ file: File } & SpreadsheetRead) | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [error, setError] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const choose = async (picked: File | undefined, sheet?: string) => {
    if (!picked) return;
    setError(""); setName(picked.name); if (!sheet) setBook(null);
    if (picked.size > 2 * 1024 * 1024) { setPlan(null); setError("That file is larger than 2 MB. A list of services is usually much smaller: check it is the right file."); return; }
    try { const read = await readSpreadsheet(picked, sheet); setBook({ file: picked, ...read }); setPlan(planImport(read.text, existing)); }
    catch (err) { setPlan(null); setError(readProblem(err)); }
  };

  const bring = async () => {
    if (!plan?.services.length || busy) return;
    setBusy(true); setError("");
    try {
      const answer = await bookingsAdmin<Result>("importServices", { services: plan.services, show });
      setResult(answer);
      if (answer.added.length) onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The services couldn't be added just now. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    const skipped = [...(plan?.skipped || []).map((s) => `${s.name || `Line ${s.line}`}: ${s.why}`), ...result.skipped.map((s) => `${s.name}: ${s.why}`)];
    return (
      <Dialog open onClose={onClose} title="Services brought in" footer={<PrimaryButton onClick={onClose}>Done</PrimaryButton>}>
        <div className="rp-stack" style={{ gap: 12 }} role="status">
          <StatusBadge tone={result.added.length ? "success" : "neutral"}>{plural(result.added.length, "service")} added</StatusBadge>
          {result.added.length > 0 && <p className="rp-hint" style={{ margin: 0 }}>{show
            ? "Clients can book them now. Open any of them to add a photo, questions or card payment."
            : "They're hidden until you're ready. Open each one to check it, then switch on Show on the booking page."}</p>}
          {skipped.length > 0 && (
            <details>
              <summary className="rp-hint">{plural(skipped.length, "line")} left out</summary>
              <ul className="rp-hint" style={{ margin: "6px 0 0", paddingLeft: 18, maxHeight: 200, overflow: "auto" }}>
                {skipped.slice(0, 200).map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </details>
          )}
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog open onClose={() => { if (!busy) onClose(); }} title="Bring your services from a spreadsheet" size="lg"
      description="Choose a sheet with one service on each line: your own list, or the services file from the booking tool you used before."
      footer={<>
        <SecondaryButton disabled={busy} onClick={onClose}>Cancel</SecondaryButton>
        <PrimaryButton disabled={busy || !plan?.services.length} onClick={() => void bring()}>
          {busy ? "Adding them…" : plan?.services.length ? `Add ${plural(plan.services.length, "service")}` : "Nothing to add"}
        </PrimaryButton>
      </>}>
      <div className="rp-stack" style={{ gap: 14 }}>
        <input ref={fileRef} type="file" accept={SPREADSHEET_ACCEPT} hidden aria-label="Services file"
          onChange={(e) => { void choose(e.target.files?.[0]); e.target.value = ""; }} />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <SecondaryButton icon={<Upload size={16} aria-hidden />} disabled={busy} onClick={() => fileRef.current?.click()}>{name ? "Choose another file" : "Choose the file"}</SecondaryButton>
          <GoogleSheetLink disabled={busy} onFile={(f) => void choose(f)} />
          {name && <span className="rp-mono" style={{ overflowWrap: "anywhere" }}>{name}</span>}
          {book && <SheetChoice sheets={book.sheets} sheet={book.sheet} disabled={busy} onChange={(s) => void choose(book.file, s)} />}
        </div>
        {!plan && !error && (
          <p className="rp-hint" style={{ margin: 0 }}>
            Columns we read: Name, Length, Price, Group, Description and Places. Only Name is needed.
          </p>
        )}
        {!plan && !error && (
          <div>
            <GhostButton size="sm" icon={<Download size={16} aria-hidden />} onClick={() => saveFile("services-sample.csv", SAMPLE_SHEET, "text/csv;charset=utf-8")}>Get a sample sheet</GhostButton>
          </div>
        )}
        {error && <p role="alert" className="rp-error-text" style={{ margin: 0 }}>{error}</p>}
        {plan && (plan.missing.includes("name") ? (
          <p role="alert" className="rp-error-text" style={{ margin: 0 }}>We couldn't find a Name column. Put the service names under a heading called Name, then choose the file again.</p>
        ) : (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }} aria-live="polite">
              <StatusBadge tone="info">{plural(plan.services.length, "service")} to add</StatusBadge>
              {plan.skipped.length > 0 && <StatusBadge tone="neutral">{plural(plan.skipped.length, "line")} left out</StatusBadge>}
            </div>
            {plan.services.length > 0 && (
              <div className="bkg-import-list">
                <DataTable caption="Services to add" columns={COLUMNS} rows={plan.services} rowKey={(s) => s.name} />
              </div>
            )}
            {plan.missing.length > 0 && <p className="rp-hint" style={{ margin: 0 }}>
              The sheet has no {plan.missing.map((m) => MISSING_WORDS[m]).join(" or ")} column, so {plan.missing.includes("minutes") ? "each service takes an hour" : ""}{plan.missing.length === 2 ? " and " : ""}{plan.missing.includes("price") ? "each service is free" : ""}. You can change any of them after.
            </p>}
            {plan.skipped.length > 0 && (
              <details>
                <summary className="rp-hint">Why some lines were left out</summary>
                <ul className="rp-hint" style={{ margin: "6px 0 0", paddingLeft: 18, maxHeight: 200, overflow: "auto" }}>
                  {plan.skipped.slice(0, 200).map((s) => <li key={s.line}>Line {s.line}{s.name ? ` (${s.name})` : ""}: {s.why}</li>)}
                </ul>
              </details>
            )}
            {plan.services.length > 0 && (
              <>
                <Checkbox label="Show them on the booking page now" checked={show} disabled={busy} onChange={(e) => setShow(e.target.checked)} />
                <p className="rp-hint" style={{ margin: 0 }}>Priced services are paid at the visit. You can switch any of them to card payment, a deposit or a card on file after.</p>
              </>
            )}
          </>
        ))}
      </div>
    </Dialog>
  );
}
