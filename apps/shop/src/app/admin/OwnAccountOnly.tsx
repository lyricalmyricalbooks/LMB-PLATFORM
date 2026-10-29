import type { ReactNode } from "react";
import { runsOnColophon } from "../../lib/shopProfile";

/**
 * Panels that ask the press for a key, a connection address or a release: shown only on a shop that is not run by
 * Colophon (code plan 6.16). On a Colophon shop the platform looks after those, so the press never meets them.
 * platformPlainWords.test.ts checks that every such panel sits inside this wrapper.
 */
export function OwnAccountOnly({ children }: { children: ReactNode }) {
  return runsOnColophon() ? null : <>{children}</>;
}
