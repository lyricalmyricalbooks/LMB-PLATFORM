import { describe, expect, it } from "vitest";
import { autoSeo, duplicatePage, missingSeo, movePage, seoHints } from "./pageInsights";

describe("pageInsights", () => {
  it("gives SEO hints", () => {
    expect(seoHints("", "", "").every((h) => h.level === "warn")).toBe(true);
    const good = seoHints("About the press and its history", "", "x".repeat(100));
    expect(good.every((h) => h.level === "good")).toBe(true);
    expect(seoHints("t".repeat(70), "", "x".repeat(100))[0].level).toBe("warn");
  });
  it("duplicates as draft with a unique slug and no id", () => {
    const d = duplicatePage({ id: "1", title: "About", slug: "about", status: "published", body: "b" }, [{ slug: "about" }, { slug: "about-copy" }]);
    expect(d).toMatchObject({ title: "About (copy)", slug: "about-copy-2", status: "draft", body: "b" });
    expect(d).not.toHaveProperty("id");
  });
  it("moves by position even when orders tie", () => {
    const s = [{ id: "a", order: 0 }, { id: "b", order: 0 }, { id: "c", order: 0 }];
    expect(movePage(s, "b", -1)).toEqual([{ id: "a", order: 1 }, { id: "c", order: 2 }]);
    expect(movePage(s, "a", -1)).toEqual([]);
    expect(movePage(s, "c", 1)).toEqual([]);
  });
  it("auto-fills a search listing from the page", () => {
    const body = "<h2>Our story</h2><p>Lyricalmyrical began in 2009 as a small press in Toronto.</p><p>We publish poetry &amp; art books. " + "More words here. ".repeat(20) + "</p>";
    const seo = autoSeo({ title: "  History of   Lyricalmyrical ", body });
    expect(seo.seoTitle).toBe("History of Lyricalmyrical");
    expect(seo.metaDescription.startsWith("Lyricalmyrical began in 2009 as a small press in Toronto. We publish poetry & art books.")).toBe(true);
    expect(seo.metaDescription.length).toBeLessThanOrEqual(160);
    expect(/[.!?]$/.test(seo.metaDescription)).toBe(true);
  });
  it("cuts one long sentence on a word and leaves an empty page blank", () => {
    const seo = autoSeo({ title: "t".repeat(80), body: `<p>${"word ".repeat(60)}</p>` });
    expect(seo.seoTitle.length).toBeLessThanOrEqual(60);
    expect(seo.metaDescription.endsWith("word…")).toBe(true);
    expect(seo.metaDescription.length).toBeLessThanOrEqual(160);
    expect(autoSeo({ title: "", body: "<h2>Only a heading</h2>" }).metaDescription).toBe("Only a heading");
    expect(autoSeo({ title: "", body: "<p><br></p>" })).toEqual({ seoTitle: "", metaDescription: "" });
  });
  it("fills only blank search fields", () => {
    const page = { title: "About the press", body: "<p>We make books.</p>" };
    expect(missingSeo(page)).toEqual({ seoTitle: "About the press", metaDescription: "We make books." });
    expect(missingSeo({ ...page, seoTitle: "Mine", metaDescription: "Mine too" })).toEqual({});
    expect(missingSeo({ ...page, seoTitle: "Mine", metaDescription: " " })).toEqual({ metaDescription: "We make books." });
    expect(missingSeo({ title: "", body: "" })).toEqual({});
  });
  it("measures the title as the shop sends it and shortens nothing just to fit the name", () => {
    const fmt = (t: string) => `${t} — Lyricalmyrical Books`;
    expect(seoHints("About", "", "x".repeat(100), fmt)[0]).toEqual({ level: "good", text: "Title length is good (28 with the shop name)." });
    expect(seoHints("History of Lyricalmyrical and its friends", "", "x".repeat(100), fmt)[0].level).toBe("warn");
    expect(autoSeo({ title: "History of Lyricalmyrical and its friends", body: "" }, fmt).seoTitle).toBe("History of Lyricalmyrical and its friends");
  });
});
