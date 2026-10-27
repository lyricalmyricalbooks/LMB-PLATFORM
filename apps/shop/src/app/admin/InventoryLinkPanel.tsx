// Inventory › Inventory app link (docs/INVENTORY_LINK.md): four steps the owner walks once —
// connect, match books, send website sales, let stock follow the inventory app — then a status view.
// Every write goes through the server (inventoryLinkApi); this screen only shows and asks.
import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, ExternalLink, RefreshCw } from "lucide-react";
import {
  DataTable, Dialog, EmptyState, ErrorState, GhostButton, LoadingState, PrimaryButton, SecondaryButton, SectionCard, SelectField,
  StatusBadge, TextField, Toggle, useConfirm, useRisoToast, type Column,
} from "./riso/components";
import { inventoryLinkApi, type LinkStatus, type StockPreview } from "./inventoryLinkApi";
import {
  DETAIL_LABELS, IAM_URL, NO_COUNT_YET, ago, appOnlyBooks, detailDiffs, detailSignature, detailText, dayBefore, editionKey, holdWords, linkStep, linkableEditions, linkedTo, linksFromChoices, openMatches,
  shopDraftFrom, suggestLinks, type AppOnlyBook, type DetailDiff, type InventoryAppBook, type InventoryLinks, type LinkableEdition, type StockRow,
} from "./inventoryLink";
import { inventoryApi } from "./inventoryApi";
import { waitingReaders, wakesRestockEmails } from "./inventoryInsights";

const PROBLEM_WORDS: Record<string, string> = {
  "not-granted": "Google Cloud hasn't given the website access to the inventory app yet. Follow the steps above, then check again.",
  "api-disabled": "The inventory app's database isn't switched on for outside access. Check that the inventory app still opens normally, then try again.",
  unreachable: "The inventory app's database didn't answer. Try again in a minute.",
};

const editionName = (e: { title: string; edition: string }) => (e.edition ? `${e.title} — ${e.edition}` : e.title);

