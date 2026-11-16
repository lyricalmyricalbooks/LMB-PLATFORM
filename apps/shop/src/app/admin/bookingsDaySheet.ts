// Bookings › the day's list on paper (15 November 2026): who is coming, start by start, with a box to tick at the door.
// Plain black on white so it prints the same from any shop; opened the hidden-frame way the line sheet prints.
import type { DayListGroup } from "./bookingsView";

const escape = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

/** The printable page for one day. */
export function daySheetHtml(groups: readonly DayListGroup[], { title, shopName = "" }: { title: string; shopName?: string }): string {
  const count = groups.reduce((n, g) => n + g.people.length, 0);
  const person = (p: DayListGroup["people"][number]) => `<tr>
<td class="tick"><i></i></td>
<td><strong>${escape(p.name)}</strong>${p.tag ? ` <em>${escape(p.tag)}</em>` : ""}<br><span>${[p.phone, p.email].filter(Boolean).map(escape).join(" · ")}</span></td>
<td>${escape(p.payment)}</td>
<td>${[p.note ? `<p>${escape(p.note)}</p>` : "", ...p.answers.map((a) => `<p><b>${escape(a.label)}</b> ${escape(a.answer)}</p>`)].join("")}</td>
</tr>`;
  const group = (g: DayListGroup) => `<section>
<h2><span>${escape(g.time)}</span> ${escape(g.serviceName)}${g.people.length > 1 ? ` <small>${g.people.length} people</small>` : ""}</h2>
<table><thead><tr><th class="tick">Here</th><th>Name</th><th>Payment</th><th>Notes and answers</th></tr></thead><tbody>${g.people.map(person).join("")}</tbody></table>
</section>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escape(title)}</title><style>
@page { margin: 14mm; }
* { box-sizing: border-box; }
body { margin: 0; font: 12px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; color: #000; background: #fff; }
header { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; padding-bottom: 8px; border-bottom: 2px solid #000; }
h1 { margin: 0; font-size: 20px; letter-spacing: -0.01em; }
header p { margin: 0; font-size: 12px; }
section { margin-top: 18px; break-inside: avoid; }
h2 { margin: 0 0 6px; font-size: 14px; }
h2 span { display: inline-block; min-width: 64px; font-variant-numeric: tabular-nums; }
h2 small { font-weight: 400; font-size: 12px; }
table { width: 100%; border-collapse: collapse; }
th { text-align: left; font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase; font-weight: 600; padding: 4px 8px 4px 0; border-bottom: 1px solid #000; }
td { vertical-align: top; padding: 8px 8px 8px 0; border-bottom: 1px solid #bbb; }
td span { font-size: 11px; }
td p { margin: 0 0 2px; }
em { font-style: normal; font-size: 10px; border: 1px solid #000; border-radius: 99px; padding: 0 6px; }
.tick { width: 44px; }
.tick i { display: block; width: 16px; height: 16px; border: 1.5px solid #000; border-radius: 3px; }
</style></head><body>
<header><h1>${escape(title)}</h1><p>${[shopName, `${count} ${count === 1 ? "person" : "people"}`].filter(Boolean).map(escape).join(" · ")}</p></header>
${groups.map(group).join("")}
</body></html>`;
}

/** Opens the print dialog for the day's list. */
export function printDaySheet(html: string) {
  const frame = document.createElement("iframe");
  frame.title = "Day list"; frame.style.cssText = "position:fixed;width:1px;height:1px;left:-9999px";
  frame.onload = () => { frame.contentWindow?.addEventListener("afterprint", () => frame.remove(), { once: true }); frame.contentWindow?.focus(); frame.contentWindow?.print(); };
  frame.srcdoc = html;
  document.body.appendChild(frame);
}
