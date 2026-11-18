// Digital D3 (Beta): Listen or Watch a bought audiobook or video in the page. The server hands a short play link
// (downloadDigitalAsset with play=1, counted per day, never against downloads); the player asks again when it fails or
// is about to run out, and carries on from the same second. Where the shopper stopped is kept in this browser
// (listenPlace.ts). Words: Text & labels › Customer account; region `accountPlayer`.
import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useFocusTrap } from "../../lib/useFocusTrap";
import { functionUrl } from "../../lib/functionsBase";
import { regionProps } from "./storefrontRegions";
import { getCopy } from "./storeCopy";
import { linkNeedsRefresh, placeKey, placeToSave, startFrom } from "./listenPlace";

export interface PlayTarget { order: any; itemId: string; variantId: string; file: number; title: string; kind: "audio" | "video" }

type Link = { url: string; expiresAt: number };

function readPlace(key: string): string | null { try { return window.localStorage.getItem(key); } catch { return null; } }
function writePlace(key: string, value: string | null) {
  try { if (value === null) window.localStorage.removeItem(key); else window.localStorage.setItem(key, value); } catch { /* private window */ }
}

export function MediaPlayer({ design, target, onClose }: { design: any; target: PlayTarget; onClose: () => void }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const resumeAt = useRef<number | null>(null);
  // Automatic refreshes since the last good load: a file that never plays stops after two, with Try again.
  const retries = useRef(0);
  const [link, setLink] = useState<Link | null>(null);
  const [problem, setProblem] = useState<"" | "error" | "limit">("");
  const [loading, setLoading] = useState(true);
  const orderId = target.order.id || target.order.orderId;
  const key = placeKey(orderId, target.itemId, target.variantId, target.file);
  useFocusTrap(boxRef, true, onClose);

  const fetchLink = useCallback(async () => {
    setLoading(true);
    setProblem("");
    try {
      const res = await fetch(functionUrl("downloadDigitalAsset", {
        orderId, itemId: target.itemId, variantId: target.variantId || undefined,
        file: target.file ? String(target.file) : undefined, token: target.order.downloadToken, play: "1",
      }), { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.url) { setProblem(body?.code === "play_limit" ? "limit" : "error"); return; }
      setLink({ url: body.url, expiresAt: Date.parse(body.expiresAt) || Date.now() + 9 * 60_000 });
    } catch {
      setProblem("error");
    } finally {
      setLoading(false);
    }
  }, [orderId, target.itemId, target.variantId, target.file, target.order.downloadToken]);

  useEffect(() => { void fetchLink(); }, [fetchLink]);

  // Keep the place every few seconds and when the player closes.
  const save = () => { const m = mediaRef.current; if (m) writePlace(key, placeToSave(m.currentTime, m.duration)); };
  useEffect(() => () => save(), []);

  const onLoaded = () => {
    const m = mediaRef.current;
    if (!m) return;
    const at = resumeAt.current ?? startFrom(readPlace(key), m.duration);
    resumeAt.current = null;
    retries.current = 0;
    if (at > 0) m.currentTime = at;
  };
  // A link that ran out (or any load failure): ask again and carry on from the same second.
  const onError = () => {
    const m = mediaRef.current;
    if (m && m.currentTime > 0) resumeAt.current = m.currentTime;
    if (retries.current >= 2) { setProblem("error"); return; }
    retries.current += 1;
    void fetchLink();
  };
  const onPlay = () => {
    if (link && linkNeedsRefresh(link.expiresAt, Date.now())) onError();
  };

  const media = link && !problem ? (target.kind === "video"
    ? <video ref={(el) => { mediaRef.current = el; }} src={link.url} controls autoPlay playsInline preload="metadata" onLoadedMetadata={onLoaded} onError={onError} onPlay={onPlay} onTimeUpdate={(e) => { if (Math.floor(e.currentTarget.currentTime) % 5 === 0) save(); }} onPause={save} className="w-full max-h-[70vh] bg-black" />
    : <audio ref={(el) => { mediaRef.current = el; }} src={link.url} controls autoPlay preload="metadata" onLoadedMetadata={onLoaded} onError={onError} onPlay={onPlay} onTimeUpdate={(e) => { if (Math.floor(e.currentTarget.currentTime) % 5 === 0) save(); }} onPause={save} className="w-full" />) : null;

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={boxRef} role="dialog" aria-modal="true" aria-labelledby="fm-player-title" tabIndex={-1} {...regionProps("accountPlayer")}
        className={`fm-surface-2 border border-white/10 w-full ${target.kind === "video" ? "sm:max-w-3xl" : "sm:max-w-lg"} rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 space-y-4`}>
        <div className="flex items-start justify-between gap-4">
          <h2 id="fm-player-title" className="text-sm font-bold text-white break-words min-w-0">{target.title}</h2>
          <button type="button" onClick={onClose} className="min-h-[44px] min-w-[44px] -m-2 flex items-center justify-center text-white/60 hover:text-white shrink-0" aria-label={getCopy(design, "accountPlayerClose")}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        {media}
        {loading && !media && <p className="text-sm fm-muted" role="status">{getCopy(design, "accountPlayerLoading")}</p>}
        {problem && (
          <div role="alert" className="space-y-3">
            <p className="text-sm fm-muted">{getCopy(design, problem === "limit" ? "accountPlayerLimit" : "accountPlayerError")}</p>
            {problem === "error" && (
              <button type="button" onClick={() => { retries.current = 0; void fetchLink(); }} className="min-h-[44px] px-4 rounded-lg text-white text-xs font-bold" style={{ backgroundColor: "var(--accent)" }}>
                {getCopy(design, "accountPlayerRetry")}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
