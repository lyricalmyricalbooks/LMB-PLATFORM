// The download files on a product or one of its editions (Digital D1, 17 November 2026). Several files, each up to
// 5 GB, sent in pieces so a weak connection picks up where it stopped. Each file's name is what buyers see in their
// email and Library. The list is saved with the product (filesPatch keeps the older single-file field in step).
import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, Loader2, Trash2, Upload } from "lucide-react";
import { adminApi } from "./api";
import { SecondaryButton, TextField, GhostButton, useConfirm } from "./riso/components";
import { fileLabel, fileSizeText, filesOf, MAX_DIGITAL_FILE_BYTES, MAX_DIGITAL_FILES, type DigitalFile } from "../../shared/digitalFiles";

type Sending = { name: string; share: number };

export function DigitalFilesEditor({ holder, onChange, label, emptyNote, notify }: {
  /** The product or edition record (reads `digitalFiles`, else the older `digitalFileName`). */
  holder: any;
  onChange: (files: DigitalFile[]) => void;
  label: string;
  emptyNote: string;
  notify: { ok: (m: string) => void; err: (m: string) => void };
}) {
  const files = filesOf(holder);
  const input = useRef<HTMLInputElement>(null);
  const [sending, setSending] = useState<Sending | null>(null);
  const [askConfirm, confirmNode] = useConfirm();
  // Each upload adds to the list as it finishes, so later files never overwrite earlier ones.
  const latest = useRef(files);
  latest.current = files;

  const addFiles = async (picked: File[]) => {
    const room = MAX_DIGITAL_FILES - latest.current.length;
    if (room <= 0) { notify.err(`A product can have up to ${MAX_DIGITAL_FILES} files.`); return; }
    for (const file of picked.slice(0, room)) {
      if (file.size > MAX_DIGITAL_FILE_BYTES) { notify.err(`"${file.name}" is bigger than 5 GB, so it can't be uploaded.`); continue; }
      setSending({ name: file.name, share: 0 });
      try {
        const stored = `${Date.now()}-${file.name.replace(/[/\\]/g, "-")}`;
        // digital-assets/ cannot be read from a browser (storage.rules); the server signs a short link per download.
        await adminApi.uploadStoragePathInPieces(file, `digital-assets/${stored}`, (share) => setSending({ name: file.name, share }));
        const next = [...latest.current, { file: stored, name: file.name.slice(0, 120), size: file.size }];
        latest.current = next;
        onChange(next);
        notify.ok(`${file.name} uploaded`);
      } catch (err) {
        console.error("Download file upload failed:", err);
        notify.err(`"${file.name}" didn't finish uploading. Check the connection and try again.`);
      }
    }
    if (picked.length > room) notify.err(`Only ${room} more file${room === 1 ? "" : "s"} fit on this product.`);
    setSending(null);
    if (input.current) input.current.value = "";
  };

  const rename = (i: number, name: string) => onChange(files.map((f, j) => (j === i ? { ...f, name } : f)));
  const move = (i: number, by: number) => {
    const next = files.slice();
    const [f] = next.splice(i, 1);
    next.splice(i + by, 0, f);
    onChange(next);
  };
  const remove = async (i: number) => {
    const ok = await askConfirm({ title: "Remove this file?", confirmLabel: "Remove file",
      message: "Buyers stop seeing it once you save. People who already downloaded it keep their copy." });
    if (ok) onChange(files.filter((_, j) => j !== i));
  };

  return (
    <div className="be-dfiles" role="group" aria-label={label}>
      {confirmNode}
      {files.length === 0 && !sending && <p className="be-note">{emptyNote}</p>}
      {files.length > 0 && (
        <ol className="be-dfiles-list">
          {files.map((f, i) => (
            <li key={f.file} className="be-dfiles-row">
              <TextField label={`File ${i + 1} name`} value={f.name ?? fileLabel(f)} maxLength={120}
                hint={[fileSizeText(f.size), i === 0 && files.length > 1 ? "First in the list" : ""].filter(Boolean).join(" · ") || undefined}
                onChange={(e) => rename(i, e.target.value)} />
              <div className="be-dfiles-tools">
                {files.length > 1 && <GhostButton size="sm" disabled={i === 0} aria-label={`Move ${fileLabel(f)} up`} onClick={() => move(i, -1)}><ArrowUp size={13} aria-hidden /></GhostButton>}
                {files.length > 1 && <GhostButton size="sm" disabled={i === files.length - 1} aria-label={`Move ${fileLabel(f)} down`} onClick={() => move(i, 1)}><ArrowDown size={13} aria-hidden /></GhostButton>}
                <SecondaryButton size="sm" onClick={() => void remove(i)} aria-label={`Remove ${fileLabel(f)}`}><Trash2 size={13} aria-hidden /> Remove</SecondaryButton>
              </div>
            </li>
          ))}
        </ol>
      )}
      {sending && (
        <div className="be-dfiles-progress" role="status" aria-live="polite">
          <Loader2 size={14} className="animate-spin" aria-hidden />
          <span>Uploading {sending.name}: {Math.round(sending.share * 100)}%</span>
          <progress max={1} value={sending.share} aria-hidden />
        </div>
      )}
      <input ref={input} type="file" multiple className="hidden" aria-hidden="true" tabIndex={-1}
        onChange={(e) => void addFiles(Array.from(e.target.files || []))} />
      {files.length < MAX_DIGITAL_FILES && (
        <div className="be-inline-actions">
          <SecondaryButton size="sm" disabled={!!sending} onClick={() => input.current?.click()}>
            <Upload size={13} aria-hidden /> {files.length ? "Add another file" : "Upload a file"}
          </SecondaryButton>
          <span className="be-note">Any file type, up to 5 GB each.</span>
        </div>
      )}
    </div>
  );
}
