// The words of each booking email and text (Bookings plan 4, step 3.5, 23 November 2026). The owner rewrites any of
// them in Bookings › Hours & rules › Emails and texts to clients, in English and in French; a field left blank keeps the
// standard words below. A client gets the language of the booking page they used (the booking's `locale`), else the
// shop's own (Studio › Text & labels › Shop language).
//
// Saved in bookingSettings/main as `messages`: { en?: { [kind]: { subject?, heading?, lead? } | { text? } }, fr?: … }.
// Placeholders: {client} (first name), {service}, {when}, {shop}, {amount} (only where the kind has an amount), {code}
// (the points reward's code) and,
// in texts, {with} ("with Ana", or nothing). Sentences the server adds by itself (a refund, a review link, the answer-by
// date) follow the owner's words, in the same language. The details under the words (when, how long, what's paid,
// the buttons) are not edited here.

export type MessageLanguage = "en" | "fr";

export type EmailKind =
  | "booked" | "requested" | "moved" | "cancelled" | "classCancelled" | "declined" | "reminder" | "reminderConfirm"
  | "soon" | "thanks" | "tip" | "tipPaid" | "payRest" | "restPaid" | "fee" | "notCleared" | "welcome" | "birthday" | "missYou" | "loyaltyReward";
export type TextKind = "textReminder" | "textSoon";
export type MessageKind = EmailKind | TextKind;

export interface EmailWords { subject: string; heading: string; lead: string }
export interface TextWords { text: string }
export type MessageWords = { [K in EmailKind]?: Partial<EmailWords> } & { [K in TextKind]?: Partial<TextWords> };
export type BookingMessages = { en?: MessageWords; fr?: MessageWords };

/** Each message as the owner sees it in the list, in the order a booking meets them. */
export const MESSAGE_LIST: ReadonlyArray<{ kind: MessageKind; label: string; when: string; amount?: boolean; text?: boolean }> = [
  { kind: "booked", label: "Booking confirmed", when: "Sent when a booking is made or you accept a request." },
  { kind: "requested", label: "Request received", when: "Sent when a client asks for a time you check first." },
  { kind: "declined", label: "Request declined", when: "Sent when you decline a request without writing your own reason." },
  { kind: "reminder", label: "Reminder", when: "Sent before the visit, at the time set under Reminders." },
  { kind: "reminderConfirm", label: "Reminder that asks them to confirm", when: "The reminder, while Ask clients to confirm is on." },
  { kind: "soon", label: "Second reminder", when: "Sent shortly before the visit." },
  { kind: "moved", label: "Booking moved", when: "Sent when the booking moves to a new time." },
  { kind: "cancelled", label: "Booking cancelled", when: "Sent when the client or you cancel. A line about any refund follows." },
  { kind: "classCancelled", label: "Class cancelled, too few people", when: "Sent when a class or course doesn't reach its smallest number." },
  { kind: "payRest", label: "Left to pay", when: "Sent when you send the pay link for what's left.", amount: true },
  { kind: "restPaid", label: "Paid in full", when: "Sent when the rest is paid by card.", amount: true },
  { kind: "thanks", label: "Thanks for coming", when: "Sent after the visit. A review link follows when you ask for reviews." },
  { kind: "tip", label: "Thanks, with a tip button", when: "Sent after the visit while tips are on." },
  { kind: "tipPaid", label: "Tip received", when: "Sent when a tip comes in.", amount: true },
  { kind: "fee", label: "Missed-booking fee", when: "Sent when you charge the fee for a missed or late-cancelled booking.", amount: true },
  { kind: "notCleared", label: "Bank payment didn't clear", when: "Sent when a bank payment is still clearing at the start." },
  { kind: "welcome", label: "Welcome", when: "Sent the day after a client's first visit, while Keep in touch › Welcome is on." },
  { kind: "birthday", label: "Happy birthday", when: "Sent on a client's birthday, while Keep in touch › Birthdays is on." },
  { kind: "missYou", label: "We miss you", when: "Sent when a client hasn't been back for the weeks set under Keep in touch. {when} is their last visit." },
  { kind: "loyaltyReward", label: "Points reward", amount: true, when: "Sent when a client's points reach a reward. {amount} is what it takes off, {code} the code and {when} the last day it works." },
  { kind: "textReminder", label: "Reminder text", when: "The reminder by text, while Text reminders are on.", text: true },
  { kind: "textSoon", label: "Second reminder text", when: "The second reminder by text.", text: true },
];

