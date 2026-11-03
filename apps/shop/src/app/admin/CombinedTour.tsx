// A short first-time tour of the combined admin (shop + stockroom plan; docs/combined-admin.md, the five next moves):
// six steps on what moved where, each with a "Show me" that opens the page. Home invites the press once, in a small
// card above its figures (never a window popping over the setup guide); the account menu brings the tour back.
// Seen or skipped is remembered on this device only: missing that memory just shows the invitation again.
import { useState } from "react";
import { Dialog, GhostButton, PrimaryButton, SecondaryButton } from "./riso/components";
import { useShopWords } from "./shopWords";

/** Where a step's "Show me" goes: an admin page, or a stockroom page inside the admin. */
export type TourStop = { page: string } | { stockroom: string };
export type TourStep = { title: string; text: string; go?: TourStop; show?: string };

export const TOUR_STEPS: TourStep[] = [
  { title: "One admin for your shop and stockroom",
    text: "Everything you used to switch between is now in one menu. Your website and your stockroom still keep their own records, and the stockroom still keeps the count of your stock." },
  { title: "Home: what needs you", go: { page: "overview" }, show: "Show me Home",
    text: "Needs you lists what's waiting from both: orders to ship, payments to chase, stock counts to check. Each line opens the thing itself." },
  { title: "Orders: every sale in one list", go: { page: "sales" }, show: "Show me All sales",
    text: "Orders › All sales puts website orders beside fairs, stockists, invoices and sales entered by hand, with a button for each channel." },
  { title: "Books: stock and sales on each book", go: { page: "catalog" }, show: "Show me Books",
    text: "Open any book and pick Stock and sales: how many you have, at stockists and with the author, and what sold everywhere." },
  { title: "Sell in person: the fair till", go: { stockroom: "pos" }, show: "Show me the Fair till",
    text: "Open the Fair till once before a fair, while you have a connection. After that it opens with no signal, and your sales catch up later." },
  { title: "Money and Settings", go: { stockroom: "reconcile" }, show: "Show me Money",
    text: "Payments, expenses and tax are under Money. Your plan, billing and the shop's details are under Settings. That's the tour: you can take it again from your account menu." },
];

const KEY = "lm:combined-tour";
/** Whether this device has seen (or skipped) the tour. */
export function tourSeen(store: Pick<Storage, "getItem"> | null = safeStorage()): boolean {
  try { return store?.getItem(KEY) === "done"; } catch { return false; }
}
export function markTourSeen(store: Pick<Storage, "setItem"> | null = safeStorage()) {
  try { store?.setItem(KEY, "done"); } catch { /* private window: the invitation may show again */ }
}
function safeStorage(): Storage | null {
  try { return typeof window !== "undefined" ? window.localStorage : null; } catch { return null; }
}

/** Home's one-time invitation, in the look of Home's other notices. */
export function CombinedTourInvite({ onStart, onDismiss }: { onStart: () => void; onDismiss: () => void }) {
  return (
    <section className="rp-alerts" aria-label="New">
      <div className="rp-alert" data-tone="info" role="status">
        <span className="rp-alert-glyph" aria-hidden="true">●</span>
        <div className="rp-alert-text">
          <span className="rp-alert-kicker">New</span>
          <strong className="rp-alert-title">Your shop and stockroom are now one admin</strong>
          <span className="rp-alert-detail">A one-minute tour shows what moved where.</span>
        </div>
        <div className="rp-alert-actions">
          <PrimaryButton onClick={onStart}>Take the tour</PrimaryButton>
          <GhostButton onClick={onDismiss}>No thanks</GhostButton>
        </div>
      </div>
    </section>
  );
}

/** The tour itself: one step at a time, Back and Next, and "Show me" for the step's page. */
export function CombinedTour({ open, onClose, onGo, appearance }: {
  open: boolean; onClose: () => void; onGo: (stop: TourStop) => void; appearance?: "light" | "dark";
}) {
  const w = useShopWords();
  const [i, setI] = useState(0);
  const step = TOUR_STEPS[i];
  const last = i === TOUR_STEPS.length - 1;
  const close = () => { setI(0); onClose(); };
  return (
    <Dialog open={open} onClose={close} appearance={appearance} title={w(step.title)} description={`Step ${i + 1} of ${TOUR_STEPS.length}`}
      footer={<>
        {i > 0 && <GhostButton onClick={() => setI(i - 1)}>Back</GhostButton>}
        <PrimaryButton data-autofocus onClick={() => (last ? close() : setI(i + 1))}>{last ? "Done" : "Next"}</PrimaryButton>
      </>}>
      <div className="rp-stack">
        <p style={{ margin: 0 }}>{w(step.text)}</p>
        {step.go && <div><SecondaryButton onClick={() => { onGo(step.go!); close(); }}>{w(step.show || "Show me")}</SecondaryButton></div>}
      </div>
    </Dialog>
  );
}
