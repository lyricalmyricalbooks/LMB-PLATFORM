// Book from a message (Bookings plan 4, 3.6): what the New booking window starts with when the owner books
// straight from a client's message in Messages. Pure, so it is tested without the page.

export interface MessageForBooking { name?: string; email?: string; phone?: string; subject?: string; message?: string }
export interface ServiceName { id: string; name: string; hidden?: boolean }

/** A service the message names (the longest name found wins, so "Cut and colour" beats "Cut"); "" when none. */
export function serviceFromText(text: string, services: readonly ServiceName[]): string {
  const said = ` ${String(text || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ")} `;
  let best = { id: "", length: 0 };
  for (const s of services) {
    const name = String(s.name || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    if (name.length < 3) continue;
    if (said.includes(` ${name} `) && name.length > best.length) best = { id: s.id, length: name.length };
  }
  return best.id;
}

/** The booking's note: the message's subject, else its first line, cut to a sentence's length. */
export function noteFromMessage(m: MessageForBooking): string {
  const first = String(m.subject || "").trim() || String(m.message || "").split(/\n/).map((l) => l.trim()).find(Boolean) || "";
  const cut = first.length > 120 ? `${first.slice(0, 119).trimEnd()}…` : first;
  return cut ? `From their message: ${cut}` : "";
}

/** Whether the message has an address a booking can use. */
export const canBookFrom = (m: MessageForBooking): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(m.email || "").trim());