const EMAIL_KINDS = new Set<string>(MESSAGE_LIST.filter((m) => !m.text).map((m) => m.kind));
const TEXT_KINDS = new Set<string>(MESSAGE_LIST.filter((m) => m.text).map((m) => m.kind));

export const MAX_SUBJECT = 150;
export const MAX_HEADING = 80;
export const MAX_LEAD = 1000;
export const MAX_TEXT = 200;

/** The standard words. English matches what the emails said before this step. */
export const DEFAULT_MESSAGES: { [L in MessageLanguage]: { [K in EmailKind]: EmailWords } & { [K in TextKind]: TextWords } } = {
  en: {
    booked: { subject: "Booked: {service}, {when}", heading: "Booking confirmed", lead: "You're booked in with {shop}." },
    requested: { subject: "Request sent: {service}, {when}", heading: "Booking requested", lead: "Thank you. {shop} looks at each booking before confirming it. The time is kept for you, and you'll get an email as soon as they answer." },
    declined: { subject: "Not booked: {service}, {when}", heading: "Not booked", lead: "{shop} can't take this booking, sorry. You're welcome to choose another time." },
    reminder: { subject: "Coming up: {service}, {when}", heading: "See you soon", lead: "A reminder of your booking with {shop}. If you can't make it, please cancel or move it below so the time can go to someone else." },
    reminderConfirm: { subject: "Coming up: {service}, {when}", heading: "See you soon", lead: "A reminder of your booking with {shop}. Please tap \"Yes, I'll be there\" so they know to expect you. If you can't make it, cancel or move it below so the time can go to someone else." },
    soon: { subject: "Soon: {service}, {when}", heading: "Starting soon", lead: "Your booking with {shop} is coming up soon. See you there." },
    moved: { subject: "Moved: {service}, now {when}", heading: "Booking moved", lead: "Your booking with {shop} has moved." },
    cancelled: { subject: "Cancelled: {service}, {when}", heading: "Booking cancelled", lead: "Your booking with {shop} is cancelled." },
    classCancelled: { subject: "Cancelled: {service}, {when}", heading: "Booking cancelled", lead: "Not enough people signed up for {service} to run, so {shop} has cancelled it. Sorry for the change of plans." },
    payRest: { subject: "Left to pay: {service}, {when}", heading: "Left to pay", lead: "There is {amount} left to pay for your booking with {shop}. You can pay it by card now, so there is nothing to pay at your visit." },
    restPaid: { subject: "Paid in full: {service}, {when}", heading: "Paid in full", lead: "Thank you. You paid {amount} by card, so your booking with {shop} is paid in full." },
    thanks: { subject: "Thank you for coming: {service}", heading: "Thanks for coming", lead: "Thank you for visiting {shop}. We hope to see you again soon." },
    tip: { subject: "Thank you for coming: {service}", heading: "Thanks for coming", lead: "Thank you for visiting {shop}. If you'd like to thank the team, you can add a tip by card. It's up to you." },
    tipPaid: { subject: "Tip received: {service}, {when}", heading: "Tip received", lead: "Thank you! Your {amount} tip for your visit to {shop} has gone through." },
    fee: { subject: "Fee charged: {service}, {when}", heading: "Fee receipt", lead: "{shop} charged {amount} to your card for this booking, as agreed when you booked. Questions? Just reply to this email." },
    notCleared: { subject: "Not booked: {service}, {when}", heading: "Payment didn't clear", lead: "Your bank payment for this booking with {shop} didn't clear in time, so the time has been released. Nothing was taken. You're welcome to book again." },
    welcome: { subject: "Welcome to {shop}", heading: "Welcome", lead: "Hi {client}, thank you for your first visit to {shop}. We loved having you, and we hope to see you again soon." },
    birthday: { subject: "Happy birthday from {shop}", heading: "Happy birthday", lead: "Hi {client}, everyone at {shop} wishes you a very happy birthday. Treat yourself to something nice today." },
    missYou: { subject: "We miss you at {shop}", heading: "We miss you", lead: "Hi {client}, it's been a while since your last visit to {shop} on {when}. Whenever you're ready, you can pick your next time online." },
    loyaltyReward: { subject: "You've earned {amount} off at {shop}", heading: "Your points earned a reward", lead: "Thank you for coming back, {client}. Your points add up to {amount} off your next visit or order. Type the code below when you book or pay. It works until {when}." },
    textReminder: { text: "Reminder: {service} at {shop}, {when} {with}." },
    textSoon: { text: "Soon: {service} at {shop}, {when} {with}." },
  },
  fr: {
    booked: { subject: "Réservé : {service}, {when}", heading: "Réservation confirmée", lead: "Votre réservation chez {shop} est confirmée." },
    requested: { subject: "Demande envoyée : {service}, {when}", heading: "Réservation demandée", lead: "Merci. {shop} vérifie chaque réservation avant de la confirmer. La plage horaire vous est réservée, et vous recevrez un courriel dès qu'on vous aura répondu." },
    declined: { subject: "Non réservé : {service}, {when}", heading: "Non réservé", lead: "{shop} ne peut pas accepter cette réservation, désolé. N'hésitez pas à choisir une autre heure." },
    reminder: { subject: "Bientôt : {service}, {when}", heading: "À bientôt", lead: "Un rappel de votre réservation chez {shop}. Si vous ne pouvez pas venir, annulez-la ou déplacez-la ci-dessous pour que la plage horaire profite à quelqu'un d'autre." },
    reminderConfirm: { subject: "Bientôt : {service}, {when}", heading: "À bientôt", lead: "Un rappel de votre réservation chez {shop}. Touchez « Oui, je serai là » pour qu'on sache que vous venez. Si vous ne pouvez pas venir, annulez-la ou déplacez-la ci-dessous." },
    soon: { subject: "Tout à l'heure : {service}, {when}", heading: "C'est bientôt", lead: "Votre réservation chez {shop} approche. À tout à l'heure." },
    moved: { subject: "Déplacé : {service}, maintenant {when}", heading: "Réservation déplacée", lead: "Votre réservation chez {shop} a été déplacée." },
    cancelled: { subject: "Annulé : {service}, {when}", heading: "Réservation annulée", lead: "Votre réservation chez {shop} est annulée." },
    classCancelled: { subject: "Annulé : {service}, {when}", heading: "Réservation annulée", lead: "Il n'y a pas assez d'inscriptions pour que {service} ait lieu, alors {shop} l'a annulé. Désolé pour ce changement." },
    payRest: { subject: "Reste à payer : {service}, {when}", heading: "Reste à payer", lead: "Il reste {amount} à payer pour votre réservation chez {shop}. Vous pouvez le payer par carte maintenant, pour n'avoir rien à payer sur place." },
    restPaid: { subject: "Payé en entier : {service}, {when}", heading: "Payé en entier", lead: "Merci. Vous avez payé {amount} par carte, et votre réservation chez {shop} est payée en entier." },
    thanks: { subject: "Merci de votre visite : {service}", heading: "Merci de votre visite", lead: "Merci d'être venu chez {shop}. Au plaisir de vous revoir." },
    tip: { subject: "Merci de votre visite : {service}", heading: "Merci de votre visite", lead: "Merci d'être venu chez {shop}. Si vous souhaitez remercier l'équipe, vous pouvez laisser un pourboire par carte. C'est à vous de voir." },
    tipPaid: { subject: "Pourboire reçu : {service}, {when}", heading: "Pourboire reçu", lead: "Merci! Votre pourboire de {amount} pour votre visite chez {shop} a bien été reçu." },
    fee: { subject: "Frais facturés : {service}, {when}", heading: "Reçu des frais", lead: "{shop} a facturé {amount} sur votre carte pour cette réservation, comme convenu lors de la réservation. Des questions? Répondez simplement à ce courriel." },
    notCleared: { subject: "Non réservé : {service}, {when}", heading: "Paiement non reçu", lead: "Votre paiement bancaire pour cette réservation chez {shop} n'a pas été reçu à temps, alors la plage horaire a été libérée. Rien n'a été prélevé. Vous pouvez réserver de nouveau." },
    welcome: { subject: "Bienvenue chez {shop}", heading: "Bienvenue", lead: "Bonjour {client}, merci pour votre première visite chez {shop}. Ce fut un plaisir de vous accueillir, et on espère vous revoir bientôt." },
    birthday: { subject: "Joyeux anniversaire de la part de {shop}", heading: "Joyeux anniversaire", lead: "Bonjour {client}, toute l'équipe de {shop} vous souhaite un très joyeux anniversaire. Faites-vous plaisir aujourd'hui." },
    missYou: { subject: "Vous nous manquez chez {shop}", heading: "Vous nous manquez", lead: "Bonjour {client}, votre dernière visite chez {shop} remonte au {when}. Quand vous le voudrez, vous pouvez choisir votre prochaine heure en ligne." },
    loyaltyReward: { subject: "{amount} de rabais chez {shop}", heading: "Vos points vous offrent une récompense", lead: "Merci de votre fidélité, {client}. Vos points vous donnent {amount} de rabais sur votre prochaine visite ou commande. Entrez le code ci-dessous au moment de réserver ou de payer. Il est valable jusqu'au {when}." },
    textReminder: { text: "Rappel : {service} chez {shop}, {when} {with}." },
    textSoon: { text: "Bientôt : {service} chez {shop}, {when} {with}." },
  },
};

