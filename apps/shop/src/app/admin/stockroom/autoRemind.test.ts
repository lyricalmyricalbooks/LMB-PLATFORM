import { describe, expect, it } from "vitest";
import { dueForReminder, reminderBlockReason } from "@stockroom/payment-reminders.js";
import { awaitingReminder, sweepReminders } from "./autoRemind";
import { reminderChange } from "./RemindersDialog";

const inv = (id: string, dueDate: string, extra: Record<string, unknown> = {}) => ({ id, num: `INV-${id}`, status: "sent", dueDate, storeEmail: "shop@example.com", total: 40, ...extra });
const records = (invoices: Record<string, unknown>[]) => ({ books: [{ id: "b1", title: "Moths", currency: "CAD" }, { id: "t", title: "Test", isTest: true }],
  states: { b1: { invoices }, t: { invoices: [inv("x", "2026-01-01")] } }, taxCenter: null }) as never;
const settings = { remindAuto: true, remindDays: "7", name: "Moth Press" };
const tuesday10am = new Date(2026, 10, 10, 10, 0);

function fakeDeps(state: { invoices: any[] }, failSend = false) {
  const sent: string[] = [];
  return { sent, deps: {
    save: async (_b: string, step: (s: any) => any) => { try { step(state); return { status: "saved" }; } catch { return { status: "failed" }; } },
    send: async (m: { to: string }) => { if (failSend) throw new Error("refused"); sent.push(m.to); },
    now: () => tuesday10am, sentToday: () => 0, countSent: () => undefined,
  } };
}

describe("automatic reminders", () => {
  it("picks the same invoices as the old stockroom, skipping test items", () => {
    const list = [inv("1", "2026-10-01"), inv("2", "2026-11-08"), inv("3", "2026-09-01", { status: "paid" })];
    const picked = awaitingReminder(records(list), settings, "2026-11-10").map((r) => r.inv.id);
    expect(picked).toEqual(dueForReminder(list, { today: "2026-11-10", days: 7, max: 0 }).map((i) => i.id));
    expect(picked).toEqual(["1"]);
  });

  it("sends once, logs it as sent, and never chases the same invoice twice", async () => {
    const state = { invoices: [inv("1", "2026-10-01")] };
    const { sent, deps } = fakeDeps(state);
    const said = await sweepReminders(records(state.invoices), settings, "2026-11-10", deps);
    expect(sent).toEqual(["shop@example.com"]);
    expect(state.invoices[0].reminders).toMatchObject([{ kind: "auto", status: "sent" }]);
    expect(said?.title).toBe("1 reminder sent");
    expect(awaitingReminder(records(state.invoices), settings, "2026-11-10")).toHaveLength(0);
  });

  it("logs a failed send and waits before trying again", async () => {
    const state = { invoices: [inv("1", "2026-10-01")] };
    const { deps } = fakeDeps(state, true);
    await sweepReminders(records(state.invoices), settings, "2026-11-10", deps);
    expect(state.invoices[0].reminders[0].status).toBe("failed");
    expect(reminderBlockReason(state.invoices[0], { today: "2026-11-10", days: 7, now: tuesday10am.getTime() + 3600_000 })).toBe("recent-attempt");
  });

  it("does nothing when off, on a weekend or at night", async () => {
    const state = { invoices: [inv("1", "2026-10-01")] };
    const { sent, deps } = fakeDeps(state);
    expect(await sweepReminders(records(state.invoices), { ...settings, remindAuto: false }, "2026-11-10", deps)).toBeNull();
    expect(await sweepReminders(records(state.invoices), settings, "2026-11-10", { ...deps, now: () => new Date(2026, 10, 8, 10) })).toBeNull();
    expect(await sweepReminders(records(state.invoices), settings, "2026-11-10", { ...deps, now: () => new Date(2026, 10, 10, 22) })).toBeNull();
    expect(sent).toEqual([]);
  });

  it("saves only the reminder fields, keeping the invoice details", () => {
    expect(reminderChange({ auto: true, days: 10, message: " Hi " })({ name: "Moth Press", bank: "123" }))
      .toEqual({ name: "Moth Press", bank: "123", remindAuto: true, remindDays: "10", remindMsg: "Hi" });
  });
});
