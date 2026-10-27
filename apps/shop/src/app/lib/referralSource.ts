// Where a visit came from, as the short name stored in sessionStorage `referral_source` (App.tsx) and joined with
// orders and traffic in Overview. Also used for visits forwarded from the old GitHub Pages address, which arrive
// without a referrer of their own (features/site/movedState.ts).
export const REFERRAL_KEY = "referral_source";

export function referralSourceOf(referrer: string, currentHost: string): string | null {
  try {
    const url = new URL(referrer);
    if (url.hostname.includes(currentHost)) return null;
    let source = url.hostname.replace("www.", "");
    if (source.includes("google")) source = "google";
    else if (source.includes("instagram")) source = "instagram";
    else if (source.includes("facebook")) source = "facebook";
    else if (source.includes("twitter") || source.includes("t.co")) source = "twitter";
    else if (source.includes("tiktok")) source = "tiktok";
    else if (source.includes("pinterest")) source = "pinterest";
    return source;
  } catch {
    return null;
  }
}
