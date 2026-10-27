import { forwardRef } from "react";
import { Link } from "react-router";
import { getCopy } from "../features/site/storeCopy";
import { policySlug, policyTitle } from "../features/site/policyPages";
import { hasTermsPage, splitTermsLabel } from "../features/site/bagTerms";

// Style › Cart drawer › Total & checkout button › Terms checkbox (off by default).
export const CartTermsAgree = forwardRef<HTMLInputElement, {
  design: any; policies: any; agreed: boolean; showError: boolean; onChange: (agreed: boolean) => void; onLinkClick: () => void;
}>(function CartTermsAgree({ design, policies, agreed, showError, onChange, onLinkClick }, ref) {
  const [before, after] = splitTermsLabel(getCopy(design, "cartTermsAgree"));
  const termsName = policyTitle(design, "terms");
  return <div className="fm-bag-terms">
    <label className="flex items-start gap-3 min-h-[44px] cursor-pointer fm-bag-meta" style={{ textTransform: "none", letterSpacing: "0.02em" }}>
      <input ref={ref} type="checkbox" className="mt-0.5 h-5 w-5 shrink-0" style={{ accentColor: "var(--accent, currentColor)" }}
        checked={agreed} onChange={event => onChange(event.target.checked)}
        aria-invalid={showError || undefined} aria-describedby={showError ? "fm-bag-terms-error" : undefined} />
      <span>
        {before}
        {hasTermsPage(policies)
          ? <Link to={`/page/${policySlug("terms")}`} onClick={onLinkClick} className="underline underline-offset-2">{termsName}</Link>
          : termsName}
        {after}
      </span>
    </label>
    {showError && <p id="fm-bag-terms-error" role="alert" className="fm-bag-meta mt-2" style={{ textTransform: "none", letterSpacing: "0.02em", color: "var(--danger, currentColor)" }}>{getCopy(design, "cartTermsError")}</p>}
  </div>;
});
