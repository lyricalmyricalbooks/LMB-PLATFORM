import { describe, expect, it } from "vitest";
import { MAX_QUOTE_QUANTITY, quoteMessage, quoteProblem, quoteQuantity, quoteSubject } from "./bulkQuote";

const ok = { name: "Ana", email: "ana@shop.example", quantity: "50", note: "For a class." };

describe("bulk quote rules", () => {
  it("needs a name, a plain email and a whole quantity from 1 up", () => {
    expect(quoteProblem(ok)).toBeNull();
    expect(quoteProblem({ ...ok, name: " " })).toBe("name");
    expect(quoteProblem({ ...ok, email: "a@b.com, c@d.com" })).toBe("email");
    for (const bad of ["", "0", "-5", "2.5", "lots", String(MAX_QUOTE_QUANTITY + 1)]) expect(quoteProblem({ ...ok, quantity: bad })).toBe("quantity");
    expect(quoteProblem({ ...ok, note: "x".repeat(3001) })).toBe("note");
  });

  it("reads the quantity as a whole number only", () => {
    expect(quoteQuantity(" 12 ")).toBe(12);
    expect(quoteQuantity("1e3")).toBe(1000);
    expect(quoteQuantity("abc")).toBe(0);
  });

  it("names the book and edition in the subject, within 200 characters", () => {
    expect(quoteSubject("Bulk quote: {title}", "Night Pages", "Signed")).toBe("Bulk quote: Night Pages (Signed)");
    expect(quoteSubject("Q {title}", "x".repeat(400)).length).toBe(200);
  });

  it("puts the quantity first in the message the owner reads", () => {
    expect(quoteMessage(ok, "Night Pages")).toBe("Quantity: 50\nBook: Night Pages\n\nFor a class.");
    expect(quoteMessage({ ...ok, note: "" }, "Night Pages")).toBe("Quantity: 50\nBook: Night Pages");
  });
});
