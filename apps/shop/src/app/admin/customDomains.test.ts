import { describe, expect, test } from "vitest";
import { allowLabel, BUY_DOMAIN_URL, guideLineKind, describeDomain, describeEntry, domainActions, guideLineTitle, guideMailto, moveWarning } from "./customDomains";

describe("Your web address", () => {
  test("each state has a badge and a plain sentence", () => {
    expect(describeDomain("live")).toMatchObject({ tone: "success", label: "Live" });
    expect(describeDomain("waiting_dns").text).toMatch(/Do the steps below/);
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

  test("a free address is never removed, and a www address sends visitors on and is never made main", () => {
    expect(domainActions({ name: "moth-press.shops.example", state: "live", free: true }, "mothpress.example")).toMatchObject({ canMakeMain: true, canRemove: false });
    expect(domainActions({ name: "moth-press.shops.example", state: "live", free: true }, "moth-press.shops.example")).toMatchObject({ canMakeMain: false, canRemove: false });
    const www = domainActions({ name: "www.mothpress.example", state: "live", sendsTo: "mothpress.example" }, "mothpress.example");
    expect(www).toMatchObject({ canMakeMain: false, canRemove: true });
    expect(www.note).toContain("sent on to mothpress.example");
    expect(describeEntry({ free: true }, "waiting_dns").label).toBe("Setting up");
    expect(describeEntry({}, "waiting_dns").label).toBe("Waiting for you");
    expect(moveWarning("mothpress.example").message).toMatch(/take your last orders and close its checkout first/);
    expect(moveWarning("mothpress.example").message).not.toMatch(/DNS|CNAME|TXT|record/);
  });
});

describe("the tracker and the words for a domain brought over", () => {
  test("shows Connect, Secure, Live with the stage it is on", async () => {
    const { domainStages } = await import("./customDomains");
    expect(domainStages("waiting_dns").map((s) => [s.label, s.done, s.current])).toEqual([["Connect", false, true], ["Secure", false, false], ["Live", false, false]]);
    expect(domainStages("securing").map((s) => s.current)).toEqual([false, true, false]);
    expect(domainStages("live").every((s) => s.done)).toBe(true);
  });
  test("never tells a press to add an address again, and names no technical term", () => {
    for (const state of ["connecting", "waiting_dns", "securing", "live", "conflict", "missing"] as const) {
      expect(describeDomain(state).text).not.toMatch(/add it again|DNS|CNAME|record/i);
    }
  });

  test("a line to add says which type to pick at the seller; a line to take out doesn't need it", () => {
    expect(guideLineKind({ action: "add", kind: "Alias", pick: "CNAME", name: "www", value: "x.example" })).toBe("Alias line · in the Type box choose CNAME");
    expect(guideLineKind({ action: "remove", kind: "Address", pick: "A", name: "@", value: "1.2.3.4" })).toBe("Address line");
    expect(guideLineKind({ action: "add", kind: "Mail", name: "@", value: "mx.example", priority: 10 })).toBe("Mail line · Priority 10");
    expect(BUY_DOMAIN_URL).toMatch(/^https:\/\/www\.godaddy\.com\//);
  });
});
