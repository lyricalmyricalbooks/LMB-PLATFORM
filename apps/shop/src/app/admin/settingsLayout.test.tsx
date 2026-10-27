// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SettingsAnchor, SettingsGroup, SettingsTabs, friendlyError } from "./settingsLayout";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });

it("shows one topic per sub tab, keeps the others mounted and marks unsaved ones", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  window.location.hash = "#settings/general";
  function Page() {
    const [view, setView] = React.useState("g1");
    return <>
      <SettingsTabs label="General settings" value={view} onChange={setView}
        tabs={[{ id: "g1", title: "Shop status" }, { id: "g2", title: "Shop details", unsaved: true }]} />
      <SettingsGroup id="g1" active={view === "g1"}><p>Status card</p></SettingsGroup>
      <SettingsGroup id="g2" active={view === "g2"}><SettingsAnchor id="c1"><input aria-label="Name" defaultValue="" /></SettingsAnchor></SettingsGroup>
    </>;
  }
  await act(async () => root.render(<Page />));
  const panels = () => Array.from(container.querySelectorAll<HTMLElement>("[role=tabpanel]"));
  expect(panels().map((p) => p.hidden)).toEqual([false, true]);
  expect(container.textContent).toContain("(unsaved changes)");
  const name = container.querySelector<HTMLInputElement>("input")!;
  name.value = "Lyricalmyrical";
  const details = Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.startsWith("Shop details"))!;
  await act(async () => details.click());
  expect(panels().map((p) => p.hidden)).toEqual([true, false]);
  expect(panels()[1].getAttribute("aria-labelledby")).toBe(details.id);
  await act(async () => (Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Shop status") as HTMLButtonElement).click());
  // The hidden topic kept what was typed in it.
  expect(container.querySelector<HTMLInputElement>("input")!.value).toBe("Lyricalmyrical");
  expect(window.location.hash).toBe("#settings/general");
  await act(async () => root.unmount());
});

it("turns provider errors into plain sentences and keeps the shop's own words", () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  expect(friendlyError(new Error("Shippo refused this key"), "save the Shippo API key")).toBe("Couldn't save the Shippo API key. Shippo refused this key.");
  expect(friendlyError({ code: "permission-denied", message: "Missing or insufficient permissions." }, "remove the key")).toMatch(/^Couldn't remove the key\. The shop didn't allow that/);
  expect(friendlyError(new Error("FirebaseError: [code=internal] at x.js:1:2"), "make the export")).toBe("Couldn't make the export. Something went wrong. Try again in a moment.");
});

it("Settings pages never show a raw error message", () => {
  const files = ["ShopSettings.tsx", "TaxesSettings.tsx", "AddressFinderCard.tsx", "AiWriterCard.tsx", "BackupsExportCard.tsx", "ClarityCard.tsx", "GoogleAnalyticsCard.tsx",
    "OwnVisitsCard.tsx", "PrivacyRequestsCard.tsx", "RedirectsCard.tsx", "SearchConsoleCard.tsx", "StripeWebhookHealth.tsx", "LocalFulfillmentSettings.tsx"];
  for (const f of files) {
    const src = readFileSync(resolve(process.cwd(), "src/app/admin", f), "utf8");
    expect(src, f).not.toMatch(/(err|error)\??\.message/);
  }
});
