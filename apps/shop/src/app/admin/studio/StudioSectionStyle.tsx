import { Fragment } from "react";
import { SectionFieldEditor } from "../ThemeEditorExtensions";
import { uploadStudioImage } from "./mediaUpload";
import { sectionStyleValue, type SectionStyleField, type SectionTab } from "./sectionStyleSchema";

/** One tab of a section's look and layout settings, grouped under small headings. */
export function StudioSectionStyle({ fields, tab, settings, search, onPatch }: {
  fields: SectionStyleField[]; tab: SectionTab; settings: Record<string, any>; search: string;
  onPatch: (patch: Record<string, any>) => void;
}) {
  const q = search.trim().toLowerCase();
  const shown = fields.filter(f => f.tab === tab && (!q || `${f.label} ${f.group} ${f.key}`.toLowerCase().includes(q)));
  const groups = [...new Set(shown.map(f => f.group))];
  if (!shown.length) return q ? <p className="studio-hint">No matching settings.</p> : null;
  return <>{groups.map(group => <Fragment key={group}>
    <p className="studio-structure-sub">{group}</p>
    {shown.filter(f => f.group === group).map(f => {
      const value = settings[f.key];
      const set = value !== undefined && value !== "" && f.kind !== "toggle";
      return <div key={f.key} className="studio-field" data-section-style-key={f.key}>
        <SectionFieldEditor field={f as any} value={value} settings={settings} onPatch={onPatch} uploadFile={uploadStudioImage}
          onChange={v => onPatch({ [f.key]: sectionStyleValue(f, v) })} />
        {(f.hint || set) && <div className="studio-field-status">
          <small>{f.hint || "Custom value"}</small>
          {set && <button type="button" className="studio-reset" aria-label={`Reset ${f.label}`} onClick={() => onPatch({ [f.key]: undefined })}>Reset</button>}
        </div>}
      </div>;
    })}
  </Fragment>)}</>;
}
