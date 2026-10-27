import { REGION_GROUPS, regionValue, regionFieldDevice, type RegionDevice } from "../../features/site/storefrontRegions";
import type { StyleField } from "./styleSchema";

/** Includes hidden and conditional regions so selecting them never depends on canvas state. */
export function StudioRegionBrowser({ groupId, fields, values, device, onPick }: {
  groupId: string; fields: StyleField[]; values: any; device: RegionDevice;
  onPick: (group: string, label: string, device?: RegionDevice) => void;
}) {
  const group = REGION_GROUPS.find(g => g.id === groupId);
  if (!group) return null;
  return <div className="studio-region-browser">
    <p className="studio-hint">Choose an element, including hidden elements and messages shown after an action. Use the preview size to edit desktop, tablet or phone styling.</p>
    {group.regions.filter(region => fields.some(f => f.key.startsWith(`regions.${region.id}`))).map(region => {
      const matches = fields.filter(f => f.key.startsWith(`regions.${region.id}`));
      const sizes = new Set(matches.map(f => regionFieldDevice(f.key)));
      const hidden = regionValue(values, region.id, "Visible", device) === false && !region.required;
      return <button type="button" key={region.id} className="studio-category-link" onClick={() => sizes.size === 1 ? onPick(group.id, region.label, regionFieldDevice(matches[0].key)) : onPick(group.id, region.label)}>
        <span>{region.label}</span>
        <small>{region.required ? "Required · presentation editable" : hidden ? "Hidden at this size · edit to show" : "Layout, text style & visibility"} →</small>
      </button>;
    })}
  </div>;
}
