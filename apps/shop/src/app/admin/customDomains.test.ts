import { describe, expect, test } from "vitest";
import { describeDomain, recordHostLabel } from "./customDomains";

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
});