const line = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");
const para = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/[ \t]+/g, " ").trim().slice(0, max) : "");

/** Keeps only known kinds and languages, words cut to size, blanks dropped (a blank keeps the standard words). Pure. */
export function cleanMessages(raw: unknown): BookingMessages {
  const out: BookingMessages = {};
  if (!raw || typeof raw !== "object") return out;
  for (const lang of ["en", "fr"] as const) {
    const given = (raw as any)[lang];
    if (!given || typeof given !== "object") continue;
    const kept: Record<string, Record<string, string>> = {};
    for (const [kind, value] of Object.entries(given)) {
      if (!value || typeof value !== "object") continue;
      const words: Record<string, string> = {};
      if (EMAIL_KINDS.has(kind)) {
        const subject = line((value as any).subject, MAX_SUBJECT);
        const heading = line((value as any).heading, MAX_HEADING);
        const lead = para((value as any).lead, MAX_LEAD);
        if (subject) words.subject = subject;
        if (heading) words.heading = heading;
        if (lead) words.lead = lead;
      } else if (TEXT_KINDS.has(kind)) {
        const text = line((value as any).text, MAX_TEXT);
        if (text) words.text = text;
      }
      if (Object.keys(words).length) kept[kind] = words;
    }
    if (Object.keys(kept).length) out[lang] = kept as MessageWords;
  }
  return out;
}

