import { describe, expect, it } from "vitest";
import { themeWrite } from "./themeWrite";

describe("theme persistence contract", () => {
  it("never writes an unpublished draft or My themes to the public settings document", () => {
    const write = themeWrite({ design: { heroPage: { sections: [] } }, draftDesign: { primaryColor: "red" }, savedThemes: [{ id: "t" }], info: { name: "Shop" } });
    expect(write.payload).toEqual({ info: { name: "Shop" } });
    expect(write.options).toEqual({ mergeFields: ["info"] });
  });
  it("publishes a clean snapshot of the whole design without replacing unrelated settings", () => {
    const now = new Date("2026-10-08T12:00:00Z");
    const write = themeWrite({ design: { primaryColor: "red", unused: undefined } }, true, now);
    expect(write.payload).toEqual({ design: { primaryColor: "red" }, designPublishedAt: now.toISOString() });
    expect(write.options.mergeFields.sort()).toEqual(["design", "designPublishedAt"]);
  });
});
