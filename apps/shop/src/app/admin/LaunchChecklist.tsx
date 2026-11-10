// The launch checklist (design handoff "Colophon platform"): where the shop is (Made, Private, Live), what still stops
// it opening, each with a button to its page, and Open to shoppers once nothing is left.
import { Dialog, PrimaryButton, SecondaryButton, StatusBadge } from "./riso/components";
import type { ReadinessItem } from "./launchReadiness";

export function stepsLeftLine(n: number): string {
  return n === 0 ? "Everything shoppers need is ready." : `${n} required step${n === 1 ? "" : "s"} left`;
}

export function LaunchChecklist({ appearance, open, blockers, busy, onClose, onGo, onOpenShop }: {
  appearance?: "light" | "dark";
  open: boolean; blockers: ReadinessItem[]; busy?: boolean;
  onClose: () => void; onGo: (tab: string) => void; onOpenShop: () => void;
}) {
  return (
    <Dialog appearance={appearance} open={open} onClose={onClose} title="Launch checklist" size="lg"
      footer={<>
        <span className="rp-launch-left">{stepsLeftLine(blockers.length)}</span>
        <PrimaryButton busy={busy} disabled={blockers.length > 0} onClick={onOpenShop}>Open to shoppers</PrimaryButton>
      </>}>
      <ol className="rp-launch-stages" aria-label="Where your shop is">
        <li data-stage="done"><b>1 · Made</b><span>Your shop exists</span></li>
        <li data-stage="here" aria-current="step"><b>2 · Private</b><span>You are here</span></li>
        <li data-stage="next"><b>3 · Live</b><span>Shoppers can buy</span></li>
      </ol>
      <ul className="rp-launch-list">
        {blockers.map((b) => (
          <li key={b.id}>
            <div><strong>{b.label}</strong><p>{b.detail}</p></div>
            <StatusBadge tone="warning">Required</StatusBadge>
            <SecondaryButton size="sm" onClick={() => onGo(b.tab)}>{b.action}</SecondaryButton>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
