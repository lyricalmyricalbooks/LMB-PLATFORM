// Visit notes and photos on the client card (Services plan 2): one entry per visit with the colour formula or session
// note and before and after photos, newest first. Private to the shop (clientVisits.ts).
import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { ImagePlus, X } from "lucide-react";
import { Dialog, EmptyState, GhostButton, PrimaryButton, SecondaryButton, StatusBadge, TextArea, TextField, useConfirm } from "./riso/components";
import { MAX_VISIT_NOTE, MAX_VISIT_PHOTOS, type ClientVisit, type VisitPhoto } from "./clientVisits";
import { clientPhotoUrl, deleteClientVisit, listClientVisits, saveClientVisit, uploadClientPhoto, clientVisitsData } from "./clientVisitsApi";
import { dayOf } from "../../shared/bookingTimes";
import { shopTimeZone } from "../../shared/shopTimeZone";
import { emailHash } from "./emailHash";
import "./clientCard.css";

const KIND_WORD: Record<VisitPhoto["kind"], string> = { before: "Before", after: "After" };
const longDay = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", year: "numeric" });

// Photos already fetched this visit to the admin, by path, so reopening a client never downloads them again.
const shown = new Map<string, Promise<string>>();
function usePhoto(path: string): string | null | "failed" {
  const [url, setUrl] = useState<string | null | "failed">(null);
  useEffect(() => {
    let alive = true;
    if (!shown.has(path)) shown.set(path, clientPhotoUrl(path).catch((e) => { shown.delete(path); throw e; }));
    shown.get(path)!.then((u) => { if (alive) setUrl(u); }, () => { if (alive) setUrl("failed"); });
    return () => { alive = false; };
  }, [path]);
  return url;
}

function Thumb({ photo, onOpen, onRemove }: { photo: VisitPhoto; onOpen?: () => void; onRemove?: () => void }) {
  const url = usePhoto(photo.path);
  const label = `${KIND_WORD[photo.kind]} photo`;
  return (
    <span className="cv-thumb" data-loading={url === null || undefined}>
      {url && url !== "failed"
        ? (onOpen ? <button type="button" className="cv-thumb-open" onClick={onOpen} aria-label={`Open the ${label.toLowerCase()}`}><img src={url} alt={label} /></button> : <img src={url} alt={label} />)
        : <span className="cv-thumb-note">{url === "failed" ? "Couldn't load" : ""}</span>}
      {onRemove && <button type="button" className="cv-thumb-remove" onClick={onRemove} aria-label={`Remove this ${label.toLowerCase()}`}><X size={14} aria-hidden /></button>}
    </span>
  );
}

function PhotoView({ photo, onClose }: { photo: VisitPhoto | null; onClose: () => void }) {
  return (
    <Dialog open={!!photo} onClose={onClose} title={photo ? `${KIND_WORD[photo.kind]} photo` : ""} size="lg">
      {photo && <BigPhoto path={photo.path} />}
    </Dialog>
  );
}
function BigPhoto({ path }: { path: string }) {
  const url = usePhoto(path);
  if (url === "failed") return <p className="rp-hint">The photo couldn't be loaded. Try again in a moment.</p>;
  return url ? <img className="cv-big" src={url} alt="" /> : <p className="rp-hint">Loading…</p>;
}

