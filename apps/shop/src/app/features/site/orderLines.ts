// Do two lists of order lines buy the same things? Compared by book, edition and total copies
// (the free gift line is the server's own addition and is ignored). Mirrors
// functions/paymentGuards.js `sameOrderLines`, which decides whether an earlier paid order is a
// duplicate of the one being placed.
export function sameOrderLines(a: any[] | null | undefined, b: any[] | null | undefined): boolean {
  const tally = (lines: any[] | null | undefined) => {
    const out = new Map<string, number>();
    for (const line of Array.isArray(lines) ? lines : []) {
      if (!line || line.promoGift === true || typeof line.id !== "string") continue;
      const key = `${line.id}\u0000${line.variantId || ""}`;
      out.set(key, (out.get(key) || 0) + (Math.max(0, Math.floor(Number(line.quantity) || 0))));
    }
    return out;
  };
  const left = tally(a), right = tally(b);
  if (left.size !== right.size) return false;
  for (const [key, quantity] of left) if (right.get(key) !== quantity) return false;
  return true;
}
