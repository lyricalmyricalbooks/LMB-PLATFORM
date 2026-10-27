// @vitest-environment jsdom
// Sale countdown (Studio › Style › Book page · photos & layout › showPdpSaleCountdown): off by default, so the
// line keeps saying "Sale ends {date}"; on, the sale's last hours count down and the line goes once it has ended.
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import SaleEndsLine from "./SaleEndsLine";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const STOP = Date.parse("2026-11-01T04:00:00Z"); // end of 2026-10-31 in Toronto

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

async function show(look: any, nowMs: number) {
  vi.setSystemTime(nowMs);
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root: Root = createRoot(el);
  await act(async () => { root.render(h(SaleEndsLine, { endDate: "2026-10-31", design: {}, look })); });
  return { el, root, done: async () => { await act(async () => root.unmount()); el.remove(); } };
}

it("is off by default: the plain end date", async () => {
  const { el, done } = await show({}, STOP - 3_600_000);
  expect(el.textContent).toMatch(/^Sale ends (?!in)/);
  await done();
});

it("counts down in the last hours and ticks", async () => {
  const { el, done } = await show({ showPdpSaleCountdown: true }, STOP - (5 * 3_600_000 + 12 * 60_000));
  expect(el.textContent).toBe("Sale ends in 5h 12m");
  await act(async () => { vi.advanceTimersByTime(5 * 3_600_000); });
  expect(el.textContent).toBe("Sale ends in 12 min");
  await act(async () => { vi.advanceTimersByTime(13 * 60_000); });
  expect(el.textContent).toBe("");
  await done();
});

it("keeps the date until the chosen window", async () => {
  const far = await show({ showPdpSaleCountdown: true }, STOP - 80 * 3_600_000);
  expect(far.el.textContent).toMatch(/^Sale ends (?!in)/);
  await far.done();
  const wide = await show({ showPdpSaleCountdown: true, pdpSaleCountdownWithin: 96 }, STOP - 80 * 3_600_000);
  expect(wide.el.textContent).toBe("Sale ends in 3d 8h");
  await wide.done();
});
