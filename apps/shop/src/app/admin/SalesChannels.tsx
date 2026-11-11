import { useEffect, useState } from "react";
import { adminApi } from "./api";
import { SocialFeedDialog } from "./SocialFeedDialog";
import {
  ActionMenu, ErrorState, LoadingState, PrimaryButton, StatusBadge, useConfirm,
} from "./riso/components";
import {
  CHANNELS, PLACE_WORDS, connectOutcome, socialError, whenText, type NetworkStatus, type SocialNetwork, type SocialStatus,
} from "./socialChannels";

type Props = {
  /** Opens another admin page: "designer" (the website), "socialPosts", or a Settings page id. */
  onOpen: (page: string) => void;
  /** Where a network's sign-in page is opened; the page leaves the admin and comes back with `?social=`. */
  openSignIn?: (url: string) => void;
};

/** Takes `?social=…&network=…` off the address after reading it, so a reload doesn't say it again. */
function readOutcome() {
  const params = new URLSearchParams(window.location.search);
  const outcome = connectOutcome(params.get("social"), params.get("network"));
  if (params.has("social")) {
    params.delete("social");
    params.delete("network");
    const rest = params.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${rest ? `?${rest}` : ""}${window.location.hash}`);
  }
  return outcome;
}

/**
 * Sales channels (code plan 27.5), like Shopify's: the website, then Facebook & Instagram, Pinterest and TikTok (connect,
 * send your products to their catalogs, disconnect) and Google & YouTube (the Google link in Settings). While the
 * platform's social link is off, each channel says it is coming and Facebook, Instagram and Pinterest keep the by-hand
 * steps with the product file (SocialFeedDialog, plan 24.7).
 */
export function SalesChannels({ onOpen, openSignIn = (url) => window.location.assign(url) }: Props) {
  const [status, setStatus] = useState<SocialStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>("load");
  const [notice, setNotice] = useState<{ tone: "success" | "warning" | "danger"; text: string } | null>(null);
  const [byHand, setByHand] = useState(false);
  const [books, setBooks] = useState<any[]>([]);
  const [confirm, confirmNode] = useConfirm();

  const load = async () => {
    setBusy("load");
    setLoadError(null);
    try { setStatus(await adminApi.social("status")); } catch (err) { setLoadError(socialError(err, "load your sales channels")); } finally { setBusy(null); }
  };

  useEffect(() => {
    setNotice(readOutcome());
    load();
  }, []);

  const run = async (key: string, job: () => Promise<void>) => {
    setBusy(key);
    try { await job(); } finally { setBusy(null); }
  };

  const connect = (network: SocialNetwork) => run(`connect-${network}`, async () => {
    try {
      const { url } = await adminApi.social("connect", { network, returnUrl: `${window.location.origin}${window.location.pathname}#channels` });
      if (url) openSignIn(url);
    } catch (err) { setNotice({ tone: "danger", text: socialError(err, "open the sign-in page") }); }
  });

  const sendCatalog = (n: NetworkStatus) => run(`catalog-${n.network}`, async () => {
    try {
      await adminApi.social("sendCatalog", { network: n.network });
      setNotice({ tone: "success", text: `Products sent to ${n.name}. Updated daily.` });
      await load();
    } catch (err) { setNotice({ tone: "danger", text: socialError(err, `send your products to ${n.name}`) }); }
  });

  const disconnect = async (n: NetworkStatus) => {
    const ok = await confirm({
      title: `Disconnect ${n.name}?`,
      message: `Scheduled posts to ${n.name} won't go out.`,
      confirmLabel: "Disconnect",
    });
    if (!ok) return;
    await run(`disconnect-${n.network}`, async () => {
      try { await adminApi.social("disconnect", { network: n.network }); setNotice({ tone: "success", text: `${n.name} is disconnected.` }); await load(); }
      catch (err) { setNotice({ tone: "danger", text: socialError(err, `disconnect ${n.name}`) }); }
    });
  };

  const openByHand = async () => {
    setByHand(true);
    if (!books.length) adminApi.getAllBooks({ includePrivate: false }).then(setBooks).catch(() => setBooks([]));
  };

  if (busy === "load" && !status) return <LoadingState label="Loading your sales channels…" />;
  if (loadError && !status) return <ErrorState title="Sales channels didn't load" description={loadError} onRetry={load} />;

  const enabled = !!status?.enabled;
  const BUSY_WORDS: Record<string, string> = { connect: "Opening the sign-in page…", catalog: "Sending your products…", disconnect: "Disconnecting…" };
  const busyLine = (network: string) => {
    const [step, id] = (busy || "").split("-");
    return id === network ? BUSY_WORDS[step] : "";
  };
  const guard = (job: () => void) => () => { if (!busy) job(); };

  // The mockup: one list card of every place the shop sells, each with a line saying where it stands and a chip;
  // connecting is the row's own button, everything else sits in its ⋯ menu.
  return (
    <div className="rp-stack" data-testid="sales-channels">
      {notice && (
        <div role={notice.tone === "danger" ? "alert" : "status"} className="rp-alert" data-tone={notice.tone === "success" ? undefined : notice.tone}>
          <span className="rp-alert-glyph" aria-hidden="true">{notice.tone === "success" ? "✓" : "!"}</span>
          <div className="rp-alert-text"><span className="rp-alert-detail">{notice.text}</span></div>
        </div>
      )}

      <ul className="rp-listcard" aria-label="Where you sell">
        <li data-channel="website">
          <button type="button" className="rp-listcard-main" onClick={() => onOpen("designer")}>
            <span className="rp-listcard-name">Online store</span>
            <span className="rp-listcard-sub">Your website</span>
          </button>
          <StatusBadge tone="success" glyph={false}>On</StatusBadge>
          <ActionMenu label="Actions for Online store" actions={[{ label: "Open Design", onSelect: () => onOpen("designer") }]} />
        </li>

        {CHANNELS.map((channel) => {
          const n = status?.networks.find((x) => x.network === channel.id);
          const available = enabled && !!n?.available;
          const lost = n?.problem === "lost";
          const places = n?.connected ? n.places.map((p) => `${PLACE_WORDS[p.kind]} ${p.name}`) : [];
          const sent = n?.connected && n.canSendCatalog ? (n.catalog ? `Products sent ${whenText(n.catalog.sentAt)}` : "Products not sent yet") : "";
          const line = busyLine(channel.id)
            || (n?.connected ? [n.accountName ? `Connected as ${n.accountName}` : "", ...places, sent].filter(Boolean).join(" · ")
              : lost ? "Connection lost. Connect again to keep posting." : channel.does);
          return (
            <li key={channel.id} data-channel={channel.id}>
              <div className="rp-listcard-main">
                <span className="rp-listcard-name">{channel.name}</span>
                <span className="rp-listcard-sub" role={lost ? "alert" : undefined}>{line}</span>
              </div>
              {n?.connected ? (
                <>
                  <StatusBadge tone="success" glyph={false}>Connected</StatusBadge>
                  <ActionMenu label={`Actions for ${channel.name}`} actions={[
                    { label: "Create a post", onSelect: () => onOpen("socialPosts") },
                    ...(n.canSendCatalog ? [{ label: n.catalog ? "Send products again" : "Send my products", onSelect: guard(() => sendCatalog(n)) }] : []),
                    { label: "Disconnect", tone: "danger", onSelect: guard(() => { void disconnect(n); }) },
                  ]} />
                </>
              ) : available ? (
                <PrimaryButton size="sm" disabled={!!busy} aria-label={`${lost ? "Connect again" : "Connect"} ${channel.name}`} onClick={() => connect(channel.id)}>
                  {lost ? "Connect again" : "Connect"}
                </PrimaryButton>
              ) : (
                <>
                  <StatusBadge tone="neutral" glyph={false}>Coming soon</StatusBadge>
                  {channel.id !== "tiktok" && <ActionMenu label={`Actions for ${channel.name}`} actions={[{ label: "Set up by hand", onSelect: openByHand }]} />}
                </>
              )}
            </li>
          );
        })}

        <li data-channel="google">
          <button type="button" className="rp-listcard-main" onClick={() => onOpen("general")}>
            <span className="rp-listcard-name">Google &amp; YouTube</span>
            <span className="rp-listcard-sub">Free Shopping listings, with your Google sign-in</span>
          </button>
          <StatusBadge tone="neutral" glyph={false}>In Settings</StatusBadge>
          <ActionMenu label="Actions for Google & YouTube" actions={[{ label: "Open settings", onSelect: () => onOpen("general") }]} />
        </li>
      </ul>

      <SocialFeedDialog open={byHand} onClose={() => setByHand(false)} books={books} />
      {confirmNode}
    </div>
  );
}
