// "From your old shop's address" (plans 23.2 and 23.11): one form for setup's Books page and the open shop's
// Books › Import. The press types the old shop's address; `read` asks the server, which reads the products the old
// shop shows the public and answers them as a product file. `onRead` then previews that file exactly like a chosen one.
import { useState, type FormEvent } from "react";
import { Globe } from "lucide-react";
import { PrimaryButton, SecondaryButton, TextField } from "./riso/components";
import { useShopWords } from "./shopWords";

export interface OldShopFile { host: string; csv: string; notes: string[] }

export function OldShopAddressForm({ read, onRead, disabled = false, primary = true }: {
  read: (address: string) => Promise<OldShopFile>;
  onRead: (file: File, notes: string[]) => void | Promise<void>;
  disabled?: boolean;
  /** The main action on its page (setup) or beside a file button (Books › Import). */
  primary?: boolean;
}) {
  const w = useShopWords();
  const [address, setAddress] = useState("");
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (reading || !address.trim()) return;
    setReading(true); setError("");
    try {
      const answer = await read(address.trim());
      await onRead(new File([answer.csv], `${answer.host} products.csv`, { type: "text/csv" }), answer.notes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work. Try again.");
    } finally {
      setReading(false);
    }
  }

  const Button = primary ? PrimaryButton : SecondaryButton;
  return (
    <form onSubmit={(e) => void submit(e)} style={{ display: "grid", gap: 12, maxWidth: 560 }}>
      <TextField label="Your old shop's web address" placeholder="yourshop.com" inputMode="url" autoComplete="url" value={address}
        hint={w("We read the books your old shop shows the public. You'll see them all before anything is kept.")}
        error={error || undefined} onChange={(e) => setAddress(e.target.value)} />
      <div><Button type="submit" icon={<Globe size={16} aria-hidden />} busy={reading} disabled={reading || disabled || !address.trim()}>{w("Bring my books over")}</Button></div>
    </form>
  );
}
