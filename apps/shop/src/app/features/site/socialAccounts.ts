import { SOCIAL_ICON_PATHS } from "./socialIconPaths";
import { shopSocialAccounts, type SocialKey } from "../../../shared/socialLinks";

// The rules live in src/shared/socialLinks.ts (one copy with the server's order emails); this adds the icons.
export * from "../../../shared/socialLinks";

export const socialIconPath = (key: string) => SOCIAL_ICON_PATHS[key] || "";

export type SocialLink = { key: SocialKey; name: string; url: string; path: string };

/** Every account that has a usable address, in the owner's order: what the website draws as icons. */
export function shopSocialLinks(settings: any): SocialLink[] {
  return shopSocialAccounts(settings).map((a) => ({ ...a, path: socialIconPath(a.key) }));
}
