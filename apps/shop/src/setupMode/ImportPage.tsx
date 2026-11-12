// Books in setup mode (code plan 18.7): bring a product file over before the shop exists. The file is read and
// previewed here in the browser with the shop's own importer (shopMove.ts `planShopMove`, with no books yet, so every
// row is new), then kept on the platform for the shop maker (18.9) to bring in when the shop opens. Nothing is written
// to a shop: there isn't one yet.
import { useMemo, useRef, useState, type ReactNode } from "react";
import { FileUp, Trash2 } from "lucide-react";
import { EmptyState, GhostButton, PrimaryButton, SecondaryButton, SectionCard, SelectField, StatusBadge } from "../app/admin/riso/components";
import { OldShopAddressForm } from "../app/admin/OldShopAddressForm";
import { BRING_ANSWERS, bringAnswerOf, bringHelp, type BringAnswer } from "../app/admin/bringShop";
import { ImportPreviewRows, MAX_FILE_BYTES } from "../app/admin/importPreview";
import { planShopMove, SHAPE_WORDS, type MovePlan } from "../app/admin/shopMove";
import { fileWithoutPhotos, photoCheckLine, useBrokenPhotos, withoutBrokenPhotos } from "../app/admin/photoLinks";
import { sellsBooks } from "../app/admin/sells";
import { useShopWords } from "../app/admin/shopWords";
import type { SetupDoor, SetupPress } from "./door";
import { foundCounts, type FoundCounts } from "./foundCounts";
import "../app/admin/overview/setupBoard.css";
import { SPREADSHEET_ACCEPT, readProblem, readSpreadsheet, type SpreadsheetRead } from "../app/admin/spreadsheetFile";
import { FirstRows, SheetChoice } from "../app/admin/SheetChoice";

const TOO_BIG = "That file is larger than 5 MB. Split it into smaller files: bring one now and the rest once your shop is open.";
const UNREADABLE = "This file couldn't be read. Save it from your spreadsheet as CSV or Excel (.xlsx) and try again.";

/** The day a file was kept, in the press's own words ("3 November 2026"). */
const dayOf = (at: string) => {
  const date = new Date(at);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
};

