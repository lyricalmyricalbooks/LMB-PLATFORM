import { describe, expect, it } from "vitest";
import { toastPosition, toastStyle } from "./toastStyle";

describe("pop-up message style", () => {
  it("looks exactly as before when nothing is set", () => {
    expect(toastPosition({})).toBe("top-center");
    expect(toastStyle({})).toEqual({
      background: "var(--surface-2, #171717)",
      color: "var(--text-color, #fff)",
      fontSize: "12px",
      letterSpacing: "0.05em",
      borderRadius: "8px",
      maxWidth: "350px",
      zIndex: 99999,
    });
  });

  it("follows the Studio controls", () => {
    const d = { toastPosition: "bottom-right", toastBg: "#ff0", toastTextColor: "#000", toastFontSize: 15, toastTracking: 0, toastRadius: 0, toastBorderWidth: 2, toastBorderColor: "#f00", toastMaxWidth: 480 };
    expect(toastPosition(d)).toBe("bottom-right");
    expect(toastStyle(d)).toMatchObject({ background: "#ff0", color: "#000", fontSize: "15px", letterSpacing: "0em", borderRadius: "0px", border: "2px solid #f00", maxWidth: "480px" });
  });

  it("ignores an unknown position", () => {
    expect(toastPosition({ toastPosition: "middle" })).toBe("top-center");
  });
});
