import { useState } from "react";
import { adminApi } from "./api";
import { readOldLinks } from "./oldShopApi";
import { checkOldLinks, countLinks, type OldLink } from "./oldLinks";
import { addToIndex, MAX_REDIRECTS, redirectIndex, redirectProblemIn, type Redirect } from "../features/site/redirects";
import { DataTable, PrimaryButton, SecondaryButton, StatusBadge, TextField } from "./riso/components";
import { useShopWords } from "./shopWords";

/**
 * Settings › General › URL redirects › Check your old links (plan 23.8). Before the press points its web address at
 * this shop, it types the old shop's address: the shop's server reads the old shop's list of pages, and each one is
 * tried here. Any that would land on "page not found" gets a suggested redirect, added one by one or all at once.
 */
const SHOWN = 200;
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en")} ${n === 1 ? one : many}`;

export function OldLinksCheck({ redirects, busy, onAdd }: {
  redirects: Redirect[];
  busy: boolean;
  /** Saves the list with these added; true once saved. */
  onAdd: (added: Redirect[], message: string) => Promise<boolean>;
}) {
  const w = useShopWords();
  const [address, setAddress] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<null | { host: string; paths: string[]; notes: string[]; shop: Omit<Parameters<typeof checkOldLinks>[1], "redirects"> }>(null);

  // Worked out again from the live redirect list, so a redirect added here (or in the form above) moves its row at once.
  const links = result ? checkOldLinks(result.paths, { ...result.shop, redirects }) : [];
  const counts = countLinks(links);
  const missing = links.filter((l) => l.state === "missing");
  const drafts = links.filter((l) => l.state === "draft");

  const check = async () => {
    if (!address.trim() || checking) return;
    setChecking(true); setError("");
    try {
      const [answer, books, pages, settings] = await Promise.all([
        readOldLinks(address.trim()), adminApi.getAllBooks({ includePrivate: false }), adminApi.getPages(), adminApi.getSettings(),
      ]);
      setResult({ ...answer, shop: { books, pages: pages as any[], settings } });
    } catch (err: any) {
      setResult(null);
      setError(err?.message || "We couldn't check your old links just now. Try again in a minute.");
    } finally {
      setChecking(false);
    }
  };

  /** The suggested redirects that can be saved: not already taken, no loops, within the shop's limit. */
  const addable = (rows: OldLink[]): Redirect[] => {
    const index = redirectIndex(redirects);
    const out: Redirect[] = [];
    for (const l of rows) {
      if (!l.suggestion || redirects.length + out.length >= MAX_REDIRECTS) continue;
      const r = { from: l.path, to: l.suggestion.to };
      if (redirectProblemIn(r, index)) continue;
      addToIndex(index, r);
      out.push(r);
    }
    return out;
  };
  const add = async (rows: OldLink[]) => {
    const list = addable(rows);
    if (!list.length) return;
    await onAdd(list, list.length === 1 ? "Redirect saved." : `${plural(list.length, "redirect")} added.`);
  };
  const allAddable = addable(missing);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div>
        <h3 className="rp-label" style={{ margin: 0 }}>Check your old links</h3>
        <p className="rp-hint" style={{ margin: "4px 0 0" }}>
          Do this before you point your web address here. Type your old shop's address: we read its list of pages and try each one in this shop, so old links and search results don't land on “page not found”.
        </p>
      </div>
      <form style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }} onSubmit={(e) => { e.preventDefault(); void check(); }}>
        <div style={{ flex: "1 1 240px" }}>
          <TextField label="Your old shop's address" placeholder="yourshop.com" value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="url" inputMode="url" />
        </div>
        <SecondaryButton type="submit" disabled={checking || !address.trim()}>{checking ? "Checking…" : "Check old links"}</SecondaryButton>
      </form>
      {error && <p role="alert" className="rp-error-text" style={{ margin: 0 }}>{error}</p>}
      {result && (
        <div style={{ display: "grid", gap: 10 }} aria-live="polite">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <StatusBadge tone="neutral">{plural(links.length, "old address", "old addresses")} on {result.host}</StatusBadge>
            {counts.works + counts.redirected > 0 && <StatusBadge tone="success">{plural(counts.works + counts.redirected, "works", "work")}</StatusBadge>}
            {counts.draft > 0 && <StatusBadge tone="warning">{plural(counts.draft, "waits", "wait")} for you to publish</StatusBadge>}
            <StatusBadge tone={counts.missing ? "danger" : "success"}>{counts.missing ? `${counts.missing.toLocaleString("en")} would show page not found` : "None would show page not found"}</StatusBadge>
          </div>
          {result.notes.map((n) => <p key={n} className="rp-hint" style={{ margin: 0 }}>{n}</p>)}
          {missing.length > 0 && (
            <>
              <DataTable<OldLink>
                caption="Old addresses that would show page not found" rows={missing.slice(0, SHOWN)} rowKey={(l) => l.path} stackOnPhone
                columns={[
                  { key: "from", header: "Old address", lead: true, render: (l) => <code style={{ overflowWrap: "anywhere" }}>{l.path}</code> },
                  { key: "to", header: "Suggested new home", render: (l) => <span>{l.suggestion!.to === "/collections/all" ? w(l.suggestion!.label) : l.suggestion!.label} <code style={{ overflowWrap: "anywhere" }}>{l.suggestion!.to}</code></span> },
                  { key: "act", header: "", render: (l) => <button type="button" className="rp-wb-a" disabled={busy || !addable([l]).length} onClick={() => add([l])} aria-label={`Add a redirect from ${l.path}`}>Add redirect</button> },
                ]}
              />
              {missing.length > SHOWN && <p className="rp-hint" style={{ margin: 0 }}>Showing the first {SHOWN} of {missing.length.toLocaleString("en")}. Adding them all includes every one.</p>}
              <div>
                <PrimaryButton disabled={busy || !allAddable.length} onClick={() => add(missing)}>
                  {allAddable.length ? `Add all ${plural(allAddable.length, "suggested redirect")}` : "No suggestion can be added"}
                </PrimaryButton>
              </div>
              <p className="rp-hint" style={{ margin: 0 }}>Want a different home for one? Type it in the form above instead.</p>
            </>
          )}
          {drafts.length > 0 && (
            <details>
              <summary className="rp-hint">{plural(drafts.length, "old address", "old addresses")} {drafts.length === 1 ? "works" : "work"} once you publish {drafts.length === 1 ? "its page" : "their pages"}</summary>
              <ul className="rp-hint" style={{ margin: "6px 0 0", paddingLeft: 18, maxHeight: 200, overflow: "auto" }}>
                {drafts.slice(0, SHOWN).map((l) => <li key={l.path}><code style={{ overflowWrap: "anywhere" }}>{l.path}</code></li>)}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
