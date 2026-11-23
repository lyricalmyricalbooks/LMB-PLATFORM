// Client files on the client card (Bookings plan 4, 3.2): PDFs, documents and pictures kept with one client, newest
// first. Private to the shop (clientFiles.ts).
import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { FileText, FileSpreadsheet, FileImage, File as FileIcon, Upload } from "lucide-react";
import { Dialog, EmptyState, GhostButton, PrimaryButton, SecondaryButton, StatusBadge, TextField, useConfirm } from "./riso/components";
import { CLIENT_FILE_ACCEPT, MAX_CLIENT_FILES, MAX_FILE_NAME, downloadName, fileProblem, kindWord, sizeWords, sortFiles, type ClientFile } from "./clientFiles";
import { addClientFile, clientFilesData, deleteClientFile, renameClientFile } from "./clientFilesApi";
import { emailHash } from "./emailHash";
import "./clientCard.css";

const shortDay = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

function KindIcon({ type }: { type: string }) {
  const word = kindWord(type);
  const Icon = word === "Picture" ? FileImage : word === "Spreadsheet" ? FileSpreadsheet : word === "File" ? FileIcon : FileText;
  return <span className="cf-icon" aria-hidden><Icon size={20} /></span>;
}

/** The files list with Add files, for one client's email. */
export function ClientFiles({ email }: { email: string }) {
  const [client, setClient] = useState("");
  const [files, setFiles] = useState<ClientFile[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [adding, setAdding] = useState<{ done: number; of: number } | null>(null);
  const [renaming, setRenaming] = useState<ClientFile | null>(null);
  const [opening, setOpening] = useState("");
  const [confirm, confirmNode] = useConfirm();
  const picker = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    setClient("");
    emailHash(email).then((h) => { if (alive) setClient(h); }, () => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [email]);

  useEffect(() => {
    let alive = true;
    setFiles(null);
    if (!client) return;
    setFailed(false);
    clientFilesData.list(client).then((f) => { if (alive) setFiles(f); }, () => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [client]);

  const add = async (chosen: FileList | null) => {
    const list = Array.from(chosen || []);
    if (picker.current) picker.current.value = "";
    if (!list.length || !files) return;
    const problems = list.map(fileProblem).filter(Boolean);
    const good = list.filter((f) => !fileProblem(f));
    const room = MAX_CLIENT_FILES - files.length;
    if (problems.length) toast.error(problems.length === 1 ? problems[0] : `${problems.length} files couldn't be added: PDFs, documents, spreadsheets and pictures up to 20 MB.`);
    if (!good.length) return;
    if (room <= 0) { toast.error(`Up to ${MAX_CLIENT_FILES} files a client. Delete one to add another.`); return; }
    const take = good.slice(0, room);
    setAdding({ done: 0, of: take.length });
    let added = 0;
    try {
      for (const file of take) {
        const result = await addClientFile(client, email, file);
        if ("problem" in result) { toast.error(result.problem); continue; }
        added++;
        setFiles((all) => sortFiles([result.file, ...(all || [])]));
        setAdding((a) => a && { ...a, done: a.done + 1 });
      }
      if (added) toast.success(added === 1 ? "File added" : `${added} files added`);
      if (good.length > room) toast(`Only the first ${room} ${room === 1 ? "file was" : "files were"} added: up to ${MAX_CLIENT_FILES} a client.`);
    } catch { toast.error(added ? `${added} added. The rest couldn't be added. Try again.` : "The file couldn't be added. Try again."); }
    finally { setAdding(null); }
  };

  // Opens the file in a new tab. The tab is opened at the click (browsers block a late one), then given the file.
  const open = async (file: ClientFile) => {
    const tab = window.open("", "_blank");
    setOpening(file.id);
    try {
      const url = URL.createObjectURL(await clientFilesData.blob(file.path));
      if (tab) tab.location.href = url; else save(url, file);
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      tab?.close();
      toast.error("The file couldn't be opened. Try again in a moment.");
    } finally { setOpening(""); }
  };
  const save = (url: string, file: ClientFile) => {
    const a = document.createElement("a");
    a.href = url; a.download = downloadName(file);
    document.body.appendChild(a); a.click(); a.remove();
  };
  const download = async (file: ClientFile) => {
    setOpening(file.id);
    try {
      const url = URL.createObjectURL(await clientFilesData.blob(file.path));
      save(url, file);
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch { toast.error("The file couldn't be saved. Try again in a moment."); }
    finally { setOpening(""); }
  };

  const remove = async (file: ClientFile) => {
    const ok = await confirm({ title: "Delete this file?", message: `${file.name} will be deleted for good.`, confirmLabel: "Delete file" });
    if (!ok) return;
    try {
      await deleteClientFile(file);
      setFiles((all) => (all || []).filter((f) => f.id !== file.id));
      toast.success("File deleted");
    } catch { toast.error("The file couldn't be deleted. Try again."); }
  };

  const full = !!files && files.length >= MAX_CLIENT_FILES;
  return (
    <section className="cv cf" aria-labelledby="cf-title">
      <div className="cv-head">
        <h3 id="cf-title" className="cv-title">Files <StatusBadge tone="info" glyph={false}>Beta</StatusBadge></h3>
        {!failed && files && (
          <SecondaryButton onClick={() => picker.current?.click()} disabled={!!adding || full} busy={!!adding}>
            <Upload size={16} aria-hidden /> {adding ? `Adding ${Math.min(adding.done + 1, adding.of)} of ${adding.of}…` : "Add files"}
          </SecondaryButton>
        )}
        <input ref={picker} type="file" multiple hidden accept={CLIENT_FILE_ACCEPT} aria-label="Files to add"
          onChange={(e) => { void add(e.target.files); }} />
      </div>
      {failed ? <p className="rp-hint" style={{ margin: 0 }}>Files couldn't be loaded. Close the client and open them again.</p>
        : !files ? <p className="rp-hint" style={{ margin: 0 }}>Loading…</p>
        : !files.length ? <EmptyState inline title="No files yet" description="Keep signed forms, contracts and briefs with this client. PDFs, documents and pictures, up to 20 MB each. Only your team sees them." />
        : (
          <ul className="cf-list">
            {files.map((f) => (
              <li key={f.id} className="cf-row">
                <KindIcon type={f.type} />
                <span className="cf-text">
                  <button type="button" className="cf-name" onClick={() => { void open(f); }} disabled={opening === f.id} title={`Open ${f.name}`}>{f.name}</button>
                  <span className="cf-meta">{kindWord(f.type)} · {sizeWords(f.size)} · added {shortDay(f.addedAt)}</span>
                </span>
                <span className="cv-actions cf-actions">
                  <GhostButton onClick={() => { void download(f); }} disabled={opening === f.id}>Download</GhostButton>
                  <GhostButton onClick={() => setRenaming(f)}>Rename</GhostButton>
                  <GhostButton onClick={() => { void remove(f); }}>Delete</GhostButton>
                </span>
              </li>
            ))}
          </ul>
        )}
      {full && <p className="rp-hint" style={{ margin: 0 }}>This client has {MAX_CLIENT_FILES} files, the most one client can hold. Delete one to add another.</p>}
      {renaming && (
        <RenameDialog file={renaming} onClose={() => setRenaming(null)}
          onSaved={(saved) => { setFiles((all) => (all || []).map((f) => (f.id === saved.id ? saved : f))); setRenaming(null); }} />
      )}
      {confirmNode}
    </section>
  );
}

function RenameDialog({ file, onClose, onSaved }: { file: ClientFile; onClose: () => void; onSaved: (f: ClientFile) => void }) {
  const [name, setName] = useState(file.name);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const saved = await renameClientFile(file, name);
      toast.success("File renamed");
      onSaved(saved);
    } catch { toast.error("The name couldn't be saved. Try again."); }
    finally { setSaving(false); }
  };
  return (
    <Dialog open onClose={onClose} title="Rename file"
      footer={<>
        <GhostButton onClick={onClose} disabled={saving}>Cancel</GhostButton>
        <PrimaryButton onClick={() => { void save(); }} busy={saving} disabled={!name.trim()}>Save name</PrimaryButton>
      </>}>
      <form onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <TextField label="Name" value={name} maxLength={MAX_FILE_NAME} autoFocus onChange={(e) => setName(e.target.value)} />
      </form>
    </Dialog>
  );
}
