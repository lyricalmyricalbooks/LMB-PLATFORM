// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { auditDocument, contrastRatio, ownerOf, parseColor, summarise } from "./healthAudit";

// jsdom has no layout: every element gets a box from data-w / data-h (default 120×40).
const realRect = Element.prototype.getBoundingClientRect;
beforeEach(() => {
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const w = Number(this.getAttribute("data-w") ?? 120), h = Number(this.getAttribute("data-h") ?? 40);
    return { x: 0, y: 0, top: 0, left: 0, right: w, bottom: h, width: w, height: h, toJSON() {} } as DOMRect;
  };
  document.head.innerHTML = '<meta name="description" content="Independent publisher.">';
  document.title = "Lyricalmyrical Books";
});
afterEach(() => { Element.prototype.getBoundingClientRect = realRect; document.body.innerHTML = ""; document.body.removeAttribute("style"); });

const page = (html: string) => { document.body.innerHTML = `<main><h1>Shop</h1>${html}</main>`; return auditDocument(document, window); };
const ids = (findings: { id: string }[]) => findings.map(f => f.id.split(":")[0]);

describe("colour maths", () => {
  it("reads browser colours and measures WCAG contrast", () => {
    expect(parseColor("rgb(255, 255, 255)")).toEqual([255, 255, 255, 1]);
    expect(parseColor("rgba(0, 0, 0, 0.5)")).toEqual([0, 0, 0, 0.5]);
    expect(parseColor("#fff")).toEqual([255, 255, 255, 1]);
    expect(contrastRatio([0, 0, 0, 1], [255, 255, 255, 1])).toBeCloseTo(21, 0);
    expect(contrastRatio([119, 119, 119, 1], [255, 255, 255, 1])).toBeCloseTo(4.48, 1);
  });
});