export function ImportPage({ press, door, onSaved }: { press: SetupPress; door: Pick<SetupDoor, "keepImport" | "removeImport" | "readOldShop">; onSaved: (press: SetupPress) => void }) {
  const w = useShopWords();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<MovePlan | null>(null);
  const [replacing, setReplacing] = useState(false);
  const [busy, setBusy] = useState<"" | "keep" | "remove">("");
  const [error, setError] = useState("");
  const [from, setFrom] = useState<BringAnswer | "">("");
  /** What reading the old shop's address had to say (stock counts aren't public, choices without prices). */
  const [readNotes, setReadNotes] = useState<string[]>([]);
  /** The old shop read from its address, while its products are on screen ("" for a chosen file). */
  const [foundHost, setFoundHost] = useState("");
  /** What the read said about stock: products not sold out, and whether it saw how many of each. */
  const [stockSeen, setStockSeen] = useState<{ forSale?: number; stockShown?: boolean }>({});

  const kept = press.stagedImport;
  // Plan 23.3: photos that can't be loaded from the old shop are left out of the preview and of the kept file.
  const photoCheck = useBrokenPhotos(preview?.plan);
  const plan = useMemo(() => (preview?.plan ? withoutBrokenPhotos(preview.plan, photoCheck.broken) : undefined), [preview, photoCheck.broken]);
  const ready = plan && !plan.problems.length ? plan.counts.create : 0;
  const found = foundHost && plan && preview ? foundCounts(plan, preview.oldPaths) : null;

  const [book, setBook] = useState<{ file: File } & SpreadsheetRead | null>(null);
  // Only the newest file (or sheet) chosen may fill the preview: an earlier read that finishes later is dropped.
  const readSeq = useRef(0);
  async function choose(next: File | undefined, notes: string[] = [], sheet?: string) {
    if (!next) return;
    const seq = ++readSeq.current;
    setError(""); setPreview(null); setFile(null); setReadNotes(notes);
    if (!sheet) setBook(null);
    if (next.size > MAX_FILE_BYTES) { setError(TOO_BIG); return; }
    try {
      // A spreadsheet of any kind is kept as CSV (plan 23.35), under the name the press chose.
      const read = await readSpreadsheet(next, sheet);
      if (seq !== readSeq.current) return;
      const text = read.text;
      setBook({ file: next, ...read });
      setFile(new File([text], next.name, { type: "text/csv" }));
      // No books yet, so every row is new; a shop that doesn't sell books keeps the old shop's sizes and colours.
      setPreview(planShopMove(text, [], [], {}, { keepOptions: !sellsBooks(press.sells || null) }));
    } catch (err) {
      if (seq === readSeq.current) setError(readProblem(err, UNREADABLE));
    }
  }

  async function keep() {
    if (!file || !ready || busy) return;
    setBusy("keep"); setError("");
    try {
      const kept = photoCheck.broken.size ? new File([fileWithoutPhotos(await file.text(), photoCheck.broken)], file.name, { type: file.type || "text/csv" }) : file;
      onSaved(await door.keepImport(press.pressId, kept, { name: file.name, rows: ready }));
      setFile(null); setPreview(null); setReplacing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't save. Try again.");
    } finally {
      setBusy("");
    }
  }

  async function remove() {
    if (busy) return;
    setBusy("remove"); setError("");
    try {
      onSaved(await door.removeImport(press.pressId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't save. Try again.");
    } finally {
      setBusy("");
    }
  }

  const pick = () => fileRef.current?.click();
  const cancel = () => { setFile(null); setPreview(null); setReplacing(false); setError(""); setFoundHost(""); };
  const errorLine = error && <p role="alert" className="rp-hint" style={{ margin: 0, color: "var(--rp-danger)" }}>{error}</p>;

  return (
    <>
      <input ref={fileRef} type="file" accept={SPREADSHEET_ACCEPT} hidden aria-label="Product file"
        onChange={(e) => { setFoundHost(""); void choose(e.target.files?.[0]); e.target.value = ""; }} />

      {kept && !replacing && !file && (
        <SectionCard title="Kept for your shop" collapsible={false}
          actions={<GhostButton size="sm" icon={<Trash2 size={14} aria-hidden />} busy={busy === "remove"} disabled={!!busy} onClick={() => void remove()}>Remove</GhostButton>}>
          <div style={{ display: "grid", gap: 12 }}>
            <p style={{ margin: 0 }}>
              <strong style={{ overflowWrap: "anywhere" }}>{kept.name}</strong>
              <span className="rp-hint" style={{ display: "block" }}>{w(`${kept.rows} ${kept.rows === 1 ? "book" : "books"}`)}{dayOf(kept.at) ? `, kept ${dayOf(kept.at)}` : ""}</span>
            </p>
            {errorLine}
            <div><SecondaryButton disabled={!!busy} onClick={() => { setReplacing(true); setError(""); }}>Choose another file</SecondaryButton></div>
          </div>
        </SectionCard>
      )}

      {(!kept || replacing || file) && !preview && (
        <div style={{ display: "grid", gap: 16 }}>
        {/* Bring it over from the old shop's address (23.2): the platform answers a product file, previewed like a chosen one. */}
        <div className="rp-sb-row" style={{ marginBottom: 0 }}>
          <section className="rp-sb-tile rp-sb-big" aria-labelledby="bring-title">
            <p className="rp-sb-eyebrow">From its web address</p>
            <h2 id="bring-title">Bring your shop with you</h2>
            <OldShopAddressForm read={(address) => door.readOldShop(press.pressId, address)} label="Look at my shop" disabled={!!busy}
              onRead={(f, notes, answer) => { setFoundHost(f.name.replace(/ products\.csv$/, "")); setStockSeen({ forSale: answer.forSale, stockShown: answer.stockShown }); return choose(f, notes); }} />
          </section>
          <FoundTile counts={null} />
        </div>
        <SectionCard title="Or bring a file" collapsible={false}>
          <div style={{ display: "grid", gap: 12, maxWidth: 560 }}>
            <EmptyState icon={<FileUp size={28} aria-hidden />} title={w("Your books, in one file")}
              description={w("In your old shop, export your products as a file. Or choose your own spreadsheet of books: Excel, CSV and LibreOffice files all work. You'll see your books before anything is kept.")}
              action={<div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
                <PrimaryButton icon={<FileUp size={16} aria-hidden />} disabled={!!busy} onClick={pick}>Choose a file</PrimaryButton>
                {kept && <SecondaryButton disabled={!!busy} onClick={cancel}>Keep {kept.name}</SecondaryButton>}
              </div>} />
            {errorLine}
            {/* How to get the file out of the old shop (17.4's plain steps), right where the file is chosen (23.0). */}
            <SelectField label="Not sure how to get the file? Where do you sell now?" value={from} onChange={(e) => setFrom(bringAnswerOf(e.target.value) ?? "")}>
              <option value="">Choose one</option>
              {BRING_ANSWERS.filter((a) => a.id !== "nowhere").map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </SelectField>
            {from && (
              <ol className="rp-hint" aria-label="How to get your product file" style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 6 }}>
                {/* The last step names Books › Import's button; here the file is kept with "Keep … for my shop" instead. */}
                {bringHelp(from).slice(0, -1).map((step) => <li key={step}>{w(step)}</li>)}
              </ol>
            )}
          </div>
        </SectionCard>
        </div>
      )}

      {found && file && (
        <div className="rp-sb-row" style={{ gridTemplateColumns: "minmax(0, 1fr)", marginBottom: 16 }}>
          <FoundTile counts={found} host={foundHost} forSale={stockSeen.stockShown === false && typeof stockSeen.forSale === "number" ? Math.min(stockSeen.forSale, found.products) : undefined}
            action={<PrimaryButton busy={busy === "keep"} disabled={!ready || !!busy} onClick={() => void keep()}>
              {ready ? w(`Keep ${ready} ${ready === 1 ? "book" : "books"} for my shop`) : "Nothing to keep"}
            </PrimaryButton>} />
        </div>
      )}

      {plan && file && (
        <SectionCard title={file.name} description={preview?.moved ? `Read as ${SHAPE_WORDS[preview.moved.shape]}.` : undefined} collapsible={false}>
          <div style={{ display: "grid", gap: 12 }}>
            {book && <SheetChoice sheets={book.sheets} sheet={book.sheet} disabled={!!busy} onChange={(s) => void choose(book.file, readNotes, s)} />}
            {book && <FirstRows text={book.text} />}
            {plan.problems.length ? (
              <div role="alert" style={{ display: "grid", gap: 8 }}>
                <StatusBadge tone="danger">Nothing can be brought in from this file</StatusBadge>
                <ul className="rp-hint" style={{ margin: 0, paddingLeft: 18 }}>{plan.problems.map((p) => <li key={p}>{p}</li>)}</ul>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }} aria-live="polite">
                  <StatusBadge tone="info">{w(`${plan.counts.create} ${plan.counts.create === 1 ? "book" : "books"} ready`)}</StatusBadge>
                  {plan.counts.error > 0 && <StatusBadge tone="danger">{plan.counts.error} with problems (left out)</StatusBadge>}
                </div>
                {photoCheckLine(photoCheck) && <p className="rp-hint" role="status" style={{ margin: 0 }}>{w(photoCheckLine(photoCheck))}</p>}
                {[...readNotes, ...(preview?.moved?.notices ?? [])].map((n) => <p key={n} className="rp-hint" style={{ margin: 0 }}>{w(n)}</p>)}
                {!preview?.moved && plan.ignoredColumns.length > 0 && <p className="rp-hint" style={{ margin: 0 }}>Columns left out: {plan.ignoredColumns.join(", ")}.</p>}
                <ImportPreviewRows plan={plan} />
              </>
            )}
            {errorLine}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {!found && <PrimaryButton busy={busy === "keep"} disabled={!ready || !!busy} onClick={() => void keep()}>
                {ready ? w(`Keep ${ready} ${ready === 1 ? "book" : "books"} for my shop`) : "Nothing to keep"}
              </PrimaryButton>}
              <SecondaryButton disabled={!!busy} onClick={pick}>Choose another file</SecondaryButton>
              <GhostButton disabled={!!busy} onClick={cancel}>Cancel</GhostButton>
            </div>
          </div>
        </SectionCard>
      )}
    </>
  );
}

