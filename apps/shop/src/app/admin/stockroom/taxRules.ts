// Tax centre › Sorting rules: "anything from Canva is Software". A rule only pre-fills the category on a new expense; a
// category picked by hand wins, and expenses already in the ledger are never re-sorted. Same rows and matching as the old
// stockroom (`expenseRules` at the top of the Tax Centre), so each app reads the other's rules.
type Row = Record<string, any>;
export const RULE_MIN_LENGTH = 2;

export function normalizeRuleText(value: unknown): string {
  return String(value ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export const rulesOf = (tc: Row | null): Row[] =>
  (Array.isArray(tc?.expenseRules) ? tc!.expenseRules : []).filter((r: Row) => r && r.id != null && normalizeRuleText(r.match).length >= RULE_MIN_LENGTH && typeof r.cat === "string" && r.cat.trim());

/** The rule's words must appear as whole words, in order: "post" fires on "Canada Post", not on "PostNet". */
export function ruleMatches(rule: Row, text: unknown): boolean {
  const needle = normalizeRuleText(rule?.match), hay = normalizeRuleText(text);
  return needle.length >= RULE_MIN_LENGTH && !!hay && ` ${hay} `.includes(` ${needle} `);
}

/** The category a new expense's words file under, or null. The longest matching rule wins; on a tie the older one. */
export function categoryFromRules(tc: Row | null, description: string, allowed: string[]): string | null {
  let best: Row | null = null, bestLen = 0;
  for (const rule of rulesOf(tc)) {
    if (!allowed.includes(rule.cat.trim()) || !ruleMatches(rule, description)) continue;
    const len = normalizeRuleText(rule.match).length;
    if (len > bestLen) { best = rule; bestLen = len; }
  }
  return best ? best.cat.trim() : null;
}

export function addRule(tc: Row | null, input: { match: string; cat: string }, id: string, now: string): { taxCenter: Row } | { error: string } {
  const match = input.match.trim().replace(/\s+/g, " ");
  const cat = input.cat.trim();
  if (normalizeRuleText(match).length < RULE_MIN_LENGTH) return { error: "Type a shop name or word with at least two letters." };
  if (!cat) return { error: "Pick the category it should go under." };
  const base: Row = tc && typeof tc === "object" ? tc : {};
  const list = rulesOf(base);
  const key = normalizeRuleText(match);
  const same = list.find((r) => normalizeRuleText(r.match) === key);
  const next = same ? list.map((r) => (r === same ? { ...r, match, cat, updatedAt: now } : r)) : [...list, { id, match, cat, createdAt: now }];
  return { taxCenter: { ...base, expenseRules: next } };
}

export const removeRule = (tc: Row | null, id: string): Row => ({ ...(tc || {}), expenseRules: rulesOf(tc).filter((r) => String(r.id) !== String(id)) });
