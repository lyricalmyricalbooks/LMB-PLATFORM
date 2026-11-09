// Settings › Google (googleHub.ts): each service's card state from the platform's answer, the working count, the extras
// the press changed, and plain words on every card.
import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/firebase", () => ({ auth: { currentUser: null }, db: {} }));
import { readGoogleStatus } from "./googleConnect";
import { EXTRAS, INCLUDED, SERVICE_INFO, extrasChanged, googleServices, googleSummary, serviceBadge } from "./googleHub";

const connected = readGoogleStatus({
  enabled: true, connected: true, accountEmail: "owner@example.com", extrasOffered: ["drive", "youtube", "businessProfile"], extrasChosen: ["drive"],
  steps: [
    { step: "analytics", state: "done", detail: "Visits are counted." },
    { step: "searchConsole", state: "failed", detail: "Google said no." },
    { step: "merchantCenter", state: "done", detail: "" },
    { step: "email", state: "done", detail: "" },
    { step: "domain", state: "waiting", detail: "Waiting for your address." },
    { step: "drive", state: "done", detail: "" },
  ],
});

describe("the service cards", () => {
  it("while Google isn't switched on, every service shows as coming, with all the extras", () => {
    const { included, extras } = googleServices({ enabled: false });
    expect(included.map((s) => s.id)).toEqual(INCLUDED);
    expect(extras.map((s) => s.id)).toEqual(EXTRAS);
    expect([...included, ...extras].every((s) => s.state === "coming" && !s.canRetry)).toBe(true);
  });

  it("before connecting, the included parts are ready and the extras follow the press's ticks", () => {
    const status = readGoogleStatus({ enabled: true, connected: false, extrasOffered: ["drive", "ads"] });
    const { included, extras } = googleServices(status, ["ads"]);
    expect(included.every((s) => s.state === "ready")).toBe(true);
    expect(serviceBadge(included[0]).text).toBe("Ready to link");
    // Only the extras the platform offers are shown.
    expect(extras.map((s) => [s.id, s.picked, serviceBadge(s).text])).toEqual([["drive", false, "Off"], ["ads", true, "On"]]);
  });

  it("once connected, each card takes its part's state and Google's own line", () => {
    const { included, extras } = googleServices(connected);
    const by = Object.fromEntries([...included, ...extras].map((s) => [s.id, s]));
    expect(by.analytics).toMatchObject({ state: "done", detail: "Visits are counted.", canRetry: false });
    expect(by.searchConsole).toMatchObject({ state: "failed", canRetry: true });
    // The web address follows its own page: no Try again here.
    expect(by.domain).toMatchObject({ state: "waiting", canRetry: false });
    expect(by.drive.state).toBe("done");
    expect(by.youtube).toMatchObject({ state: "off", picked: false });
    expect(serviceBadge(by.youtube).text).toBe("Off");
  });

  it("a part Google didn't answer for says it may have been unticked, and an extra ticked but not saved says so", () => {
    const status = readGoogleStatus({ enabled: true, connected: true, extrasOffered: ["drive"], extrasChosen: [], steps: [{ step: "analytics", state: "done", detail: "" }] });
    const { included, extras } = googleServices(status, ["drive"]);
    expect(included.find((s) => s.id === "email")).toMatchObject({ state: "off", detail: expect.stringMatching(/unticked/) });
    expect(serviceBadge(extras[0]).text).toBe("On, not saved");
  });

  it("just after connecting, with no parts back yet, cards say Linking", () => {
    const status = readGoogleStatus({ enabled: true, connected: true, steps: [] });
    expect(googleServices(status).included.every((s) => s.state === "linking")).toBe(true);
  });
});

describe("the page's count and the extras' changes", () => {
  it("counts the included parts and the saved extras", () => {
    const summary = googleSummary(connected, googleServices(connected));
    expect(summary).toMatchObject({ working: 4, total: 6, needsYou: 2 });
    expect(summary.segments.map((s) => s.state)).toEqual(["done", "failed", "done", "done", "waiting", "done"]);
  });
  it("lists what was switched on and off", () => {
    expect(extrasChanged(["drive", "ads"], ["ads", "youtube"])).toEqual({ added: ["youtube"], removed: ["drive"] });
    expect(extrasChanged(["drive"], ["drive"])).toEqual({ added: [], removed: [] });
  });
});

describe("plain words", () => {
  it("never names anything technical, and links only to Google's own pages", () => {
    const words = Object.values(SERVICE_INFO).flatMap((s) => [...s.gives, s.admin?.label ?? ""]).join(" ");
    for (const banned of [/Firebase/, /\bAPI\b/, /OAuth/i, /\bkey\b/i, /\bDNS\b/, /webhook/i, /secret/i, /deploy/i, /token/i, /scope/i]) expect(words).not.toMatch(banned);
    for (const s of Object.values(SERVICE_INFO)) if (s.googleUrl) expect(new URL(s.googleUrl).hostname).toMatch(/(^|\.)google\.com$|^studio\.youtube\.com$/);
  });
});
