// Studio 2.7 · dynamic sources: under a text, picture or link field, "Connect to a detail" swaps the fixed value for
// a detail of the page the section is on (the book, the open category, the custom page). A connected field shows a
// chip with Disconnect instead of its editor. Values: features/site/dynamicSources.ts.
import { createContext, useContext, useId, useRef, type ReactNode } from "react";
import { Link2, Unlink } from "lucide-react";
import type { BookFieldDef } from "../../features/site/bookFields";
import { connect, dynamicSources, isDynamic, sourceLabel, type DynamicSource } from "../../features/site/dynamicSources";
import { StudioAiRewrite } from "./StudioAiRewrite";

export type DynamicSourcesValue = { fields: BookFieldDef[] };
export const DynamicSourcesContext = createContext<DynamicSourcesValue | null>(null);

/** Which sources a field of this kind may connect to ("" = none: colours, numbers, lists…). */
export function connectableKind(kind: string): DynamicSource["kind"] | "" {
  if (kind === "text" || kind === "textarea") return "text";
  if (kind === "image") return "image";
  if (kind === "link") return "link";
  return "";
}

const WHERE: Record<string, string> = { book: "on book pages", category: "on collection pages", page: "on custom pages" };

export function ConnectedField({ label, path, onDisconnect }: { label: string; path: string; onDisconnect: () => void }) {
  const ctx = useContext(DynamicSourcesContext);
  const where = WHERE[path.split(".")[0]] || "";
  return (
    <div className="studio-connected" data-connected-field={path}>
      <span className="studio-connected-label">{label}</span>
      <p><Link2 size={13} aria-hidden /> Connected to <strong>{sourceLabel(path, ctx?.fields)}</strong></p>
      {where && <small>Filled in {where}. Elsewhere it is empty; Visibility › Hide when a connected detail is empty can hide the section there.</small>}
      <button type="button" className="studio-link-button" onClick={onDisconnect}><Unlink size={13} aria-hidden /> Disconnect</button>
    </div>
  );
}

export function ConnectMenu({ label, kind, onConnect }: { label: string; kind: DynamicSource["kind"]; onConnect: (value: { $dyn: string }) => void }) {
  const ctx = useContext(DynamicSourcesContext);
  const id = useId();
  if (!ctx) return null;
  const sources = dynamicSources(ctx.fields).filter(s => s.kind === kind);
  const groups = Array.from(new Set(sources.map(s => s.group)));
  return (
    <div className="studio-connect">
      <label htmlFor={id} className="sr-only">Connect {label} to a detail</label>
      <select id={id} value="" onChange={e => { if (e.target.value) onConnect(connect(e.target.value)); }}>
        <option value="">Connect to a detail…</option>
        {groups.map(g => (
          <optgroup key={g} label={g}>
            {sources.filter(s => s.group === g).map(s => <option key={s.path} value={s.path}>{s.label}</option>)}
          </optgroup>
        ))}
      </select>
    </div>
  );
}

/** Wraps a field editor: connected → chip; otherwise the editor plus the Connect menu (when the field can connect). */
export function ConnectableField({ fieldKind, label, value, onChange, children, aiWhere }: {
  fieldKind: string; label: string; value: any; onChange: (v: any) => void; children: ReactNode;
  /** The section's name, told to the AI when the owner chooses Rewrite with AI (3.0 phase 8). */
  aiWhere?: string;
}) {
  const kind = connectableKind(fieldKind);
  // The fixed value typed before connecting, so Disconnect in the same session puts it back (else the field is blank).
  const before = useRef<any>("");
  if (isDynamic(value)) return <ConnectedField label={label} path={value.$dyn} onDisconnect={() => { onChange(before.current ?? ""); before.current = ""; }} />;
  return <>{children}<StudioAiRewrite kind={fieldKind} label={label} where={aiWhere} value={value} onChange={onChange} />{kind && <ConnectMenu label={label} kind={kind} onConnect={(next) => { before.current = value ?? ""; onChange(next); }} />}</>;
}
