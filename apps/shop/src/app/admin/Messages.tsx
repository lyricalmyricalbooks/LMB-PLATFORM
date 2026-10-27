import { useEffect, useMemo, useState } from "react";
import {
  collection, deleteDoc, doc, getCountFromServer, getDocs, limit, orderBy, query, startAfter, updateDoc, where,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { Archive, ArchiveRestore, Mail, MailOpen, Send, Trash2 } from "lucide-react";
import { auth, db } from "../../lib/firebase";
import { functionFetch } from "../lib/functionsBase";
import { plainError } from "./plainError";
import {
  Checkbox, ConfirmDialog, EmptyState, ErrorState, FilterBar, GhostButton, IconButton, LoadingState, PrimaryButton,
  SearchField, SecondaryButton, SectionCard, StatusBadge, Tabs, TextArea, ToastProvider, useRisoToast,
} from "./riso/components";

// Messages sent from the storefront Contact Form section (collection `contactMessages`).
export type ContactMessage = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  subject?: string;
  message: string;
  page?: string;
  status?: "new" | "emailed" | "read" | "archived" | "replied";
  replies?: Array<{ at: string; body: string; by?: string }>;
  createdAt?: any;
};
export type Filter = "inbox" | "unread" | "replied" | "archived";

const PAGE = 100;
export const isUnread = (m: ContactMessage) => m.status === "new" || m.status === "emailed" || !m.status;
export const hasReplied = (m: ContactMessage) => m.status === "replied" || (Array.isArray(m.replies) && m.replies.length > 0);
const toDate = (v: any): Date | null => (v?.toDate ? v.toDate() : v ? new Date(v) : null);

export function filterMessages(list: ContactMessage[], filter: Filter, q: string) {
  const needle = q.trim().toLowerCase();
  return list.filter((m) => {
    if (filter === "archived" ? m.status !== "archived" : m.status === "archived") return false;
    if (filter === "unread" && !isUnread(m)) return false;
    if (filter === "replied" && !hasReplied(m)) return false;
    if (!needle) return true;
    return [m.name, m.email, m.subject, m.message].some((s) => (s || "").toLowerCase().includes(needle));
  });
}

/** Status a message returns to when it leaves the archive (or after undoing an archive). */
export const restoredStatus = (m: ContactMessage): ContactMessage["status"] => (hasReplied(m) ? "replied" : "read");

async function replyCall(messageId: string, body: string) {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error("Sign in again as the shop administrator.");
  const response = await functionFetch("sendTestEmail", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ action: "replyToMessage", messageId, body }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `The email service answered ${response.status}. Check that Cloud Functions are deployed.`);
  return data.reply as { at: string; body: string; by?: string };
}

type OrderSummary = { count: number; latestId: string | null; more: boolean };

