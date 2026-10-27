// Page starters (Studio 3.0 phase 5): Studio › Pages › New page opens a small gallery of ready-made page outlines.
// Each starter is headings plus bracketed prompts the owner replaces — never invented facts about the shop — and opens
// as a draft, so the prompts can't reach shoppers until the owner publishes the page. Nothing is saved until Save.
export type PageStarter = {
  id: string;
  label: string;
  /** One line shown on the card. */
  summary: string;
  /** The headings it starts with, shown on the card. */
  outline: string[];
  title: string;
  slug: string;
  body: string;
  showInNav: boolean;
  /** Linked from the footer only (when showInNav is off). */
  showInFooter?: boolean;
};

const h2 = (t: string) => `<h2>${t}</h2>`;
const p = (t: string) => `<p>${t}</p>`;

export const PAGE_STARTERS: PageStarter[] = [
  { id: "blank", label: "Blank page", summary: "Start from an empty page.", outline: [], title: "", slug: "", body: "", showInNav: true },
  {
    id: "about", label: "About", summary: "Who you are and what you publish.", outline: ["Who we are", "What we publish", "How we work"],
    title: "About", slug: "about", showInNav: true,
    body: [h2("Who we are"), p("[Say who runs the press and how it started.]"), h2("What we publish"), p("[Describe the books you make and who they are for.]"), h2("How we work"), p("[Printing, paper, editions — whatever makes your books yours.]")].join(""),
  },
  {
    id: "shipping", label: "Shipping & returns", summary: "Delivery times, costs and how returns work.", outline: ["Shipping", "Delivery times", "Returns", "Damaged or missing parcels"],
    title: "Shipping & returns", slug: "shipping-returns", showInNav: false,
    body: [h2("Shipping"), p("[Where you ship to and how prices are worked out.]"), h2("Delivery times"), p("[How long parcels usually take, by region.]"), h2("Returns"), p("[How long shoppers have, what condition books must be in, and who pays return postage.]"), h2("Damaged or missing parcels"), p("[What to do and how to reach you.]")].join(""),
  },
  {
    id: "faq", label: "FAQ", summary: "Answers to the questions you hear most.", outline: ["Orders", "Shipping", "Books & editions"],
    title: "Frequently asked questions", slug: "faq", showInNav: false,
    body: [h2("Orders"), `<h3>[A question shoppers ask]</h3>`, p("[Your answer.]"), h2("Shipping"), `<h3>[A question shoppers ask]</h3>`, p("[Your answer.]"), h2("Books & editions"), `<h3>[A question shoppers ask]</h3>`, p("[Your answer.]")].join(""),
  },
  {
    id: "contact", label: "Contact", summary: "How shoppers, authors and stores can reach you.", outline: ["Get in touch", "Wholesale & stockists", "Press"],
    title: "Contact", slug: "contact", showInNav: true,
    body: [h2("Get in touch"), p("[Your email address and when you usually reply.]"), h2("Wholesale & stockists"), p("[How bookshops can order from you.]"), h2("Press"), p("[Who to contact for review copies and interviews.]")].join(""),
  },
  {
    id: "stockists", label: "Stockists", summary: "The bookshops that carry your books, linked from the footer only.", outline: ["Where to find our books", "[City]", "Stock our books"],
    title: "Stockists", slug: "stockists", showInNav: false, showInFooter: true,
    body: [h2("Where to find our books"), p("[One line inviting shoppers to see the books in person.]"), h2("[City]"), `<h3>[Shop name]</h3>`, p("[Street address] · [link to the shop's website]"), `<h3>[Shop name]</h3>`, p("[Street address] · [link to the shop's website]"), h2("[Another city]"), `<h3>[Shop name]</h3>`, p("[Street address] · [link to the shop's website]"), h2("Stock our books"), p("[How bookshops and libraries can order from you: email, terms, minimums.]")].join(""),
  },
  {
    id: "submissions", label: "Submissions", summary: "What you're looking for and how to send work.", outline: ["What we're looking for", "How to submit", "What happens next"],
    title: "Submissions", slug: "submissions", showInNav: true,
    body: [h2("What we're looking for"), p("[The kinds of work you publish, and anything you don't take.]"), h2("How to submit"), p("[What to send, in which format, and where.]"), h2("What happens next"), p("[How long replies take and whether you reply to everyone.]")].join(""),
  },
  {
    id: "journal", label: "Journal", summary: "A page for news, notes and behind-the-scenes posts.", outline: ["Latest", "From the archive"],
    title: "Journal", slug: "journal", showInNav: true,
    body: [h2("Latest"), p("[Your newest note: a book on press, an event, a new stockist.]"), h2("From the archive"), p("[Older notes you want to keep handy.]")].join(""),
  },
];

/** A slug no other page uses ("about", then "about-2"…). */
export function uniqueSlug(slug: string, pages: { slug?: string }[]): string {
  if (!slug) return slug;
  const used = new Set(pages.map(x => x.slug));
  if (!used.has(slug)) return slug;
  let n = 2;
  while (used.has(`${slug}-${n}`)) n++;
  return `${slug}-${n}`;
}

/** The unsaved page a starter opens: a draft (except Blank, which matches the old New page), in the menu if the
 *  starter belongs there, with a slug no other page uses. */
export function pageFromStarter(starter: PageStarter, pages: { slug?: string }[]) {
  return {
    title: starter.title, slug: uniqueSlug(starter.slug, pages), body: starter.body,
    status: (starter.id === "blank" ? "published" : "draft") as "published" | "draft",
    showInNav: starter.showInNav, showInFooter: !!starter.showInFooter, order: pages.length, seoTitle: "", metaDescription: "", seoImage: "",
  };
}
