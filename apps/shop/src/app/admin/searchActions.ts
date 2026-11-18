// Search that does things (simpler admin, change 10): the admin search box understands a few jobs as well as names.
// "add product", "new discount", "refund 1042", "ship 1042", "turn on events" become a "Do" row at the top of the
// results. Pure: the shell passes what each job runs.

/** Set by the "make a discount" job; Discounts opens a new discount once and clears it. */
export const NEW_DISCOUNT_KEY = "lm:new-discount";

export type SearchJob =
  | { kind: "newProduct" }
  | { kind: "newDiscount" }
  | { kind: "order"; verb: "refund" | "ship" | "open"; number: string }
  | { kind: "waysToSell"; way?: string };

const NEW = /^(add|new|create|make)\s+(an?\s+)?/;
const WAYS: Record<string, string> = {
  event: "Events", events: "Events", tickets: "Events", class: "Classes", classes: "Classes", course: "Classes",
  booking: "Bookings", bookings: "Bookings", appointments: "Bookings", donations: "Donations", donation: "Donations",
  tips: "Donations", giving: "Donations", memberships: "Members", membership: "Members", members: "Members",
  rentals: "Rentals", rental: "Rentals",
};

/** The jobs a typed phrase asks for, best first. Nothing for an ordinary name search. */
export function searchJobs(text: string, productWords: readonly string[] = ["product", "book"]): SearchJob[] {
  const t = text.trim().toLowerCase().replace(/\s+/g, " ");
  if (t.length < 3) return [];
  const jobs: SearchJob[] = [];
  const order = t.match(/^(refund|ship|order)\s+#?\s*([a-z]*-?\d[\w-]*)$/);
  if (order) jobs.push({ kind: "order", verb: order[1] === "order" ? "open" : (order[1] as "refund" | "ship"), number: order[2] });
  if (NEW.test(t)) {
    const what = t.replace(NEW, "");
    if (productWords.some((w) => what.startsWith(w) || w.startsWith(what))) jobs.push({ kind: "newProduct" });
    if ("discount".startsWith(what) || what.startsWith("discount") || what.startsWith("code") || what.startsWith("sale")) jobs.push({ kind: "newDiscount" });
  }
  const turn = t.match(/^(turn on|switch on|start|sell|offer)\s+(.+)$/);
  if (turn) jobs.push({ kind: "waysToSell", way: WAYS[turn[2].trim()] });
  return jobs;
}

/** The words on a job's row. */
export function jobLabel(job: SearchJob, productWord = "product"): string {
  switch (job.kind) {
    case "newProduct": return `Add a ${productWord}`;
    case "newDiscount": return "Make a discount";
    case "order": return job.verb === "refund" ? `Open order #${job.number} to refund it` : job.verb === "ship" ? `Open order #${job.number} to ship it` : `Open order #${job.number}`;
    case "waysToSell": return job.way ? `Turn on ${job.way}` : "Choose your ways to sell";
  }
}

/** The order a typed number means: its own number with or without "#", case ignored. */
export function orderByNumber<T extends { id: string; orderId?: string }>(orders: readonly T[], number: string): T | undefined {
  const n = number.replace(/^#/, "").toLowerCase();
  return orders.find((o) => String(o.orderId || "").replace(/^#/, "").toLowerCase() === n)
    || orders.find((o) => o.id.toLowerCase() === n)
    || orders.find((o) => String(o.orderId || "").toLowerCase().endsWith(n));
}
