// Settings › General › Your web address (plan 2.9): the words for where each address stands, tested without the page.

export type DnsRecord = { action: "add" | "remove"; host: string; type: string; value: string };
export type DomainState = "connecting" | "waiting_dns" | "securing" | "live" | "conflict" | "missing";
export type DomainEntry = { name: string; state: DomainState; addedAt?: string; paymentDomainAt?: string | null };
export type DomainCheck = { name: string; state: DomainState; records: DnsRecord[]; paymentDomain?: "registered" | "not_yet" | "failed" };
export type DomainList = { domains: DomainEntry[]; max: number };

type Tone = "success" | "warning" | "danger" | "info" | "neutral";

/** A badge and one plain sentence for each state. */
export function describeDomain(state: DomainState | undefined): { tone: Tone; label: string; text: string } {
  switch (state) {
    case "live": return { tone: "success", label: "Live", text: "Your shop opens at this address, with a secure padlock." };
    case "securing": return { tone: "info", label: "Securing", text: "The address points at your shop. Google is making its secure certificate, which can take up to a day." };
    case "conflict": return { tone: "danger", label: "In use elsewhere", text: "Another website is already set up on this address. Remove it there first, then check again." };
    case "missing": return { tone: "danger", label: "Not found", text: "Google has no record of this address for your shop. Add it again." };
    case "waiting_dns": return { tone: "warning", label: "Waiting for you", text: "Add the records below where you bought the address. Changes can take a few hours to reach everyone." };
    default: return { tone: "neutral", label: "Connecting", text: "Getting the address ready." };
  }
}

/** Where to type each record: the part before the address the press owns, or "@" for the address itself. */
export function recordHostLabel(host: string, domain: string): string {
  const h = host.replace(/\.$/, "").toLowerCase();
  const d = domain.toLowerCase();
  const root = d.split(".").slice(-2).join(".");
  if (h === root) return "@";
  if (h.endsWith(`.${root}`)) return h.slice(0, -(root.length + 1));
  return h;
}
