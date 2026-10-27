// Studio editing cost (Phase 4): what one edit costs on the published design snapshot — the same work `change()` and the
// Save-draft / Publish state do on every keystroke. Run with `pnpm exec vitest bench src/app/admin/studio/studioPerf.bench.ts`.
// Not part of CI timing gates; numbers are recorded in the PR.
import { test } from "vitest";
import live from "../../features/site/__fixtures__/liveDesign.json";
import { defaultSettings } from "../defaultSettings";
import { normalizeDesign, sameDesign, setPath } from "./studioModel";

const defaults = defaultSettings().design;
const start = normalizeDesign((live as any).design, defaults);
const firstSection = (d: any) => (d.heroPage?.sections || [])[0];
// A design about six times larger (30 pages of 12 sections with blocks), as a shop grows.
const section = (id: string) => ({ id, type: "MulticolumnSection", settings: {
  heading: "Our books", text: "<p>" + "Independent publishing. ".repeat(20) + "</p>",
  items: Array.from({ length: 4 }, (_, k) => ({ id: `${id}-b${k}`, title: `Column ${k}`, text: "Words ".repeat(30), image: "https://example.com/a.jpg" })),
} });
const big = normalizeDesign({
  ...(live as any).design,
  ...Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`page:p${i}`, { sections: Array.from({ length: 12 }, (_, j) => section(`p${i}-${j}`)) }])),
}, defaults);
export const BIG_DESIGN_BYTES = JSON.stringify(big).length;

/** One edit as Studio runs it: normalise the result, skip no-ops, then work out dirty/unpublished. */
function edit(present: any, saved: any, published: any, fn: (d: any) => any) {
  const next = normalizeDesign(fn(present), defaults);
  if (sameDesign(next, present)) return present;
  void !sameDesign(next, saved);
  void !sameDesign(next, published);
  return next;
}

// Vitest 5 runs benchmarks from a test's own `bench` (the old global `bench()` is gone).
test("one Studio edit on the live design", async ({ bench }) => {
  let d = start;
  let n = 0;
  await bench.compare(
    bench("change a colour", () => { d = edit(d, start, start, x => setPath(x, "primaryColor", n++ % 2 ? "#e8402a" : "#e8402b")); }),
    bench("type into a word", () => { d = edit(d, start, start, x => setPath(x, "copy.cartTitle", `Bag ${n++}`)); }),
    bench("edit a section", () => {
      d = edit(d, start, start, x => {
        const s = firstSection(x);
        if (!s) return setPath(x, "primaryColor", `#00000${n++ % 9}`);
        return { ...x, heroPage: { ...x.heroPage, sections: [{ ...s, settings: { ...s.settings, heading: `Hello ${n++}` } }, ...x.heroPage.sections.slice(1)] } };
      });
    }),
  );
});

test(`one Studio edit on a larger design (${Math.round(BIG_DESIGN_BYTES / 1024)} KB)`, async ({ bench }) => {
  let d = big;
  let n = 0;
  await bench("type into a word (large design)", () => { d = edit(d, big, big, x => setPath(x, "copy.cartTitle", `Bag ${n++}`)); }).run();
});
