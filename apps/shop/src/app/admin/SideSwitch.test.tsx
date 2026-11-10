import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SideSwitch, rememberSide, rememberedSide } from "./SideSwitch";

const store = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };

describe("SideSwitch", () => {
  it("marks the side you're on and counts the stockroom's to-dos from the website side only", () => {
    const web = renderToStaticMarkup(<SideSwitch side="website" stockroomCount={3} onPick={() => {}} />);
    expect(web).toContain('aria-label="Stockroom, 3 to do"');
    expect(web).toContain(">3</span>");
    const stock = renderToStaticMarkup(<SideSwitch side="stockroom" stockroomCount={3} onPick={() => {}} />);
    expect(stock).not.toContain("rp-side-count");
    expect(stock).toMatch(/aria-pressed="true"[^>]*>Stockroom/);
  });

  it("remembers the side on this device, and falls back to the website", () => {
    const s = store();
    expect(rememberedSide(s)).toBe("website");
    rememberSide("stockroom", s);
    expect(rememberedSide(s)).toBe("stockroom");
    expect(rememberedSide({ getItem: () => { throw new Error("blocked"); } })).toBe("website");
    expect(rememberedSide(null)).toBe("website");
  });
});
