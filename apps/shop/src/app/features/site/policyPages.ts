import { getCopy } from "./storeCopy";

// Store policies (settings.policies) are plain text; they are served as public pages at /page/policy-<key>.
export const POLICY_KEYS = ["shipping", "returns", "privacy", "terms"] as const;
export type PolicyKey = (typeof POLICY_KEYS)[number];

// Shopper-facing titles are copy (Studio › Text & labels › Footer); the admin labels reuse the defaults.
const POLICY_COPY_KEYS: Record<PolicyKey, string> = {
  shipping: "policyTitleShipping", returns: "policyTitleReturns", privacy: "policyTitlePrivacy", terms: "policyTitleTerms",
};
export const policyTitle = (design: any, key: PolicyKey) => getCopy(design, POLICY_COPY_KEYS[key]);
export const POLICY_TITLES = Object.fromEntries(POLICY_KEYS.map((k) => [k, policyTitle(undefined, k)])) as Record<PolicyKey, string>;

export const policySlug = (key: PolicyKey) => `policy-${key}`;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Plain text → safe HTML: blank lines split paragraphs, single newlines become <br>. */
export function policyHtml(text: string): string {
  return String(text || "").trim().split(/\n{2,}/).filter(Boolean)
    .map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
}

/** Resolves /page/policy-<key> to a synthetic published page, or null when unknown/empty. */
export function policyPageFor(slug: string | undefined, policies: Partial<Record<PolicyKey, string>> | undefined, design?: any) {
  const m = /^policy-(.+)$/.exec(slug || "");
  const key = m?.[1] as PolicyKey | undefined;
  if (!key || !POLICY_KEYS.includes(key)) return null;
  const text = policies?.[key];
  if (!text || !text.trim()) return null;
  return { id: `policy-${key}`, title: policyTitle(design, key), slug: slug!, body: policyHtml(text), status: "published" as const };
}
