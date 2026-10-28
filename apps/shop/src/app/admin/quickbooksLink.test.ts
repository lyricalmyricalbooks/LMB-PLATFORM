import { describe, expect, test } from "vitest";
import { CONNECT_LABEL, bookkeepingError, connectOutcome, currentStep, endsText, firstMatches, lastSentText, saveProblem, shopTaxNames, yesterday } from "./quickbooksLink";

describe("Settings › Bookkeeping (plan 7.16)", () => {
  test("the button is words only, as Intuit asks", () => {
    expect(CONNECT_LABEL).toBe("Connect to QuickBooks");
  });

  test("the three steps follow the connection and what the owner opened", () => {
    expect(currentStep(null, null)).toBe(1);
    expect(currentStep({ enabled: true, connected: false }, 3)).toBe(1);
    expect(currentStep({ enabled: true, connected: true, ready: false }, null)).toBe(2);
    expect(currentStep({ enabled: true, connected: true, ready: false }, 3)).toBe(3);
    expect(currentStep({ enabled: true, connected: true, ready: true }, null)).toBe("done");
    expect(currentStep({ enabled: true, connected: true, ready: true }, 2)).toBe(2);
  });

  test("tax names come from each rate's name in the books, else its place; zero rates and repeats drop", () => {
    const rates = [{ country: "CA", region: "ON", rate: "13", bookName: "HST ON" }, { country: "CA", region: "AB", rate: "5" }, { country: "US", region: "", rate: "0" }, { country: "CA", region: "NB", rate: "15", bookName: "HST ON" }];
    expect(shopTaxNames(rates)).toEqual(["HST ON", "Tax AB"]);
    expect(shopTaxNames([], { GST: "5" })).toEqual(["GST"]);
  });

  test("step 3 starts from what was saved, else the code with the same name", () => {
    const codes = [{ id: "5", name: "GST" }, { id: "6", name: "HST ON" }];
    expect(firstMatches(["GST", "HST ON", "QST"], codes)).toEqual({ GST: "5", "HST ON": "6" });
    expect(firstMatches(["GST"], codes, { GST: "6" })).toEqual({ GST: "6" });
    expect(firstMatches(["GST"], codes, { GST: "99" })).toEqual({ GST: "5" });
  });

  test("step 3 says what is still missing", () => {
    const accounts = { income: "40", clearing: "4", bank: "35", fees: "8", giftCards: "90" };
    expect(saveProblem(["GST"], { taxCodes: {}, noTaxCode: "2", accounts })).toBe("Choose a QuickBooks tax code for GST.");
    expect(saveProblem(["GST"], { taxCodes: { GST: "5" }, accounts })).toBe("Choose the tax code for sales with no tax.");
    expect(saveProblem([], { noTaxCode: "2", accounts: { ...accounts, bank: "" } })).toBe('Choose an account for "Payouts land in".');
    expect(saveProblem(["GST"], { taxCodes: { GST: "5" }, noTaxCode: "2", accounts })).toBe("");
  });

  test("errors are plain words: the service's sentence, else the code's, never a browser's", () => {
    expect(bookkeepingError({ code: "disconnected" }, "send that day")).toBe("Couldn't send that day. QuickBooks stopped taking this shop's sales. Connect to QuickBooks again.");
    expect(bookkeepingError(Object.assign(new Error("Failed to fetch"), { code: "unreachable" }), "load")).toBe("Couldn't load. The platform didn't answer. Try again in a minute.");
    expect(bookkeepingError(new Error("That tax code isn't in this QuickBooks company"), "save")).toBe("Couldn't save. That tax code isn't in this QuickBooks company.");
    expect(bookkeepingError(null, "save")).toMatch(/Something went wrong/);
  });

  test("the way back from Intuit's sign-in is explained", () => {
    expect(connectOutcome("connected")?.tone).toBe("success");
    expect(connectOutcome("in_use")?.text).toMatch(/another shop/);
    expect(connectOutcome("denied")?.tone).toBe("warning");
    expect(connectOutcome(null)).toBeNull();
  });

  test("last sent, the connection's end and yesterday read as dates", () => {
    expect(lastSentText(null)).toMatch(/Nothing sent yet/);
    expect(lastSentText({ date: "2026-10-27", at: "2026-10-28T07:00:00Z" })).toBe("Sales sent up to October 27, 2026.");
    expect(endsText("2031-10-28T12:00:00Z")).toMatch(/October 28, 2031/);
    expect(yesterday(new Date("2026-10-28T16:00:00Z"))).toBe("2026-10-27");
  });
});
