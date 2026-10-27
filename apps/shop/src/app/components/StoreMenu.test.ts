import { describe, expect, it } from "vitest";
import { headerMenuPanelStyle } from "./StoreMenu";

describe("headerMenuPanelStyle", () => {
  it("adds nothing when Studio sets nothing (today's look)", () => {
    expect(headerMenuPanelStyle({})).toEqual({});
    expect(headerMenuPanelStyle(undefined)).toEqual({});
    expect(headerMenuPanelStyle({ headerMenuPanelRadius: "" })).toEqual({});
  });

  it("applies the Studio colours and a clamped corner radius", () => {
    expect(headerMenuPanelStyle({ headerMenuPanelBg: "#111", headerMenuPanelBorderColor: "#fff", headerMenuPanelRadius: 0 }))
      .toEqual({ backgroundColor: "#111", borderColor: "#fff", borderRadius: "0px" });
    expect(headerMenuPanelStyle({ headerMenuPanelRadius: 99 }).borderRadius).toBe("32px");
  });
});
