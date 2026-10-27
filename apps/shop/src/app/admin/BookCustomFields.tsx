// Books › edit › More details (Studio 2.7): the shop's custom book fields. Answers are saved with the book in
// `book.custom`; the fields themselves (shared by every book) are managed in "Book fields" below and saved at once to
// settings/bookFields. Sections connect to them in the Design studio (Content tab › Connect to a detail).
import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { adminApi } from "./api";
import { BOOK_FIELD_KINDS, fieldKeyFor, MAX_BOOK_FIELDS, MAX_FIELD_VALUE, type BookFieldDef, type BookFieldKind } from "../features/site/bookFields";
import { SectionCard, SelectField, TextArea, TextField } from "./riso/components";

type Status = { tone: "ok" | "err"; text: string } | null;

export function BookCustomFields({ form, set, onDefinitionsDirty }: { form: any; set: (name: string, value: any) => void; onDefinitionsDirty?: (dirty: boolean) => void }) {
  const [fields, setFields] = useState<BookFieldDef[] | null>(null);
  const [draft, setDraft] = useState<BookFieldDef[]>([]);
  const [newLabel, setNewLabel] = useState("");
  const [newKind, setNewKind] = useState<BookFieldKind>("text");
  const [status, setStatus] = useState<Status>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    adminApi.getBookFields()
      .then(list => { if (live) { setFields(list); setDraft(list); } })
      .catch(() => { if (live) { setFields([]); setDraft([]); setStatus({ tone: "err", text: "Couldn't load your book fields. Check your connection and reopen this tab." }); } });
    return () => { live = false; };
  }, []);

  const values: Record<string, string> = form.custom || {};
  const setValue = (key: string, value: string) => {
    const next = { ...values };
    if (value === "") delete next[key]; else next[key] = value.slice(0, MAX_FIELD_VALUE);
    set("custom", next);
  };
  const changed = JSON.stringify(draft) !== JSON.stringify(fields || []);
  // The editor's unsaved-changes guard also covers unsaved field definitions.
  useEffect(() => { onDefinitionsDirty?.(changed); }, [changed]);
  useEffect(() => () => onDefinitionsDirty?.(false), []);
  const saveFields = async () => {
    setSaving(true); setStatus(null);
    try {
      const saved = await adminApi.saveBookFields(draft);
      setFields(saved); setDraft(saved);
      setStatus({ tone: "ok", text: "Book fields saved. They now appear on every book." });
    } catch {
      setStatus({ tone: "err", text: "Couldn't save the book fields. Try again." });
    } finally { setSaving(false); }
  };
  const addField = () => {
    const label = newLabel.trim();
    if (!label || draft.length >= MAX_BOOK_FIELDS) return;
    setDraft([...draft, { key: fieldKeyFor(label, draft.map(f => f.key)), label, kind: newKind }]);
    setNewLabel("");
  };

  if (fields === null) return <SectionCard title="More details"><p className="be-note">Loading your book fields…</p></SectionCard>;

  return (
    <>
      <SectionCard title="More details" description="Extra details you've defined for every book. Design studio sections can show them on book pages: in a section's Content tab, use Connect to a detail.">
        {!fields.length && <p className="be-note">No book fields yet. Add one below — for example Series, Translator or Awards.</p>}
        <div className="be-custom-fields">
          {fields.map(f => {
            const common = { label: f.label, hint: f.help, value: values[f.key] || "", "data-book-field": f.key } as any;
            if (f.kind === "multiline") return <TextArea key={f.key} {...common} rows={4} onChange={e => setValue(f.key, e.target.value)} />;
            const type = f.kind === "number" ? "number" : f.kind === "date" ? "date" : f.kind === "url" || f.kind === "image" ? "url" : "text";
            return <TextField key={f.key} {...common} type={type} placeholder={f.kind === "image" ? "https://… (link to a picture)" : f.kind === "url" ? "https://… or /page/…" : undefined}
              onChange={e => setValue(f.key, e.target.value)} />;
          })}
        </div>
        {fields.length > 0 && <p className="be-note">These are saved with the book when you press Save.</p>}
      </SectionCard>

      <SectionCard title="Book fields (shared by every book)" description="Add, rename or remove the fields above. Removing a field hides it everywhere, but answers already saved on books are kept, so adding it back brings them back.">
        <ul className="be-field-defs">
          {draft.map((f, i) => (
            <li key={f.key} className="be-field-def">
              <TextField label={`Field ${i + 1} name`} value={f.label} maxLength={80}
                onChange={e => setDraft(draft.map(d => d.key === f.key ? { ...d, label: e.target.value } : d))} />
              <SelectField label="Kind" value={f.kind} onChange={e => setDraft(draft.map(d => d.key === f.key ? { ...d, kind: e.target.value as BookFieldKind } : d))}>
                {BOOK_FIELD_KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
              </SelectField>
              <button type="button" className="rp-btn rp-btn-ghost rp-btn-sm" aria-label={`Remove field ${f.label || i + 1}`}
                onClick={() => setDraft(draft.filter(d => d.key !== f.key))}><Trash2 size={13} aria-hidden /> Remove</button>
            </li>
          ))}
        </ul>
        <div className="be-field-add">
          <TextField label="New field name" value={newLabel} maxLength={80} placeholder="e.g. Series"
            onChange={e => setNewLabel(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addField(); } }} />
          <SelectField label="Kind" value={newKind} onChange={e => setNewKind(e.target.value as BookFieldKind)}>
            {BOOK_FIELD_KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
          </SelectField>
          <button type="button" className="rp-btn rp-btn-secondary rp-btn-sm" onClick={addField} disabled={!newLabel.trim() || draft.length >= MAX_BOOK_FIELDS}>
            <Plus size={13} aria-hidden /> Add field
          </button>
        </div>
        <div className="be-field-save">
          <button type="button" className="rp-btn rp-btn-primary rp-btn-sm" onClick={saveFields} disabled={!changed || saving}>
            {saving ? "Saving…" : "Save book fields"}
          </button>
          {changed && <span className="be-note">Unsaved changes to the fields (separate from saving this book).</span>}
          {status && <p role={status.tone === "err" ? "alert" : "status"} className={status.tone === "err" ? "rp-error-text" : "be-note"}>{status.text}</p>}
        </div>
      </SectionCard>
    </>
  );
}