/** The visits list with Add a visit, for one client's email. */
export function ClientVisits({ email }: { email: string }) {
  const [client, setClient] = useState("");
  const [visits, setVisits] = useState<ClientVisit[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState<ClientVisit | "new" | null>(null);
  const [open, setOpen] = useState<VisitPhoto | null>(null);
  const [confirm, confirmNode] = useConfirm();

  useEffect(() => {
    let alive = true;
    setClient("");
    emailHash(email).then((h) => { if (alive) setClient(h); }, () => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [email]);

  useEffect(() => {
    let alive = true;
    setVisits(null);
    if (!client) return;
    setFailed(false);
    listClientVisits(client).then((v) => { if (alive) setVisits(v); }, () => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [client]);

  const remove = async (v: ClientVisit) => {
    const ok = await confirm({ title: "Delete this visit?", message: `The note and ${v.photos.length === 1 ? "photo" : "photos"} from ${longDay(v.day)} will be deleted for good.`, confirmLabel: "Delete visit" });
    if (!ok) return;
    try {
      await deleteClientVisit(v);
      setVisits((list) => (list || []).filter((x) => x.id !== v.id));
      toast.success("Visit deleted");
    } catch { toast.error("The visit couldn't be deleted. Try again."); }
  };

  return (
    <section className="cv" aria-labelledby="cv-title">
      <div className="cv-head">
        <h3 id="cv-title" className="cv-title">Visit notes and photos <StatusBadge tone="info" glyph={false}>Beta</StatusBadge></h3>
        {!failed && visits && <SecondaryButton onClick={() => setEditing("new")}>Add a visit</SecondaryButton>}
      </div>
      {failed ? <p className="rp-hint" style={{ margin: 0 }}>Visit notes couldn't be loaded. Close the client and open them again.</p>
        : !visits ? <p className="rp-hint" style={{ margin: 0 }}>Loading…</p>
        : !visits.length ? <EmptyState inline title="No visit notes yet" description="Keep the formula and before and after photos for each visit. Only your team sees them." />
        : (
          <ol className="cv-list">
            {visits.map((v) => {
              const before = v.photos.filter((p) => p.kind === "before"), after = v.photos.filter((p) => p.kind === "after");
              return (
                <li key={v.id} className="cv-visit">
                  <div className="cv-visit-head">
                    <strong className="cv-day">{longDay(v.day)}</strong>
                    <span className="cv-actions">
                      <GhostButton onClick={() => setEditing(v)}>Edit</GhostButton>
                      <GhostButton onClick={() => { void remove(v); }}>Delete</GhostButton>
                    </span>
                  </div>
                  {v.note && <p className="cv-note">{v.note}</p>}
                  {(before.length > 0 || after.length > 0) && (
                    <div className="cv-photos">
                      {[before, after].map((group, i) => group.length > 0 && (
                        <div key={i} className="cv-group">
                          <span className="cv-kind">{i ? "After" : "Before"}</span>
                          <div className="cv-row">{group.map((p) => <Thumb key={p.path} photo={p} onOpen={() => setOpen(p)} />)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      {editing && (
        <VisitDialog client={client} email={email} visit={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setVisits((list) => [saved, ...(list || []).filter((x) => x.id !== saved.id)].sort((a, b) => b.day.localeCompare(a.day) || b.createdAt.localeCompare(a.createdAt)));
            setEditing(null);
          }} />
      )}
      <PhotoView photo={open} onClose={() => setOpen(null)} />
      {confirmNode}
    </section>
  );
}

function VisitDialog({ client, email, visit, onClose, onSaved }: {
  client: string; email: string; visit: ClientVisit | null; onClose: () => void; onSaved: (v: ClientVisit) => void;
}) {
  const [day, setDay] = useState(visit?.day || dayOf(Date.now(), shopTimeZone()));
  const [note, setNote] = useState(visit?.note || "");
  const [photos, setPhotos] = useState<VisitPhoto[]>(visit?.photos || []);
  const [uploading, setUploading] = useState<VisitPhoto["kind"] | null>(null);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState("");
  // Photos added in this window: removed again if the window closes without saving.
  const added = useRef<string[]>([]);
  // Set once the window closes: a photo still uploading then is removed as soon as it lands.
  const closed = useRef(false);
  const before = useRef<HTMLInputElement>(null), after = useRef<HTMLInputElement>(null);

  const addPhotos = async (kind: VisitPhoto["kind"], files: FileList | null) => {
    const list = Array.from(files || []).filter((f) => f.type.startsWith("image/"));
    if (!list.length) { if (files?.length) toast.error("Choose a photo (JPG, PNG or HEIC from a phone)."); return; }
    const room = MAX_VISIT_PHOTOS - photos.length;
    if (room <= 0) { toast.error(`Up to ${MAX_VISIT_PHOTOS} photos a visit.`); return; }
    setUploading(kind);
    try {
      for (const file of list.slice(0, room)) {
        const path = await uploadClientPhoto(client, kind, file);
        if (closed.current) { void clientVisitsData.removeFiles([path]); return; }
        added.current.push(path);
        setPhotos((p) => [...p, { path, kind }]);
      }
      if (list.length > room) toast(`Only the first ${room} ${room === 1 ? "photo was" : "photos were"} added: up to ${MAX_VISIT_PHOTOS} a visit.`);
    } catch { toast.error("A photo couldn't be added. Try again."); }
    finally {
      setUploading(null);
      for (const r of [before, after]) if (r.current) r.current.value = "";
    }
  };

  const close = () => {
    closed.current = true;
    void clientVisitsData.removeFiles(added.current);
    onClose();
  };
  const save = async () => {
    setSaving(true); setProblem("");
    try {
      const result = await saveClientVisit({ client, email, day, note, photos }, visit);
      if ("problem" in result) { setProblem(result.problem); return; }
      // Photos taken off but added in this window were never saved anywhere: remove them now.
      const kept = new Set(result.visit.photos.map((p) => p.path));
      void clientVisitsData.removeFiles(added.current.filter((p) => !kept.has(p)));
      added.current = [];
      toast.success(visit ? "Visit saved" : "Visit added");
      onSaved(result.visit);
    } catch { setProblem("The visit couldn't be saved. Try again."); }
    finally { setSaving(false); }
  };

  const picker = (kind: VisitPhoto["kind"], ref: React.RefObject<HTMLInputElement | null>) => {
    const mine = photos.filter((p) => p.kind === kind);
    return (
      <div className="cv-pick">
        <span className="cv-kind">{KIND_WORD[kind]}</span>
        <div className="cv-row">
          {mine.map((p) => <Thumb key={p.path} photo={p} onRemove={() => setPhotos((all) => all.filter((x) => x.path !== p.path))} />)}
          <button type="button" className="cv-add" onClick={() => ref.current?.click()} disabled={!!uploading || photos.length >= MAX_VISIT_PHOTOS}
            aria-label={`Add ${kind} photos`}>
            <ImagePlus size={20} aria-hidden /><span>{uploading === kind ? "Adding…" : "Add"}</span>
          </button>
        </div>
        <input ref={ref} type="file" accept="image/*" multiple hidden aria-label={`${KIND_WORD[kind]} photos`}
          onChange={(e) => { void addPhotos(kind, e.target.files); }} />
      </div>
    );
  };

  return (
    <Dialog open onClose={close} title={visit ? "Edit visit" : "Add a visit"} description="Only you and your team see this."
      footer={<>
        <GhostButton onClick={close} disabled={saving}>Cancel</GhostButton>
        <PrimaryButton onClick={() => { void save(); }} busy={saving} disabled={!!uploading}>{visit ? "Save visit" : "Add visit"}</PrimaryButton>
      </>}>
      <div className="cv-form">
        <TextField label="Day of the visit" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
        <TextArea label="Notes" rows={5} maxLength={MAX_VISIT_NOTE} value={note} onChange={(e) => setNote(e.target.value)}
          hint="The formula, what you used, what to try next time." />
        {picker("before", before)}
        {picker("after", after)}
        {problem && <p className="cv-problem" role="alert">{problem}</p>}
      </div>
    </Dialog>
  );
}
