// Product used per visit (plan 4, 4.5). Run against the shop's copy and the server's.
import { describe, expect, test } from "vitest";
import { createRequire } from "module";
import * as shop from "./bookingTimes";

const server = createRequire(import.meta.url)("../../functions/shared/bookingTimes.js") as typeof shop;

describe.each([["shop", shop], ["server", server]] as const)("product used per visit (%s copy)", (_name, t) => {
  const base = { name: "Colour", minutes: 90, payment: "full", priceMinor: 12_000 };

  test("kept on a priced service, never more than the price", () => {
    expect(t.cleanService({ ...base, costMinor: 1_800 })).toMatchObject({ costMinor: 1_800 });
    expect(t.cleanService({ ...base, costMinor: 12_001 })).toEqual({ problem: "The product used can't cost more than the price." });
    expect(t.cleanService(base)).not.toHaveProperty("costMinor");
    expect(t.cleanService({ ...base, costMinor: -5 })).not.toHaveProperty("costMinor");
  });

  test("a free service has none", () => {
    expect(t.cleanService({ name: "Chat", minutes: 30, payment: "free", costMinor: 500 })).not.toHaveProperty("costMinor");
  });
});
