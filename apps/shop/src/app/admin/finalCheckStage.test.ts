import { describe, expect, it } from "vitest";
import { finalCheckShows } from "./finalCheckStage";

const started = { details: { at: "a" }, plan: "both", welcome: { theme: "x", at: "a" }, shipping: { at: "b", skipped: true } };
const closed = { design: { showUnderConstruction: true } };
const open = { design: { showUnderConstruction: false } };

describe("the final check shows after shipping, until the shop is open (plan 17.13)", () => {
  it("shows for a press that finished shipping and its shop is still private", () => {
    expect(finalCheckShows(started, closed)).toBe(true);
  });
  it("not before shipping, not for an older shop, a stockroom-only plan, or once it is done", () => {
    expect(finalCheckShows({ ...started, shipping: undefined }, closed)).toBe(false);
    expect(finalCheckShows({ welcome: started.welcome, shipping: started.shipping, plan: "both" }, closed)).toBe(false);
    expect(finalCheckShows({ ...started, plan: "stockroom" }, closed)).toBe(false);
    expect(finalCheckShows({ ...started, finalCheck: { at: "c", opened: true } }, closed)).toBe(false);
    expect(finalCheckShows(null, closed)).toBe(false);
  });
  it("is left out when the shop was already opened from the setup guide", () => {
    expect(finalCheckShows(started, open)).toBe(false);
  });
});
