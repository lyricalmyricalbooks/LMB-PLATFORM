// The shop's social accounts for chrome that only gets the design (the phone menu): useSiteData hands them over from
// the settings it already read, like bookingsLive.ts, so the menu needs no extra request or prop.
import { useSyncExternalStore } from "react";
import { shopSocialLinks, type SocialLink } from "./socialAccounts";

let links: SocialLink[] = [];
let signature = "";
const listeners = new Set<() => void>();

export function setShopSocial(settings: any) {
  const next = shopSocialLinks(settings);
  const sig = next.map((l) => `${l.key}=${l.url}`).join("|");
  if (sig === signature) return;
  signature = sig;
  links = next;
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const none: SocialLink[] = [];

/** The accounts the website shows as icons, in the owner's order. */
export const useShopSocial = () => useSyncExternalStore(subscribe, () => links, () => none);
