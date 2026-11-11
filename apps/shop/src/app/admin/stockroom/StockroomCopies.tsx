// The stockroom's online copies on Stockroom › Backups: the list (newest first), Copy now, Download one copy, and Bring
// back one item or everything behind a question. StockroomCopyAuto makes the day's copy when the admin is open.
import { useEffect, useState } from "react";

import { ConfirmDialog, Dialog, PrimaryButton, SecondaryButton, SelectField, StatusBadge } from "../riso/components";
import { friendlyError } from "../settingsLayout";
import { download } from "../BackupsExportCard";
import { whenWords } from "./backups";
import { bringBack, copiesIO, itemsInCopy, makeCopy, type CopyEntry, type Snapshot } from "./stockroomCopies";
import { SaveNoteLine, type SaveNote } from "./SaleWriter";

const CHECK_EVERY_MS = 30 * 60 * 1000;

/** Makes today's copy once the admin is open, and again on return to the tab after midnight. Quiet: failures wait for tomorrow's try or Copy now. */
export function StockroomCopyAuto() {
  useEffect(() => {
    let last = 0;
    const check = () => {
      if (document.visibilityState === "hidden" || Date.now() - last < CHECK_EVERY_MS) return;
      last = Date.now();
      makeCopy("auto").catch(() => { /* a team member is refused; the owner sees the list's date */ });
    };
    check();
    document.addEventListener("visibilitychange", check);
    return () => document.removeEventListener("visibilitychange", check);
  }, []);
  return null;
}

/** The row's words: when the newest copy was made. */
export function copiesLine(list: CopyEntry[] | null, failed: boolean, now = Date.now()) {
  if (failed) return "Couldn't read the copies";
  if (!list) return "Checking…";
  if (!list.length) return "The first one is made today";
  const when = whenWords(new Date(list[0].createdAt).toISOString(), now);
  return `Newest ${when.charAt(0).toLowerCase()}${when.slice(1)} · ${list.length} kept`;
}

export function useStockroomCopies(io = copiesIO) {
  const [list, setList] = useState<CopyEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const load = () => io.list().then((l) => { setList(l); setFailed(false); }, () => { setFailed(true); setList(null); });
  useEffect(() => { void load(); }, []);
  return { list, failed, load };
}

export function StockroomCopiesList({ copies, io = copiesIO }: { copies: ReturnType<typeof useStockroomCopies>; io?: typeof copiesIO }) {
  const { list, failed, load } = copies;
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState<SaveNote | null>(null);
  const [open, setOpen] = useState<{ entry: CopyEntry; snap: Snapshot } | null>(null);
  const [item, setItem] = useState("");
  const [confirm, setConfirm] = useState(false);

  const copyNow = async () => {
    setBusy("copy"); setNote(null);
    try { await makeCopy("manual", io); setNote({ tone: "ok", text: "Copy made." }); await load(); }
    catch (err) { setNote({ tone: "error", text: friendlyError(err, "make the copy"), retry: () => void copyNow() }); }
    finally { setBusy(""); }
  };
  const read = async (entry: CopyEntry) => {
    setBusy(`read:${entry.id}`); setNote(null);
    try {
      const snap = await io.readCopy(entry.id);
      if (!snap) throw new Error("That copy couldn't be read.");
      return snap;
    } catch (err) { setNote({ tone: "error", text: friendlyError(err, "read that copy") }); return null; }
    finally { setBusy(""); }
  };
  const save = async (entry: CopyEntry) => {
    const snap = await read(entry);
    if (snap) download(`stockroom-copy-${entry.dayKey}.json`, JSON.stringify(snap, null, 2), "application/json");
  };
  const choose = async (entry: CopyEntry) => {
    const snap = await read(entry);
    if (snap) { setItem(""); setOpen({ entry, snap }); }
  };
  const run = async () => {
    if (!open) return;
    setConfirm(false); setBusy("back");
    try {
      const r = await bringBack(open.entry.id, item || null, io);
      setNote({ tone: r.ok ? "ok" : "warn", text: r.text });
      if (r.ok) setOpen(null);
      await load();
    } catch (err) { setNote({ tone: "error", text: friendlyError(err, "bring that back") }); }
    finally { setBusy(""); }
  };

  const items = open ? itemsInCopy(open.snap) : [];
  const chosen = items.find((i) => i.id === item);
  return (
    <div className="rp-stack" style={{ gap: 12 }}>
      <p className="rp-hint" style={{ margin: 0 }}>Your stock, sales and costs, copied once a day while the admin is open. The newest 30 are kept.</p>
      <div><PrimaryButton size="sm" busy={busy === "copy"} disabled={!!busy} onClick={() => void copyNow()}>Copy now</PrimaryButton></div>
      <SaveNoteLine note={note} />
      {failed ? <p className="rp-hint" style={{ margin: 0 }}><StatusBadge tone="warning">Unavailable</StatusBadge> The copies didn't load. <button type="button" className="rp-sr-open" onClick={() => void load()}>Try again</button></p>
        : !list ? <p className="rp-hint" style={{ margin: 0 }}>Loading the copies…</p>
        : !list.length ? <p className="rp-hint" style={{ margin: 0 }}>No copies yet. The first one is made today.</p>
        : (
          <ul className="rp-listcard" style={{ padding: 0 }}>
            {list.map((e) => (
              <li key={e.id}>
                <div className="rp-listcard-main">
                  <span className="rp-listcard-name">{whenWords(new Date(e.createdAt).toISOString())}</span>
                  <span className="rp-listcard-sub">{e.bookCount} {e.bookCount === 1 ? "item" : "items"} · {e.type === "manual" ? "Made by hand" : "Daily"}</span>
                </div>
                <SecondaryButton size="sm" disabled={!!busy} aria-label={`Download the copy from ${whenWords(new Date(e.createdAt).toISOString())}`} onClick={() => void save(e)}>Download</SecondaryButton>
                <SecondaryButton size="sm" disabled={!!busy} aria-label={`Bring back from the copy from ${whenWords(new Date(e.createdAt).toISOString())}`} onClick={() => void choose(e)}>{busy === `read:${e.id}` ? "Opening…" : "Bring back"}</SecondaryButton>
              </li>
            ))}
          </ul>
        )}

      <Dialog open={!!open} onClose={busy ? () => {} : () => setOpen(null)} title="Bring back from this copy"
        description={open ? whenWords(new Date(open.entry.createdAt).toISOString()) : undefined}
        footer={<><SecondaryButton onClick={() => setOpen(null)} disabled={!!busy}>Cancel</SecondaryButton><PrimaryButton busy={busy === "back"} onClick={() => setConfirm(true)}>{item ? "Bring this item back" : "Bring everything back"}</PrimaryButton></>}>
        <SelectField label="What to bring back" value={item} onChange={(e) => setItem(e.target.value)}>
          <option value="">Everything</option>
          {items.map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}
        </SelectField>
        <p className="rp-hint" style={{ margin: "8px 0 0" }}>A copy of the stockroom as it is now is made first.</p>
      </Dialog>
      <ConfirmDialog open={confirm} title={chosen ? `Bring back ${chosen.title}?` : "Bring everything back?"}
        message={chosen ? "Its stock, sales and costs go back to this copy. Sales recorded since then for it are replaced." : "Every item, the tax centre and your lists go back to this copy. Anything recorded since then is replaced."}
        confirmLabel={chosen ? "Bring it back" : "Bring everything back"}
        onConfirm={() => void run()} onCancel={() => setConfirm(false)} />
    </div>
  );
}
