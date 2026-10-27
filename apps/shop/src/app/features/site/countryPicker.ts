// Country picker helpers: pinned favourites first, forgiving type-to-search, a sensible guess.
import { COUNTRIES, type Country } from "./shippingZones";

/** Canada and the US, then the main European markets. Studio can override (Style › Checkout). */
export const DEFAULT_PINNED_COUNTRIES = "CA,US,GB,IE,FR,DE,IT,ES,NL,BE,PT,AT,CH,SE,DK,NO,FI";

/** Other names people type for a country. */
const ALIASES: Record<string, string[]> = {
  US: ["usa", "america", "united states of america", "states"],
  GB: ["uk", "england", "scotland", "wales", "great britain", "britain", "northern ireland"],
  NL: ["holland"],
  DE: ["deutschland"],
  ES: ["espana", "españa"],
  CH: ["schweiz", "suisse", "svizzera"],
  AT: ["osterreich", "österreich"],
  IT: ["italia"],
  CZ: ["czech republic", "czechia"],
  KR: ["south korea", "korea"],
  AE: ["uae", "emirates"],
  CI: ["ivory coast", "cote d'ivoire"],
};

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

export function parsePinned(list: string | undefined | null): string[] {
  const raw = (list ?? DEFAULT_PINNED_COUNTRIES).split(/[\s,]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
  const known = new Set(COUNTRIES.map(c => c.code));
  return Array.from(new Set(raw.filter(code => known.has(code))));
}

/** Pinned countries in their given order, then everyone else A–Z. */
export function orderedCountries(pinnedCodes: string[]): { pinned: Country[]; rest: Country[] } {
  const byCode = new Map(COUNTRIES.map(c => [c.code, c]));
  const pinned = pinnedCodes.map(code => byCode.get(code)).filter(Boolean) as Country[];
  const pinnedSet = new Set(pinned.map(c => c.code));
  const rest = COUNTRIES.filter(c => !pinnedSet.has(c.code)).sort((a, b) => a.name.localeCompare(b.name));
  return { pinned, rest };
}

/** Countries matching what was typed, best match first (pinned break ties). */
export function matchCountries(query: string, pinnedCodes: string[] = []): Country[] {
  const q = fold(query);
  if (!q) return [];
  const pinRank = (code: string) => { const i = pinnedCodes.indexOf(code); return i === -1 ? 999 : i; };
  const scored: { c: Country; score: number }[] = [];
  for (const c of COUNTRIES) {
    const name = fold(c.name);
    const aliases = (ALIASES[c.code] || []).map(fold);
    let score = -1;
    if (name === q || c.code.toLowerCase() === q || aliases.includes(q)) score = 0;
    else if (name.startsWith(q)) score = 1;
    else if (aliases.some(a => a.startsWith(q))) score = 2;
    else if (name.split(/[\s-]+/).some(w => w.startsWith(q))) score = 3;
    else if (q.length >= 3 && name.includes(q)) score = 4;
    if (score >= 0) scored.push({ c, score });
  }
  return scored
    .sort((a, b) => a.score - b.score || pinRank(a.c.code) - pinRank(b.c.code) || a.c.name.localeCompare(b.c.name))
    .map(s => s.c);
}

/** Flag emoji from a two-letter code (shown beside names; easier to spot than text). */
export function flagEmoji(code: string): string {
  if (!/^[A-Z]{2}$/i.test(code)) return "";
  return String.fromCodePoint(...code.toUpperCase().split("").map(ch => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

/** Best guess at the shopper's country from their browser language (e.g. en-CA → Canada). */
export function guessCountryName(languages: readonly string[] = typeof navigator !== "undefined" ? (navigator.languages || [navigator.language]) : []): string | null {
  for (const tag of languages) {
    const region = String(tag || "").split(/[-_]/)[1];
    if (region && /^[A-Z]{2}$/i.test(region)) {
      const hit = COUNTRIES.find(c => c.code === region.toUpperCase());
      if (hit) return hit.name;
    }
  }
  return null;
}
