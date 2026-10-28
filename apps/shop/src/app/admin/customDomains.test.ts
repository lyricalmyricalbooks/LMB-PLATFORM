import { describe, expect, test } from "vitest";
import { allowLabel, describeDomain, domainActions, guideLineTitle, guideMailto } from "./customDomains";

describe("Your web address", () => {
  test("each state has a badge and a plain sentence", () => {
    expect(describeDomain("live")).toMatchObject({ tone: "success", label: "Live" });
    expect(describeDomain("waiting_dns").text).toMatch(/Finish connecting it below/);
    expect(describeDomain("securing").tone).toBe("info");
    expect(describeDomain("conflict").tone).toBe("danger");
    expect(describeDomain(undefined).label).toBe("Connecting");
  });

  test("one step: the button names the domain seller, guide lines are plain, the web person gets a mail (plan 6.15)", () => {
    expect(allowLabel("GoDaddy")).toBe("Connect with GoDaddy");
    expect(allowLabel(null)).toBe("Connect my address");
    expect(guideLineTitle({ action: "add", kind: "Address", name: "@", value: "1.2.3.4" })).toBe("Add");
    expect(guideLineTitle({ action: "remove", kind: "Address", name: "@", value: "1.2.3.4" })).toMatch(/Take out/);
    const mail = guideMailto({ seller: null, zone: "a.example", steps: [], lines: [], message: { subject: "Please connect a.example", body: "Kind: Address\nName: @" } });
    expect(mail).toBe("mailto:?subject=Please%20connect%20a.example&body=Kind%3A%20Address%0AName%3A%20%40");
    for (const state of ["live", "securing", "conflict", "missing", "waiting_dns", undefined] as const) expect(describeDomain(state).text).not.toMatch(/DNS|CNAME|TXT|record type/);
  });

  test("only a live address can be made main, and the main one can't be removed (plan 5.9)", () => {
    expect(domainActions({ name: "a.example", state: "live" }, "shop.web.app")).toMatchObject({ canMakeMain: true, canRemove: true, note: "" });
    expect(domainActions({ name: "a.example", state: "waiting_dns" }, "shop.web.app")).toMatchObject({ canMakeMain: false, canRemove: true });
    const main = domainActions({ name: "a.example", state: "live" }, "a.example");
    expect(main).toMatchObject({ canMakeMain: false, canRemove: false });
    expect(main.note).toMatch(/make another address main first/);
  });
});
