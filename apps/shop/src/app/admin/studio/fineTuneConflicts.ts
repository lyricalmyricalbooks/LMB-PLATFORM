import { REGION_DEVICES, REGION_GROUPS, regionKey } from "../../features/site/storefrontRegions";

/**
 * Style controls whose element can also be styled in Fine-tune one element at a time. The
 * element's own setting is drawn on top, so when it is set the control looks dead; Studio says
 * so under the control and offers to clear the element's setting.
 */
export const FINE_TUNE_CONFLICTS: Record<string, { region: string; suffix: string }> = {
  pdpDescColor: { region: "productDescription", suffix: "Color" },
  pdpDescAlign: { region: "productDescription", suffix: "Align" },
  pdpDescFont: { region: "productDescription", suffix: "Font" },
};

const regionLabel = (id: string) => REGION_GROUPS.flatMap(g => g.regions).find(r => r.id === id)?.label || id;

/** The Fine-tune setting that overrides `key` on any screen size (root or the page's own regions), else null. */
export function fineTuneConflict(design: any, key: string, surface?: string) {
  const hit = FINE_TUNE_CONFLICTS[key];
  if (!hit) return null;
  const values = { ...(design?.regions || {}), ...(surface ? design?.[surface]?.regions : {}) };
  const keys = REGION_DEVICES.map(device => regionKey(hit.region, hit.suffix, device)).filter(k => values[k] != null && values[k] !== "");
  if (!keys.length) return null;
  return { region: hit.region, label: regionLabel(hit.region), value: values[keys[0]], paths: keys.map(k => `regions.${k}`) };
}