/**
 * What reading the old shop found (design "Shop setup (bento)", screen 4): empty until a shop is read, then the success
 * tint with its four counts. Nothing is kept until the press presses Keep.
 */
function FoundTile({ counts, host = "", forSale, action }: { counts: FoundCounts | null; host?: string; forSale?: number; action?: ReactNode }) {
  const w = useShopWords();
  const shown = (n: number | undefined) => (counts ? n!.toLocaleString("en-CA") : "–");
  return (
    <section className={`rp-sb-tile ${counts ? "rp-sb-good" : "rp-sb-big rp-sb-empty"}`} aria-labelledby="found-title" aria-live="polite">
      <p className="rp-sb-eyebrow">{counts ? `Found · ${host}` : "What we find"}</p>
      <h2 id="found-title">{counts ? "Here's your shop" : "Shows up here"}</h2>
      <dl className="rp-sb-counts" style={counts ? { gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 140px), 1fr))" } : undefined}>
        <div><dt>{w("Books")}</dt><dd>{shown(counts?.products)}</dd></div>
        <div><dt>Photos</dt><dd>{shown(counts?.photos)}</dd></div>
        {/* An old shop that doesn't show how many it has: the products not sold out, rather than a misleading 0 in stock. */}
        {forSale === undefined ? <div><dt>In stock</dt><dd>{shown(counts?.inStock)}</dd></div> : <div><dt>For sale</dt><dd>{forSale.toLocaleString("en-CA")}</dd></div>}
        <div><dt>Old links kept</dt><dd>{shown(counts?.oldLinks)}</dd></div>
      </dl>
      <p>{counts ? "Check them below. Nothing is kept until you say so." : "Nothing is kept until you say so."}</p>
      {action && <div className="rp-sb-actions">{action}</div>}
    </section>
  );
}
