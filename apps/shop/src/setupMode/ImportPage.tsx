// Books in setup mode (code plan 18.7): bring a product file over before the shop exists. The file is read and
// previewed here in the browser with the shop's own importer (shopMove.ts `planShopMove`, with no books yet, so every
// row is new), then kept on the platform for the shop maker (18.9) to bring in when the shop opens. Nothing is written
// to a shop: there isn't one yet.
import { useRef, useState, type FormEvent } from "react";
import { FileUp, Globe, Trash2 } from "lucide-react";
import { EmptyState, GhostButton, PageHeader, PrimaryButton, SecondaryButton, SectionCard, SelectField, StatusBadge, TextField } from "../app/admin/riso/components";
import { BRING_ANSWERS, bringAnswerOf, bringHelp, type BringAnswer } from "../app/admin/bringShop";
import { ImportPreviewRows, MAX_FILE_BYTES } from "../app/admin/importPreview";
import { planShopMove, SHAPE_WORDS, type MovePlan } from "../app/admin/shopMove";
import { sellsBooks } from "../app/admin/sells";
import { useShopWords } from "../app/admin/shopWords";
import type { SetupDoor, SetupPress } from "./door";

const TOO_BIG = "That file is larger than 5 MB. Split it into smaller files: bring one now and the rest once your shop is open.";
const UNREADABLE = "This file couldn't be read. Save it from your spreadsheet as CSV (comma separated) and try again.";

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
  const [address, setAddress] = useState("");
  const [reading, setReading] = useState(false);
  const [addressError, setAddressError] = useState("");
  /** What reading the old shop's address had to say (stock counts aren't public, choices without prices). */
  const [readNotes, setReadNotes] = useState<string[]>([]);

  const kept = press.stagedImport;
  const plan = preview?.plan;
  const ready = plan && !plan.problems.length ? plan.counts.create : 0;

  async function choose(next: File | undefined, notes: string[] = []) {
    if (!next) return;
    setError(""); setPreview(null); setFile(next); setReadNotes(notes);
    if (next.size > MAX_FILE_BYTES) { setError(TOO_BIG); return; }
    try {
      // No books yet, so every row is new; a shop that doesn't sell books keeps the old shop's sizes and colours.
      setPreview(planShopMove(await next.text(), [], [], {}, { keepOptions: !sellsBooks(press.sells || null) }));
    } catch {
      setError(UNREADABLE);
    }
  }

  async function keep() {
    if (!file || !ready || busy) return;
    setBusy("keep"); setError("");
    try {
      onSaved(await door.keepImport(press.pressId, file, { name: file.name, rows: ready }));
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

  // Bring it over from the old shop's address (23.2): the platform reads the public product list and answers it as a
  // product file, which is previewed and kept exactly like a chosen file.
  async function readAddress(event: FormEvent) {
    event.preventDefault();
    if (reading || !address.trim()) return;
    setReading(true); setAddressError("");
    try {
      const read = await door.readOldShop(press.pressId, address.trim());
      await choose(new File([read.csv], `${read.host} products.csv`, { type: "text/csv" }), read.notes);
    } catch (err) {
      setAddressError(err instanceof Error ? err.message : "That didn't work. Try again.");
    } finally {
      setReading(false);
    }
  }

  const pick = () => fileRef.current?.click();
  const cancel = () => { setFile(null); setPreview(null); setReplacing(false); setError(""); };
  const errorLine = error && <p role="alert" className="rp-hint" style={{ margin: 0, color: "var(--rp-danger)" }}>{error}</p>;

  return (
    <>
      <input ref={fileRef} type="file" accept=".csv,text/csv" hidden aria-label="Product file"
        onChange={(e) => { void choose(e.target.files?.[0]); e.target.value = ""; }} />
      <PageHeader title={w("Books")} description={w("Bring your books over from your old shop or a spreadsheet. They come in when your shop opens, as drafts for you to check.")} />

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
        <SectionCard title="From your old shop's address" collapsible={false}>
          <form onSubmit={(e) => void readAddress(e)} style={{ display: "grid", gap: 12, maxWidth: 560 }}>
            <TextField label="Your old shop's web address" placeholder="yourshop.com" inputMode="url" autoComplete="url" value={address}
              hint={w("We read the books your old shop shows the public. You'll see them all before anything is kept.")}
              error={addressError || undefined} onChange={(e) => setAddress(e.target.value)} />
            <div><PrimaryButton type="submit" icon={<Globe size={16} aria-hidden />} busy={reading} disabled={reading || !!busy || !address.trim()}>{w("Bring my books over")}</PrimaryButton></div>
          </form>
        </SectionCard>
        <SectionCard title="Or bring a file" collapsible={false}>
          <div style={{ display: "grid", gap: 12, maxWidth: 560 }}>
            <EmptyState icon={<FileUp size={28} aria-hidden />} title={w("Your books, in one file")}
              description={w("In your old shop, export your products as a CSV file. Or save your spreadsheet of books as CSV. You'll see your books before anything is kept.")}
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

      {plan && file && (
        <SectionCard title={file.name} description={preview?.moved ? `Read as ${SHAPE_WORDS[preview.moved.shape]}.` : undefined} collapsible={false}>
          <div style={{ display: "grid", gap: 12 }}>
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
                {[...readNotes, ...(preview?.moved?.notices ?? [])].map((n) => <p key={n} className="rp-hint" style={{ margin: 0 }}>{w(n)}</p>)}
                {!preview?.moved && plan.ignoredColumns.length > 0 && <p className="rp-hint" style={{ margin: 0 }}>Columns left out: {plan.ignoredColumns.join(", ")}.</p>}
                <ImportPreviewRows plan={plan} />
              </>
            )}
            {errorLine}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <PrimaryButton busy={busy === "keep"} disabled={!ready || !!busy} onClick={() => void keep()}>
                {ready ? w(`Keep ${ready} ${ready === 1 ? "book" : "books"} for my shop`) : "Nothing to keep"}
              </PrimaryButton>
              <SecondaryButton disabled={!!busy} onClick={pick}>Choose another file</SecondaryButton>
              <GhostButton disabled={!!busy} onClick={cancel}>Cancel</GhostButton>
            </div>
          </div>
        </SectionCard>
      )}
    </>
  );
}
