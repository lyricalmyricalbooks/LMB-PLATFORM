import { describe, expect, test } from "vitest";
import { describeDomain, domainActions, recordHostLabel } from "./customDomains";

describe("Your web address", () => {
  test("each state has a badge and a plain sentence", () => {
    expect(describeDomain("live")).toMatchObject({ tone: "success", label: "Live" });
    expect(describeDomain("waiting_dns").text).toMatch(/Add the records below/);
    expect(describeDomain("securing").tone).toBe("info");
    expect(describeDomain("conflict").tone).toBe("danger");
    expect(describeDomain(undefined).label).toBe("Connecting");
  });

  test("records name the host the way domain sellers ask for it", () => {
    expect(recordHostLabel("yourpress.example", "yourpress.example")).toBe("@");
    expect(recordHostLabel("shop.yourpress.example.", "shop.yourpress.example")).toBe("shop");
    expect(recordHostLabel("_acme-challenge.shop.yourpress.example", "shop.yourpress.example")).toBe("_acme-challenge.shop");
  });

  test("only a live address can be made main, and the main one can't be removed (plan 5.9)", () => {
    expect(domainActions({ name: "a.example", state: "live" }, "shop.web.app")).toMatchObject({ canMakeMain: true, canRemove: true, note: "" });
    expect(domainActions({ name: "a.example", state: "waiting_dns" }, "shop.web.app")).toMatchObject({ canMakeMain: false, canRemove: true });
    const main = domainActions({ name: "a.example", state: "live" }, "a.example");
    expect(main).toMatchObject({ canMakeMain: false, canRemove: false });
    expect(main.note).toMatch(/make another address main first/);
  });
});
