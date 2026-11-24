// The shop's own words for booking messages (plan 4, 3.5): run against the shop's copy and the server's.
import { describe, expect, test } from "vitest";
import { createRequire } from "module";
import * as shop from "./bookingMessages";

const server = createRequire(import.meta.url)("../../functions/shared/bookingMessages.js") as typeof shop;

describe.each([["shop", shop], ["server", server]] as const)("booking messages (%s copy)", (_name, m) => {
  test("every listed message has standard words in both languages", () => {
    for (const lang of ["en", "fr"] as const) {
      for (const entry of m.MESSAGE_LIST) {
        const words = (m.DEFAULT_MESSAGES[lang] as any)[entry.kind];
        if (entry.text) expect(words.text).toBeTruthy();
        else expect(words.subject && words.heading && words.lead).toBeTruthy();
      }
    }
  });

  test("cleanMessages keeps known kinds and languages, cut to size, and drops blanks", () => {
    const cleaned = m.cleanMessages({
      en: { booked: { subject: "  Hi   {client} ", heading: "", lead: "a\r\n\r\n\r\n\r\nb", extra: "x" }, nope: { subject: "x" }, textSoon: { text: "t".repeat(400) } },
      fr: { booked: "words" },
      de: { booked: { subject: "Hallo" } },
    });
    expect(cleaned).toEqual({ en: { booked: { subject: "Hi {client}", lead: "a\n\nb" }, textSoon: { text: "t".repeat(m.MAX_TEXT) } } });
    expect(m.cleanMessages(null)).toEqual({});
    expect(m.cleanMessages("x")).toEqual({});
  });

  test("the client's language comes from the booking page, else the shop", () => {
    expect(m.messageLanguage("fr-CA", "en")).toBe("fr");
    expect(m.messageLanguage("en-US", "fr")).toBe("en");
    expect(m.messageLanguage("", "fr")).toBe("fr");
    expect(m.messageLanguage(undefined, undefined)).toBe("en");
  });

  test("the owner's words win field by field; blanks keep the standard ones", () => {
    const own = { fr: { booked: { subject: "C'est noté, {client}" } }, en: { textReminder: { text: "Hey {service}" } } };
    expect(m.emailWords(own, "fr", "booked")).toEqual({ ...m.DEFAULT_MESSAGES.fr.booked, subject: "C'est noté, {client}" });
    expect(m.emailWords(own, "en", "booked")).toEqual(m.DEFAULT_MESSAGES.en.booked);
    expect(m.textWords(own, "en", "textReminder")).toBe("Hey {service}");
    expect(m.textWords(own, "fr", "textReminder")).toBe(m.DEFAULT_MESSAGES.fr.textReminder.text);
    expect(m.ownWords(own, "fr", "booked")).toBe(true);
    expect(m.ownWords(own, "en", "booked")).toBe(false);
  });

  test("fillMessage fills placeholders and closes up an empty one; French spacing stays", () => {
    expect(m.fillMessage("Soon: {service} at {shop}, {when} {with}.", { service: "Cut", shop: "Studio", when: "Tue 10:00" })).toBe("Soon: Cut at Studio, Tue 10:00.");
    expect(m.fillMessage("Réservé : {service}, {when}", { service: "Coupe", when: "mardi" })).toBe("Réservé : Coupe, mardi");
    expect(m.fillMessage("Hi {client}, {unknown}", { client: "Ada" })).toBe("Hi Ada, {unknown}");
  });

  test("texts offer no client or amount; money emails offer the amount", () => {
    expect(m.placeholdersFor("textReminder")).not.toContain("{client}");
    expect(m.placeholdersFor("fee")).toContain("{amount}");
    expect(m.placeholdersFor("booked")).not.toContain("{amount}");
  });
});
