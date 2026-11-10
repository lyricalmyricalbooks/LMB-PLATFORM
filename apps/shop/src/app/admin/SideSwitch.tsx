import type { AdminSide } from "./riso/nav";

const SIDES: { id: AdminSide; label: string }[] = [{ id: "website", label: "Website" }, { id: "stockroom", label: "Stockroom" }];
const KEY = "lm:admin-side";

/** The side last used on this device (a convenience only: missing or blocked storage means the website). */
export function rememberedSide(storage: Pick<Storage, "getItem"> | null = safeStorage()): AdminSide {
  try { return storage?.getItem(KEY) === "stockroom" ? "stockroom" : "website"; } catch { return "website"; }
}
export function rememberSide(side: AdminSide, storage: Pick<Storage, "setItem"> | null = safeStorage()): void {
  try { storage?.setItem(KEY, side); } catch { /* private window: nothing kept */ }
}
function safeStorage(): Storage | null {
  try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; }
}

/**
 * "Website · Stockroom" at the top of the combined admin's rail (Julian, 10 November 2026): running the website on one
 * side, stock, in-person sales and money on the other. Picking a side opens its first page; the rail then lists only
 * that side's items. Both are the same admin, sign-in and address. `stockroomCount`: the stockroom's to-dos, shown on
 * the Stockroom side while you are on the website's.
 */
export function SideSwitch({ side, onPick, stockroomCount = 0 }: { side: AdminSide; onPick: (side: AdminSide) => void; stockroomCount?: number }) {
  return (
    <div className="rp-app-switch rp-side-switch" role="group" aria-label="Admin side">
      {SIDES.map((s) => {
        const count = s.id === "stockroom" && side !== "stockroom" ? stockroomCount : 0;
        return (
          <button key={s.id} type="button" className="rp-app-switch-seg" aria-pressed={side === s.id}
            aria-current={side === s.id ? "page" : undefined}
            aria-label={count ? `${s.label}, ${count} to do` : undefined}
            onClick={() => { if (side !== s.id) onPick(s.id); }}>
            {s.label}
            {count > 0 && <span className="rp-side-count" aria-hidden>{count > 99 ? "99+" : count}</span>}
          </button>
        );
      })}
    </div>
  );
}
