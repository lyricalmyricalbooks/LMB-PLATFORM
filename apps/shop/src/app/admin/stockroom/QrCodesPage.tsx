// Stockroom › QR codes, drawn by the admin itself as the mockup shows it: New code by the title and one Codes list
// (name, what it opens, Print). A row opens the code large, with Download, Print and, for the owner's own codes,
// Remove. The list is qrCodes.ts; the owner's codes are kept by qrCodesStore.ts. The picture is drawn in the browser.
import { useEffect, useMemo, useState } from "react";

import { shopProfile } from "../../../lib/shopProfile";
import { DestructiveButton, Dialog, Drawer, EmptyState, PageActions, PrimaryButton, SecondaryButton, TextField } from "../riso/components";
import { useShopWords } from "../shopWords";
import type { NativePageProps } from "./nativePages";
import { booksWithoutLink, newCodeProblem, newOwnCode, qrCodeList, type OwnCode, type QrCode } from "./qrCodes";
import { qrCodesStore, qrPicture } from "./qrCodesStore";
import { RecordsGate } from "./RecordsGate";
import { TallySheetDialog } from "./TallySheetDialog";
import { SaveNoteLine, type SaveNote } from "./SaleWriter";
import type { StockroomRecords } from "./stockroomData";
import "./stockroom.css";
import "./sales.css";

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Prints one code on its own page: a large picture, its name and the link under it. False when the browser blocked the window. */
async function printCode(code: QrCode): Promise<boolean> {
  const sheet = window.open("", "_blank");
  if (!sheet) return false;
  const picture = await qrPicture(code.url, 12);
  // A printed code must be black on white whatever the admin's look, so this page sets its own plain colours.
  sheet.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escape(code.name)}</title>
