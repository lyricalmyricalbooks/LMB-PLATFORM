// A storefront extra (a line, button or box a Studio switch turns on) lives in one folder,
// `features/site/extras/<name>/`: its component, its tests and a `feature.ts` whose default export says what
// it adds to the shared lists — Style controls (STYLE_GROUPS), words (COPY_SCHEMA), click-to-edit regions
// (REGION_GROUPS) and the Theme settings sub-section its controls sit in (STYLE_SUBSECTIONS). The lists
// collect every folder through `extras/registry.ts`, so a new extra edits none of them by hand.
// Pure data and helpers only: feature.ts files are read by shopper code (storeCopy) and must not import components.

export type FeatureStyleField =
  | { key: string; label: string; defaultValue?: any; kind: "text" | "textarea" | "color" | "toggle" | "image" | "html" | "link" }
  | { key: string; label: string; defaultValue?: any; kind: "range" | "number"; min: number; max: number; step?: number; suffix?: string }
  | { key: string; label: string; defaultValue?: any; kind: "select"; options: { value: string; label: string }[] };
export type FeatureCopyField = { key: string; label: string; default: string; multiline?: boolean; hint?: string };
export type FeatureRegion = { id: string; label: string; required?: boolean; grid?: boolean; image?: boolean; copy?: string };

/** Where the new entries go: after an existing entry of the list (its key or id), else at the end. */
type Placed<T> = { after?: string; fields: T[] };

export type StorefrontFeature = {
  /** The folder name. */
  id: string;
  /** Style controls, in a STYLE_GROUPS group; `subsection` = its STYLE_SUBSECTIONS title in that group, placed after `subsectionAfter`. */
  style?: Placed<FeatureStyleField> & { group: string; subsection?: string; subsectionAfter?: string };
  /** Words, in a COPY_SCHEMA group (Text & labels). */
  copy?: Placed<FeatureCopyField> & { group: string };
  /** Click-to-edit regions in a REGION_GROUPS group; `files` = the component files that draw them (src/app-relative). */
  regions?: Placed<FeatureRegion> & { group: string; files: string[] };
};

/** Folder-name order, except that a feature placed after a key or id another feature adds comes after that feature. */
export function orderFeatures(features: StorefrontFeature[]): StorefrontFeature[] {
  const adds = (f: StorefrontFeature) => [...(f.style?.fields || []).map(x => x.key), ...(f.copy?.fields || []).map(x => x.key), ...(f.regions?.fields || []).map(x => x.id)];
  const anchors = (f: StorefrontFeature) => [f.style?.after, f.style?.subsectionAfter, f.copy?.after, f.regions?.after].filter((a): a is string => !!a);
  const left = [...features], out: StorefrontFeature[] = [];
  while (left.length) {
    const pending = new Set(left.flatMap(adds));
    const next = left.findIndex(f => { const own = new Set(adds(f)); return anchors(f).every(a => own.has(a) || !pending.has(a)); });
    if (next < 0) throw new Error(`extras: ${left.map(f => f.id).join(", ")} are placed after each other`);
    out.push(...left.splice(next, 1));
  }
  return out;
}

/** Inserts `items` after the entry whose `idOf` is `after` (else at the end). Throws on an unknown anchor. */
export function insertAfter<T>(list: T[], items: T[], after: string | undefined, idOf: (item: T) => string, where: string): T[] {
  if (!items.length) return list;
  if (!after) return [...list, ...items];
  const at = list.findIndex(item => idOf(item) === after);
  if (at < 0) throw new Error(`${where}: no entry "${after}" to place after`);
  return [...list.slice(0, at + 1), ...items, ...list.slice(at + 1)];
}

function intoGroup<G>(groups: G[], group: string, groupId: (g: G) => string, where: string, edit: (g: G) => G): G[] {
  const at = groups.findIndex(g => groupId(g) === group);
  if (at < 0) throw new Error(`${where}: no group "${group}"`);
  return groups.map((g, i) => (i === at ? edit(g) : g));
}

type StyleGroupLike = { id: string; fields: FeatureStyleField[] };
type CopyGroupLike = { group: string; fields: FeatureCopyField[] };
type RegionGroupLike = { id: string; files: string[]; regions: FeatureRegion[] };
type SubsectionsLike = Record<string, { title: string; keys: string[] }[]>;

export function withFeatureStyle<G extends StyleGroupLike>(groups: G[], features: StorefrontFeature[]): G[] {
  return features.reduce((acc, f) => !f.style ? acc : intoGroup(acc, f.style.group, g => g.id, `extras/${f.id} style`,
    g => ({ ...g, fields: insertAfter(g.fields, f.style!.fields, f.style!.after, x => x.key, `extras/${f.id} style`) })), groups);
}

export function withFeatureCopy<G extends CopyGroupLike>(groups: G[], features: StorefrontFeature[]): G[] {
  return features.reduce((acc, f) => !f.copy ? acc : intoGroup(acc, f.copy.group, g => g.group, `extras/${f.id} copy`,
    g => ({ ...g, fields: insertAfter(g.fields, f.copy!.fields, f.copy!.after, x => x.key, `extras/${f.id} copy`) })), groups);
}

export function withFeatureRegions<G extends RegionGroupLike>(groups: G[], features: StorefrontFeature[]): G[] {
  return features.reduce((acc, f) => !f.regions ? acc : intoGroup(acc, f.regions.group, g => g.id, `extras/${f.id} regions`,
    g => ({ ...g, files: [...g.files, ...f.regions!.files.filter(file => !g.files.includes(file))],
      regions: insertAfter(g.regions, f.regions!.fields, f.regions!.after, x => x.id, `extras/${f.id} regions`) })), groups);
}

/** Adds each feature's style keys to its sub-section, after `subsectionAfter` (else at the end). */
export function withFeatureSubsections<S extends SubsectionsLike>(map: S, features: StorefrontFeature[]): S {
  const out: SubsectionsLike = { ...map };
  for (const f of features) {
    const style = f.style;
    if (!style?.subsection) continue;
    const where = `extras/${f.id} subsection`;
    const sections = out[style.group];
    const at = sections?.findIndex(s => s.title === style.subsection) ?? -1;
    if (!sections || at < 0) throw new Error(`${where}: no "${style.subsection}" in ${style.group}`);
    const keys = sections[at].keys;
    const fresh = style.fields.map(x => x.key).filter(k => !keys.includes(k));
    out[style.group] = sections.map((s, i) => (i === at ? { ...s, keys: insertAfter(keys, fresh, style.subsectionAfter, k => k, where) } : s));
  }
  return out as S;
}
