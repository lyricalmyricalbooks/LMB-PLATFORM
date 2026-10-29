import { SectionCard } from "./riso/components";

/**
 * On a shop run by Colophon (plan 6.18): where the shop's emails come from, with nothing to set up. Colophon's address
 * with the press's name, then orders@ their own web address once it opens the shop and is ready to send.
 */
export function PlatformSenderCard() {
  return (
    <SectionCard title="Where your emails come from" description="Nothing to set up.">
      <p className="rp-hint" style={{ margin: 0 }}>
        Your receipts and order emails go out with your press's name on them, and replies come straight to you. Once your own
        web address opens your shop, your emails come from orders@ that address by themselves.
      </p>
    </SectionCard>
  );
}