/** The client's language: the booking page's (`locale`, like "fr-CA"), else the shop's. Pure. */
export function messageLanguage(locale: unknown, shopLanguage: unknown): MessageLanguage {
  const given = String(locale || "").toLowerCase();
  if (/^fr\b/.test(given)) return "fr";
  if (/^[a-z]{2}\b/.test(given)) return "en";
  return shopLanguage === "fr" ? "fr" : "en";
}

/** An email's words in one language: the owner's where written, else the standard ones. Pure. */
export function emailWords(messages: BookingMessages | null | undefined, lang: MessageLanguage, kind: EmailKind): EmailWords {
  const base = DEFAULT_MESSAGES[lang][kind];
  const own = (messages?.[lang] as any)?.[kind] || {};
  return { subject: own.subject || base.subject, heading: own.heading || base.heading, lead: own.lead || base.lead };
}

/** A text's words in one language. Pure. */
export function textWords(messages: BookingMessages | null | undefined, lang: MessageLanguage, kind: TextKind): string {
  return (messages?.[lang] as any)?.[kind]?.text || DEFAULT_MESSAGES[lang][kind].text;
}

/** Whether the owner changed any words of one message in one language. Pure. */
export const ownWords = (messages: BookingMessages | null | undefined, lang: MessageLanguage, kind: MessageKind): boolean =>
  Object.keys((messages?.[lang] as any)?.[kind] || {}).length > 0;

export interface MessageValues { client?: string; service?: string; when?: string; shop?: string; amount?: string; with?: string; code?: string }

/** Fills the placeholders; an unknown one is left as typed, and an empty one takes the space before it away. Pure. */
export function fillMessage(template: string, values: MessageValues): string {
  return String(template || "")
    .replace(/([ \t]?)\{(client|service|when|shop|amount|with|code)\}/g, (_m, space: string, name: keyof MessageValues) => {
      const value = String(values[name] ?? "");
      return value ? space + value : "";
    })
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** The placeholders a message can use, for the owner's list. Pure. */
export function placeholdersFor(kind: MessageKind): string[] {
  const entry = MESSAGE_LIST.find((m) => m.kind === kind);
  if (entry?.text) return ["{service}", "{when}", "{shop}", "{with}"];
  if (kind === "loyaltyReward") return ["{client}", "{amount}", "{code}", "{when}", "{shop}"];
  return ["{client}", "{service}", "{when}", "{shop}", ...(entry?.amount ? ["{amount}"] : [])];
}
