// Bookings › Hours & rules › Emails and texts to clients (plan 4, 3.5): the owner's own words for each booking
// message, in English and French. Blank fields keep the standard words (shown as the placeholder).
import { useState } from "react";
import { SecondaryButton, SelectField, StatusBadge, Tabs, TextArea, TextField } from "./riso/components";
import {
  DEFAULT_MESSAGES, MAX_HEADING, MAX_LEAD, MAX_SUBJECT, MAX_TEXT, MESSAGE_LIST, ownWords, placeholdersFor,
  type BookingMessages, type EmailKind, type MessageKind, type MessageLanguage, type TextKind,
} from "@/shared/bookingMessages";

const LANGS: Array<{ id: MessageLanguage; label: string }> = [{ id: "en", label: "English" }, { id: "fr", label: "Français" }];

export function BookingMessagesTile({ messages, onChange }: { messages: BookingMessages | undefined; onChange: (messages: BookingMessages) => void }) {
  const [lang, setLang] = useState<MessageLanguage>("en");
  const [kind, setKind] = useState<MessageKind>("booked");
  const entry = MESSAGE_LIST.find((m) => m.kind === kind)!;
  const own = ((messages?.[lang] as any)?.[kind] || {}) as Record<string, string>;
  const changedCount = MESSAGE_LIST.filter((m) => ownWords(messages, lang, m.kind)).length;
  const set = (field: string, value: string) => {
    const words = { ...own, [field]: value };
    if (!value) delete words[field];
    const langWords = { ...((messages?.[lang] as any) || {}) };
    if (Object.keys(words).length) langWords[kind] = words; else delete langWords[kind];
    onChange({ ...(messages || {}), [lang]: langWords });
  };
  const reset = () => {
    const langWords = { ...((messages?.[lang] as any) || {}) };
    delete langWords[kind];
    onChange({ ...(messages || {}), [lang]: langWords });
  };
  const base = DEFAULT_MESSAGES[lang] as any;
  return (
    <section className="bkg-tile" data-messages-tile>
      <h2 className="bkg-tile-title">Emails and texts to clients <StatusBadge tone="info" glyph={false}>Beta</StatusBadge></h2>
      <p className="bkg-cal-text">Change the words of any booking message. A blank box keeps the standard words. Clients get the French words when they booked on the French page.</p>
      <div className="bkg-msg">
        <Tabs label="Language" value={lang} onChange={setLang} idPrefix="bkg-msg-" tabs={LANGS} />
        <SelectField label="Message" value={kind} onChange={(e) => setKind(e.target.value as MessageKind)}
          hint={entry.when}>
          {MESSAGE_LIST.map((m) => (
            <option key={m.kind} value={m.kind}>{m.label}{ownWords(messages, lang, m.kind) ? " (your words)" : ""}</option>
          ))}
        </SelectField>
        {entry.text ? (
          <TextArea label="Text" rows={3} maxLength={MAX_TEXT} value={own.text || ""} placeholder={base[kind as TextKind].text}
            onChange={(e) => set("text", e.target.value)} hint="Keep it short: one text is about 160 letters." />
        ) : (
          <>
            <TextField label="Subject" maxLength={MAX_SUBJECT} value={own.subject || ""} placeholder={base[kind as EmailKind].subject}
              onChange={(e) => set("subject", e.target.value)} />
            <TextField label="Heading" maxLength={MAX_HEADING} value={own.heading || ""} placeholder={base[kind as EmailKind].heading}
              onChange={(e) => set("heading", e.target.value)} />
            <TextArea label="Message" rows={4} maxLength={MAX_LEAD} value={own.lead || ""} placeholder={base[kind as EmailKind].lead}
              onChange={(e) => set("lead", e.target.value)} hint="The visit's details, any pay or manage button and the shop's footer follow your words." />
          </>
        )}
        <p className="bkg-msg-fill">You can use {placeholdersFor(kind).map((p, i) => <span key={p}>{i ? ", " : ""}<code>{p}</code></span>)}. They fill in for each client.</p>
        <div className="bkg-msg-foot">
          <span className="bkg-cal-text">{changedCount ? `${changedCount} ${changedCount === 1 ? "message has" : "messages have"} your words in ${lang === "fr" ? "French" : "English"}.` : "All standard words."}</span>
          {ownWords(messages, lang, kind) && <SecondaryButton size="sm" onClick={reset}>Use the standard words</SecondaryButton>}
        </div>
      </div>
    </section>
  );
}
