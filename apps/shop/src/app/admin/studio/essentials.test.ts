import { describe, expect, it } from "vitest";
import { ESSENTIALS, essentialCopyField, essentialStyleField } from "./essentials";
import { RAIL_TABS, railHome, workspaceGroup } from "./StudioRail";
import { parseUiState } from "./studioUiState";
import { parseStudioLocation } from "../../lib/studioLocation";
import { GO_KEYS } from "./shortcuts";

describe("Studio Essentials (plan 1.27)", () => {
  it("uses only controls that also live in Style or Text & labels", () => {
    for (const step of ESSENTIALS) {
      for (const key of step.style || []) expect(essentialStyleField(key), key).not.toBeNull();
      for (const key of step.copy || []) expect(essentialCopyField(key), key).not.toBeNull();
      expect((step.style?.length || 0) + (step.copy?.length || 0) + (step.open ? 1 : 0), step.id).toBeGreaterThan(0);
    }
  });

  it("stays short: a handful of steps and at most a dozen settings", () => {
    expect(ESSENTIALS.length).toBeLessThanOrEqual(8);
    expect(ESSENTIALS.reduce((n, s) => n + (s.style?.length || 0) + (s.copy?.length || 0), 0)).toBeLessThanOrEqual(12);
    expect(new Set(ESSENTIALS.map((s) => s.id)).size).toBe(ESSENTIALS.length);
  });

  it("opens inside Style, on the rail's four workspaces (Page, Style, Pages, Designs), with Words and Media under More", () => {
    expect(RAIL_TABS.map((t) => t.id)).toEqual(["sections", "style", "pages", "themes", "text", "media"]);
    expect(RAIL_TABS.map((t) => t.short)).toEqual(["Page", "Style", "Pages", "Designs", "Words", "Media"]);
    expect(RAIL_TABS.find((t) => t.id === "text")?.section).toBe("More");
    expect(railHome("essentials")).toBe("style");
    expect(railHome("menus")).toBe("pages");
    expect(workspaceGroup("essentials").map((w) => w.id)).toEqual(["essentials", "style"]);
    expect(workspaceGroup("pages").map((w) => w.id)).toEqual(["pages", "menus"]);
  });

  it("can be remembered, linked to and reached with G then E", () => {
    expect(parseUiState(JSON.stringify({ leftTab: "essentials" })).leftTab).toBe("essentials");
    expect(parseStudioLocation("#designer?tab=essentials")?.leftTab).toBe("essentials");
    expect(GO_KEYS.find((g) => g.key === "e")?.tab).toBe("essentials");
  });
});
