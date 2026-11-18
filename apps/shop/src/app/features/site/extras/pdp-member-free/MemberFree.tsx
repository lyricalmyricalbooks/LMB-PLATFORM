import { Link } from "react-router";
import { Gift } from "lucide-react";
import { getCopy } from "../../storeCopy";
import { regionProps } from "../../storefrontRegions";

// "Free for members" under the price of a download the owner gives to members (Memberships M2b). Display only: the
// server prices it at nothing for a signed-in member at checkout. Words: Text & labels › Product page (`pdpMemberFree*`).
export default function MemberFree({ design }: { design: any }) {
  const text = getCopy(design, "pdpMemberFree");
  if (!text.trim()) return null;
  const join = getCopy(design, "pdpMemberFreeJoin");
  return (
    <p {...regionProps("productMemberFree")} className="fm-pdp-meta w-full basis-full flex items-start gap-2">
      <Gift size={16} aria-hidden="true" className="shrink-0 mt-0.5" />
      <span>{text}{join.trim() ? <> <Link to="/membership" className="underline underline-offset-2">{join}</Link></> : null}</span>
    </p>
  );
}
