// Books › edit › Licence keys (gap list 38): paste a digital product's keys, one per line. Each paid copy takes the next
// one (functions/licenceKeys.js); orders that ran short get theirs as soon as more are added here.
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { PrimaryButton, SectionCard, TextArea } from "./riso/components";
import { cleanKeys } from "./licenceKeys";
import { licenceKeysStore, type KeyPool } from "./licenceKeysStore";

export function LicenceKeysCard({ bookId }: { bookId?: string }) {
  const [pool, setPool] = useState<KeyPool | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!bookId) return;
    let live = true;
    licenceKeysStore.load(bookId).then((p) => { if (live) setPool(p); }, () => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [bookId]);

  const keys = cleanKeys(text);
  const add = async () => {
    if (!bookId || !keys.length) return;
    setBusy(true);
    try {
      const r = await licenceKeysStore.add(bookId, keys);
      setPool({ waiting: r.waiting, given: r.given });
      setText("");
      toast.success(r.skipped ? `${r.added} added, ${r.skipped} already there` : `${r.added} ${r.added === 1 ? "code" : "codes"} added`);
    } catch {
      toast.error("Couldn't add the codes. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard title="Licence codes" description="Each copy sold gets the next code, sent in the order email.">
      {!bookId ? <p className="be-note">Save the product first, then add its codes.</p> : (
        <>
          <p className="be-note" data-testid="licence-key-counts">
            {failed ? "Couldn't read the codes." : pool ? `${pool.waiting} waiting · ${pool.given} given` : "Loading…"}
          </p>
          <TextArea label="Add codes" hint="One per line." rows={4} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
          <PrimaryButton size="sm" busy={busy} disabled={!keys.length || busy} onClick={() => void add()}>
            {keys.length ? `Add ${keys.length} ${keys.length === 1 ? "code" : "codes"}` : "Add codes"}
          </PrimaryButton>
        </>
      )}
    </SectionCard>
  );
}
