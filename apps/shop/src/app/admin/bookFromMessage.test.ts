import { describe, expect, test } from "vitest";
import { canBookFrom, noteFromMessage, serviceFromText } from "./bookFromMessage";

const SERVICES = [{ id: "cut", name: "Cut" }, { id: "cc", name: "Cut and colour" }, { id: "mass", name: "Massage, 60 min" }, { id: "x", name: "Go" }];

describe("book from a message (plan 4, 3.6)", () => {
  test("picks the service the message names, the longest name first", () => {
    expect(serviceFromText("Hi! Could I get a cut and colour next week?", SERVICES)).toBe("cc");
    expect(serviceFromText("Just a CUT please", SERVICES)).toBe("cut");
    expect(serviceFromText("Do you have a massage 60 min on Friday?", SERVICES)).toBe("mass");
    expect(serviceFromText("Cutting it close", SERVICES)).toBe("");
    // Names under three letters are too likely to match by chance.
    expect(serviceFromText("go go go", SERVICES)).toBe("");
  });

  test("the note quotes the subject, else the first line, kept short", () => {
    expect(noteFromMessage({ subject: "Booking for Friday", message: "Hello" })).toBe("From their message: Booking for Friday");
    expect(noteFromMessage({ message: "\n  First line \nSecond" })).toBe("From their message: First line");
    expect(noteFromMessage({ message: "x".repeat(200) })).toHaveLength("From their message: ".length + 120);
    expect(noteFromMessage({})).toBe("");
  });

  test("a message needs a real address to book from", () => {
    expect(canBookFrom({ email: "ada@example.com" })).toBe(true);
    expect(canBookFrom({ email: "ada" })).toBe(false);
  });
});
