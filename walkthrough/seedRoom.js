// A day in the life of the platform, for the control room in the walkthrough (plan 9.11): presses paying, on a trial
// and paused, open repairs, support requests, an account recovery waiting to be checked, a breach written down and
// dealt with, and a few things in the activity log. Every step goes through the platform's own code (sign-up, the shop
// maker, billing on the pretend Stripe, the repair queue, the support inbox, recovery, the breach register), so what
// the control room shows is what those parts would really write. Made-up people and money only.
import { adminClaims, person } from "./world.js";
import { TERMS_VERSION } from "../terms/terms.js";

/** Presses owned by other people than owner@example.com (whose account page keeps its three). */
export const ROOM_PRESSES = Object.freeze([
  { pressName: "Kestrel Books", address: "kestrel", plan: "both", owner: person("uid-kit", "kit@example.com", "Kit Kestrel"), pays: true, publishes: "books" },
  { pressName: "Lantern Zines", address: "lantern-zines", plan: "shop", owner: person("uid-lou", "lou@example.com", "Lou Lantern"), pays: true, publishes: "zines" },
  { pressName: "Driftwood Prints", address: "driftwood", plan: "stockroom", owner: person("uid-dee", "dee@example.com", "Dee Driftwood"), card: true, publishes: "prints" },
]);

const subscriptionOf = (world, shopId) => [...world.stripe.world.subscriptions.values()].find((sub) => sub.metadata?.lmb_shop_id === shopId)?.id;

async function addCard(world, owner, shopId) {
  const asked = await world.ask(owner, "POST", "/api/billing/card", { shopId });
  if (asked.status !== 200) throw new Error(`the walkthrough couldn't add a card for ${shopId}: ${asked.body?.message}`);
  await world.stripeEvent("checkout.session.completed", world.stripe.completeSetup(asked.body.url.split("/").pop()));
}

/** Fills the control room. Safe to run on a fresh world only (the walkthrough runs it once at start). */
export async function seedRoom(world) {
  const admin = () => adminClaims(world.clock);

  for (const press of ROOM_PRESSES) {
    await world.signup.start(press.owner, { pressName: press.pressName, plan: press.plan, country: "CA", address: press.address, termsAccepted: true, termsVersion: TERMS_VERSION, sellingToday: "online", publishes: press.publishes });
  }
  await world.shopMaker.sweep();
  for (const press of ROOM_PRESSES) {
    if (!press.pays && !press.card) continue;
    await addCard(world, press.owner, press.address);
    const sub = subscriptionOf(world, press.address);
    if (press.pays && sub) await world.stripeEvent("customer.subscription.updated", world.stripe.payMonth(sub));
  }

  // The repair queue: two to fix, one fixed.
  await world.repairs.report({ shopId: "lantern-zines", check: "web-address", problem: "lanternzines.example stopped pointing at the shop", detail: "The address's records changed at the press's domain company on Monday. The shop still answers on its own .web.app address." });
  await world.repairs.report({ shopId: "driftwood", check: "stockroom-sync", problem: "The stockroom hasn't synced for two days", detail: "The last sync was from a phone that has been offline since the weekend fair." });
  const fixed = await world.repairs.report({ shopId: "kestrel", check: "release", problem: "The 1.4.0 release check failed at checkout" });
  await world.repairs.markFixed(fixed.id, { by: admin().email, note: "Ran the release again after the payment service came back. It passed." });

  // Support: two waiting, one answered.
  const lou = ROOM_PRESSES[1].owner;
  const kit = ROOM_PRESSES[0].owner;
  await world.support.open(lou, { shopId: "lantern-zines", subject: "My web address stopped working", body: "Since Monday lanternzines.example shows an error page. The shop's other address still works. Did I break something?" });
  await world.support.open(ROOM_PRESSES[2].owner, { shopId: "driftwood", subject: "Can I sell prints in two sizes?", body: "Most of my prints come in A4 and A3. Can one print have both sizes with their own stock?" });
  const { ticket } = await world.support.open(kit, { shopId: "kestrel", subject: "Changing the receipt wording", body: "Where do I change the thank-you line on the order email?" });
  await world.support.answer(admin(), { id: ticket.id, body: "In your admin: Settings › Email sender › Words. The preview on the right shows the change before you save." });

  // Account recovery: one to check.
  await world.recovery.ask(person("uid-kit-new", "kit.kestrel@example.com", "Kit Kestrel"), {
    oldEmail: "kit@example.com",
    details: "I lost the password to my old email when I left my day job. My press is Kestrel Books; my last order was a box of 20 copies of Birdsong to the Toronto fair.",
  });

  // The breach register: one entry, reported and told.
  const { breach } = await world.room.recordBreach(admin(), {
    foundOn: world.clock.date().toISOString().slice(0, 10),
    what: "A shipping confirmation for one order went to the wrong customer because of a typo in the address book.",
    shops: ["kestrel"], people: "One customer; their name and the books they ordered.", reportedToCommissioner: false, peopleTold: true,
  });
  await world.room.updateBreach(admin(), { id: breach.id, note: "Low risk: no payment details or address were in the email. Not reportable." });

  // The activity log: an invite from the waitlist, a change to what new shops start with and a per-order fee to come.
  await world.controls.invite(admin(), { email: "chapbooks@example.com" });
  await world.room.setNewShopSwitch(admin(), { name: "gmailReceiptFinder", on: true, reason: "New presses ask for it in their first week." });
  await world.room.setFee(admin(), { shopId: "lantern-zines", basisPoints: 50, refunded: true, reason: "Lantern Zines sells mostly at fairs; half a percent online." });
  return world;
}
