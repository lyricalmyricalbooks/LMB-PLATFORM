import { describe, expect, it } from "vitest";
import { commit, initHistory, jumpBy } from "./studioModel";
import { setupChecklist, setupProgress } from "./setupChecklist";

describe("jumpBy (Workbench › Changes)", () => {
  const h = [1, 2, 3].reduce((acc, n) => commit(acc, n, { label: `Step ${n}`, now: n * 5000 }), initHistory(0));
  it("goes back several steps at once, keeping the labels for Redo", () => {
    const back = jumpBy(h, -2);
    expect(back.present).toBe(1);
    expect(back.pastLabels).toEqual(["Step 1"]);
    expect(back.futureLabels).toEqual(["Step 2", "Step 3"]);
    expect(jumpBy(back, 2).present).toBe(3);
  });
  it("stops at either end and does nothing for zero", () => {
    expect(jumpBy(h, -10).present).toBe(0);
    expect(jumpBy(h, 4).present).toBe(3);
    expect(jumpBy(h, 0)).toBe(h);
  });
});

describe("setupChecklist (Workbench › Setup)", () => {
  const defaults = { primaryColor: "#f00", headingFont: "Anton", bodyFont: "Archivo" };
  it("starts mostly open for a fresh design", () => {
    const items = setupChecklist({ design: { ...defaults }, defaults, policies: {} });
    expect(setupProgress(items).done).toBe(0);
    expect(items.find(x => x.id === "policies")?.go).toBeUndefined();
    expect(items.find(x => x.id === "logo")?.go).toEqual({ kind: "target", target: "style:logo" });
  });
  it("ticks items from the design, the shop policies and the session", () => {
    const design = {
      ...defaults, primaryColor: "#0af", headingFont: "Lora", logoUrl: "https://x/logo.png", shareImageUrl: "https://x/s.png",
      copy: { siteDefaultTitle: "Books", siteDefaultDescription: "We print books." },
      heroPage: { sections: [{ id: "a" }, { id: "b" }, { id: "c", enabled: false }] },
    };
    const items = setupChecklist({ design, defaults, published: design, phoneChecked: true, healthIssues: 0,
      policies: { shipping: "a", returns: "b", privacy: "c", terms: "d" } });
    expect(setupProgress(items)).toEqual({ done: items.length, total: items.length });
  });
  it("Home counts only shown sections, and is done when Home is off", () => {
    const one = { heroPage: { sections: [{ id: "a" }, { id: "b", enabled: false }] } };
    expect(setupChecklist({ design: one }).find(x => x.id === "home")?.done).toBe(false);
    expect(setupChecklist({ design: { ...one, showHero: false } }).find(x => x.id === "home")?.done).toBe(true);
  });
  it("Health is done only after a run with nothing to fix", () => {
    const at = (healthIssues: number | null) => setupChecklist({ design: {}, healthIssues }).find(x => x.id === "health")?.done;
    expect(at(null)).toBe(false); expect(at(2)).toBe(false); expect(at(0)).toBe(true);
  });
  it("Health also counts as done after a whole-shop check with nothing to fix", () => {
    const at = (siteIssues: number | null, healthIssues: number | null = 3) => setupChecklist({ design: {}, healthIssues, siteIssues }).find(x => x.id === "health")?.done;
    expect(at(0)).toBe(true); expect(at(4)).toBe(false); expect(at(null)).toBe(false);
  });
});

describe("setup checklist › brand kit", () => {
  it("leads with the brand kit, done once logo, colours and fonts are all done", async () => {
    const { setupChecklist } = await import("./setupChecklist");
    const first = setupChecklist({ design: {} })[0];
    expect(first).toMatchObject({ id: "brand", done: false, go: { kind: "brand" } });
    const branded = setupChecklist({ design: { logoUrl: "https://x.test/l.png", primaryColor: "#e8402a", headingFont: "Anton" }, defaults: { primaryColor: "#000000" } });
    expect(branded[0].done).toBe(true);
    expect(setupChecklist({ design: { logoUrl: "https://x.test/l.png" } })[0].done).toBe(false);
    // Bold uses the default fonts, so the brand item is done by the kit's own Brand colour scheme.
    expect(setupChecklist({ design: { colorSchemes: [{ id: "brand-accent" }] } })[0].done).toBe(true);
  });
});
