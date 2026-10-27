import { describe, expect, it, vi } from "vitest";
vi.mock("../../lib/firebase", () => ({ db: {} }));
vi.mock("../../lib/firebaseApp", () => ({ app: {}, db: {}, appCheck: null, authState: { loaded: true } }));
vi.mock("../../lib/firestoreLite", () => ({ liteDb: {} }));
import { filterMessages, restoredStatus, type ContactMessage } from "./Messages";

const m = (id: string, status: ContactMessage["status"], extra: Partial<ContactMessage> = {}): ContactMessage =>
  ({ id, name: `N${id}`, email: `${id}@x.com`, message: "hello", status, ...extra });

describe("contact message inbox filters", () => {
  const all = [m("a", "new"), m("b", "emailed"), m("c", "read", { message: "wholesale query" }), m("d", "archived")];
  it("inbox hides archived, unread keeps new + emailed", () => {
    expect(filterMessages(all, "inbox", "").map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(filterMessages(all, "unread", "").map((x) => x.id)).toEqual(["a", "b"]);
    expect(filterMessages(all, "archived", "").map((x) => x.id)).toEqual(["d"]);
  });
  it("searches name, email and text", () => {
    expect(filterMessages(all, "inbox", "WHOLESALE").map((x) => x.id)).toEqual(["c"]);
  });
  it("replied folder lists replied (not archived) messages; archive restores keep replied", () => {
    const list = [m("a", "replied"), m("b", "read", { replies: [{ at: "x", body: "hi" }] }), m("c", "read"), m("d", "archived", { replies: [{ at: "x", body: "y" }] })];
    expect(filterMessages(list, "replied", "").map((x) => x.id)).toEqual(["a", "b"]);
    expect(restoredStatus(list[3])).toBe("replied");
    expect(restoredStatus(list[2])).toBe("read");
  });
});
