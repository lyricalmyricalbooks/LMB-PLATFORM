import { useState } from "react";
import { adminApi } from "../api";
import { BookImportDialog } from "../BookImportDialog";
import { keptFileLine, type KeptFile } from "../setupHandover";
import { PrimaryButton, SecondaryButton, SectionCard } from "../riso/components";
import { useShopWords } from "../shopWords";

/**
 * The product file kept in setup (code plan 18.9), read back from the shop's database and handed to the Books importer
 * as if it had been chosen. Shared by Get started's bring step and the card below.
 */
export function useKeptFile(kept: KeptFile | null) {
  const [file, setFile] = useState<File | null>(null);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");
  const open = async () => {
    if (!kept || opening) return;
    setOpening(true); setError("");
    try {
      setFile(new File([await adminApi.getSetupHandoverFile(kept.parts)], kept.name, { type: "text/csv" }));
    } catch {
      setError("Your file from setup couldn't be opened. Check your connection and try again, or choose the file from your computer.");
    } finally {
      setOpening(false);
    }
  };
  return { file, opening, error, open, close: () => setFile(null) };
}

/**
 * The kept file, for a press that got past Get started's bring step before its file reached the shop (the welcome
 * email can arrive a few minutes before the hand-over). Either choice puts the card away for good (`done`).
 */
export function KeptFileCard({ books, kept, onDone }: { books: any[]; kept: KeptFile; onDone: () => Promise<void> }) {
  const w = useShopWords();
  const keptFile = useKeptFile(kept);
  const [imported, setImported] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const finish = async () => {
    setBusy(true);
    await onDone().catch(() => setBusy(false));
  };
  return (
    <>
      <SectionCard title="Your file from setup is here" collapsible={false}>
        <p className="rp-hint" style={{ marginTop: 0 }}>
          {imported === null
            ? <><span className="rp-mono" style={{ overflowWrap: "anywhere" }}>{keptFileLine(kept, w)}</span>. {w("Bring it in to see every book before anything is saved.")}</>
            : w(imported === 1 ? "1 new book came over as a draft." : `${imported} new books came over as drafts.`)}
        </p>
        {keptFile.error && <p role="alert" className="rp-hint" style={{ color: "var(--rp-danger)" }}>{keptFile.error}</p>}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {imported === null
            ? <>
              <PrimaryButton busy={keptFile.opening} disabled={busy} onClick={() => void keptFile.open()}>Bring in my file</PrimaryButton>
              <SecondaryButton disabled={busy || keptFile.opening} onClick={() => void finish()}>I don't need it</SecondaryButton>
            </>
            : <PrimaryButton busy={busy} onClick={() => void finish()}>Done</PrimaryButton>}
        </div>
      </SectionCard>
      {keptFile.file && <BookImportDialog books={books} initialFile={keptFile.file} onClose={keptFile.close} onDone={(ids) => setImported(ids.length)} />}
    </>
  );
}
