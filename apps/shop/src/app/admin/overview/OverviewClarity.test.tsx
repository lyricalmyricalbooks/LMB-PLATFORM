import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const fs = vi.hoisted(() => ({ setDoc: vi.fn(async () => {}), getDoc: vi.fn(), doc: vi.fn((_db: unknown, ...path: string[]) => path.join("/")) }));
vi.mock("firebase/firestore", () => fs);
vi.mock("../../../lib/firebase", () => ({ db: {}, auth: { currentUser: null }, storage: {}, googleProvider: {} }));
vi.mock("./overviewVisitors.css", () => ({}));

import { OverviewClarity } from "./OverviewClarity";
import { clarityApi, clarityIdOf } from "../clarityAdmin";

describe("Overview › Microsoft Clarity widget", () => {
  it("links to the project's dashboard, heatmaps and recordings when connected", () => {
    const html = renderToStaticMarkup(<OverviewClarity settings={{ analytics: { clarityProjectId: "abc12def34" } }} />);
    expect(html).toContain("Heatmaps and recordings live in Microsoft Clarity");
    expect(html).toContain("https://clarity.microsoft.com/projects/view/abc12def34/dashboard");
    expect(html).toContain("https://clarity.microsoft.com/projects/view/abc12def34/heatmaps");
    expect(html).toContain("https://clarity.microsoft.com/projects/view/abc12def34/impressions");
    expect(html).toContain('rel="noopener noreferrer"');
  });
  it("says it isn't connected, with a way to Settings › General", () => {
    const html = renderToStaticMarkup(<OverviewClarity settings={{ analytics: { ga4MeasurementId: "G-ABC123" } }} setActiveTab={() => {}} />);
    expect(html).toContain("isn&#x27;t connected");
    expect(html).toContain("Open Clarity settings");
  });
  it("waits for settings and says when they can't be read", () => {
    expect(renderToStaticMarkup(<OverviewClarity settings={undefined} />)).toContain("Reading settings");
    expect(renderToStaticMarkup(<OverviewClarity settings={null} />)).toContain("Settings unavailable");
  });
});

describe("clarityAdmin", () => {
  it("reads only a valid project ID", () => {
    expect(clarityIdOf({ analytics: { clarityProjectId: " ABC12DEF34 " } })).toBe("abc12def34");
    expect(clarityIdOf({ analytics: { clarityProjectId: "<bad>" } })).toBe("");
    expect(clarityIdOf(null)).toBe("");
  });
  it("writes only analytics.clarityProjectId, leaving the Google Analytics ID alone", async () => {
    await clarityApi.save(" https://clarity.microsoft.com/projects/view/abc12def34/dashboard ");
    expect(fs.setDoc).toHaveBeenCalledWith("settings/website", { analytics: { clarityProjectId: "abc12def34" } }, { mergeFields: ["analytics.clarityProjectId"] });
  });
});
