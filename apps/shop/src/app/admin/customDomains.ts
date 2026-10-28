// Settings › General › Your web address (plan 2.9): the words for where each address stands, tested without the page.

export type DnsRecord = { action: "add" | "remove"; host: string; type: string; value: string };
export type DomainState = "connecting" | "waiting_dns" | "securing" | "live" | "conflict" | "missing";
export type DomainEntry = { name: string; state: DomainState; addedAt?: string; paymentDomainAt?: string | null; main?: boolean };
/** One thing to add (or take out) by hand, in plain words: `kind` is Address, Text, Mail or Alias (plan 6.15). */
export type GuideLine = { action: "add" | "remove"; kind: string; name: string; value: string; priority?: number };
export type DomainGuide = { seller: string | null; zone: string; steps: string[]; lines: GuideLine[]; message: { subject: string; body: string } };
/** `allowUrl`: the domain seller's own sign-in-and-Allow window; `guide`: the same by hand (plan 6.15). */
export type DomainCheck = {
  name: string; state: DomainState; records: DnsRecord[]; paymentDomain?: "registered" | "not_yet" | "failed";
  way?: "allow" | "guide"; seller?: string | null; allowUrl?: string; guide?: DomainGuide;
};
/** `own` is the address the shop came with; `main` the one emails, links and Google use (plan 5.9). */
export type DomainList = { domains: DomainEntry[]; max: number; own?: string; main?: string; removed?: string };
export type DomainStep = "list" | "add" | "connect" | "check" | "makeMain" | "remove";

/** What the press can do with one address (plan 5.9): only a live one becomes main; the main one is never removed. */
export function domainActions(entry: DomainEntry, main: string | undefined): { canMakeMain: boolean; canRemove: boolean; note: string } {
  const isMain = entry.name === main;
  if (isMain) return { canMakeMain: false, canRemove: false, note: "This is your main address. To remove it, make another address main first." };
  return { canMakeMain: entry.state === "live", canRemove: true, note: entry.state === "live" ? "" : "Once it shows as Live, you can make it your main address." };
}

type Tone = "success" | "warning" | "danger" | "info" | "neutral";

/** A badge and one plain sentence for each state. */
export function describeDomain(state: DomainState | undefined): { tone: Tone; label: string; text: string } {
  switch (state) {
    case "live": return { tone: "success", label: "Live", text: "Your shop opens at this address, with a secure padlock." };
    case "securing": return { tone: "info", label: "Securing", text: "The address points at your shop. Google is making its secure certificate, which can take up to a day." };
    case "conflict": return { tone: "danger", label: "In use elsewhere", text: "Another website is already set up on this address. Remove it there first, then check again." };
    case "missing": return { tone: "danger", label: "Not found", text: "Google has no record of this address for your shop. Add it again." };
    case "waiting_dns": return { tone: "warning", label: "Waiting for you", text: "Finish connecting it below. Changes can take a few hours to reach everyone; we check every few minutes and email you when it opens your shop." };
    default: return { tone: "neutral", label: "Connecting", text: "Getting the address ready." };
  }
}

/** The Allow button's words: names the domain seller when it is known (plan 6.15). */
export function allowLabel(seller: string | null | undefined): string {
  return seller ? `Connect with ${seller}` : "Connect my address";
}

/** What one line of the guide asks of the press, in words. */
export function guideLineTitle(line: GuideLine): string {
  return line.action === "add" ? "Add" : "Take out, if it's there";
}

/** A mail link that sends the guide to the press's web person. */
export function guideMailto(guide: DomainGuide): string {
  return `mailto:?subject=${encodeURIComponent(guide.message.subject)}&body=${encodeURIComponent(guide.message.body)}`;
}
