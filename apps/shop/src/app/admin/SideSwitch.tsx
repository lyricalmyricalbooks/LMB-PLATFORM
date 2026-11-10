import type { AdminSide } from "./riso/nav";

const SIDES: { id: AdminSide; label: string }[] = [{ id: "website", label: "Website" }, { id: "stockroom", label: "Stockroom" }];

/**
 * "Website · Stockroom" at the top of the combined admin's rail (Julian, 10 November 2026): running the website on one
 * side, stock, in-person sales and money on the other. Picking a side opens its first page; the rail then lists only
 * that side's items. Both are the same admin, sign-in and address.
 */
export function SideSwitch({ side, onPick }: { side: AdminSide; onPick: (side: AdminSide) => void }) {
  return (
    <div className="rp-app-switch rp-side-switch" role="group" aria-label="Admin side">
      {SIDES.map((s) => (
        <button key={s.id} type="button" className="rp-app-switch-seg" aria-pressed={side === s.id}
          aria-current={side === s.id ? "page" : undefined} onClick={() => { if (side !== s.id) onPick(s.id); }}>
          {s.label}
        </button>
      ))}
    </div>
  );
}
