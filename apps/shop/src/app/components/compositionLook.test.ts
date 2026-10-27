import { describe, expect, it } from "vitest";
import { compositionLook } from "./SectionComponents";

describe("compositionLook (Flexible composition blocks, 3.0 phase 3)", () => {
  it("adds nothing when unset or at the defaults", () => {
    expect(compositionLook(undefined)).toEqual({});
    expect(compositionLook({ rotate: 0, scale: 100, opacity: 100 })).toEqual({});
  });
  it("turns rotate, size and see-through into CSS, kept in range", () => {
    expect(compositionLook({ rotate: 10, scale: 120, opacity: 60 })).toEqual({ transform: "rotate(10deg) scale(1.2)", opacity: 0.6 });
    expect(compositionLook({ rotate: 400, scale: 5, opacity: 0 })).toEqual({ transform: "rotate(45deg) scale(0.5)", opacity: 0.1 });
  });
});
