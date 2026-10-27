import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HOME_LINK_STATE, wantsHome } from "./homeLink";

describe("header logo → Home", () => {
  it("recognises only the logo's navigation state", () => {
    expect(wantsHome(HOME_LINK_STATE)).toBe(true);
    expect(wantsHome(null)).toBe(false);
    expect(wantsHome(undefined)).toBe(false);
    expect(wantsHome({ home: "yes" })).toBe(false);
    expect(wantsHome({ from: "/books/x" })).toBe(false);
  });

  it("every header logo / shop name is a real link to the Home page carrying that state", () => {
    const src = readFileSync(new URL("./StoreHeader.tsx", import.meta.url), "utf8");
    // A button with onClick only worked inside the shop page and never changed the address.
    expect(src).not.toMatch(/onClick=\{onHome\}/);
    expect(src.match(/<Link\s+to="\/"\s+state=\{HOME_LINK_STATE\}/g)?.length).toBe(3);
    const main = readFileSync(new URL("../../components/MainSite.tsx", import.meta.url), "utf8");
    expect(main).toMatch(/wantsHome\(location\.state\)/);
  });
});
