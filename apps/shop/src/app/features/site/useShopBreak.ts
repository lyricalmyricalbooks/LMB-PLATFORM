import { useEffect, useState } from "react";
import { lite } from "../../../lib/lite";
import { shopBreakState, type ShopBreak } from "./shopBreak";

const isPreviewUrl = () => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("preview") === "true";

/**
 * Whether the shop is on its plan's fixed break page (shopBreak.ts): read once per page load from the public
 * platform/status document. Null while reading, when open, or when it can't be read (the server still refuses orders on
 * a paused plan). Studio's own preview never shows it.
 */
export function useShopBreak(): ShopBreak | null {
  const [state, setState] = useState<ShopBreak | null>(null);
  useEffect(() => {
    if (isPreviewUrl()) return;
    let alive = true;
    lite()
      .then(async ({ doc, getDoc, liteDb }) => {
        const snap = await getDoc(doc(liteDb, "platform", "status"));
        if (alive) setState(shopBreakState(snap.exists() ? snap.data() : null));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  return state;
}
