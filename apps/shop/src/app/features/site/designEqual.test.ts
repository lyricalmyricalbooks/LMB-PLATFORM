import { describe, expect, it } from "vitest";
import { designEqual } from "./designEqual";
import live from "./__fixtures__/liveDesign.json";
import { THEME_LIBRARY } from "../../admin/studio/themeLibrary";
import { normalizeDesign } from "../../admin/studio/studioModel";
import { defaultSettings } from "../../admin/defaultSettings";

// The old rule: same text when serialised. designEqual must agree, except that key order no longer matters.
const sortedJson = (v: unknown) => JSON.stringify(v ?? null, (_k, x) => (x && typeof x === "object" && !Array.isArray(x)
  ? Object.keys(x).sort().reduce((o: any, k) => { o[k] = x[k]; return o; }, {}) : x));
const agrees = (a: unknown, b: unknown) => expect(designEqual(a, b)).toBe(sortedJson(a) === sortedJson(b));

// Small deterministic random generator so the property test is repeatable.
let seed = 7;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
function randomValue(depth = 0): any {
  const leaf = [() => undefined, () => null, () => 0, () => -0, () => 1.5, () => NaN, () => Infinity, () => "", () => "x", () => true, () => false, () => () => 1, () => new Date(0)];
  if (depth > 3 || rnd() < 0.4) return pick(leaf)();
  if (rnd() < 0.5) return Array.from({ length: Math.floor(rnd() * 4) }, () => randomValue(depth + 1));
  return Object.fromEntries(Array.from({ length: Math.floor(rnd() * 4) }, () => [pick(["a", "b", "c", "d"]), randomValue(depth + 1)]));
}
function mutate(v: any): any {
  if (v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)) {
    const keys = Object.keys(v);
    if (!keys.length || rnd() < 0.3) return { ...v, [pick(["a", "z"])]: randomValue(2) };
    const k = pick(keys);
    return { ...v, [k]: rnd() < 0.5 ? mutate(v[k]) : randomValue(2) };
  }
  if (Array.isArray(v) && v.length) { const i = Math.floor(rnd() * v.length); return v.map((x, j) => (j === i ? mutate(x) : x)); }
  return randomValue(1);
}

describe("designEqual — the same answer as comparing saved JSON", () => {
  it("agrees on edge values", () => {
    const cases: [unknown, unknown][] = [
      [{ a: undefined }, {}], [{ a: () => 1 }, {}], [[undefined], [null]], [[() => 1], [null]], [[NaN], [null]], [{ a: NaN }, { a: null }],
      [{ a: Infinity }, { a: null }], [0, -0], [new Date(0), new Date(0).toJSON()], [{ a: 1, b: 2 }, { b: 2, a: 1 }],
      [null, undefined], [[], {}], [{}, []], ["1", 1], [[1, 2], [2, 1]], [{ a: [1] }, { a: [1, undefined] }],
    ];
    for (const [a, b] of cases) agrees(a, b);
  });

  it("agrees on 2,000 random pairs and their mutations", () => {
    for (let i = 0; i < 1000; i++) {
      const a = randomValue();
      const text = JSON.stringify(a ?? null);
      agrees(a, text === undefined ? null : JSON.parse(text));
      agrees(a, mutate(a));
    }
  });

  it("agrees on the live design and every theme preset", () => {
    const d = (live as any).design;
    expect(designEqual(d, JSON.parse(JSON.stringify(d)))).toBe(true);
    for (const preset of THEME_LIBRARY as any[]) agrees(d, { ...d, ...(preset.global || {}) });
  });
});

describe("structural sharing through normalizeDesign (Phase 4)", () => {
  const defaults = defaultSettings().design;
  const base = normalizeDesign({
    ...(live as any).design,
    heroPage: { sections: [
      { id: "a", type: "RichTextSection", settings: { heading: "A" } },
      { id: "b", type: "MulticolumnSection", settings: { items: [{ id: "i1", title: "One", children: [{ id: "c1", title: "Child" }] }] } },
    ] },
  }, defaults);

  it("is idempotent and keeps every part the same object the second time", () => {
    const again = normalizeDesign(base, defaults);
    expect(again.heroPage).toBe(base.heroPage);
    expect(again.storefront).toBe(base.storefront);
    for (const key of Object.keys(base)) if (base[key] && typeof base[key] === "object") expect(again[key]).toBe(base[key]);
  });

  it("an edit to one section leaves the others, and the other pages, as the same objects", () => {
    const [a, b] = base.heroPage.sections;
    const edited = normalizeDesign({ ...base, heroPage: { ...base.heroPage, sections: [{ ...a, settings: { ...a.settings, heading: "A2" } }, b] } }, defaults);
    expect(edited.heroPage.sections[1]).toBe(b);
    expect(edited.heroPage.sections[1].settings.items[0].children[0]).toBe(b.settings.items[0].children[0]);
    expect(edited.storefront).toBe(base.storefront);
    expect(edited.heroPage.sections[0].settings.heading).toBe("A2");
  });

  it("still adds missing ids and normalises blocks", () => {
    const raw = normalizeDesign({ heroPage: { sections: [{ type: "MulticolumnSection", settings: { items: [{ title: "x", children: [] }] } }] } }, defaults);
    const s = raw.heroPage.sections[0];
    expect(s.id).toBe("legacy-section-0");
    expect(s.settings.items[0].id).toBe("legacy-section-0-items-0");
    expect(s.settings.items[0].children).toBeUndefined();
  });
});
