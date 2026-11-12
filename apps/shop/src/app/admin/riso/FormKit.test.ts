import { describe, expect, it } from "vitest";
import { formStatus } from "./FormKit";

describe("v4 form kit status bar", () => {
  it("names missing required fields first", () => {
    expect(formStatus({ missing: 2, create: true, dirty: true })).toEqual({ tone: "warn", text: "2 required fields to fill in" });
    expect(formStatus({ missing: 1 }).text).toBe("1 required field to fill in");
  });
  it("then says a create form is ready, then unsaved, then all saved", () => {
    expect(formStatus({ missing: 0, create: true, verb: "record" })).toEqual({ tone: "good", text: "Ready to record" });
    expect(formStatus({ missing: 0, dirty: true })).toEqual({ tone: "warn", text: "Unsaved changes" });
    expect(formStatus({ missing: 0 })).toEqual({ tone: "good", text: "All saved" });
  });
});
