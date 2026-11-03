// Admin › Gift cards › Bring gift cards over (plan 23.5): the old shop's gift card file read in the browser.
import { describe, expect, it } from "vitest";
import { batches, dayOf, fullCode, readGiftCardFile } from "./giftCardMove";

const TODAY = "2026-11-03";

describe("reading an old shop's gift card file (plan 23.5)", () => {
  it("reads a file that only shows the last characters: new codes, emails counted, used-up and foreign cards skipped", () => {
    const file = [
      "Id,Last Characters,Customer Name,Email,Date Issued,Expires On,Initial Value,Balance,Currency,Disabled At",
      "101,a1b2,Ada Lovelace,Ada@Example.com,2026-01-02,2027-12-31,50.00,25.00,CAD,",
      "102,c3d4,Ben,,2026-02-02,,20.00,10.00,CAD,",
      "103,e5f6,Cy,cy@example.com,2026-03-02,,20.00,0.00,CAD,",
      "104,g7h8,Di,di@example.com,2026-03-02,,20.00,5.00,USD,",
      "105,j9k0,Ed,ed@example.com,2026-03-02,,20.00,5.00,CAD,2026-05-01",
      "106,m1n2,Flo,flo@example.com,2026-03-02,2026-06-01,20.00,5.00,CAD,",
    ].join("\n");
    const out = readGiftCardFile(file, TODAY);
    expect(out.problems).toEqual([]);
    expect(out.cards).toEqual([
      { line: 2, lastChars: "a1b2", oldRef: "id:101", balanceMinor: 2500, expiresOn: "2027-12-31", recipientEmail: "ada@example.com", recipientName: "Ada Lovelace" },
      { line: 3, lastChars: "c3d4", oldRef: "id:102", balanceMinor: 1000, recipientName: "Ben" },
    ]);
    expect(out.skipped.map((s) => [s.line, s.reason])).toEqual([
      [4, "no balance left"],
      [5, "in USD, and gift cards here are in Canadian dollars"],
      [6, "turned off in your old shop"],
      [7, "already expired"],
    ]);
    expect(out).toMatchObject({ totalMinor: 3500, keepCodes: 0, newCodes: 2, canEmail: 1 });
  });

  it("keeps a full code, and makes a reference from the code when there is no id", () => {
    const out = readGiftCardFile("Gift card code,Current balance,Status\nab12-cd34-ef56,$12.50,Active\n****ef56,3,active\nzz99-yy88,4,Deactivated", TODAY);
    expect(out.cards.map((c) => [c.code, c.oldRef, c.balanceMinor, c.lastChars])).toEqual([
      ["AB12CD34EF56", "code:AB12CD34EF56", 1250, "EF56"],
      [undefined, "line:ef56||300", 300, "ef56"],
    ]);
    expect(out.skipped).toEqual([{ line: 4, reason: "turned off in your old shop" }]);
    expect(out).toMatchObject({ keepCodes: 1, newCodes: 1, canEmail: 0 });
  });

  it("says plainly when a file isn't a gift card list", () => {
    expect(readGiftCardFile("", TODAY).problems).toEqual(["This file is empty."]);
    expect(readGiftCardFile("Title,Price\nBook,10", TODAY).problems[0]).toMatch(/each card's balance/);
    expect(readGiftCardFile("Title,Balance\nBook,10", TODAY).problems[0]).toMatch(/each card's code or id/);
    expect(readGiftCardFile("Code,Balance", TODAY).problems).toEqual(["This file has no gift cards in it."]);
  });

  it("small helpers", () => {
    expect(fullCode("abcd 1234 efgh")).toBe("ABCD1234EFGH");
    expect(fullCode("•••• 1234")).toBe("");
    expect(fullCode("xxxx-xxxx-1234")).toBe("");
    expect(fullCode("abc")).toBe("");
    expect(dayOf("2027-12-31T23:59:59Z")).toBe("2027-12-31");
    expect(dayOf("")).toBe("");
    expect(dayOf("not a date")).toBeNull();
    expect(batches([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(batches([], 2)).toEqual([]);
  });
});
