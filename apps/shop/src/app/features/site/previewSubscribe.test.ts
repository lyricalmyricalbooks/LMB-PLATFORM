// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { latestPreview, readPreviewMessage, subscribePreview } from "./previewTab";

const msg = (data: any, extra: Record<string, unknown> = {}) =>
  new MessageEvent("message", { data, origin: window.location.origin, source: window, ...extra });

afterEach(() => window.history.replaceState(null, "", "/"));

describe("one shared preview listener", () => {
  it("hands every subscriber the accepted snapshot, once, and remembers it", () => {
    window.history.replaceState(null, "", "/?preview=true");
    const seen: any[] = [];
    const stopA = subscribePreview(m => seen.push(["a", m.type, m.books?.length]));
    const stopB = subscribePreview(m => seen.push(["b", m.type]));
    window.dispatchEvent(msg({ type: "STUDIO_PREVIEW_STATE", design: { x: 1 }, books: [{ id: "b" }], studioStatus: "draft" }));
    window.dispatchEvent(msg({ type: "THEME_UPDATE", design: { x: 2 } }));
    expect(seen).toEqual([["a", "STUDIO_PREVIEW_STATE", 1], ["b", "STUDIO_PREVIEW_STATE"], ["a", "THEME_UPDATE", undefined], ["b", "THEME_UPDATE"]]);
    expect(latestPreview()?.design).toEqual({ x: 2 });
    expect((window as any).__studioPreviewState.books).toEqual([{ id: "b" }]);
    stopA(); stopB();
  });

  it("refuses other origins, other senders, messages without a design, and shoppers' pages", () => {
    window.history.replaceState(null, "", "/?preview=true");
    expect(readPreviewMessage(msg({ type: "THEME_UPDATE", design: {} }, { origin: "https://evil.example" }))).toBeNull();
    expect(readPreviewMessage(msg({ type: "THEME_UPDATE", design: {} }, { source: null }))).toBeNull();
    expect(readPreviewMessage(msg({ type: "THEME_UPDATE" }))).toBeNull();
    expect(readPreviewMessage(msg({ type: "BOOK_PREVIEW_UPDATE", design: {} }))).toBeNull();
    expect(readPreviewMessage(msg({ type: "STUDIO_PREVIEW_STATE", design: {}, studioStatus: "weird" }))?.status).toBeUndefined();
    window.history.replaceState(null, "", "/");
    expect(readPreviewMessage(msg({ type: "THEME_UPDATE", design: {} }))).toBeNull();
  });
});

// Storefront code follows Studio's snapshot only through subscribePreview: a second hand-written listener
// drifts (each used to check origin and sender a little differently).
it("no storefront file reads Studio's snapshot messages itself", () => {
  const root = join(__dirname, "..", "..");
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) { if (!["admin", "__fixtures__"].includes(name)) walk(full); }
      else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(full);
    }
  };
  walk(root);
  const offenders = files.filter(f => !f.endsWith("previewTab.ts") && /data\??\.type\s*[!=]==?\s*["'](STUDIO_PREVIEW_STATE|THEME_UPDATE)["']|\["THEME_UPDATE", "STUDIO_PREVIEW_STATE"\]/.test(readFileSync(f, "utf8")));
  expect(offenders.map(f => f.slice(root.length + 1))).toEqual([]);
});
