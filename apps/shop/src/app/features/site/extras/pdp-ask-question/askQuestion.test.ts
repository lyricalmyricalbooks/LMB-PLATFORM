import { describe, expect, it } from "vitest";
import { questionProblem, questionSubject } from "./askQuestion";

describe("ask a question rules", () => {
  it("needs a name, a plain email and a question", () => {
    const ok = { name: "Ana", email: "ana@example.com", message: "Is it signed?" };
    expect(questionProblem(ok)).toBeNull();
    expect(questionProblem({ ...ok, name: "  " })).toBe("name");
    expect(questionProblem({ ...ok, email: "a@b" })).toBe("email");
    expect(questionProblem({ ...ok, email: "a@b.com, c@d.com" })).toBe("email");
    expect(questionProblem({ ...ok, message: "" })).toBe("message");
    expect(questionProblem({ ...ok, message: "x".repeat(5001) })).toBe("message");
  });

  it("names the book and edition in the subject, within the rule's 200 characters", () => {
    expect(questionSubject("Question about {title}", "Night Pages", "Signed")).toBe("Question about Night Pages (Signed)");
    expect(questionSubject("Question about {title}", "Night Pages")).toBe("Question about Night Pages");
    expect(questionSubject("Q: {title}", "x".repeat(400)).length).toBe(200);
  });
});
