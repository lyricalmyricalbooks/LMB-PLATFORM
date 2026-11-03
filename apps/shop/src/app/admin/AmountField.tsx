import { useState } from "react";
import { TextField } from "./riso/components";
/**
 * A dollar amount typed as text. The box keeps what was typed while it has focus, so "499." keeps its point on the
 * way to "499.99" (turning each key press straight into a number dropped the point and saved 49999).
 */
export function AmountField({ value, onValue, max = 1000000, ...rest }: { value: number; onValue: (amount: number) => void; max?: number; label: string; placeholder?: string; hint?: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <TextField {...rest} inputMode="decimal"
      value={draft ?? (value ? String(value) : "")}
      onChange={(e) => {
        const typed = e.target.value.replace(/[^0-9.]/g, "");
        setDraft(typed);
        onValue(Math.min(max, Math.round((Number(typed) || 0) * 100) / 100));
      }}
      onBlur={() => setDraft(null)} />
  );
}
