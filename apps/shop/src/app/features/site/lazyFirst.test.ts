// A lazy <img> React creates must get `loading` before `src`/`srcSet`. React sets attributes in prop order,
// and Chrome starts a new image's download at once (skipping lazy loading) when its address is already in the
// memory cache, which is where the prerendered page's own lazy photos sit, unloaded. With `src` first, every
// gallery photo and related-book cover downloaded the moment the app took over from the prerendered book page.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const FILES = [
  "src/app/features/site/BookDetail.tsx",
  "src/app/features/site/PhotoLightbox.tsx",
  "src/app/features/site/RecentlyViewedRow.tsx",
  "src/app/features/site/StoreFooter.tsx",
  "src/app/components/ResponsiveImage.tsx",
];

/** Every `<img …/>` / `<m.img …/>` opening tag in a file, braces balanced so `=>` and `/>` inside expressions don't end it. */
function imgTags(source: string): string[] {
  const tags: string[] = [];
  const re = /<(?:m\.)?img\b/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) {
    let depth = 0;
    let i = match.index + match[0].length;
    for (; i < source.length; i++) {
      const c = source[i];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (depth === 0 && c === ">") break;
    }
    tags.push(source.slice(match.index, i + 1));
  }
  return tags;
}

/** Where a tag first names its picture (src, srcSet or a photoSrcSet spread), and where it says how to load. */
function lazyAfterSource(tag: string): boolean {
  const withoutComments = tag.replace(/\/\/[^\n]*/g, "");
  const loading = withoutComments.search(/\bloading=/);
  if (loading < 0) return false;
  const source = withoutComments.search(/\bsrc=|\bsrcSet=|\.\.\.photoSrcSet\(/);
  return source >= 0 && source < loading;
}

describe("lazy pictures say so before naming their file", () => {
  it("finds the order problem it guards against", () => {
    expect(lazyAfterSource(`<img src={a} loading="lazy" />`)).toBe(true);
    expect(lazyAfterSource(`<img {...photoSrcSet(p, s)} loading="lazy" />`)).toBe(true);
    expect(lazyAfterSource(`<img loading="lazy" src={a} {...photoSrcSet(p, s)} />`)).toBe(false);
    expect(imgTags(`<m.img loading={i > 1 ? "lazy" : "eager"} onLoad={() => x(a > b)} src={u} />`)).toHaveLength(1);
  });

  for (const file of FILES) {
    it(file, () => {
      const tags = imgTags(readFileSync(resolve(__dirname, "../../../..", file), "utf8"));
      expect(tags.length).toBeGreaterThan(0);
      expect(tags.filter(lazyAfterSource).filter(t => !t.includes("loading={loading}"))).toEqual([]);
    });
  }
});
