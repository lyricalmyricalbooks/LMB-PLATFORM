// Help inside setup mode (4 Nov 2026): the platform's own help answers shown in place, so a press setting up never has
// to leave for the help centre, and a form to ask a person, sent to the platform's support inbox
// (services/support, POST /api/support/open) as the account page's Get help form does.
//
// The answers are the platform's (help/articles.js), loaded by main.tsx from the platform site, so there is one copy.
// Without them (they didn't load) each question falls back to a link into the help centre.
import { useId, useState, type FormEvent } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";
import { PrimaryButton, TextArea, TextField } from "../app/admin/riso/components";
import type { SupportAsk } from "./door";
import { useShopWords } from "../app/admin/shopWords";

/** One help answer, as help/articles.js writes it. */
export interface HelpArticle { id: string; question: string; answer: string[]; steps?: string[] }

/** The answers by id: an empty map when they didn't load. */
export type HelpAnswers = ReadonlyMap<string, HelpArticle>;

export const helpAnswersFrom = (list: unknown): HelpAnswers =>
  new Map((Array.isArray(list) ? list : []).filter((a): a is HelpArticle => !!a && typeof a.id === "string" && Array.isArray(a.answer)).map((a) => [a.id, a]));

const linkStyle = { color: "var(--rp-text)", textDecoration: "underline", textUnderlineOffset: 3 } as const;

/** The answer's words and steps, with a link to the same answer in the help centre. */
export function HelpAnswer({ article, helpUrl }: { article: HelpArticle; helpUrl: string }) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {article.answer.map((line) => <p key={line} style={{ margin: 0 }}>{line}</p>)}
      {article.steps?.length ? (
        <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 4, listStyle: "decimal" }}>{article.steps.map((s) => <li key={s}>{s}</li>)}</ol>
      ) : null}
      <a className="rp-hint" href={`${helpUrl}#${article.id}`} target="_blank" rel="noopener" style={{ ...linkStyle, display: "inline-flex", alignItems: "center", gap: 4, justifySelf: "start" }}>
        Open in the help centre<ExternalLink size={12} aria-hidden /><span className="rp-sr-only"> (opens in a new tab)</span>
      </a>
    </div>
  );
}

/**
 * A list of questions, each opening its answer in place. A question whose answer didn't load is a link into the help
 * centre instead, so nothing is a dead end.
 */
export function HelpQuestions({ questions, answers, helpUrl, ruled = false }: {
  questions: ReadonlyArray<{ id: string; question: string }>; answers: HelpAnswers; helpUrl: string; ruled?: boolean;
}) {
  const [open, setOpen] = useState("");
  const base = useId();
  const w = useShopWords();
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: ruled ? 0 : 4 }}>
      {questions.map((q) => {
        const article = answers.get(q.id);
        const isOpen = open === q.id && !!article;
        const panel = `${base}-${q.id}`;
        const row = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, width: "100%", minHeight: 44, padding: "6px 0",
          background: "none", border: 0, color: "var(--rp-text)", font: "inherit", textAlign: "left", cursor: "pointer" } as const;
        return (
          <li key={q.id} style={ruled ? { borderTop: "1px solid var(--rp-divider)" } : undefined}>
            {article ? (
              <button type="button" aria-expanded={isOpen} aria-controls={panel} onClick={() => setOpen(isOpen ? "" : q.id)} style={row}>
                <span style={linkStyle}>{w(q.question)}</span>
                <ChevronDown size={16} aria-hidden style={{ flex: "none", transform: isOpen ? "rotate(180deg)" : undefined, color: "var(--rp-text-subtle)" }} />
              </button>
            ) : (
              <a href={`${helpUrl}#${q.id}`} target="_blank" rel="noopener" style={{ ...row, ...linkStyle }}>
                <span>{w(q.question)}</span><ExternalLink size={14} aria-hidden /><span className="rp-sr-only"> (opens in a new tab)</span>
              </a>
            )}
            {isOpen && <div id={panel} style={{ padding: "4px 0 14px" }}><HelpAnswer article={article!} helpUrl={helpUrl} /></div>}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Ask a person, without leaving setup. One request per Send: a retry after a failure reuses its id, so pressing Send
 * twice makes one request. The press's name goes with it, since a press in setup has no shop for support to look up.
 */
export function AskForm({ ask, pressName, accountUrl }: { ask: SupportAsk; pressName: string; accountUrl: string }) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [sent, setSent] = useState(false);
  const [requestId, setRequestId] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    // The inbox's own checks, said before sending (it asks for a few words of question and a subject).
    const local: Record<string, string> = {};
    if (!subject.trim()) local.subject = "Say in a few words what it's about.";
    if (body.trim().length < 10) local.body = "Tell us a little more, so we can help.";
    if (Object.keys(local).length) { setProblems(local); return; }
    const id = requestId || newRequestId();
    setRequestId(id); setBusy(true); setError(""); setProblems({});
    try {
      const note = pressName ? `\n\n(Sent while setting up ${pressName}.)` : "";
      await ask({ subject: subject.trim(), body: `${body.trim()}${note}`, requestId: id });
      setSent(true); setSubject(""); setBody(""); setRequestId("");
    } catch (err) {
      const e = err as Error & { problems?: Record<string, string> };
      setProblems(e.problems ?? {});
      setError(e.message || "That didn't send. Try again.");
    } finally {
      setBusy(false);
    }
  };
  if (sent) {
    return (
      <div role="status" style={{ display: "grid", gap: 8 }}>
        <p style={{ margin: 0 }}><strong>Sent.</strong> We've emailed you a copy, and a person will answer by email.</p>
        <p className="rp-hint" style={{ margin: 0 }}>You can see your requests, and add to them, on <a href={accountUrl} style={linkStyle}>your account page</a>.</p>
        <div><button type="button" className="rp-btn rp-btn-secondary" onClick={() => setSent(false)}>Ask something else</button></div>
      </div>
    );
  }
  return (
    <form onSubmit={submit} noValidate style={{ display: "grid", gap: 12 }}>
      <TextField label="What it's about" value={subject} maxLength={150} onChange={(e) => setSubject(e.target.value)} error={problems.subject} />
      <TextArea label="Your question" hint="Say what you were trying to do and what happened." rows={5} value={body} maxLength={4900}
        onChange={(e) => setBody(e.target.value)} error={problems.body} />
      {error && !Object.keys(problems).length && <p role="alert" className="rp-hint" style={{ margin: 0, color: "var(--rp-danger)" }}>{error}</p>}
      <div><PrimaryButton type="submit" busy={busy} disabled={busy}>Send</PrimaryButton></div>
    </form>
  );
}

function newRequestId(): string {
  try { return crypto.randomUUID(); } catch { return `ask-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
}
