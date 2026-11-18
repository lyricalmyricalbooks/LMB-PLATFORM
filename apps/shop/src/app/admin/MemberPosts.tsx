// Admin › Members › Posts for members (M5b): the owner writes to members, for every plan or only some, and can email a
// new post to them once. Members read the posts for their plan in their account (AccountMembership.tsx). Posts are
// server-only records (functions/memberships.js `memberPosts`), so every read and change goes through membersAdmin.
import { useEffect, useState } from "react";
import { Megaphone, Pencil, Plus, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { Checkbox, Drawer, EmptyState, GhostButton, IconButton, PrimaryButton, SecondaryButton, StatusBadge, TextArea, TextField, Toggle, useConfirm } from "./riso/components";
import { membersAdmin, type AdminPlan, type MemberPost } from "./membersApi";
import { dayText } from "./givingView";
import { MAX_POST_BODY, MAX_POST_TITLE, MAX_POSTS, cleanPost } from "../../shared/membershipRules";

const problemOf = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

/** Who reads a post, in words: "Every plan", or the plan names. */
export function postAudience(planIds: readonly string[], plans: readonly Pick<AdminPlan, "id" | "name">[]) {
  if (!planIds.length) return "Every plan";
  const names = planIds.map((id) => plans.find((p) => p.id === id)?.name).filter(Boolean) as string[];
  return names.length ? names.join(", ") : "A plan you deleted";
}

export function MemberPosts({ plans }: { plans: AdminPlan[] }) {
  const [posts, setPosts] = useState<MemberPost[] | null>(null);
  const [failed, setFailed] = useState("");
  const [editing, setEditing] = useState<MemberPost | "new" | null>(null);
  const [ask, confirmNode] = useConfirm();
  const load = () => membersAdmin<{ posts: MemberPost[] }>("posts").then((a) => { setPosts(a.posts || []); setFailed(""); }).catch((e) => setFailed(problemOf(e, "Your posts didn't load.")));
  useEffect(() => { void load(); }, []);

  const remove = async (p: MemberPost) => {
    if (!(await ask({ title: "Delete this post?", message: `"${p.title}" disappears from your members' accounts. An email already sent can't be taken back.`, confirmLabel: "Delete" }))) return;
    try {
      await membersAdmin("deletePost", { id: p.id });
      setPosts((list) => (list || []).filter((x) => x.id !== p.id));
      toast.success("Deleted.");
    } catch (e) { toast.error(problemOf(e, "That didn't delete. Try again.")); }
  };

  return (
    <>
      <div className="mbr-head">
        <h2 className="mbr-title">Posts for members</h2>
        {posts && posts.length > 0 && <SecondaryButton icon={<Plus size={16} aria-hidden />} disabled={posts.length >= MAX_POSTS} onClick={() => setEditing("new")}>New post</SecondaryButton>}
      </div>
      {failed && !posts ? (
        <div className="bkg-tile"><EmptyState icon={<Megaphone size={24} aria-hidden />} title="Your posts didn't load" description={failed}
          action={<SecondaryButton onClick={() => { void load(); }}>Try again</SecondaryButton>} /></div>
      ) : !posts ? (
        <div className="bkg-tile mbr-post-skeleton" aria-busy="true"><p className="mbr-meta">Loading your posts…</p></div>
      ) : posts.length === 0 ? (
        <div className="bkg-tile">
          <EmptyState icon={<Megaphone size={24} aria-hidden />} title="No posts yet"
            description="Write to your members: news, a behind-the-scenes look, an early peek. They read it in their account, and you can email it to them too."
            action={<PrimaryButton icon={<Plus size={16} aria-hidden />} onClick={() => setEditing("new")}>New post</PrimaryButton>} />
        </div>
      ) : (
        <ul className="mbr-posts" aria-label="Posts for members">
          {posts.map((p) => (
            <li key={p.id} className="bkg-tile mbr-post">
              <div className="mbr-main">
                <strong className="mbr-post-title">{p.title}</strong>
                <p className="mbr-meta">{[dayText(p.publishedAt), postAudience(p.planIds, plans)].filter(Boolean).join(" · ")}</p>
                <p className="mbr-post-body">{p.body}</p>
                {p.emailedAt && <p className="mbr-meta"><StatusBadge tone="neutral" glyph={false}>Emailed</StatusBadge> {p.emailedTo === 1 ? "to 1 member" : `to ${p.emailedTo} members`}</p>}
              </div>
              <div className="mbr-actions">
                <IconButton label={`Edit ${p.title}`} onClick={() => setEditing(p)}><Pencil size={16} aria-hidden /></IconButton>
                <IconButton label={`Delete ${p.title}`} onClick={() => { void remove(p); }}><Trash2 size={16} aria-hidden /></IconButton>
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing && <PostDrawer start={editing === "new" ? null : editing} plans={plans} onClose={() => setEditing(null)}
        onSaved={(post) => { setEditing(null); setPosts((list) => [post, ...(list || []).filter((x) => x.id !== post.id)].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))); }} />}
      {confirmNode}
    </>
  );
}

function PostDrawer({ start, plans, onClose, onSaved }: { start: MemberPost | null; plans: AdminPlan[]; onClose: () => void; onSaved: (p: MemberPost) => void }) {
  const [title, setTitle] = useState(start?.title || "");
  const [body, setBody] = useState(start?.body || "");
  const [every, setEvery] = useState(!start?.planIds.length);
  const [picked, setPicked] = useState<string[]>(start?.planIds || []);
  const [email, setEmail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ field: string; text: string } | null>(null);
  const err = (field: string) => (problem?.field === field ? problem.text : undefined);

  const save = async () => {
    const planIds = every ? [] : picked;
    if (!every && !planIds.length) { setProblem({ field: "plans", text: "Pick at least one plan, or choose every plan." }); return; }
    const clean = cleanPost({ title, body, planIds, email: !start && email });
    if ("problem" in clean) { setProblem({ field: clean.field, text: clean.problem }); return; }
    setBusy(true);
    try {
      const answer = await membersAdmin<{ post: MemberPost }>("savePost", { ...(start ? { id: start.id } : {}), post: clean.post });
      toast.success(answer.post.emailedAt && !start ? `Posted and emailed to ${answer.post.emailedTo === 1 ? "1 member" : `${answer.post.emailedTo} members`}.` : "Saved.");
      onSaved(answer.post);
    } catch (e) {
      const code = (e as { code?: string })?.code || "";
      setProblem({ field: ["title", "body"].includes(code) ? code : "form", text: problemOf(e, "That didn't save. Check your connection and try again.") });
    } finally { setBusy(false); }
  };

  return (
    <Drawer open onClose={onClose} title={start ? "Edit post" : "New post"}
      footer={<><GhostButton onClick={onClose} disabled={busy}>Cancel</GhostButton><PrimaryButton onClick={() => { void save(); }} busy={busy}>{start ? "Save" : email ? "Post and email" : "Post"}</PrimaryButton></>}>
      <div className="mbr-form">
        <TextField label="Title" maxLength={MAX_POST_TITLE} value={title} error={err("title")} onChange={(e) => { setTitle(e.target.value); setProblem(null); }} />
        <TextArea label="What you want to say" rows={10} maxLength={MAX_POST_BODY} hint="Leave an empty line between paragraphs." value={body} error={err("body")} onChange={(e) => { setBody(e.target.value); setProblem(null); }} />
        <fieldset className="mbr-box">
          <legend className="mbr-legend">Who reads it</legend>
          <Toggle label="Members of every plan" checked={every} onChange={(on) => { setEvery(on); setProblem(null); }} />
          {!every && (
            <div className="mbr-post-plans">
              {plans.map((p) => (
                <Checkbox key={p.id} label={p.name} checked={picked.includes(p.id)}
                  onChange={(e) => { setPicked((list) => (e.target.checked ? [...list, p.id] : list.filter((x) => x !== p.id))); setProblem(null); }} />
              ))}
              {problem?.field === "plans" && <p className="mbr-problem" role="alert">{problem.text}</p>}
            </div>
          )}
        </fieldset>
        {!start && (
          <div>
            <Toggle label="Email it to these members now" checked={email} onChange={setEmail} />
            <p className="mbr-hint">Sent once to each paid-up member, with a link to read it in their account. Members in a free trial get it too.</p>
          </div>
        )}
        {start?.emailedAt && <p className="mbr-hint">This post was emailed on {dayText(start.emailedAt)}. Changes show in members' accounts; the email isn't sent again.</p>}
        {problem?.field === "form" && <p className="mbr-problem" role="alert">{problem.text}</p>}
      </div>
    </Drawer>
  );
}
