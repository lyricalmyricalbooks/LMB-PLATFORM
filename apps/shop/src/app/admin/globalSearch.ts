// Pure matching for the admin top-bar search (riso/shellParts GlobalSearch): orders and customers.

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

/** Orders matching a number (with or without "#", spaces ignored), an email or a customer name. Test orders skipped. */
export function matchOrders(orders: any[], term: string, limit = 5): any[] {
  const t = norm(term);
  if (!t) return [];
  const num = t.replace(/^#/, "").replace(/\s+/g, "");
  return (orders || []).filter((o) => o && o.isTest !== true && (
    (num.length >= 2 && [o.orderId, o.id].some((v) => norm(v).replace(/^#/, "").includes(num)))
    || (t.length >= 3 && [o.customer?.email, o.customer?.name].some((v) => norm(v).includes(t)))
  )).slice(0, limit);
}

/** Distinct customers (by lowercased email) whose email or name matches. */
export function matchCustomers(orders: any[], term: string, limit = 4): Array<{ email: string; name: string }> {
  const t = norm(term);
  if (t.length < 3) return [];
  const seen = new Map<string, { email: string; name: string }>();
  for (const o of orders || []) {
    if (!o || o.isTest === true) continue;
    const email = norm(o.customer?.email);
    if (!email || seen.has(email)) continue;
    const name = String(o.customer?.name || "");
    if (email.includes(t) || norm(name).includes(t)) seen.set(email, { email, name });
    if (seen.size >= limit) break;
  }
  return [...seen.values()];
}
