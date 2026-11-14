import { describe, expect, it } from "vitest";
import { articlesFor } from "@help/articles.js";
import { answersForPage, askWith, relatedTo, type HelpEntry } from "./helpAnswers";

const list = articlesFor("both", "books") as HelpEntry[];

describe("Help extras", () => {
  it("finds answers about the page the owner came from", () => {
    const ship = answersForPage(list, "settings/shipping", { combined: true });
    expect(ship.length).toBeGreaterThan(0);
    expect(ship.every((a) => (a.where || []).some((p) => /shipping/i.test(p)))).toBe(true);
    expect(answersForPage(list, "help", { combined: true })).toEqual([]);
    expect(answersForPage(list, null, { combined: true })).toEqual([]);
  });
  it("related answers share the topic and leave out the answer itself", () => {
    const first = list[0];
    const rel = relatedTo(list, first);
    expect(rel.some((a) => a.id === first.id)).toBe(false);
    expect(rel.every((a) => a.topic === first.topic)).toBe(true);
  });
  it("Ask a person carries the question, cut to the subject's length", () => {
    const url = askWith("https://p.example/account/#get-help", "How do I refund?");
    expect(url).toBe("https://p.example/account/?subject=How+do+I+refund%3F#get-help");
    expect(askWith("https://p.example/account/#get-help", "  ")).toBe("https://p.example/account/#get-help");
    expect(new URL(askWith("https://p.example/a/", "x".repeat(300))).searchParams.get("subject")).toHaveLength(150);
  });
});
