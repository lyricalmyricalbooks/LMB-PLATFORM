// Help centre (gap list 29): the FAQ section groups questions by topic, gives each an address, offers search and a
// contact link when set, and tells search engines about the questions without letting an answer break out of the script.
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

const { StaticRouter } = await import("react-router");
const { FAQSection } = await import("./SectionComponents");

const render = (settings: Record<string, unknown>) =>
  renderToStaticMarkup(h(StaticRouter, { location: "/page/faq" }, h(FAQSection, { settings, enableAnimations: false })));

const items = [
  { question: "How long is delivery?", answer: "3 to 7 days.", group: "Shipping" },
  { question: "Can I return a book?", answer: "Yes </script><b>x</b>", group: "Returns" },
];

describe("FAQ section as a help centre", () => {
  it("draws topics and a stable address per question", () => {
    const html = render({ title: "Help", items });
    expect(html).toContain(">Shipping</h3>");
    expect(html).toContain(">Returns</h3>");
    expect(html).toContain('id="faq-how-long-is-delivery"');
  });
  it("shows the search box and contact link only when set", () => {
    expect(render({ items })).not.toContain('type="search"');
    expect(render({ items })).not.toContain("Still need help");
    const html = render({ items, showSearch: true, contactUrl: "/page/contact" });
    expect(html).toContain('type="search"');
    expect(html).toContain('placeholder="Search questions"');
    expect(html).toContain("Still need help? Contact us");
  });
  it("lists the questions for search engines with every < escaped", () => {
    const html = render({ items });
    const script = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1] ?? "";
    expect(JSON.parse(script).mainEntity).toHaveLength(2);
    expect(script).not.toContain("<");
  });
});
