// Settings › General › Your web address (plan 2.9): the words for where each address stands, tested without the page.

export type DnsRecord = { action: "add" | "remove"; host: string; type: string; value: string };
export type DomainState = "connecting" | "waiting_dns" | "securing" | "live" | "conflict" | "missing";
/** `former`: a free address the shop had before a new name (it still opens the shop). `free`: the shop's free address on the platform's shop domain (set up by the platform, never removed). `sendsTo`: this
 * address sends visitors on to that one (www to the bare domain). */
export type DomainEntry = { name: string; state: DomainState; addedAt?: string; paymentDomainAt?: string | null; main?: boolean; free?: boolean; former?: boolean; sendsTo?: string };
/**
 * One thing to add (or take out) by hand, in plain words: `kind` is Address, Text, Mail or Alias (plan 6.15). `pick`
 * is the exact word to choose in the domain seller's own Type box (A, TXT, CNAME), the button the press looks for there.
 */
export type GuideLine = { action: "add" | "remove"; kind: string; pick?: string; name: string; value: string; priority?: number };
/** `openUrl`: the seller's own page for a domain's lines, when it is known (the "Open GoDaddy" button). */
export type DomainGuide = { seller: string | null; zone: string; steps: string[]; lines: GuideLine[]; message: { subject: string; body: string }; openUrl?: string };
/** `allowUrl`: the domain seller's own sign-in-and-Allow window; `guide`: the same by hand (plan 6.15). */
export type DomainCheck = {
  name: string; state: DomainState; records: DnsRecord[]; paymentDomain?: "registered" | "not_yet" | "failed";
  way?: "allow" | "guide"; seller?: string | null; allowUrl?: string; guide?: DomainGuide;
};
/** `own` is the address the shop came with; `main` the one emails, links and Google use (plan 5.9). */
export type DomainList = { domains: DomainEntry[]; max: number; own?: string; main?: string; removed?: string };
export type DomainStep = "list" | "add" | "connect" | "check" | "makeMain" | "remove" | "renameFree";

/** What the press can do with one address (plan 5.9): only a live one becomes main; the main one is never removed. */
export function domainActions(entry: DomainEntry, main: string | undefined): { canMakeMain: boolean; canRemove: boolean; note: string } {
  const isMain = entry.name === main;
  // The free address before a new name: it sends visitors on to the new one once that works.
  if (entry.free && entry.former) return { canMakeMain: false, canRemove: !isMain, note: isMain ? "Main until your new free address works." : entry.sendsTo ? `Old free address. Sends visitors to ${entry.sendsTo}.` : "Old free address. Still works." };
  if (entry.free) return { canMakeMain: !isMain && entry.state === "live", canRemove: false, note: "Free address. Always works." };
  if (entry.sendsTo) return { canMakeMain: false, canRemove: !isMain, note: `Visitors here are sent on to ${entry.sendsTo}.` };
  if (isMain) return { canMakeMain: false, canRemove: false, note: "This is your main address. To remove it, make another address main first." };
  return { canMakeMain: entry.state === "live", canRemove: true, note: entry.state === "live" ? "" : "Once it shows as Live, you can make it your main address." };
}

type Tone = "success" | "warning" | "danger" | "info" | "neutral";

/** A badge and one plain sentence for each state. */
export function describeDomain(state: DomainState | undefined): { tone: Tone; label: string; text: string } {
  switch (state) {
    case "live": return { tone: "success", label: "Live", text: "Your shop opens at this address, with a secure padlock." };
    case "securing": return { tone: "info", label: "Securing", text: "The address points at your shop. Google is making its secure certificate, which can take up to a day." };
    case "conflict": return { tone: "danger", label: "In use elsewhere", text: "This address is still tied to another website. Disconnect it there, then press Check again." };
    case "missing": return { tone: "warning", label: "Setting up", text: "Still getting this address ready. Press Check again in a minute." };
    case "waiting_dns": return { tone: "warning", label: "Waiting for you", text: "Finish the steps below. This page checks by itself, and we email you when the address opens your shop. It can take a few hours." };
    default: return { tone: "neutral", label: "Connecting", text: "Getting the address ready." };
  }
}

/** Where one address stands, for its card: a free address is set up by the platform, so there is nothing to finish. */
export function describeEntry(entry: Pick<DomainEntry, "free" | "former">, state: DomainState | undefined): { tone: Tone; label: string; text: string } {
  if (entry.free && state !== "live" && state !== "conflict") {
    return { tone: "info", label: "Setting up", text: "Ready within the hour. Nothing to do." };
  }
  return describeDomain(state);
}

/**
 * The three stages every address of the press's own goes through, for the small tracker on its card: which are done
 * and which one it is on now.
 */
export function domainStages(state: DomainState | undefined): { label: string; done: boolean; current: boolean }[] {
  const at = state === "live" ? 3 : state === "securing" ? 1 : 0;
  return ["Connect", "Secure", "Live"].map((label, i) => ({ label, done: i < at, current: i === at }));
}

/** How often the card looks again by itself while an address isn't working yet. */
export const RECHECK_MS = 30_000;

/** A name typed for the free address, as the platform cleans it: "Moth Books!" -> "moth-books". */
export function freeNameOf(text: string): string {
  return text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30).replace(/-+$/, "");
}

/**
 * Said before the press connects a domain that may still show an old shop: once they say yes, the domain opens this shop
 * instead, so the last orders should be taken there first.
 */
export function moveWarning(name: string): { title: string; message: string; confirmLabel: string } {
  return {
    title: `Move ${name} to this shop now?`,
    message: `Once you say yes, ${name} shows this shop instead of anything it shows today, within minutes to a few hours. If your old shop is still selling there, take your last orders and close its checkout first, so no order lands in the wrong place. Your shop's own address keeps working throughout.`,
    confirmLabel: "Yes, connect it",
  };
}

/** The Allow button's words: names the domain seller when it is known (plan 6.15). */
export function allowLabel(seller: string | null | undefined): string {
  return seller ? `Connect with ${seller}` : "Connect my address";
}

/** What one line of the guide asks of the press, in words. */
export function guideLineTitle(line: GuideLine): string {
  return line.action === "add" ? "Add" : "Take out, if it's there";
}

/** Beside a line's title: its kind in plain words, and the word to pick in the seller's Type box. */
export function guideLineKind(line: GuideLine): string {
  return `${line.kind} line${line.pick && line.action === "add" ? ` · in the Type box choose ${line.pick}` : ""}${line.priority !== undefined ? ` · Priority ${line.priority}` : ""}`;
}

/** Where a press with no domain yet can buy one: a search at GoDaddy, opened in a new tab. */
export const BUY_DOMAIN_URL = "https://www.godaddy.com/domains";

/** A mail link that sends the guide to the press's web person. */
export function guideMailto(guide: DomainGuide): string {
  return `mailto:?subject=${encodeURIComponent(guide.message.subject)}&body=${encodeURIComponent(guide.message.body)}`;
}
