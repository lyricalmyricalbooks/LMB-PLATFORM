// Back from Shippo's "allow Colophon" page: the platform adds `shippo=<outcome>` and, when the press said yes, a
// one-use `shippoTicket` to the shop's own address (LMB-PLATFORM services/shippo/link.js).

const TICKET = /^[0-9a-f]{48}$/;

export function shippoReturn(search: string): { outcome: string | null; ticket: string | null } {
  const params = new URLSearchParams(search);
  const outcome = params.get("shippo");
  const ticket = params.get("shippoTicket");
  return { outcome: outcome ? outcome.slice(0, 20) : null, ticket: outcome === "ok" && ticket && TICKET.test(ticket) ? ticket : null };
}

/** What to tell the owner when Shippo came back without a connection. */
export function shippoReturnWords(outcome: string | null): string | null {
  if (!outcome) return null;
  if (outcome === "denied") return "Shippo wasn't connected, because the connection wasn't allowed on Shippo's page. Press Connect Shippo to try again.";
  return "Shippo didn't finish the connection. Press Connect Shippo again.";
}
