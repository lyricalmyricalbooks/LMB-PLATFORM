import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router";
import { publicApi } from "../../lib/publicApi";
import { inEditorPreview } from "../../lib/trackingGuard";
import { findRedirect, isExternalTarget, MAX_REDIRECT_HOPS } from "./redirects";

/**
 * Call from a "this page doesn't exist" view (404, unknown book, unknown page). When the owner saved a redirect for the
 * address (Settings › General › URL redirects), the shopper is sent to the new one. Does nothing while `enabled` is
 * false (the page exists / is still loading), in the Studio preview, or after MAX_REDIRECT_HOPS chained hops.
 */
export function useMissingRedirect(enabled: boolean) {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const doneFor = useRef("");
  useEffect(() => {
    if (!enabled || inEditorPreview() || doneFor.current === pathname) return;
    doneFor.current = pathname;
    let live = true;
    (async () => {
      try {
        const list = await publicApi.getRedirects();
        const to = findRedirect(list, pathname);
        if (!live || !to) return;
        if (isExternalTarget(to)) { window.location.replace(to); return; }
        const hops = Number((window.history.state?.usr as any)?.lmRedirectHops || 0);
        if (hops >= MAX_REDIRECT_HOPS) return;
        // Carry the shopper's query (utm tags, discount links) unless the new address sets its own.
        navigate(to.includes("?") ? to : to + search, { replace: true, state: { lmRedirectHops: hops + 1 } });
      } catch { /* the 404 stays */ }
    })();
    return () => { live = false; };
  }, [enabled, pathname, search, navigate]);
}
