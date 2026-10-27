import { useEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router";

/**
 * Whether a navigation should open the new page at the top, like a normal page load.
 * Back/forward (POP) and replace navigations keep their position; links to an in-page
 * anchor (#hash) and the admin keep theirs too.
 */
export function shouldScrollToTop(previousPath: string | null, next: { pathname: string; hash: string }, navigationType: string): boolean {
  if (previousPath === null || previousPath === next.pathname) return false;
  if (navigationType !== "PUSH" || next.hash) return false;
  return !next.pathname.startsWith("/admin");
}

/** Opens each newly visited storefront page at the top instead of the old scroll position. */
export function ScrollToTop() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const previous = useRef<string | null>(null);
  useEffect(() => {
    if (shouldScrollToTop(previous.current, location, navigationType)) window.scrollTo(0, 0);
    previous.current = location.pathname;
  }, [location.pathname, location.hash, navigationType]);
  return null;
}
