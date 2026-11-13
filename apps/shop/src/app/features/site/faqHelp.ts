// Help centre (gap list 29): the FAQ section's pure rules. Questions can sit under a topic (`group`), shoppers can
// search them, each question has its own address (#faq-<words>) and the list is given to search engines as an FAQPage.

export type FaqItem = { question?: string; answer?: string; group?: string };
export type FaqGroup = { group: string; items: FaqItem[] };

const fold = (text: string) =>
  text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Questions whose question, answer or topic holds every word typed (any order, accents ignored). */
export function filterFaq(items: FaqItem[], query: string): FaqItem[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return items;
  return items.filter((item) => {
    const hay = fold(`${item.question ?? ""} ${item.answer ?? ""} ${item.group ?? ""}`);
    return words.every((word) => hay.includes(word));
  });
}

/** Topics in the order they first appear; questions without one come first under "". */
export function groupFaq(items: FaqItem[]): FaqGroup[] {
  const groups: FaqGroup[] = [];
  for (const item of items) {
    const name = (item.group ?? "").trim();
    let group = groups.find((g) => g.group === name);
    if (!group) {
      group = { group: name, items: [] };
      if (name) groups.push(group);
      else groups.unshift(group);
    }
    group.items.push(item);
  }
  return groups;
}

/** A stable address for one question: "faq-do-you-ship-abroad". Repeats get -2, -3… */
export function faqAnchors(items: FaqItem[]): string[] {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const base = `faq-${fold(item.question ?? "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "question"}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}-${n}`;
  });
}

/** schema.org FAQPage for the questions that have both a question and an answer; null when none do. */
export function faqJsonLd(items: FaqItem[]): Record<string, unknown> | null {
  const entries = items
    .filter((item) => item.question?.trim() && item.answer?.trim())
    .map((item) => ({
      "@type": "Question",
      name: item.question!.trim(),
      acceptedAnswer: { "@type": "Answer", text: item.answer!.trim() },
    }));
  return entries.length ? { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: entries } : null;
}

/** JSON for an inline <script>: "<" escaped so an answer can never close the script tag. */
export function safeJson(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
