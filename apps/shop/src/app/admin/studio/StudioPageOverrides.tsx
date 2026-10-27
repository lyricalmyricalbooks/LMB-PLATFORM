import { useMemo } from "react";
import { pageOverrides } from "../../features/site/designModel";
import { COPY_SCHEMA } from "../../features/site/storeCopy";
import { STYLE_GROUPS } from "./styleSchema";

const labels = (() => {
  const map = new Map<string, string>();
  for (const g of STYLE_GROUPS) for (const f of g.fields) map.set(f.key, `${g.title} › ${f.label}`);
  for (const g of COPY_SCHEMA) for (const f of g.fields) map.set(`copy.${f.key}`, `Text & labels › ${g.group} › ${f.label}`);
  return map;
})();
const human = (key: string) => key.replace(/^copy\./, "Text › ").replace(/^regions\./, "Element › ").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
export function overrideLabel(key: string) {
  const direct = labels.get(key);
  if (direct) return direct;
  // A whole map (e.g. `social`) whose entries are separate controls: name it after their category.
  const child = STYLE_GROUPS.find(g => g.fields.some(f => f.key.startsWith(key + ".")));
  return child ? `${child.title} › ${human(key)}` : human(key);
}

export function shown(value: any) {
  if (value === undefined || value === null || value === "") return "not set";
  if (value === true) return "On";
  if (value === false) return "Off";
  if (typeof value === "object") return Array.isArray(value) ? `${value.length} item${value.length === 1 ? "" : "s"}` : "custom";
  const text = String(value);
  return text.length > 28 ? text.slice(0, 27) + "…" : text;
}

/**
 * One field's value on the previewed page when that page sets its own (so the all-pages value
 * the field shows isn't what the preview draws), else null. Nested keys (`social.x`) are found
 * inside the page's own map.
 */
export function fieldPageOverride(design: any, surface: string, key: string): { value: any } | null {
  const hit = pageOverrides(design, surface).find(o => o.key === key || key.startsWith(o.key + "."));
  if (!hit) return null;
  const value = hit.key === key ? hit.value : key.slice(hit.key.length + 1).split(".").reduce((n: any, k) => (n == null ? undefined : n[k]), hit.value);
  return value === undefined ? null : { value };
}

/**
 * Theme settings › "This page differs from all pages": the values this page sets for itself,
 * which win over the all-pages value Studio shows elsewhere. Each can go back to the all-pages
 * value or become the new all-pages value.
 */
export function StudioPageOverrides({ design, surface, pageLabel, onUseAll, onMakeAll }: {
  design: any; surface: string; pageLabel: string;
  onUseAll: (key: string) => void; onMakeAll: (key: string, value: any) => void;
}) {
  const overrides = useMemo(() => pageOverrides(design, surface), [design, surface]);
  if (!overrides.length) return null;
  return (
    <details className="studio-overrides" data-studio-page-overrides>
      <summary>
        <span className="studio-overrides-title"><strong>This page differs from all pages</strong> <span className="studio-overrides-count">{overrides.length}</span></span>
        <small>{pageLabel} uses its own value for {overrides.length === 1 ? "this setting" : "these settings"}, so changing the all-pages value won't show here.</small>
      </summary>
      <ul>
        {overrides.map(o => (
          <li key={o.key}>
            <span className="studio-overrides-name">{overrideLabel(o.key)}</span>
            <span className="studio-overrides-values">This page: <b>{shown(o.value)}</b> · All pages: <b>{shown(o.inherited)}</b></span>
            <span className="studio-overrides-actions">
              <button type="button" className="rp-btn rp-btn-secondary rp-btn-sm" onClick={() => onUseAll(o.key)}>Use the all-pages value</button>
              <button type="button" className="rp-btn rp-btn-ghost rp-btn-sm" onClick={() => onMakeAll(o.key, o.value)}>Make this the all-pages value</button>
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
