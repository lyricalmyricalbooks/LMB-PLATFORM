// Members-only custom pages (Memberships beta, M2b). A page Studio marks "Members only" is saved with status "members",
// which no rule lets a shopper read, so it never reaches the shared site snapshot. When /page/<slug> finds no published
// page and the shop takes members, PageView asks the server (functions/memberships.js `membershipPage`): a signed-in
// member gets the page's words; anyone else gets its title, shown with the "for members" box below. Every word is Text &
// labels › Custom pages & 404; colours come from the page's theme.
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { restoredUser } from "../../../lib/authSession";
import { askMembership } from "./membershipAsk";
import { getCopy } from "./storeCopy";
import { regionProps } from "./storefrontRegions";

export type MembersPage = { id: string; slug: string; title: string; body: string; seoTitle?: string; metaDescription?: string; status: "members" };
export type MembersPageAnswer =
  | { state: "idle" | "asking" | "none" }
  | { state: "open"; page: MembersPage }
  | { state: "locked"; title: string; signedIn: boolean };

/** Asks once per slug while `ask` is true (no published page, and the shop takes members). */
export function useMembersPage(slug: string | undefined, ask: boolean): MembersPageAnswer {
  const [answer, setAnswer] = useState<MembersPageAnswer & { slug?: string }>({ state: "idle" });
  useEffect(() => {
    if (!ask || !slug) { setAnswer({ state: "idle" }); return; }
    let live = true;
    setAnswer({ state: "asking", slug });
    (async () => {
      const user = await restoredUser(4000).catch(() => null);
      const a = await askMembership("membershipPage", { slug }, user);
      if (!live) return;
      const page = a.page || {};
      setAnswer(a.locked === false
        ? { state: "open", slug, page: { id: String(page.id || ""), slug, title: String(page.title || ""), body: String(page.body || ""), seoTitle: page.seoTitle || "", metaDescription: page.metaDescription || "", status: "members" } }
        : { state: "locked", slug, title: String(page.title || ""), signedIn: a.signedIn === true });
    })().catch(() => { if (live) setAnswer({ state: "none", slug }); });
    return () => { live = false; };
  }, [slug, ask]);
  return answer.slug === slug || answer.state === "idle" ? answer : { state: "asking" };
}

/** The box a non-member sees under the page's title. */
export function MembersOnlyBox({ design, signedIn }: { design: any; signedIn: boolean }) {
  const c = (key: string) => getCopy(design, key);
  return (
    <section {...regionProps("membersOnlyBox")} className="fm-members-only" aria-labelledby="fm-members-only-heading">
      <h2 id="fm-members-only-heading">{c("membersOnlyHeading")}</h2>
      <p>{c(signedIn ? "membersOnlyNotMember" : "membersOnlyText")}</p>
      <div className="fm-members-only-actions">
        <Link to="/membership" className="fm-btn fm-members-only-join">{c("membersOnlyJoin")}</Link>
        {!signedIn && <Link to="/account" className="fm-members-only-signin">{c("membersOnlySignIn")}</Link>}
      </div>
    </section>
  );
}

/** The box's look: the page's own text colour and the shop's accent, no fixed colours. */
export const MEMBERS_ONLY_CSS = [
  ".fm-members-only{max-width:640px;margin:8px auto 64px;padding:28px;border:2px solid currentColor;display:grid;gap:14px;}",
  ".fm-members-only h2{margin:0;font-size:24px;line-height:1.25;font-weight:700;}",
  ".fm-members-only p{margin:0;font-size:16px;line-height:1.6;opacity:.85;}",
  ".fm-members-only-actions{display:flex;flex-wrap:wrap;align-items:center;gap:12px 20px;}",
  ".fm-members-only-join{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:10px 22px;background:var(--accent, currentColor);color:var(--on-accent, rgb(var(--fg-rgb)));font-weight:700;text-decoration:none;}",
  ".fm-members-only-signin{color:inherit;font-weight:600;min-height:44px;display:inline-flex;align-items:center;text-decoration:underline;text-underline-offset:3px;}",
].join("\n");