<style>body{margin:0;font-family:system-ui,sans-serif;color:#000;background:#fff;display:grid;place-items:center;min-height:100vh;text-align:center}
img{width:70vmin;max-width:420px;image-rendering:pixelated}h1{font-size:28px;margin:24px 0 8px}p{margin:0;font-size:14px;word-break:break-all}</style></head>
<body><main><img src="${picture}" alt=""><h1>${escape(code.name)}</h1><p>${escape(code.url)}</p></main>
<script>window.onload=function(){window.print()}</script></body></html>`);
  sheet.document.close();
  return true;
}

function CodePicture({ url, size }: { url: string; size: number }) {
  const [src, setSrc] = useState("");
  useEffect(() => { let alive = true; qrPicture(url).then((s) => { if (alive) setSrc(s); }).catch(() => { if (alive) setSrc(""); }); return () => { alive = false; }; }, [url]);
  return src ? <img src={src} alt="" width={size} height={size} className="rp-qr-picture" /> : <span className="rp-qr-picture" style={{ width: size, height: size }} aria-hidden />;
}

export function QrCodes({ records, onOpen, load = qrCodesStore.load, save = qrCodesStore.save, siteUrl = shopProfile.siteUrl }: {
  records: StockroomRecords; onOpen?: NativePageProps["onOpen"];
  load?: () => Promise<OwnCode[]>; save?: (codes: OwnCode[]) => Promise<void>; siteUrl?: string;
}) {
  const w = useShopWords();
  const [own, setOwn] = useState<OwnCode[] | "failed" | null>(null);
  const [note, setNote] = useState<SaveNote | null>(null);
  const [open, setOpen] = useState<QrCode | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: "", url: "" });
  const [errors, setErrors] = useState<{ name?: string; url?: string }>({});
  const [busy, setBusy] = useState(false);
  const [tally, setTally] = useState(false);
  const read = () => { setOwn(null); load().then(setOwn, () => setOwn("failed")); };
  useEffect(read, []);

  const mine = Array.isArray(own) ? own : [];
  const codes = useMemo(() => qrCodeList({ books: records.books, siteUrl, own: mine }), [records.books, siteUrl, own]);
  const missing = booksWithoutLink(records.books);

  const keep = async (next: OwnCode[], done: string) => {
    setBusy(true);
    try { await save(next); setOwn(next); setNote({ tone: "ok", text: done }); return true; }
    catch { setNote({ tone: "error", text: "That didn't save. Check your connection and try again." }); return false; }
    finally { setBusy(false); }
  };
  const add = async () => {
    const problem = newCodeProblem(draft.name, draft.url, mine);
    if (problem) { setErrors(problem); return; }
    const code = newOwnCode(draft.name, draft.url);
    if (await keep([...mine, code], `Code made: ${code.name}.`)) setAdding(false);
  };
  const remove = async (code: QrCode) => { if (await keep(mine.filter((c) => c.id !== code.id), `Code removed: ${code.name}.`)) setOpen(null); };
  const print = async (code: QrCode) => {
    if (!(await printCode(code))) setNote({ tone: "error", text: "Your browser blocked the print window. Allow pop-ups for this page, or use Download." });
  };
  const download = async (code: QrCode) => {
    const a = document.createElement("a");
    a.href = await qrPicture(code.url, 12);
    a.download = `${code.name.replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "qr-code"}.gif`;
    a.click();
  };

  return (
    <div className="rp-sr">
      <PageActions>
        <PrimaryButton onClick={() => { setDraft({ name: "", url: "" }); setErrors({}); setNote(null); setAdding(true); }} disabled={own === null || own === "failed"}>New code</PrimaryButton>
        <SecondaryButton onClick={() => setTally(true)} disabled={!records.books.length}>Tally sheet</SecondaryButton>
      </PageActions>
      {tally && <TallySheetDialog records={records} onClose={() => setTally(false)} />}
      <SaveNoteLine note={note} />
      {own === "failed" && <SaveNoteLine note={{ tone: "error", text: "Your own codes didn't load.", retry: read }} />}

      {codes.length ? (
        <section className="rp-cardbox" aria-labelledby="qr-codes">
          <h2 id="qr-codes" className="rp-cardbox-title">Codes</h2>
          <ul className="rp-listcard">
            {codes.map((c) => (
              <li key={c.id}>
                <button type="button" className="rp-listcard-main" onClick={() => setOpen(c)} aria-label={`Show the code for ${c.name}`}>
                  <span className="rp-listcard-name">{c.name}</span>
                  <span className="rp-listcard-sub">{c.sub}</span>
                </button>
                <SecondaryButton size="sm" onClick={() => void print(c)}>Print</SecondaryButton>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <EmptyState inline icon="▦" title="No codes yet" description={w("Make one with New code, or add a card payment link to a book.")} />
      )}
      {missing > 0 && (
        <p className="rp-sr-status">
          {missing} {w(missing === 1 ? "book has" : "books have")} no card payment link yet, so no payment code.
          {onOpen && <> <button type="button" className="rp-sr-open" onClick={() => onOpen("dashboard")}>{w("Open Stock and sales")}</button></>}
        </p>
      )}

      <Drawer open={!!open} onClose={() => setOpen(null)} title={open?.name || "Code"} description={open?.sub}
        footerStart={open?.own ? <DestructiveButton onClick={() => open && void remove(open)} busy={busy}>Remove</DestructiveButton> : undefined}
        footer={open ? <><SecondaryButton onClick={() => void download(open)}>Download</SecondaryButton><PrimaryButton onClick={() => void print(open)}>Print</PrimaryButton></> : undefined}>
        {open && (
          <div className="rp-qr-detail">
            <CodePicture url={open.url} size={240} />
            <a href={open.url} target="_blank" rel="noreferrer" className="rp-qr-link">{open.url}</a>
          </div>
        )}
      </Drawer>

      <Dialog open={adding} onClose={busy ? () => {} : () => setAdding(false)} title="New code" description="A code that opens any link: a sign-up form, a poster, your reading list."
        footer={<><SecondaryButton onClick={() => setAdding(false)} disabled={busy}>Cancel</SecondaryButton><PrimaryButton onClick={add} busy={busy}>Make code</PrimaryButton></>}>
        <form className="rp-sr-form" onSubmit={(e) => { e.preventDefault(); void add(); }}>
          <TextField label="Name" value={draft.name} error={errors.name} placeholder="Join the mailing list" onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
          <TextField label="Link" type="url" inputMode="url" value={draft.url} error={errors.url} placeholder="https://" onChange={(e) => setDraft((d) => ({ ...d, url: e.target.value }))} />
          <button type="submit" hidden />
        </form>
        <SaveNoteLine note={note?.tone === "error" ? note : null} />
      </Dialog>
    </div>
  );
}

export function QrCodesPage({ onOpen }: NativePageProps) {
  return <RecordsGate what="your codes">{(records) => <QrCodes records={records} onOpen={onOpen} />}</RecordsGate>;
}
