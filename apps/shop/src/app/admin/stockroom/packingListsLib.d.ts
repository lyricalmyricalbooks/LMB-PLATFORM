// Types for the stockroom's saved packing lists (apps/stockroom/src/lib/sales-tracker-presets.js), which the tally sheet
// imports through `@stockroom` so the admin and the old app share one list on a device.
declare module "@stockroom/sales-tracker-presets.js" {
  export type StPreset = {
    id: string; name: string; cols: number; currencyCode: string; includeNotes: boolean; bookIds: string[];
    qtyBrought: Record<string, number>; customBooks: Array<{ title: string; author: string; qty: number }>; savedAt: string;
  };
  type Store = Pick<Storage, "getItem" | "setItem"> | null | undefined;
  export function loadStPresets(storage: Store): StPreset[];
  export function saveStPresets(storage: Store, presets: StPreset[]): StPreset[];
  export function upsertStPreset(presets: StPreset[], preset: Partial<StPreset> & { name: string }): StPreset[];
  export function removeStPreset(presets: StPreset[], id: string): StPreset[];
  export function stPresetMissingBooks(preset: StPreset, availableIds: string[]): string[];
  export function stPresetSummary(preset: StPreset): string;
}
