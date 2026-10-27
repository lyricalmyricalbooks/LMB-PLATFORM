import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { fillSample, insertAt, PLACEHOLDERS, REQUIRED_PLACEHOLDERS, templateProblems, withRequiredPlaceholders } from "./emailTemplateChecks";

const server = createRequire(import.meta.url)("../../../functions/emailOutbox.js");

describe("Notifications template checks", () => {
  it("keeps the required gift-card line identical to the server's", () => {
    expect(REQUIRED_PLACEHOLDERS).toEqual(server.REQUIRED_PLACEHOLDERS);
    for (const body of ["Enjoy!", "Code: {{ code }}", ""]) {
      expect(withRequiredPlaceholders("gift_card", body)).toBe(server.withRequiredPlaceholders("gift_card", body));
    }
  });

  it("previews with sample values and blanks placeholders the email doesn't know", () => {
    expect(fillSample("order_confirmation", "Hi {{customer_name}}, order {{ order_id }} {{tracking_number}}")).toBe("Hi Julianne Smith, order LM-98241 ");
    expect(fillSample("gift_card", "{{code}}")).toBe("ABCD-EFGH-JKMN-PQRS");
  });

  it("flags typos, empty fields and a dropped gift-card code", () => {
    const fields = { subject: "Order {{order_number}}", body: "Hi {{customer_name}}", buttonText: "", signoff: "" };
    const problems = templateProblems("order_confirmation", fields);
    expect(problems[0].text).toContain("{{order_number}}");
    expect(templateProblems("order_confirmation", { ...fields, subject: "" }).some(p => p.tone === "danger")).toBe(true);
    expect(templateProblems("gift_card", { subject: "Gift", body: "Enjoy", buttonText: "", signoff: "" }).map(p => p.text).join(" ")).toContain("{{code}} is missing");
    expect(templateProblems("order_cancelled", { subject: "Cancelled {{order_id}}", body: "Hi {{customer_name}}", buttonText: "", signoff: "" })).toEqual([]);
  });

  it("warns when the order table is placed outside the body", () => {
    const problems = templateProblems("order_confirmation", { subject: "Order {{items_table}}", body: "Hi", buttonText: "", signoff: "" });
    expect(problems.map(p => p.text).join(" ")).toContain("only works in the body");
  });

  it("lists placeholders for every email", () => {
    expect(Object.keys(PLACEHOLDERS)).toHaveLength(11);
  });

  it("inserts a placeholder at the caret, replacing a selection", () => {
    expect(insertAt("Hello there", "{{customer_name}}", 6, 11)).toEqual({ value: "Hello {{customer_name}}", caret: 23 });
    expect(insertAt("Hi", "{{x}}", null, null)).toEqual({ value: "Hi {{x}}", caret: 8 });
    expect(insertAt("", "{{x}}", 0, 0)).toEqual({ value: "{{x}}", caret: 5 });
  });
});
