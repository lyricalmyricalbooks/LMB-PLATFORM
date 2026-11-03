import { useEffect, useRef, useState } from "react";
import { EmptyState, PageSkeleton, SecondaryButton } from "./riso/components";
import { STOCKROOM_FRAME_PATH, lookMessage, openMessage, stockroomFrameMessage } from "./combined";

// How long the stockroom may take to open before the admin says so (it keeps trying meanwhile).
const SLOW_MS = 20_000;
// The shortest the frame gets on a small window (a phone on its side).
const MIN_HEIGHT = 420;

/**
 * The stockroom's pages inside the combined admin (combined.ts). One frame, opened the first time a stockroom page is
 * picked and then kept, hidden while another page shows, so the fair till, a half-filled form and the offline copy
 * survive moving around the admin. The page and the look are sent to it as messages; it says which page it shows.
 */
export function StockroomFrame({ page, visible, look, appearance, onPage }: {
  page: string;
  visible: boolean;
  look: string;
  appearance: "light" | "dark";
  onPage: (tab: string) => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [slow, setSlow] = useState(false);
  // The address is fixed at first open (later pages go by message), so the frame never reloads.
  const [src] = useState(() => `${STOCKROOM_FRAME_PATH}#tab=${encodeURIComponent(page)}`);
  const shown = useRef(page);
  const onPageRef = useRef(onPage);
  onPageRef.current = onPage;

  const send = (message: object) => {
    try { frame.current?.contentWindow?.postMessage(message, window.location.origin); } catch { /* frame gone */ }
  };

  useEffect(() => {
    const on = (event: MessageEvent) => {
      const msg = stockroomFrameMessage(event, frame.current?.contentWindow, window.location.origin);
      if (!msg) return;
      if (msg.type === "ready") { setReady(true); setSlow(false); return; }
      shown.current = msg.tab;
      onPageRef.current(msg.tab);
    };
    window.addEventListener("message", on);
    return () => window.removeEventListener("message", on);
  }, []);

  useEffect(() => {
    if (ready) return;
    const t = window.setTimeout(() => setSlow(true), SLOW_MS);
    return () => window.clearTimeout(t);
  }, [ready]);

  // The page picked in the admin's menu or address.
  useEffect(() => {
    if (!ready || page === shown.current) return;
    shown.current = page;
    send(openMessage(page));
  }, [ready, page]);

  // The frame fills the window below where it starts, so the stockroom scrolls inside it and its pop-ups stay in view.
  useEffect(() => {
    if (!visible) return;
    const fit = () => {
      const el = frame.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      el.style.height = `${Math.max(MIN_HEIGHT, window.innerHeight - top - 16)}px`;
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [visible, ready]);

  // The stockroom follows the admin's look and day or night.
  useEffect(() => {
    if (ready) send(lookMessage(look, appearance));
  }, [ready, look, appearance]);

  return (
    <div className="rp-stockroom" hidden={!visible}>
      {!ready && !slow && <PageSkeleton label="Opening the stockroom…" />}
      {!ready && slow && (
        <EmptyState title="The stockroom is taking a while"
          description="It keeps trying by itself. If you're offline, it opens once you're back online, or after you've opened it here once on this device."
          action={<SecondaryButton onClick={() => window.location.reload()}>Reload the admin</SecondaryButton>} />
      )}
      <iframe ref={frame} className="rp-stockroom-frame" src={src} title="Stockroom" data-ready={ready || undefined} />
    </div>
  );
}