describe("Studio Health page audit", () => {
  it("passes a clean page", () => {
    const findings = page('<section data-fm-section="s1"><h2>New</h2><p style="color:#111111;background:#ffffff">Readable text</p><a href="/about">About us</a></section>');
    expect(findings).toEqual([]);
    expect(summarise(findings).text).toBe("No problems found on this page.");
  });

  it("finds hard-to-read text and names the section it belongs to", () => {
    document.body.setAttribute("style", "background-color:#000000");
    const findings = page('<section data-fm-section="s1" data-studio-label="Newsletter"><p style="color:#222222">Join the archive</p></section>');
    const f = findings.find(x => x.owner?.key === "s:s1")!;
    expect(f).toMatchObject({ category: "contrast", severity: "issue", owner: { key: "s:s1", sectionId: "s1" } });
    expect(f.title).toContain("Join the archive");
    expect(f.detail).toMatch(/#222222 text on #000000/);
  });

  it("lets large text pass at 3:1 and skips text over a picture", () => {
    const findings = page(`
      <p style="color:#888888;background:#ffffff;font-size:28px">Large grey title</p>
      <div style="background-image:url(x.jpg)"><p style="color:#ffffff">Over a photo</p></div>`);
    expect(ids(findings)).not.toContain("contrast");
  });

  it("flags pictures without a description, nameless and empty links, and missing pages", () => {
    const findings = auditDocument((() => {
      document.body.innerHTML = `<main><h1>Shop</h1>
        <img src="a.jpg">
        <a href="/books/missing-book">Missing book</a>
        <a href="/books/night-pages">Night Pages</a>
        <a href="#">Read more</a>
        <button><svg></svg></button></main>`;
      return document;
    })(), window, { known: { books: new Set(["night-pages"]) } });
    expect(ids(findings)).toEqual(expect.arrayContaining(["alt", "broken", "nowhere", "noname"]));
    expect(findings.find(f => f.id.startsWith("broken"))!.detail).toContain("/books/missing-book");
    expect(findings.filter(f => f.id.startsWith("broken"))).toHaveLength(1);
  });

  it("names form fields from their label, placeholder or wrapping label", () => {
    const findings = page('<label for="e">Email</label><input id="e" data-w="200" data-h="44"><label><input type="checkbox" data-w="30" data-h="30"> Agree</label><button aria-label="Close" data-w="44" data-h="44"></button>');
    expect(ids(findings)).not.toContain("noname");
  });

  it("uses 44 px tap targets on phones and 24 px on desktop, exempting links inside sentences", () => {
    const html = '<button data-w="30" data-h="30">Join</button><p>Read our <a href="/about" data-w="20" data-h="14">story</a> about how we started printing books.</p>';
    expect(ids(page(html))).not.toContain("tap");
    document.body.innerHTML = `<main><h1>Shop</h1>${html}</main>`;
    const phone = auditDocument(document, window, { device: "mobile" });
    expect(phone.filter(f => f.id.startsWith("tap"))).toHaveLength(1);
    expect(phone.find(f => f.id.startsWith("tap"))!.detail).toMatch(/30×30 px; fingers need about 44×44/);
  });

  it("checks the heading outline, title and description", () => {
    document.title = ""; document.head.innerHTML = "";
    document.body.innerHTML = "<main><h2>Intro</h2><h4>Deep</h4></main>";
    const findings = auditDocument(document, window);
    expect(ids(findings)).toEqual(expect.arrayContaining(["h1", "skip", "title", "desc"]));
    expect(findings[0]).toMatchObject({ id: "title:", severity: "issue" });
    expect(findings.find(f => f.id === "h1:")!.severity).toBe("tip");
  });

  it("ignores hidden parts and Studio's own overlays", () => {
    const findings = page('<div style="display:none"><img src="x.jpg"></div><div data-studio-overlay><button></button></div><img src="y.jpg" data-w="0" data-h="0">');
    expect(findings).toEqual([]);
  });

  it("folds repeats of the same problem in one part, counting them", () => {
    const findings = page('<section data-fm-section="s1"><img src="1.jpg" width="10" height="10"><img src="2.jpg" width="10" height="10"><img src="3.jpg" width="10" height="10"></section>');
    expect(findings).toHaveLength(1);
    expect(findings[0].count).toBe(3);
    expect(summarise(findings)).toMatchObject({ issues: 3, tips: 0 });
  });

  it("keys built-in parts the way the preview bridge does", () => {
    document.body.innerHTML = '<div data-studio-target="style:header|copy:Header" data-studio-label="Masthead"><span id="x">Hi</span></div><div data-store-region="cartTitle" data-studio-label="Bag heading"><b id="y">Bag</b></div>';
    expect(ownerOf(document.getElementById("x"))).toMatchObject({ key: "t:style:header|copy:Header|Masthead", label: "Masthead" });
    expect(ownerOf(document.getElementById("y"))).toMatchObject({ key: "r:cartTitle", region: "cartTitle" });
  });

  it("speed tips: pictures that may make the page jump, a lazy main picture, and heavy pages", () => {
    const resource = (name: string, size: number) => ({ name, encodedBodySize: size, transferSize: size });
    const spy = vi.spyOn(window.performance, "getEntriesByName").mockImplementation((name: string) => [resource(name, 1_100_000)] as any);
    const findings = page(`
      <section data-fm-section="hero"><img src="big.jpg" alt="Cover" loading="lazy" data-w="900" data-h="500"></section>
      <section data-fm-section="s2"><img src="a.jpg" alt="A" width="300" height="200"><img src="b.jpg" alt="B" width="300" height="200"></section>
      <section data-fm-section="s3"><div style="aspect-ratio:3/4"><img src="c.jpg" alt="C"></div><img src="d.jpg" alt="D" style="object-fit:cover"></section>`);
    spy.mockRestore();
    expect(findings.find(f => f.id.startsWith("lcp:"))).toMatchObject({ owner: { key: "s:hero" } });
    expect(findings.filter(f => f.id.startsWith("jump:")).map(f => f.owner?.key)).toEqual(["s:hero"]);
    expect(findings.find(f => f.id.startsWith("weight:"))!.title).toMatch(/add up to 5\.\d MB/);
  });
});
