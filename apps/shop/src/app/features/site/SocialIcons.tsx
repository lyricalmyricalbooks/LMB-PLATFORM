import type { SocialLink } from "./socialAccounts";

/** The shop's social accounts as small brand icons (Studio › Style › Footer & social links decides size and look). */
export function SocialIcon({ link, size, label }: { link: SocialLink; size: number; label: string }) {
  return (
    <a href={link.url} target="_blank" rel="noopener noreferrer me" aria-label={label} title={link.name} data-social={link.key}
      className="fm-footer-icon fm-footer-icon-box fm-social-icon text-white/55 hover:text-white transition-colors">
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d={link.path} /></svg>
    </a>
  );
}
