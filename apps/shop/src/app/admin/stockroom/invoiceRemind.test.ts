import { describe, expect, it } from "vitest";
import { invoiceReminderState } from "@stockroom/payment-reminders.js";
import { logReminder, promiseUntil, reminderMail, remindQuestion, remindRefusal } from "./invoiceRemind";

const inv = () => ({ id: "i1", num: "INV-1", status: "sent", storeName: "Corner Books", storeEmail: "corner@example.com", total: 48, date: "2026-10-01", dueDate: "2026-10-31" });

describe("invoice reminders (old chaseInvoiceNow / snoozeInvoiceFromView)", () => {
  it("refuses what the old app refused", () => {
    expect(remindRefusal({ ...inv(), status: "paid" })).toMatch(/already paid/);
    expect(remindRefusal({ ...inv(), status: "draft" })).toMatch(/hasn't been sent/);
    expect(remindRefusal({ ...inv(), storeEmail: "" })).toMatch(/No email/);
    expect(remindRefusal(inv())).toBeNull();
  });
  it("asks with how late it is and words the old email", () => {
    expect(remindQuestion(inv(), "2026-11-11")).toBe("11 days past due. Email corner@example.com a reminder about INV-1?");
    const m = reminderMail(inv(), { name: "Test Press" }, "CAD");
    expect(m.subject).toMatch(/^Reminder: invoice INV-1 — /);
    expect(m.text).toMatch(/^Hi Corner Books,/);
    expect(m.text).toMatch(/Thank you,\nTest Press$/);
  });
  it("logs tries like the old app, and only sent ones count", () => {
    const s = { invoices: [inv()] } as Record<string, any>;
    logReminder("i1", { at: 1, to: "corner@example.com", status: "failed", error: "x" })(s);
    logReminder("i1", { at: 2, to: "corner@example.com", status: "sent" })(s);
    expect(invoiceReminderState(s.invoices[0])).toMatchObject({ count: 1, lastAt: 2, lastKind: "manual", lastStatus: "sent" });
    promiseUntil("i1", "2026-11-20")(s);
    expect(invoiceReminderState(s.invoices[0]).snoozedUntil).toBe("2026-11-20");
    expect(() => promiseUntil("i1", "soon")(s)).toThrow();
  });
});
