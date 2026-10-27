// "Artist on shop cards" (Shopify themes' "Show vendor"), Studio › Style › Book cards in the shop grid ›
// showCardCreator (off by default). Display only: the credit exactly as the owner typed it in Books › edit.

const MAX_CREDIT = 120;

/** The credit a shop card shows under its title: the editor's "Author / contributors" box (`subtitle`), else a
 *  legacy `authorName`, on one line and cut at a word near 120 characters. Empty when the book credits nobody. */
export function cardCreator(book: any): string {
  const raw = [book?.subtitle, book?.authorName].find(value => typeof value === "string" && value.trim());
  const credit = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
  if (credit.length <= MAX_CREDIT) return credit;
  const cut = credit.slice(0, MAX_CREDIT);
  const space = cut.lastIndexOf(" ");
  return (space > 60 ? cut.slice(0, space) : cut).replace(/[\s,;&+]+$/, "") + "…";
}
