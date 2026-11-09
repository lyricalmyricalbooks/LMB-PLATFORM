// Code plan 17.15: every stage of the Get started run (startRun.ts `RunStep`) has a screen, and that screen passes the
// press-facing checks. Words: platformPlainWords.test.ts reads every file in the admin, so a stage screen is read by
// it as long as it is a plain file here (checked below). Help: help/help.test.js checks each stage's answer. Phone
// width: a static check of the screen's own code, the same kind as plain-words/phone.test.js. It reads the literal
// numbers in each screen's styles: no fixed width over a 360px phone (less the 16px sides), unless the screen puts that
// box in one that scrolls sideways. It does not render the screen, so the browser check for admin screens (code plan
// 13.9) is still to come.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ADMIN = __dirname;
const PHONE_CONTENT_WIDTH = 328;

// Each stage's screen, as the Overview draws it (overview/SetupStart.tsx).
const STAGE_SCREENS: Record<string, string> = {
  details: "overview/PressDetailsStage.tsx",
  bring: "overview/BringShopStage.tsx",
  look: "overview/ChooseLookWelcome.tsx",
  google: "overview/GoogleStage.tsx",
  payments: "overview/PaymentsStage.tsx",
  shipping: "overview/ShippingStage.tsx",
  final: "overview/FinalCheckStage.tsx",
};

const runStages = (): string[] => {
  const source = readFileSync(join(ADMIN, "startRun.ts"), "utf8");
  const union = source.match(/export type RunStep = ([^;]+);/)?.[1] ?? "";
  return [...union.matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
};

describe("Get started stages (plan 17.15)", () => {
  it("every stage of the run has a screen, and the screen is a plain admin file the words check reads", () => {
    expect(runStages().sort()).toEqual(Object.keys(STAGE_SCREENS).sort());
    for (const [stage, path] of Object.entries(STAGE_SCREENS)) {
      expect(path, stage).not.toMatch(/\.test\.|\/fixture\/|\.d\.ts$/);
      expect(() => readFileSync(join(ADMIN, path), "utf8"), stage).not.toThrow();
    }
  });

  it("no stage screen fixes a width wider than a phone, unless the box scrolls sideways", () => {
    const wide: string[] = [];
    for (const [stage, path] of Object.entries(STAGE_SCREENS)) {
      const source = readFileSync(join(ADMIN, path), "utf8");
      const scrolls = /overflowX:\s*"auto"/.test(source);
      for (const m of source.matchAll(/\b(min)?[wW]idth:\s*(\d+)\b/g)) {
        if (Number(m[2]) > PHONE_CONTENT_WIDTH && !scrolls) wide.push(`${stage}: ${m[0]}`);
      }
    }
    expect(wide, "a fixed width over 328px would push a 360px phone sideways").toEqual([]);
  });

  it("any table in a stage screen sits in a box that scrolls sideways, so it never pushes the page", () => {
    for (const [stage, path] of Object.entries(STAGE_SCREENS)) {
      const source = readFileSync(join(ADMIN, path), "utf8");
      if (/<table\b/.test(source)) expect(source, stage).toMatch(/overflowX:\s*"auto"/);
    }
  });
});
