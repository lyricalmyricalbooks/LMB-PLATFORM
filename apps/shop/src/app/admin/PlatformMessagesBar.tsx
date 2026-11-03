import { useEffect, useState } from "react";
import { SecondaryButton } from "./riso/components";
import { pickPlatformMessages, readDismissed, rememberDismissed } from "./platformMessages";
import { usePlatformMessagesDoc } from "./platformMessagesApi";

// The platform's messages to the press (code plan 19.14): a banner per message over every admin page, between its start
// and end, each with Close. Admin only (Dashboard.tsx); the storefront never shows them. Admin-only words.

const browserStore = () => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export function PlatformMessagesBar({ enabled }: { enabled: boolean }) {
  const raw = usePlatformMessagesDoc(enabled);
  const [dismissed, setDismissed] = useState<string[]>(() => readDismissed(browserStore()));
  // Look again each minute, so a message starts and ends on time while the admin stays open.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const shown = pickPlatformMessages(raw, { now, dismissed });
  if (!enabled || !shown.length) return null;
  return (
    <>
      {shown.map((message) => (
        <div key={message.id} role="status" className="rp-alert" data-tone={message.level === "important" ? "warning" : undefined} data-platform-message={message.level}>
          <span className="rp-alert-glyph" aria-hidden="true">{message.level === "important" ? "!" : "i"}</span>
          <div className="rp-alert-text">
            <span className="rp-alert-kicker">{message.level === "important" ? "Important · from Colophon" : "From Colophon"}</span>
            <span className="rp-alert-detail" style={{ whiteSpace: "pre-line" }}>{message.words}</span>
          </div>
          <div className="rp-alert-actions">
            <SecondaryButton size="sm" aria-label="Close this message" onClick={() => setDismissed(rememberDismissed(browserStore(), message.id))}>Close</SecondaryButton>
          </div>
        </div>
      ))}
    </>
  );
}
