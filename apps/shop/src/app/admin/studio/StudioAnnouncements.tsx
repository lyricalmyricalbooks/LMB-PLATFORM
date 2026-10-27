// Theme settings › Header & announcement bar › Announcement messages: several messages for the bar,
// each with an optional link and show-from / show-until days (features/site/sectionGroups.ts reads
// them). With no messages the bar keeps using the single Announcement text above.
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { writeDesignValue } from "../../features/site/designModel";
import { activeAnnouncements, type Announcement } from "../../features/site/sectionGroups";
import { LinkPicker } from "./StudioPickers";

type Change = (fn: (d: any) => any, meta?: { label?: string; coalesce?: string }) => void;

const newId = () => `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

/** Pure list edits, so the editor's buttons and tests share them. */
export const announcementOps = {
  add: (list: Announcement[], text = ""): Announcement[] => [...list, { id: newId(), text }],
  update: (list: Announcement[], id: string, patch: Partial<Announcement>): Announcement[] =>
    list.map(a => a.id === id ? cleanMessage({ ...a, ...patch }) : a),
  remove: (list: Announcement[], id: string): Announcement[] => list.filter(a => a.id !== id),
  move: (list: Announcement[], id: string, by: number): Announcement[] => {
    const i = list.findIndex(a => a.id === id), j = i + by;
    if (i < 0 || j < 0 || j >= list.length) return list;
    const next = [...list]; [next[i], next[j]] = [next[j], next[i]];
    return next;
  },
};

/** Blank optional fields are dropped rather than saved as "". */
function cleanMessage(a: Announcement): Announcement {
  const out: any = { id: a.id, text: a.text ?? "" };
  for (const k of ["link", "from", "until"] as const) if (a[k]) out[k] = a[k];
  return out;
}

export function StudioAnnouncements({ design, change, onNotice }: {
  design: any; change: Change;
  /** A toast after Remove; `undoable` offers Undo for that removal. */
  onNotice?: (text: string, undoable?: boolean) => void;
}) {
  const list: Announcement[] = Array.isArray(design?.announcements) ? design.announcements : [];
  const write = (next: Announcement[], label: string, coalesce?: string) =>
    change(d => writeDesignValue(d, "announcements", next.length ? next : undefined, "all"), { label, coalesce });
  const showingToday = activeAnnouncements(design).length;

  return (
    <div className="studio-announcements" data-studio-panel="announcements">
      <h3 className="studio-announcements-title">Announcement messages</h3>
      <p className="studio-hint">
        {list.length
          ? `The bar shows these instead of the Announcement text above — ${showingToday} showing today. Several messages take turns.`
          : "Add messages to rotate several, link one to a page, or show one only between two dates. Without messages the bar shows the Announcement text above."}
      </p>
      <ol className="studio-announcements-list">
        {list.map((a, i) => (
          <li key={a.id} className="studio-announcement">
            <label className="studio-scheme-field">Message {i + 1}
              <input value={a.text} onChange={e => write(announcementOps.update(list, a.id, { text: e.target.value }), "Edit announcement message", `msg-text-${a.id}`)} />
            </label>
            <LinkPicker label="Link (optional)" value={a.link || ""} onChange={v => write(announcementOps.update(list, a.id, { link: v }), "Change announcement link")} />
            <div className="studio-announcement-dates">
              <label className="studio-scheme-field">Show from
                <input type="date" value={a.from || ""} onChange={e => write(announcementOps.update(list, a.id, { from: e.target.value }), "Change announcement start")} />
              </label>
              <label className="studio-scheme-field">Show until
                <input type="date" value={a.until || ""} onChange={e => write(announcementOps.update(list, a.id, { until: e.target.value }), "Change announcement end")} />
              </label>
            </div>
            <div className="studio-scheme-actions">
              <button type="button" className="studio-link-button" aria-label={`Move message ${i + 1} up`} disabled={i === 0}
                onClick={() => write(announcementOps.move(list, a.id, -1), "Move announcement up")}><ArrowUp size={14} /></button>
              <button type="button" className="studio-link-button" aria-label={`Move message ${i + 1} down`} disabled={i === list.length - 1}
                onClick={() => write(announcementOps.move(list, a.id, 1), "Move announcement down")}><ArrowDown size={14} /></button>
              <button type="button" className="studio-link-button" onClick={() => { write(announcementOps.remove(list, a.id), "Remove announcement message"); onNotice?.(`Message ${i + 1} removed.`, true); }}>
                <Trash2 size={14} /> Remove
              </button>
            </div>
          </li>
        ))}
      </ol>
      <button type="button" className="studio-link-button" onClick={() => write(announcementOps.add(list, list.length ? "" : (design?.announcementText || "")), "Add announcement message")}>
        <Plus size={14} /> Add message
      </button>
    </div>
  );
}
