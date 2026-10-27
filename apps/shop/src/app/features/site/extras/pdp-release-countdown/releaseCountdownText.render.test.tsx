// @vitest-environment jsdom
// Release countdown (Studio › Style › Book page · photos & layout › showPdpReleaseCountdown): off by default, so the
// pre-order line keeps its usual words; on, the last hours before release day count down, then the usual words return.
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ReleaseCountdownText from "./ReleaseCountdownText";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const START = Date.parse("2026-11-03T05:00:00Z"); // release day 2026-11-03 in Toronto
const FALLBACK = "Pre-order · ships November 3, 2026";

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

async function show(look: any, nowMs: number) {
  vi.setSystemTime(nowMs);
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root: Root = createRoot(el);
  await act(async () => { root.render(h(ReleaseCountdownText, { releaseDate: "2026-11-03", fallback: FALLBACK, design: {}, look })); });
  return { el, done: async () => { await act(async () => root.unmount()); el.remove(); } };
}

it("is off by default: the usual pre-order words", async () => {
  const { el, done } = await show({}, START - 3_600_000);
  expect(el.textContent).toBe(FALLBACK);
  await done();
});

it("counts down in the last hours and ticks", async () => {
  const { el, done } = await show({ showPdpReleaseCountdown: true }, START - (5 * 3_600_000 + 12 * 60_000));
  expect(el.textContent).toBe("Pre-order · out in 5h 12m");
  await act(async () => { vi.advanceTimersByTime(60_000); });
  expect(el.textContent).toBe("Pre-order · out in 5h 11m");
  await done();
});

it("waits for the window the owner chose", async () => {
  const far = await show({ showPdpReleaseCountdown: true }, START - 80 * 3_600_000);
  expect(far.el.textContent).toBe(FALLBACK);
  await far.done();
  const wide = await show({ showPdpReleaseCountdown: true, pdpReleaseCountdownWithin: 96 }, START - 80 * 3_600_000);
  expect(wide.el.textContent).toBe("Pre-order · out in 3d 8h");
  await wide.done();
});
