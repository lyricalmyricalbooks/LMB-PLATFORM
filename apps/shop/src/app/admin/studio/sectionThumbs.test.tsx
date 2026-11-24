import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SectionThumb, thumbDesign } from "./sectionThumbs";
import { sectionDesigns } from "./sectionDesigns";
import { SECTION_REGISTRY } from "../ThemeEditorExtensions";

const look = { bg: "#f6f1e8", fg: "#1c1a17", accent: "#c2410c", font: "Newsreader", photos: ["/samples/home/a.webp", "/samples/home/b.webp"] };

describe("Add section pictures", () => {
  it("read where a design puts its words and photo, and its dark or bright band", () => {
    expect(thumbDesign({ align: "left" })).toEqual({ align: "left", photoRight: false, band: "page" });
    expect(thumbDesign({ textAlign: "center", layout: "image-right" }).photoRight).toBe(true);
    expect(thumbDesign({ colorSchemeId: "scheme-inverse" }).band).toBe("dark");
    expect(thumbDesign({ colorSchemeId: "scheme-accent" }).band).toBe("bright");
  });

  it("draw in the shop's colours, heading font and sample photos", () => {
    const html = renderToStaticMarkup(<SectionThumb type="HeroSection" settings={{ align: "left" }} look={look} />);
    expect(html).toContain("background:#f6f1e8");
    expect(html).toContain('href="/samples/home/a.webp"');
    expect(html).toContain('fill="#c2410c"');
    expect(html).toContain("Newsreader");
    expect(html).toContain('text-anchor="start"');
  });

  it("swap the page colours on a dark band", () => {
    const html = renderToStaticMarkup(<SectionThumb type="TextContentSection" settings={{ colorSchemeId: "scheme-inverse" }} look={look} />);
    expect(html).toContain("background:#1c1a17;color:#f6f1e8");
  });

  it("draw every design without a look too (plain lines, as before)", () => {
    for (const d of sectionDesigns(SECTION_REGISTRY as any[])) {
      const html = renderToStaticMarkup(<SectionThumb type={d.type} settings={d.settings} />);
      expect(html).toContain("<svg");
      expect(html).not.toContain("<image");
    }
  });
});