function Inbox({ onOpenOrder, onOpenCustomers }: { onOpenOrder?: (id: string) => void; onOpenCustomers?: (email: string) => void }) {
  const toast = useRisoToast();
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totals, setTotals] = useState<{ all: number; unread: number; archived: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<Filter>("inbox");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ContactMessage[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<string | null>(null);
  const [orders, setOrders] = useState<Record<string, OrderSummary | "loading" | "error">>({});

  const loadTotals = async () => {
    const col = collection(db, "contactMessages");
    try {
      const [all, unread, archived] = await Promise.all([
        getCountFromServer(col), getCountFromServer(query(col, where("status", "in", ["new", "emailed"]))),
        getCountFromServer(query(col, where("status", "==", "archived"))),
      ]);
      setTotals({ all: all.data().count, unread: unread.data().count, archived: archived.data().count });
    } catch { setTotals(null); }
  };

  async function load() {
    setLoading(true); setError(false); setSelected(new Set());
    try {
      const snap = await getDocs(query(collection(db, "contactMessages"), orderBy("createdAt", "desc"), limit(PAGE)));
      setMessages(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
      setCursor(snap.docs[snap.docs.length - 1] || null);
      setHasMore(snap.docs.length === PAGE);
    } catch { setError(true); } finally { setLoading(false); }
    loadTotals();
  }
  useEffect(() => { load(); }, []);

  const loadMore = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const snap = await getDocs(query(collection(db, "contactMessages"), orderBy("createdAt", "desc"), startAfter(cursor), limit(PAGE)));
      setMessages((cur) => [...cur, ...snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))]);
      setCursor(snap.docs[snap.docs.length - 1] || cursor);
      setHasMore(snap.docs.length === PAGE);
    } catch { toast("Could not load more messages.", { tone: "err" }); } finally { setLoadingMore(false); }
  };

  const setStatuses = async (list: ContactMessage[], status: ContactMessage["status"] | ((m: ContactMessage) => ContactMessage["status"])) => {
    const next = (m: ContactMessage) => (typeof status === "function" ? status(m) : status);
    const ids = new Map(list.map((m) => [m.id, next(m)]));
    setMessages((all) => all.map((x) => (ids.has(x.id) ? { ...x, status: ids.get(x.id) } : x)));
    const results = await Promise.allSettled(list.map((m) => updateDoc(doc(db, "contactMessages", m.id), { status: next(m) })));
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed) { toast(`Could not update ${failed} message${failed === 1 ? "" : "s"}.`, { tone: "err" }); load(); }
    else loadTotals();
    return failed === 0;
  };

  const archive = async (list: ContactMessage[]) => {
    const before = list.map((m) => ({ ...m }));
    if (!(await setStatuses(list, "archived"))) return;
    setSelected(new Set());
    toast(list.length === 1 ? "Message archived" : `${list.length} messages archived`, {
      actionLabel: "Undo",
      onAction: () => { void setStatuses(before, (m) => before.find((b) => b.id === m.id)?.status || "read"); },
    });
  };

  const lookUpOrders = async (email: string) => {
    const key = email.trim().toLowerCase();
    if (!key || orders[key]) return;
    setOrders((o) => ({ ...o, [key]: "loading" }));
    try {
      const snap = await getDocs(query(collection(db, "orders"), where("customer.email", "==", key), limit(50)));
      const docs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })).filter((o) => o.isTest !== true);
      const latest = docs.sort((a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0))[0];
      setOrders((o) => ({ ...o, [key]: { count: docs.length, latestId: latest?.id || null, more: snap.docs.length === 50 } }));
    } catch { setOrders((o) => ({ ...o, [key]: "error" })); }
  };

  const toggleOpen = (m: ContactMessage) => {
    const opening = open !== m.id;
    setOpen(opening ? m.id : null);
    if (opening) { lookUpOrders(m.email); if (isUnread(m)) setStatuses([m], "read"); }
  };

  const sendReply = async (m: ContactMessage) => {
    const body = (drafts[m.id] || "").trim();
    if (!body) { toast("Write a reply first.", { tone: "err" }); return; }
    setSending(m.id);
    try {
      const reply = await replyCall(m.id, body);
      setMessages((all) => all.map((x) => (x.id === m.id ? { ...x, status: "replied", replies: [...(x.replies || []), reply] } : x)));
      setDrafts((d) => { const { [m.id]: _, ...rest } = d; return rest; });
      toast(`Reply sent to ${m.email}`, { tone: "ok" });
      loadTotals();
    } catch (e: any) {
      // The server may have sent it before the answer was lost: keep the draft and say so, so it isn't sent twice blindly.
      toast(`${plainError(e, "The reply may not have been sent")} Open the message and check its replies before sending again.`, { tone: "err" });
    }
    finally { setSending(null); }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const list = deleting;
    setDeleting(null);
    const results = await Promise.allSettled(list.map((m) => deleteDoc(doc(db, "contactMessages", m.id))));
    const failed = results.filter((r) => r.status === "rejected").length;
    toast(failed ? `Could not delete ${failed} message${failed === 1 ? "" : "s"}.` : list.length === 1 ? "Message deleted" : `${list.length} messages deleted`, { tone: failed ? "err" : undefined });
    load();
  };

  const loadedCounts = useMemo(() => ({
    inbox: messages.filter((m) => m.status !== "archived").length,
    unread: messages.filter(isUnread).length,
    replied: messages.filter((m) => m.status !== "archived" && hasReplied(m)).length,
    archived: messages.filter((m) => m.status === "archived").length,
  }), [messages]);
  const list = useMemo(() => filterMessages(messages, filter, q), [messages, filter, q]);
  const last7 = useMemo(() => {
    const since = Date.now() - 7 * 86400000;
    return messages.filter((m) => (toDate(m.createdAt)?.getTime() || 0) >= since).length;
  }, [messages]);
  const unread = totals?.unread ?? loadedCounts.unread;
  const chosen = list.filter((m) => selected.has(m.id));
  const allChosen = list.length > 0 && chosen.length === list.length;
  const tabCounts: Record<Filter, number | undefined> = {
    inbox: totals ? totals.all - totals.archived : loadedCounts.inbox, unread, replied: hasMore ? undefined : loadedCounts.replied,
    archived: totals?.archived ?? loadedCounts.archived,
  };

  return (
    <div className="rp-stack">
      <Tabs<Filter> label="Message folder" value={filter} onChange={(f) => { setFilter(f); setSelected(new Set()); }}
        tabs={([["inbox", "Inbox"], ["unread", "Unread"], ["replied", "Replied"], ["archived", "Archived"]] as const).map(([id, label]) => ({ id, label, count: tabCounts[id] }))} />
      <FilterBar>
        <div className="rp-grow"><SearchField label="Search messages" placeholder="Search name, email or text…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </FilterBar>

      <SectionCard flush collapsible={false} title="Messages"
        description={`${list.length} in this view${hasMore ? " (older messages not loaded yet)" : ""} · ${last7} received in the last 7 days · ${totals?.all ?? messages.length} all time`}
        actions={unread ? <StatusBadge tone="warning">{unread} unread</StatusBadge> : <StatusBadge tone="success">All read</StatusBadge>}>
        {loading ? <LoadingState label="Loading messages…" />
          : error ? <ErrorState description="Messages could not be loaded." onRetry={load} />
          : list.length === 0 ? (
            q.trim() ? (
              <EmptyState title="No messages match" description={`Nothing in this folder mentions “${q.trim()}”.`}
                action={<SecondaryButton onClick={() => setQ("")}>Clear search</SecondaryButton>} />
            ) : (
              <EmptyState title={filter === "archived" ? "Nothing archived" : filter === "replied" ? "No replies yet" : filter === "unread" ? "All caught up" : "No messages yet"}
                description={filter === "unread" ? "Every message has been opened." : filter === "archived" ? "Archived messages land here. Nothing is deleted when you archive." : "Messages sent from the Contact Form section on your website appear here (and in your email)."} />
            )
          ) : (
            <>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", padding: "12px 16px", borderBottom: "1px solid var(--rp-border)" }}>
                <Checkbox label={chosen.length ? `${chosen.length} selected` : "Select all"} checked={allChosen}
                  onChange={(e) => setSelected(e.target.checked ? new Set(list.map((m) => m.id)) : new Set())} />
                {chosen.length > 0 && <>
                  {filter !== "archived" && <SecondaryButton size="sm" onClick={async () => { if (await setStatuses(chosen, (m) => (hasReplied(m) ? "replied" : "read"))) setSelected(new Set()); }}>Mark read</SecondaryButton>}
                  {filter === "archived"
                    ? <SecondaryButton size="sm" onClick={async () => { if (await setStatuses(chosen, restoredStatus)) setSelected(new Set()); }}>Move to inbox</SecondaryButton>
                    : <SecondaryButton size="sm" onClick={() => archive(chosen)}>Archive</SecondaryButton>}
                  <GhostButton size="sm" onClick={() => setDeleting(chosen)}>Delete…</GhostButton>
                </>}
              </div>
              <ul className="rp-list" aria-label="Messages">
                {list.map((m) => {
                  const when = toDate(m.createdAt);
                  const expanded = open === m.id;
                  const panelId = `msg-${m.id}`;
                  const ord = orders[m.email.trim().toLowerCase()];
                  return (
                    <li key={m.id} data-unread={isUnread(m) ? "true" : undefined}
                      style={isUnread(m) ? { boxShadow: "inset 3px 0 0 var(--rp-primary)" } : undefined}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-start", justifyContent: "space-between" }}>
                        <div style={{ display: "flex", gap: 10, minWidth: 0, flex: "1 1 320px" }}>
                          <input type="checkbox" aria-label={`Select message from ${m.name}`} style={{ marginTop: 4 }}
                            checked={selected.has(m.id)} onChange={(e) => setSelected((s) => { const n = new Set(s); if (e.target.checked) n.add(m.id); else n.delete(m.id); return n; })} />
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div className="rp-row-meta" style={{ marginBottom: 6 }}>
                              {isUnread(m) && <StatusBadge tone="warning">New</StatusBadge>}
                              {hasReplied(m) && <StatusBadge tone="success">Replied</StatusBadge>}
                              {m.status === "archived" && <StatusBadge tone="neutral">Archived</StatusBadge>}
                              {when && <time dateTime={when.toISOString()}>{when.toLocaleString()}</time>}
                            </div>
                            <h3 style={{ margin: "0 0 4px", fontSize: "var(--rp-text-base)", fontWeight: isUnread(m) ? 700 : 600 }}>
                              <button type="button" className="rp-disclosure" onClick={() => toggleOpen(m)} aria-expanded={expanded} aria-controls={panelId}
                                style={{ background: "none", border: 0, padding: 0, font: "inherit", color: "inherit", textAlign: "left", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3 }}>
                                {m.subject || m.name}
                              </button>
                            </h3>
                            <p style={{ margin: "0 0 6px", lineHeight: 1.55, overflowWrap: "anywhere", whiteSpace: expanded ? "pre-wrap" : "normal" }}>
                              {expanded || m.message.length <= 180 ? m.message : `${m.message.slice(0, 180)}…`}
                            </p>
                            <p className="rp-hint" style={{ margin: 0 }}>
                              {m.name} · {m.email}{m.phone ? ` · ${m.phone}` : ""}{expanded && m.page ? ` · sent from ${m.page}` : ""}
                            </p>
                          </div>
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
                          <SecondaryButton size="sm" aria-expanded={expanded} aria-controls={panelId} onClick={() => toggleOpen(m)}>
                            {expanded ? "Close" : hasReplied(m) ? "Open" : "Read & reply"}
                          </SecondaryButton>
                          {!isUnread(m) && m.status !== "archived" && (
                            <IconButton label={`Mark message from ${m.name} unread`} onClick={() => setStatuses([m], "new")}><MailOpen size={18} aria-hidden /></IconButton>)}
                          {m.status === "archived"
                            ? <IconButton label={`Move message from ${m.name} back to inbox`} onClick={() => setStatuses([m], restoredStatus(m))}><ArchiveRestore size={18} aria-hidden /></IconButton>
                            : <IconButton label={`Archive message from ${m.name}`} onClick={() => archive([m])}><Archive size={18} aria-hidden /></IconButton>}
                          <IconButton tone="danger" label={`Delete message from ${m.name}`} onClick={() => setDeleting([m])}><Trash2 size={18} aria-hidden /></IconButton>
                        </div>
                      </div>
                      {expanded && (
                        <div id={panelId} className="rp-stack" style={{ marginTop: 12, paddingLeft: 30 }}>
                          {ord && ord !== "loading" && ord !== "error" && ord.count > 0 && (
                            <p className="rp-hint" style={{ margin: 0, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                              <span>{ord.count}{ord.more ? "+" : ""} order{ord.count === 1 ? "" : "s"} from this customer</span>
                              {ord.latestId && onOpenOrder && <GhostButton size="sm" onClick={() => onOpenOrder(ord.latestId!)}>Open latest order</GhostButton>}
                              {onOpenCustomers && <GhostButton size="sm" onClick={() => onOpenCustomers(m.email)}>Open Customers</GhostButton>}
                            </p>
                          )}
                          {(m.replies || []).map((r, i) => (
                            <div key={i} className="rp-card" style={{ padding: 12, boxShadow: "none", background: "var(--rp-surface-sunken)" }}>
                              <div className="rp-hint">You replied · {new Date(r.at).toLocaleString()}</div>
                              <p style={{ margin: "6px 0 0", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{r.body}</p>
                            </div>
                          ))}
                          <TextArea label={`Reply to ${m.name}`} rows={4} maxLength={5000} value={drafts[m.id] || ""} disabled={sending === m.id}
                            hint="Sent from the shop's email to the address above; it's saved here with the message. Press Ctrl/⌘ + Enter to send."
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && sending !== m.id && (drafts[m.id] || "").trim()) { e.preventDefault(); void sendReply(m); }
                            }}
                            onChange={(e) => setDrafts((d) => ({ ...d, [m.id]: e.target.value }))} />
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                            <PrimaryButton icon={<Send size={16} aria-hidden />} disabled={sending === m.id || !(drafts[m.id] || "").trim()} onClick={() => sendReply(m)}>
                              {sending === m.id ? "Sending…" : "Send reply"}
                            </PrimaryButton>
                            <a className="rp-btn rp-btn-secondary" aria-label={`Reply to ${m.name} in your email app`}
                              href={`mailto:${encodeURIComponent(m.email)}?subject=${encodeURIComponent(`Re: ${m.subject || "your message"}`)}`}>
                              <Mail size={16} aria-hidden /> Use my email app
                            </a>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              {hasMore && (
                <div style={{ padding: 16 }}>
                  <SecondaryButton onClick={loadMore} disabled={loadingMore}>{loadingMore ? "Loading…" : "Load older messages"}</SecondaryButton>
                </div>
              )}
            </>
          )}
      </SectionCard>

      <ConfirmDialog open={!!deleting} title={deleting && deleting.length > 1 ? `Delete ${deleting.length} messages?` : "Delete this message?"}
        confirmLabel={deleting && deleting.length > 1 ? "Delete messages" : "Delete message"}
        message="This permanently removes them. Archive instead if you may need them later."
        onConfirm={confirmDelete} onCancel={() => setDeleting(null)} />
    </div>
  );
}

export default function Messages(props: { onOpenOrder?: (id: string) => void; onOpenCustomers?: (email: string) => void } = {}) {
  return <ToastProvider><Inbox {...props} /></ToastProvider>;
}
