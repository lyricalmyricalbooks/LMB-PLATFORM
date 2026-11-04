import { useEffect, useState } from "react";
import { Globe, Music2, Pin, PlaySquare } from "lucide-react";
import { Facebook, Instagram } from "../features/site/socialIcons";
import { adminApi } from "./api";
import { SocialFeedDialog } from "./SocialFeedDialog";
import {
  ErrorState, LoadingState, PrimaryButton, SecondaryButton, GhostButton, SectionCard, StatusBadge, useConfirm,
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

const ICONS: Record<SocialNetwork, React.ReactNode> = {
  meta: <span className="rp-channel-icons" aria-hidden="true"><Facebook size={18} /><Instagram size={18} /></span>,
  pinterest: <span className="rp-channel-icons" aria-hidden="true"><Pin size={18} /></span>,
  tiktok: <span className="rp-channel-icons" aria-hidden="true"><Music2 size={18} /></span>,
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

  return (
    <div className="rp-stack" data-testid="sales-channels">
      {notice && (
        <div role={notice.tone === "danger" ? "alert" : "status"} className="rp-alert" data-tone={notice.tone === "success" ? undefined : notice.tone}>
          <span className="rp-alert-glyph" aria-hidden="true">{notice.tone === "success" ? "✓" : "!"}</span>
          <div className="rp-alert-text"><span className="rp-alert-detail">{notice.text}</span></div>
        </div>
      )}

      <SectionCard title="Online store" collapsible={false} actions={<StatusBadge tone="success">On</StatusBadge>}>
        <div className="rp-channel-row">
          <span className="rp-channel-icons" aria-hidden="true"><Globe size={18} /></span>
          <p className="rp-hint" style={{ margin: 0, flex: "1 1 220px" }}>Your website.</p>
          <SecondaryButton size="sm" onClick={() => onOpen("designer")}>Open Design</SecondaryButton>
        </div>
      </SectionCard>

      {CHANNELS.map((channel) => {
        const n = status?.networks.find((x) => x.network === channel.id);
        const available = enabled && !!n?.available;
        const lost = n?.problem === "lost";
        const badge = n?.connected ? <StatusBadge tone="success">Connected</StatusBadge>
          : lost ? <StatusBadge tone="danger">Needs you</StatusBadge>
            : available ? <StatusBadge tone="neutral">Not connected</StatusBadge>
              : <StatusBadge tone="info" glyph={false}>Coming soon</StatusBadge>;
        return (
          <SectionCard key={channel.id} title={channel.name} collapsible={false} actions={badge}>
            <div className="rp-stack" style={{ gap: 12 }} data-channel={channel.id}>
              <div className="rp-channel-row">
                {ICONS[channel.id]}
                <p className="rp-hint" style={{ margin: 0, flex: "1 1 220px" }}>{channel.does}</p>
              </div>

              {n?.connected && (
                <div className="rp-stack" style={{ gap: 8 }}>
                  {n.accountName && <p style={{ margin: 0 }}>Connected as <strong>{n.accountName}</strong></p>}
                  {n.places.length > 0 && (
                    <ul className="rp-channel-places" aria-label={`Where you can post on ${channel.name}`}>
                      {n.places.map((p) => <li key={p.id}><span className="rp-hint">{PLACE_WORDS[p.kind]}</span> {p.name}</li>)}
                    </ul>
                  )}
                  {n.canSendCatalog && (
                    <p className="rp-hint" style={{ margin: 0 }}>
                      {n.catalog ? `Products sent ${whenText(n.catalog.sentAt)}, updated daily.` : "Products not sent yet."}
                    </p>
                  )}
                </div>
              )}

              {lost && <p role="alert" style={{ margin: 0 }}>Connection lost. Connect again to keep posting.</p>}

              <div className="rp-channel-actions">
                {available && !n?.connected && (
                  <PrimaryButton size="sm" disabled={!!busy} onClick={() => connect(channel.id)}>
                    {busy === `connect-${channel.id}` ? "Opening…" : lost ? "Connect again" : `Connect ${channel.name}`}
                  </PrimaryButton>
                )}
                {n?.connected && (
                  <>
                    <PrimaryButton size="sm" onClick={() => onOpen("socialPosts")}>Create a post</PrimaryButton>
                    {n.canSendCatalog && (
                      <SecondaryButton size="sm" disabled={!!busy} onClick={() => sendCatalog(n)}>
                        {busy === `catalog-${n.network}` ? "Sending…" : n.catalog ? "Send products again" : "Send my products"}
                      </SecondaryButton>
                    )}
                    <GhostButton size="sm" disabled={!!busy} onClick={() => disconnect(n)}>{busy === `disconnect-${n.network}` ? "Disconnecting…" : "Disconnect"}</GhostButton>
                  </>
                )}
                {!available && channel.id !== "tiktok" && (
                  <SecondaryButton size="sm" onClick={openByHand}>Set up by hand</SecondaryButton>
                )}
              </div>
            </div>
          </SectionCard>
        );
      })}

      <SectionCard title="Google & YouTube" collapsible={false} actions={<StatusBadge tone="neutral" glyph={false}>In Settings</StatusBadge>}>
        <div className="rp-channel-row">
          <span className="rp-channel-icons" aria-hidden="true"><PlaySquare size={18} /></span>
          <p className="rp-hint" style={{ margin: 0, flex: "1 1 220px" }}>
            Free Shopping listings and YouTube, with your Google sign-in.
          </p>
          <SecondaryButton size="sm" onClick={() => onOpen("general")}>Open settings</SecondaryButton>
        </div>
      </SectionCard>

      <SocialFeedDialog open={byHand} onClose={() => setByHand(false)} books={books} />
      {confirmNode}
    </div>
  );
}
