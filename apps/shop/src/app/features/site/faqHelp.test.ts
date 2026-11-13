import { describe, expect, it } from "vitest";
import { faqAnchors, faqJsonLd, filterFaq, groupFaq, safeJson } from "./faqHelp";

const items = [
  { question: "Do you ship to Québec?", answer: "Yes, across Canada.", group: "Shipping" },
  { question: "Can I return a book?", answer: "Within 30 days.", group: "Returns" },
  { question: "Are signed copies available?", answer: "Some editions are signed." },
  { question: "How long is delivery?", answer: "3 to 7 business days.", group: "Shipping" },
];

describe("filterFaq", () => {
  it("keeps everything for an empty search", () => {
    expect(filterFaq(items, "  ")).toHaveLength(4);
  });
  it("needs every word, in any order, ignoring accents and case", () => {
    expect(filterFaq(items, "quebec SHIP").map((i) => i.question)).toEqual(["Do you ship to Québec?"]);
    expect(filterFaq(items, "days").map((i) => i.question)).toEqual(["Can I return a book?", "How long is delivery?"]);
  });
  it("searches the topic too", () => {
    expect(filterFaq(items, "returns")).toHaveLength(1);
  });
});

describe("groupFaq", () => {
  it("keeps topics in first-seen order with untopicked questions first", () => {
    expect(groupFaq(items).map((g) => [g.group, g.items.length])).toEqual([["", 1], ["Shipping", 2], ["Returns", 1]]);
  });
});

describe("faqAnchors", () => {
  it("makes readable, unique addresses", () => {
    expect(faqAnchors([{ question: "Do you ship to Québec?" }, { question: "Do you ship to Québec?" }, { question: "" }]))
      .toEqual(["faq-do-you-ship-to-quebec", "faq-do-you-ship-to-quebec-2", "faq-question"]);
  });
});

describe("faqJsonLd", () => {
  it("lists only complete questions", () => {
    const ld = faqJsonLd([...items, { question: "Half?", answer: " " }]) as any;
    expect(ld["@type"]).toBe("FAQPage");
    expect(ld.mainEntity).toHaveLength(4);
    expect(ld.mainEntity[0]).toEqual({ "@type": "Question", name: "Do you ship to Québec?", acceptedAnswer: { "@type": "Answer", text: "Yes, across Canada." } });
  });
  it("is null with nothing to list", () => {
    expect(faqJsonLd([{ question: "Q" }])).toBeNull();
  });
  it("can't close its own script tag", () => {
    expect(safeJson({ a: "</script><script>x" })).not.toContain("</script>");
  });
});
