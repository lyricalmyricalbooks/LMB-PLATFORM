// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PREVIEW_BRIDGE_SOURCE } from "./previewBridge";

// Runs the real bridge string in a page and checks what it reports to Studio.
const sent: any[] = [];
beforeAll(() => {
  (window as any).requestAnimationFrame ??= (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0);
  Element.prototype.scrollIntoView = () => {};
  vi.spyOn(window, "postMessage").mockImplementation(((d: any) => { sent.push(d); }) as any);
  document.body.innerHTML = `
    <div data-studio-target="style:colors" data-studio-label="Page background">
      <header data-studio-target="style:header|copy:Header" data-studio-label="Header"><span data-studio-target="style:logo" data-studio-label="Logo">L</span></header>
      <section data-fm-section="hero"><h1>Hello</h1></section>
      <div data-studio-target="style:products" data-studio-label="Product grid"></div>
      <footer data-store-region="footerPanel" data-studio-target="style:footer|copy:Footer" data-studio-label="Footer"></footer>
    </div>`;
  new Function(PREVIEW_BRIDGE_SOURCE)();
});
afterEach(() => { sent.length = 0; });
afterAll(async () => { await new Promise(r => setTimeout(r, 0)); window.dispatchEvent(new Event("pagehide")); });
const fromStudio = (data: any) => window.dispatchEvent(new MessageEvent("message", { data, origin: location.origin, source: window }));

describe("preview bridge page structure", () => {
  it("reports every section and built-in part in page order, with its zone", () => {
    fromStudio({ type: "SCAN_STRUCTURE" });
    const msg = sent.find(m => m.type === "STRUCTURE");
    expect(msg).toBeTruthy();
    expect(msg.nodes.map((n: any) => [n.key, n.zone])).toEqual([
      ["t:style:colors|Page background", "main"],
      ["t:style:header|copy:Header|Header", "header"],
      ["t:style:logo|Logo", "header"],
      ["s:hero", "main"],
      ["t:style:products|Product grid", "main"],
      ["r:footerPanel", "footer"],
    ]);
    expect(msg.nodes[2].parent).toBe("t:style:header|copy:Header|Header");
  });

  it("opens a pop-over on request", () => {
    const seen: any[] = [];
    window.addEventListener("fm:studio-open-overlay", (e: any) => seen.push(e.detail.overlay));
    fromStudio({ type: "OPEN_OVERLAY", overlay: "cart" });
    fromStudio({ type: "OPEN_OVERLAY", overlay: "<script>" });
    expect(seen).toEqual(["cart"]);
  });

  it("reports which part the pointer is over, once per change", () => {
    const logo = document.querySelector("[data-studio-label=Logo]")!;
    logo.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    logo.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    expect(sent.filter(m => m.type === "NODE_HOVER").map(m => m.key)).toEqual(["t:style:logo|Logo"]);
  });

  it("hides the hover outline when the part under it leaves the page", async () => {
    const extra = document.createElement("div");
    extra.setAttribute("data-studio-target", "style:newsletter");
    extra.setAttribute("data-studio-label", "Newsletter description");
    document.body.appendChild(extra);
    extra.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    const outline = () => Array.from(document.querySelectorAll<HTMLElement>("[data-studio-overlay]"))
      .find(n => n.textContent?.includes("Newsletter description"));
    expect(outline()?.style.display).toBe("block");
    extra.remove();
    // The bridge redraws on the next animation frame after the DOM change; wait for it, however busy the machine is.
    await vi.waitFor(() => expect(outline()?.style.display).toBe("none"), { timeout: 2000, interval: 10 });
  });

  it("selects a built-in part on click and reports its text, without a pop-up menu", () => {
    document.querySelector("[data-studio-label=Logo]")!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    const msg = sent.find(m => m.type === "STUDIO_ELEMENT");
    expect(msg).toMatchObject({ key: "t:style:logo|Logo", label: "Logo", target: "style:logo", text: "L" });
    expect(document.querySelector("[role=menu]")).toBeNull();
    expect(sent.some(m => m.type === "STUDIO_TARGET")).toBe(false);
  });

  it("selects a part Studio asks for and answers with its details", () => {
    fromStudio({ type: "SELECT_NODE", key: "r:footerPanel" });
    expect(sent.find(m => m.type === "ELEMENT_INFO")).toMatchObject({ key: "r:footerPanel", region: "footerPanel", label: "Footer" });
  });

  it("ignores messages from other origins", () => {
    window.dispatchEvent(new MessageEvent("message", { data: { type: "SCAN_STRUCTURE" }, origin: "https://evil.example", source: window }));
    expect(sent.some(m => m.type === "STRUCTURE")).toBe(false);
  });
});

describe("preview bridge block drag between sections", () => {
  it("reports a block dropped into another section", () => {
    document.body.insertAdjacentHTML("beforeend", `
      <section data-fm-section="s1"><div data-fm-block="k1">one</div></section>
      <section data-fm-section="s2"><div data-fm-block="k2">two</div></section>`);
    const dt = { setData() {}, effectAllowed: "", dropEffect: "" };
    const fire = (type: string, el: Element) => { const ev: any = new Event(type, { bubbles: true, cancelable: true }); ev.dataTransfer = dt; el.dispatchEvent(ev); };
    fire("dragstart", document.querySelector("[data-fm-block=k1]")!);
    fire("drop", document.querySelector("[data-fm-block=k2]")!);
    expect(sent.find(m => m.type === "BLOCK_MOVE_TO")).toMatchObject({ fromSectionId: "s1", blockId: "k1", toSectionId: "s2", beforeId: "k2" });
  });
});
