import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Settings pages read like the Masthead: a heading and at most one short line, never a paragraph (owner, 22 October 2026).
const FILES = ["ShopSettings", "NotificationEditor", "TaxesSettings", "LocalFulfillmentSettings", "OwnVisitsCard", "GoogleAnalyticsCard",
  "ClarityCard", "SearchConsoleCard", "RedirectsCard", "AiWriterCard", "PrivacyRequestsCard", "BackupsExportCard", "GmailSendingCard", "AddressFinderCard"];
const MAX = 70;

describe("Settings card wording", () => {
  for (const f of FILES) {
    it(`${f}: card descriptions are one short line`, () => {
      const src = readFileSync(resolve(__dirname, `${f}.tsx`), "utf8");
      const long = [...src.matchAll(/<SectionCard\b[^>]*?\bdescription="([^"]*)"/gs)].map((m) => m[1]).filter((d) => d.length > MAX);
      expect(long).toEqual([]);
      expect(src).not.toMatch(/<SettingsGroup[^>]*subcopy=/);
      expect(src).not.toMatch(/className="rp-kicker"/);
    });
  }
  it("settings pages draw cards, buttons and figures exactly like Inventory (no Settings-only restyle)", () => {
    const src = readFileSync(resolve(__dirname, "ShopSettings.tsx"), "utf8");
    expect(src).toContain('className="rp-settings ');
    expect(src).not.toContain("max-w-5xl");
    expect(src).not.toContain("rp-wb-strip");
    const css = readFileSync(resolve(__dirname, "riso/riso.css"), "utf8");
    expect(css).not.toMatch(/\.rp-settings \.rp-(card|btn|btn-secondary|metric|kpi-grid|card-title|card-body) \{/);
  });
});
