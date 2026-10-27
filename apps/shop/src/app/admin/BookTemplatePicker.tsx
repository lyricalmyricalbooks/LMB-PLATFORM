// Books › edit › Categories & tags › Book page template (Studio 2.8): which book-page layout this book uses.
// Templates are made in the Design studio (Page layout › Book page template › New template from this one).
import { useEffect, useState } from "react";
import { adminApi } from "./api";
import { SectionCard, SelectField } from "./riso/components";

export function BookTemplatePicker({ value, onChange }: { value?: string; onChange: (id: string | undefined) => void }) {
  const [choices, setChoices] = useState<{ id: string; name: string; published: boolean }[] | null>(null);
  useEffect(() => {
    let live = true;
    adminApi.getAlternateTemplates("productPage").then(list => { if (live) setChoices(list); }).catch(() => { if (live) setChoices([]); });
    return () => { live = false; };
  }, []);
  const missing = value && choices && !choices.some(c => c.id === value);
  return (
    <SectionCard title="Book page template" description="Which layout this book's page uses. Make more layouts in the Design studio: open a book page, then Page layout › Book page template › New template from this one.">
      <SelectField label="Book page template" value={value || ""} disabled={choices === null}
        onChange={e => onChange(e.target.value || undefined)}
        hint={choices === null ? "Loading templates…" : missing ? "The template this book used was deleted, so it shows the default layout." : choices.some(c => c.id === value && !c.published) ? "This template isn't published yet: the book shows the default layout until you publish from the Design studio." : undefined}>
        <option value="">Default book page</option>
        {(choices || []).map(c => <option key={c.id} value={c.id}>{c.name}{c.published ? "" : " (not published yet)"}</option>)}
        {missing && <option value={value}>Deleted template</option>}
      </SelectField>
    </SectionCard>
  );
}