export function InventoryLinkPanel({ books, onLinksChanged, onStockChanged, onAddBook }: {
  books: any[]; onLinksChanged?: (links: InventoryLinks) => void; onStockChanged?: () => void;
  /** "Add to the shop": open a new website book with these values; `onCreated` gets its id once saved. */
  onAddBook?: (prefill: Record<string, any>, onCreated: (id: string) => void) => void;
}) {
  const toast = useRisoToast();
  const [confirm, confirmNode] = useConfirm();
  const [status, setStatus] = useState<LinkStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [appBooks, setAppBooks] = useState<InventoryAppBook[] | null>(null);
  const [catalogError, setCatalogError] = useState("");
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [linkErrors, setLinkErrors] = useState<Array<{ bookId: string; variantId: string | null; reason: string }>>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [startDay, setStartDay] = useState("");
  const [preview, setPreview] = useState<StockPreview | null>(null);
  const [confirmApply, setConfirmApply] = useState<{ readers: number; unknown: boolean } | null>(null);
  const [confirmStart, setConfirmStart] = useState(false);
  const [changingStart, setChangingStart] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState(false);

  const state = status?.state || {};
  const step = linkStep(state);
  const links: InventoryLinks = state.links || {};
  const editions = useMemo(() => linkableEditions(books), [books]);
  const shown = editions.filter((e) => showArchived || !e.archived || linkedTo(links, e.bookId, e.variantId));
  const suggestions = useMemo(() => (appBooks ? suggestLinks(editions, appBooks, links) : {}), [editions, appBooks, links]);
  const dirty = editions.some((e) => (choices[e.key] ?? "") !== (linkedTo(links, e.bookId, e.variantId) ?? ""));

  // The matches last read from the server: a drop-down that differs from them is an unsaved choice.
  const savedLinks = useRef<InventoryLinks>({});
  // resetChoices: after saving (or unmatching) the matches, show exactly what the server kept. Otherwise
  // (Check connection, Sync now, switches, Apply) unsaved drop-down choices are kept.
  const loadStatus = async (opts: { resetChoices?: boolean } = {}) => {
    setFailed(false);
    try {
      const s = await inventoryLinkApi.status();
      setStatus(s);
      setStartDay((d) => d || s.state?.startDay || s.earliestPaidDay || s.today);
      const saved = s.state?.links || {};
      const before = savedLinks.current;
      savedLinks.current = saved;
      setChoices((prev) => Object.fromEntries(linkableEditions(books).map((e) => {
        const mine = prev[e.key];
        const unsaved = !opts.resetChoices && mine !== undefined && mine !== (linkedTo(before, e.bookId, e.variantId) || "");
        return [e.key, unsaved ? mine : linkedTo(saved, e.bookId, e.variantId) || ""];
      })));
      onLinksChanged?.(saved);
      if (s.state?.connection?.ok) void loadCatalog();
    } catch (e) {
      console.error(e);
      setFailed(true);
    }
  };
  const loadCatalog = async () => {
    setCatalogError("");
    try { setAppBooks((await inventoryLinkApi.catalog()).books); }
    catch (e: any) { setCatalogError(e?.message || "The inventory app's books couldn't be read."); }
  };
  useEffect(() => { void loadStatus(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Opening the page checks book details against the app again (the sweep only does it hourly).
  const detailsChecked = useRef(false);
  useEffect(() => {
    if (detailsChecked.current || !status?.state?.connection?.ok || !Object.keys(status.state.links || {}).length) return;
    detailsChecked.current = true;
    inventoryLinkApi.checkDetails()
      .then(({ detailDiffs: fresh }) => setStatus((s) => (s ? { ...s, state: { ...s.state, detailDiffs: fresh } } : s)))
      .catch(() => { /* the saved list from the last hourly check stays */ });
  }, [status]);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try { await fn(); } catch (e: any) { toast(e?.message || "That didn't work. Try again in a minute.", { tone: "err" }); }
    finally { setBusy(null); }
  };

  const check = () => run("check", async () => {
    const { connection } = await inventoryLinkApi.check();
    toast(connection.ok ? "Connected to the inventory app." : PROBLEM_WORDS[connection.problem] || "Not connected yet.", { tone: connection.ok ? "ok" : "warn" });
    await loadStatus();
  });

  const saveLinks = () => run("links", async () => {
    const res = await inventoryLinkApi.saveLinks(linksFromChoices(editions, choices));
    setLinkErrors(res.errors);
    toast(res.errors.length ? `Saved, but ${res.errors.length} match${res.errors.length === 1 ? "" : "es"} couldn't be used — see below.` : "Book matches saved.", { tone: res.errors.length ? "warn" : "ok" });
    await loadStatus({ resetChoices: true });
  });

  // The sweep's hourly check: website books it can match by ISBN or title, waiting for one click.
  const newMatches = openMatches(state.newMatches?.items, links, state.ignoredMatches || {});
  // Books only the inventory app has (the hourly check): offered as new draft website books.
  const onlyInApp = appOnlyBooks(state);
  const addToShop = (book: AppOnlyBook) => onAddBook?.(shopDraftFrom(book), (id) => {
    inventoryLinkApi.linkNewBook(id, book.id)
      .then(() => toast(`Saved as a draft and matched to “${book.title}” in the inventory app. Publish it from Books when it's ready.`))
      .catch((e: any) => toast(`Saved as a draft. ${e?.message || "It couldn't be matched yet."} You can match it in this list.`, { tone: "warn" }))
      .finally(() => { void loadStatus(); });
  });
  const leaveOut = (book: AppOnlyBook) => run(`leave-${book.id}`, async () => {
    await inventoryLinkApi.ignoreAppBooks([book.id]);
    await loadStatus();
    toast(`“${book.title}” won't be offered for the shop.`, {
      actionLabel: "Undo",
      onAction: () => { void inventoryLinkApi.unignoreAppBooks([book.id]).then(() => loadStatus()).catch(() => toast("Couldn't undo. Try again in a minute.", { tone: "err" })); },
    });
  });

  // Book details the two apps disagree on: copy the app's value onto the website book, or leave it.
  const differing = detailDiffs(state);
  const takeAppValue = async (d: DetailDiff) => {
    const label = DETAIL_LABELS[d.field].toLowerCase();
    const yes = await confirm({
      title: `Use the app's ${label}?`,
      message: `“${d.title}” on the website changes from ${detailText(d.field, d.shop)} to ${detailText(d.field, d.app)}.`
        + (d.field === "price" ? " Shoppers pay the new price from now on." : " Shoppers see it straight away."),
      confirmLabel: `Use the app's ${label}`,
    });
    if (!yes) return;
    await run(`detail-${d.id}`, async () => {
      try {
        const res = await inventoryLinkApi.applyDetail(d.id, detailSignature(d));
        setStatus((s) => (s ? { ...s, state: { ...s.state, detailDiffs: res.detailDiffs } } : s));
        toast(`Website ${label} updated for “${d.title}”.`);
        onStockChanged?.();
      } catch (e: any) {
        toast(e?.message || "That didn't work. Try again in a minute.", { tone: "warn" });
        const fresh = await inventoryLinkApi.checkDetails().catch(() => null);
        if (fresh) setStatus((s) => (s ? { ...s, state: { ...s.state, detailDiffs: fresh.detailDiffs } } : s));
      }
    });
  };
  const leaveDetail = (d: DetailDiff) => run(`keep-${d.id}`, async () => {
    const res = await inventoryLinkApi.keepDetail(d.id, detailSignature(d));
    setStatus((s) => (s ? { ...s, state: { ...s.state, keptDetails: res.keptDetails } } : s));
    toast(`Left as is. It comes back only if one of the two changes.`);
  });

  // The server adds them to the links as they are now and never replaces a match.
  const matchNew = () => run("links", async () => {
    const res = await inventoryLinkApi.acceptMatches(newMatches.map((m) => m.key));
    setLinkErrors(res.errors);
    const skipped = newMatches.length - res.added;
    toast(skipped ? `${res.added} matched. ${skipped} couldn't be used — see below.` : `${res.added === 1 ? "Book" : "Books"} matched. Their website sales now reach the inventory app.`, { tone: skipped ? "warn" : "ok" });
    await loadStatus();
  });

  const ignoreNew = () => run("links", async () => {
    await inventoryLinkApi.ignoreMatches(newMatches.map((m) => ({ key: m.key, inventoryBookId: m.inventoryBookId })));
    toast("Left out. You can still match these books in the list below.");
    await loadStatus();
  });

  // Always possible, even when the inventory app can't be reached: every matched book's stock becomes
  // editable on the website again.
  const unlinkAll = () => run("links", async () => {
    setConfirmUnlink(false);
    await inventoryLinkApi.saveLinks({});
    setLinkErrors([]);
    toast("All books unmatched. Their stock is edited on the website again.");
    await loadStatus({ resetChoices: true });
  });

  const startSales = () => run("start", async () => {
    setConfirmStart(false);
    const moving = !!state.startDay;
    await inventoryLinkApi.startSales(startDay);
    setChangingStart(false);
    toast(moving
      ? `Older website sales from ${startDay} are on their way. They come into the inventory app by themselves the next time it's open.`
      : "Website sales are on their way to the inventory app.");
    await loadStatus();
  });

  const doPreview = () => run("preview", async () => {
    const res = await inventoryLinkApi.preview();
    setPreview(res.stock);
    if (res.stock?.notReady) toast("Send website sales first (step 3), so the numbers include every website sale.", { tone: "warn" });
    if (res.stock?.catchingUp) toast("Some recent website sales are still being recorded. Try again in a few minutes.", { tone: "warn" });
  });

  const askApply = () => run("apply", async () => {
    if (!preview?.rows) return;
    let readers = 0;
    let unknown = false;
    for (const row of preview.rows) {
      const book = books.find((b) => b.id === row.bookId);
      if (row.to == null || row.from == null || !wakesRestockEmails(book, row.from, row.to)) continue;
      try { readers += waitingReaders(await inventoryApi.stockAlerts(row.bookId), row.variantId); } catch { unknown = true; }
    }
    setConfirmApply({ readers, unknown });
  });

  const apply = () => run("apply", async () => {
    setConfirmApply(null);
    if (!preview) return;
    const res = await inventoryLinkApi.apply(preview.hash);
    if (res.stock?.catchingUp) {
      setPreview(null);
      toast("Some recent website sales are still being recorded, so nothing was changed. Preview again in a few minutes.", { tone: "warn" });
      return;
    }
    if (res.stock?.changed) {
      setPreview(res.stock);
      toast("The numbers moved since the preview (a sale, or a change in the inventory app). Check the new preview and apply again.", { tone: "warn" });
      return;
    }
    const applied = res.stock?.applied || [];
    const changed = applied.filter((r) => r.result === "applied").length;
    toast(`${changed} stock count${changed === 1 ? "" : "s"} updated from the inventory app.`);
    setPreview(null);
    onStockChanged?.();
    await loadStatus();
  });

  const syncNow = () => run("sync", async () => {
    const res = await inventoryLinkApi.syncNow();
    const changed = (res.stock?.applied || []).filter((r) => r.result === "applied").length;
    toast(res.stock?.notReady ? "Sales were sent. Stock follows once past orders are all sent."
      : res.stock?.catchingUp ? "Sales were sent. Some are still being recorded, so stock waits for the next check."
      : `Checked. ${changed} stock count${changed === 1 ? "" : "s"} updated.`);
    if (changed) onStockChanged?.();
    await loadStatus();
  });

  const setOption = (options: { autoSync?: boolean; rehearsal?: boolean }) => run("options", async () => {
    await inventoryLinkApi.setOptions(options);
    await loadStatus();
  });

  if (failed) return <ErrorState title="The inventory app link couldn't be loaded" onRetry={() => loadStatus()} />;
  if (!status) return <LoadingState label="Checking the inventory app link…" />;

  const connection = state.connection || {};
  const serviceAccount = status.serviceAccount || connection.serviceAccount || "";
  const appBookName = (id: string) => appBooks?.find((b) => b.id === id)?.title || id;
  const linkedCount = editions.filter((e) => linkedTo(links, e.bookId, e.variantId)).length;
  const anyLinks = Object.keys(links).length > 0;
  const backfill = state.backfill || {};
  const pending = state.pendingImport || null;

  // Editions of one book matched to the same inventory app book share one pile of copies.
  const sharesWith = (e: LinkableEdition) => (choices[e.key]
    ? editions.filter((o) => o.key !== e.key && o.bookId === e.bookId && choices[o.key] === choices[e.key]).map((o) => o.edition || o.title)
    : []);

  const linkColumns: Column<LinkableEdition>[] = [
    { key: "title", header: "On the website", lead: true, render: (e) => (
      <div style={{ overflowWrap: "anywhere", minWidth: 150 }}>
        <div style={{ fontWeight: 600 }}>{e.title}</div>
        <div className="rp-hint">{[e.edition, e.isbn && `ISBN ${e.isbn}`, e.archived && "Archived"].filter(Boolean).join(" · ") || "—"}</div>
      </div>
    ) },
    { key: "app", header: "Inventory app book", render: (e) => (
      <div style={{ minWidth: 200 }}>
        <SelectField label={`Inventory app book for ${editionName(e)}`} hideLabel value={choices[e.key] ?? ""}
          onChange={(ev) => setChoices((c) => ({ ...c, [e.key]: ev.target.value }))} disabled={!appBooks || busy === "links"}>
          <option value="">Not linked</option>
          {(appBooks || []).map((b) => <option key={b.id} value={b.id}>{b.title}{b.onHand != null ? ` (${b.onHand} on hand)` : ""}</option>)}
        </SelectField>
        {!choices[e.key] && suggestions[e.key] && <div className="rp-hint">Suggested: {appBookName(suggestions[e.key])}</div>}
        {sharesWith(e).length > 0 && <div className="rp-hint">Same copies as {sharesWith(e).join(", ")}: a sale of either takes a copy off both.</div>}
        {choices[e.key] && appBooks && appBooks.find((b) => b.id === choices[e.key])?.onHand == null && <div className="rp-hint">{NO_COUNT_YET}</div>}
        {linkErrors.filter((x) => editionKey(x.bookId, x.variantId) === e.key).map((x) => (
          <div key={x.reason} className="rp-hint" role="alert" style={{ color: "var(--rp-danger)" }}>✕ {x.reason}</div>
        ))}
      </div>
    ) },
    { key: "stock", header: "Website stock", numeric: true, render: (e) => (e.tracked ? e.stock : (
      <span className="rp-hint" style={{ display: "inline-block", maxWidth: 180, textAlign: "right" }}>
        {linkedTo(links, e.bookId, e.variantId) ? "Not counted yet. Preview stock changes, then Apply these numbers, switches counting on." : "Not counted"}
      </span>
    )) },
  ];

  const stockColumns: Column<StockRow>[] = [
    { key: "title", header: "Book", lead: true, render: (r) => (
      <div style={{ overflowWrap: "anywhere", minWidth: 150 }}>
        <div style={{ fontWeight: 600 }}>{r.title || "Missing book"}</div>
        {r.edition && <div className="rp-hint">{r.edition}</div>}
        {appBookName(r.inventoryBookId) !== r.title && <div className="rp-hint">Inventory app: {appBookName(r.inventoryBookId)}</div>}
      </div>
    ) },
    { key: "from", header: "Website now", numeric: true, render: (r) => r.from ?? "—" },
    { key: "app", header: "Inventory app on hand", numeric: true, render: (r) => r.appOnHand ?? "—" },
    { key: "to", header: "Website will show", numeric: true, render: (r) => (r.to == null ? "—" : r.to === r.from ? r.to : <strong>{r.to}</strong>) },
    { key: "note", header: "Why", render: (r) => {
      const notes = [
        r.hold ? holdWords(r, { inPreview: true }) : "",
        r.webTotal - (r.webCopies || 0) > 0 ? `${r.webTotal - (r.webCopies || 0)} website sale${r.webTotal - (r.webCopies || 0) === 1 ? "" : "s"} not in the inventory app yet, already taken off.` : "",
        r.appAhead ? "The inventory app counts more website sales than the website does: usually a website refund it hasn't added yet. Shown at the inventory app's number." : "",
      ].filter(Boolean);
      return notes.length ? <div className="rp-hint" style={{ overflowWrap: "anywhere", minWidth: 200 }}>{notes.join(" ")}</div> : <span className="rp-hint">{r.to === r.from ? "Already matches" : "From the inventory app's count"}</span>;
    } },
  ];

  return (
    <div className="rp-stack">
      {confirmNode}
      <SectionCard title="Connect"
        description="One-time access, given in Google Cloud."
        actions={<StatusBadge tone={connection.ok ? "success" : "warning"}>{connection.ok ? "Connected" : "Not connected yet"}</StatusBadge>}>
        <details className="rp-howto" open={!connection.ok}>
        <summary>{connection.ok ? "How it was set up" : "Set it up · 5 minutes, once"}</summary>
        <ol style={{ margin: "6px 0 4px", paddingLeft: 20, display: "grid", gap: 10, listStyle: "decimal" }}>
          <li>
            Copy this address:{" "}
            {serviceAccount
              ? <><code className="rp-mono" style={{ overflowWrap: "anywhere" }}>{serviceAccount}</code>{" "}
                  <SecondaryButton size="sm" icon={<Copy size={14} aria-hidden />} onClick={async () => {
                    try {
                      if (!navigator.clipboard?.writeText) throw new Error("no clipboard");
                      await navigator.clipboard.writeText(serviceAccount);
                      toast("Address copied.");
                    } catch { toast("Couldn't copy automatically. Select the address and copy it yourself.", { tone: "warn" }); }
                  }}>Copy</SecondaryButton></>
              : <span className="rp-hint">it appears here once the updated website is live.</span>}
          </li>
          <li>
            Open Google Cloud, signed in as lyricalmyricalbooks@gmail.com:{" "}
            <a className="rp-link" href={IAM_URL} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
              Inventory app permissions <ExternalLink size={12} aria-hidden /><span className="rp-sr-only"> (opens in a new tab)</span>
            </a>
          </li>
          <li>Press <strong>Grant access</strong>, paste the address under <strong>New principals</strong>, pick the role <strong>Cloud Datastore User</strong>, then press <strong>Save</strong>.</li>
          <li>Come back here and press <strong>Check connection</strong>.</li>
        </ol>
        </details>
        {!connection.ok && connection.problem && <p className="rp-hint" role="status" style={{ marginTop: 12 }}>{PROBLEM_WORDS[connection.problem] || connection.error}</p>}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginTop: 16 }}>
          <PrimaryButton disabled={!!busy} onClick={check}>{busy === "check" ? "Checking…" : "Check connection"}</PrimaryButton>
          <span className="rp-hint">
            {connection.checkedAt ? `Last checked ${ago(connection.checkedAt)}.` : ""}
            {" "}The inventory app {state.app?.lastFeedAt ? `last shared its counts ${ago(state.app.lastFeedAt)}` : "hasn't shared its counts yet — open the updated inventory app once"}.
          </span>
        </div>
      </SectionCard>

      <SectionCard flush title="Match books"
        description="Each printed edition, paired with its book in the app."
        actions={<StatusBadge tone={editions.length && linkedCount === editions.length ? "success" : "neutral"}>{linkedCount} of {editions.length} matched</StatusBadge>}>
        {(step === "connect" || catalogError) && anyLinks && (
          <div style={{ padding: 16, display: "grid", gap: 8 }} role="status">
            <p className="rp-hint" style={{ margin: 0 }}>
              Matched books' stock can only change from the inventory app.
              If the link can't be fixed, unmatch them to edit their stock on the website again.
            </p>
            <div><SecondaryButton disabled={!!busy} onClick={() => setConfirmUnlink(true)}>Unmatch all books</SecondaryButton></div>
          </div>
        )}
        {step === "connect"
          ? (anyLinks ? null : <EmptyState title="Connect first" description="Once Connect shows Connected, the app's books appear here." />)
          : catalogError ? <ErrorState description={catalogError} onRetry={loadCatalog} />
          : !appBooks ? <LoadingState label="Reading the inventory app's books…" />
          : <>
              {newMatches.length > 0 && (
                <div style={{ padding: 16, display: "grid", gap: 8, borderBottom: "1px solid var(--rp-border)" }} role="status">
                  <div style={{ fontWeight: 600 }}>New books to match</div>
                  <p className="rp-hint" style={{ margin: 0 }}>These books have the same ISBN or title in both shops. Until they're matched, their website sales don't reach the inventory app.</p>
                  <ul className="rp-list" aria-label="Suggested new matches" style={{ margin: 0 }}>
                    {newMatches.map((m) => (
                      <li key={m.key} style={{ overflowWrap: "anywhere" }}>{editionName(m)} → <strong>{m.inventoryTitle}</strong></li>
                    ))}
                  </ul>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                    <PrimaryButton disabled={!!busy} onClick={matchNew}>{busy === "links" ? "Saving…" : newMatches.length === 1 ? "Match this book" : `Match these ${newMatches.length} books`}</PrimaryButton>
                    <SecondaryButton disabled={!!busy} onClick={ignoreNew}>Not these</SecondaryButton>
                  </div>
                </div>
              )}
              {onlyInApp.length > 0 && (
                <div style={{ padding: 16, display: "grid", gap: 8, borderBottom: "1px solid var(--rp-border)" }} role="group" aria-labelledby="ilp-app-only-title">
                  <div id="ilp-app-only-title" style={{ fontWeight: 600 }}>In the inventory app, not in the shop</div>
                  <p className="rp-hint" style={{ margin: 0 }}>Add one as a draft website book filled in from the app. It's matched for you, and nothing is published until you publish it.</p>
                  <ul className="rp-list" aria-label="Inventory app books not in the shop" style={{ margin: 0 }}>
                    {onlyInApp.map((b) => (
                      <li key={b.id} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                        <div style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                          <div>{b.title}</div>
                          <div className="rp-hint">{[b.author, b.isbn && `ISBN ${b.isbn}`, b.price ? `${b.currency || ""}${b.price}` : ""].filter(Boolean).join(" · ") || "No other details in the app"}</div>
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                          {onAddBook && <SecondaryButton size="sm" disabled={!!busy} onClick={() => addToShop(b)}>Add to the shop</SecondaryButton>}
                          <GhostButton size="sm" disabled={!!busy} busy={busy === `leave-${b.id}`} onClick={() => leaveOut(b)}>Not for the shop</GhostButton>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {differing.length > 0 && (
                <div style={{ padding: 16, display: "grid", gap: 8, borderBottom: "1px solid var(--rp-border)" }} role="group" aria-labelledby="ilp-details-title">
                  <div id="ilp-details-title" style={{ fontWeight: 600 }}>Details that differ from the app</div>
                  <p className="rp-hint" style={{ margin: 0 }}>Matched books whose title, author, ISBN or price isn't the same in both. Nothing changes until you choose.</p>
                  <ul className="rp-list" aria-label="Book details that differ from the inventory app" style={{ margin: 0 }}>
                    {differing.map((d) => (
                      <li key={d.id} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                        <div style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                          <div>{d.title} · {DETAIL_LABELS[d.field]}</div>
                          <div className="rp-hint">Website: {detailText(d.field, d.shop)} · Inventory app: {detailText(d.field, d.app)}</div>
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                          {d.app && <SecondaryButton size="sm" disabled={!!busy} busy={busy === `detail-${d.id}`} onClick={() => void takeAppValue(d)}>Use the app's</SecondaryButton>}
                          <GhostButton size="sm" disabled={!!busy} busy={busy === `keep-${d.id}`} onClick={() => leaveDetail(d)}>Leave as is</GhostButton>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <DataTable caption="Book matches" columns={linkColumns} rows={shown} rowKey={(e) => e.key}
                empty={<EmptyState title="No printed books on the website yet" />} />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", padding: 16 }}>
                <PrimaryButton disabled={!!busy || !dirty} onClick={saveLinks}>{busy === "links" ? "Saving…" : "Save matches"}</PrimaryButton>
                <SecondaryButton disabled={!!busy || !Object.keys(suggestions).length}
                  onClick={() => setChoices((c) => ({ ...c, ...Object.fromEntries(Object.entries(suggestions).filter(([k]) => !c[k])) }))}>
                  Use suggestions ({Object.keys(suggestions).length})
                </SecondaryButton>
                <Toggle label="Show archived books" checked={showArchived} onChange={setShowArchived} />
              </div>
            </>}
      </SectionCard>

      <SectionCard title="Send sales"
        description="Paid orders land in the app. Hand-typed ones get linked.">
        {!state.startDay ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
            <TextField label="Send orders paid from" type="date" value={startDay} max={status.today}
              hint={status.earliestPaidDay ? `Your first website sale was on ${status.earliestPaidDay}.` : undefined}
              onChange={(e) => setStartDay(e.target.value)} />
            <PrimaryButton disabled={!!busy || step === "connect" || step === "link" || !startDay} onClick={() => setConfirmStart(true)}>Start sending sales</PrimaryButton>
            {(step === "connect" || step === "link") && <span className="rp-hint">Finish steps 1 and 2 first.</span>}
          </div>
        ) : (
          <ul className="rp-list" aria-label="Sales sent to the inventory app">
            <li>
              <div style={{ fontWeight: 600 }}>Sending website sales paid from {state.startDay}</div>
              <div className="rp-hint">{backfill.done ? `Past orders: all sent (${backfill.sent || 0}).` : `Past orders: ${backfill.sent || 0} sent so far, still sending…`} New sales go over as they're paid.</div>
              {!changingStart ? (
                <div style={{ marginTop: 8 }}>
                  <SecondaryButton disabled={!!busy} onClick={() => { setStartDay(status.earliestPaidDay && status.earliestPaidDay < state.startDay ? status.earliestPaidDay : dayBefore(state.startDay)); setChangingStart(true); }}>
                    Send older orders too
                  </SecondaryButton>
                </div>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end", marginTop: 8 }}>
                  <TextField label="Send orders paid from" type="date" value={startDay} max={dayBefore(state.startDay)}
                    hint={status.earliestPaidDay ? `Your first website sale was on ${status.earliestPaidDay}. Only an earlier day than ${state.startDay} can be chosen.` : `Only an earlier day than ${state.startDay} can be chosen.`}
                    onChange={(e) => setStartDay(e.target.value)} />
                  <PrimaryButton disabled={!!busy || !startDay || startDay >= state.startDay} onClick={() => setConfirmStart(true)}>Send from this day</PrimaryButton>
                  <SecondaryButton disabled={!!busy} onClick={() => setChangingStart(false)}>Cancel</SecondaryButton>
                </div>
              )}
            </li>
            <li>
              <div style={{ fontWeight: 600 }}>{pending ? `${pending.count} order${pending.count === 1 ? "" : "s"} waiting in the inventory app` : "Waiting in the inventory app: not checked yet"}</div>
              <div className="rp-hint">New sales, refunds and shipping updates are added when the inventory app is next open{pending?.oldestSince || pending?.oldestPaidAt ? ` · oldest waiting since ${ago(pending.oldestSince || pending.oldestPaidAt)}` : ""}. Website stock already counts them.</div>
            </li>
            {!!status.unlinkedOrders && (
              <li>
                <div style={{ fontWeight: 600 }}><StatusBadge tone="warning">{status.unlinkedOrders} order{status.unlinkedOrders === 1 ? "" : "s"} with unmatched books</StatusBadge></div>
                <div className="rp-hint">Those copies aren't counted in the inventory app yet. Match the books in step 2 and they follow.</div>
              </li>
            )}
            {!!status.undelivered && (
              <li>
                <div style={{ fontWeight: 600 }}><StatusBadge tone="warning">{status.undelivered} waiting to be sent</StatusBadge></div>
                <div className="rp-hint">The website tries again every 5 minutes. {state.connection?.ok ? "" : "Check the connection in step 1."}</div>
              </li>
            )}
          </ul>
        )}
        {state.startDay && <div style={{ marginTop: 16 }}>
          <Toggle label="Practice with Stripe test orders for 24 hours" checked={!!state.rehearsalUntil && Date.parse(state.rehearsalUntil) > Date.now()}
            disabled={!!busy} onChange={(on) => setOption({ rehearsal: on })} />
          <p className="rp-hint" style={{ margin: "6px 0 0" }}>Test-mode orders then show in the inventory app as practice runs: it shows what it would record and never changes its books.</p>
        </div>}
      </SectionCard>

      <SectionCard flush title="Stock follows the app"
        description="The app's count sets the shop's stock."
        actions={state.lastStockAt ? <span className="rp-sec-note">Last checked {ago(state.lastStockAt)}</span> : undefined}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", padding: 16 }}>
          <SecondaryButton disabled={!!busy || !state.startDay} onClick={doPreview}>{busy === "preview" ? "Working out the numbers…" : "Preview stock changes"}</SecondaryButton>
          {preview?.rows && !preview.notReady && !preview.catchingUp && (
            <PrimaryButton disabled={!!busy} onClick={askApply}>{busy === "apply" ? "Applying…" : "Apply these numbers"}</PrimaryButton>
          )}
          <Toggle label="Keep website stock in step automatically (every 15 minutes)" checked={state.autoSync === true}
            disabled={!!busy || !state.firstApplyAt} onChange={(on) => setOption({ autoSync: on })} />
          {state.firstApplyAt && <SecondaryButton icon={<RefreshCw size={14} aria-hidden />} disabled={!!busy} onClick={syncNow}>{busy === "sync" ? "Checking…" : "Sync now"}</SecondaryButton>}
        </div>
        {!state.firstApplyAt && <p className="rp-hint" style={{ margin: "0 16px 16px" }}>Preview and apply once; then you can turn on automatic updates.</p>}
        {preview?.notReady && <p className="rp-hint" role="status" style={{ margin: "0 16px 16px" }}>Send website sales first (step 3), so the numbers include every website sale.</p>}
        {preview?.catchingUp && <p className="rp-hint" role="status" style={{ margin: "0 16px 16px" }}>Some recent website sales are still being recorded. Preview again in a few minutes, so their copies aren't put back on sale.</p>}
        {preview?.rows && !preview.notReady && !preview.catchingUp && (
          <DataTable caption="Stock preview" columns={stockColumns} rows={preview.rows}
            rowKey={(r) => editionKey(r.bookId, r.variantId)} empty={<EmptyState title="No matched books" description="Pair them under Match books." />} />
        )}
        {!preview && state.lastSync && (
          <ul className="rp-list" aria-label="Last stock update">
            <li>
              <div style={{ fontWeight: 600 }}>{state.lastSync.changes?.length ? `${state.lastSync.changes.length} count${state.lastSync.changes.length === 1 ? "" : "s"} changed ${ago(state.lastSync.at)}` : `Everything matched ${ago(state.lastSync.at)}`}</div>
              {!!state.lastSync.changes?.length && <div className="rp-hint">{state.lastSync.changes.slice(0, 8).map((c: any) => `${editionName(c)}: ${c.from} → ${c.to}`).join(" · ")}</div>}
            </li>
            {(state.lastSync.holds || []).map((h: any) => (
              <li key={editionKey(h.bookId, h.variantId)}>
                <div style={{ fontWeight: 600 }}><StatusBadge tone="warning">Waiting for you</StatusBadge> {editionName(h)}</div>
                <div className="rp-hint">{holdWords(h)} Press Preview stock changes to review it.</div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <Dialog open={confirmStart} onClose={() => setConfirmStart(false)} title={state.startDay ? "Send older website orders too?" : "Start sending website sales?"}
        footer={<><SecondaryButton data-autofocus onClick={() => setConfirmStart(false)}>Cancel</SecondaryButton><PrimaryButton onClick={startSales}>{state.startDay ? "Send older orders" : "Start sending"}</PrimaryButton></>}>
        <p className="rp-card-desc" style={{ margin: 0, fontSize: "var(--rp-text-base)" }}>
          {state.startDay
            ? <>Every paid website order from {startDay} up to {state.startDay} goes to the inventory app as well, and comes into its books by itself. Sales you already typed in there by hand are linked, not counted twice; any it can't match for certain wait under Needs you in the inventory app. Website stock waits until they've all been sent. The date can only move earlier, never later.</>
            : <>Every paid website order from {startDay} on goes to the inventory app, then each new one as it's paid. They come into the inventory app's books by themselves; sales you already typed in there by hand are linked, not counted twice. You can move this date earlier later to send older orders, but not later.</>}
        </p>
      </Dialog>
      <Dialog open={confirmUnlink} onClose={() => setConfirmUnlink(false)} title="Unmatch all books?"
        footer={<><SecondaryButton data-autofocus onClick={() => setConfirmUnlink(false)}>Cancel</SecondaryButton><PrimaryButton onClick={unlinkAll}>Unmatch all</PrimaryButton></>}>
        <p className="rp-card-desc" style={{ margin: 0, fontSize: "var(--rp-text-base)" }}>
          The website stops following the inventory app's count, and every book's stock can be edited on the website again. Website sales already sent stay in the inventory app.
          You can match the books again later.
        </p>
      </Dialog>
      <Dialog open={!!confirmApply} onClose={() => setConfirmApply(null)} title="Apply these stock numbers?"
        footer={<><SecondaryButton data-autofocus onClick={() => setConfirmApply(null)}>Cancel</SecondaryButton><PrimaryButton onClick={apply}>Apply</PrimaryButton></>}>
        <p className="rp-card-desc" style={{ margin: 0, fontSize: "var(--rp-text-base)" }}>
          The website's stock for matched books changes to the numbers in the preview, and stock counting is switched on for any matched book that had it off.
          {confirmApply?.readers ? ` ${confirmApply.readers} reader${confirmApply.readers === 1 ? " is" : "s are"} waiting for a book that comes back in stock and will be emailed.` : ""}
          {confirmApply?.unknown ? " Some back-in-stock sign-ups couldn't be checked just now, so readers who asked to hear when a book is back may be emailed too." : ""}
          {" "}Each change is kept in the book's stock history.
        </p>
      </Dialog>
    </div>
  );
}
