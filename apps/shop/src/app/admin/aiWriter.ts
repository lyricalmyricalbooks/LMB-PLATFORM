import { auth } from "../../lib/firebase";
import { functionFetch } from "../lib/functionsBase";
import { bookCreators, searchText } from "../lib/bookSeo";
import type { Book } from "../features/site/types";

// AI writing assistant: Google Gemini (free AI Studio key) or OpenRouter. The keys live in admin-only
// adminSecrets/ai and are used only by the createStripeCheckoutSession `aiWrite` action (functions/aiWriter.js).
// Every answer is a suggestion placed in the editor; nothing is saved until the owner saves the book or page.

export type AiTask = "bookSeo" | "bookDescription" | "photoAlt" | "pageSeo" | "rewrite" | "sectionDraft";
/** Studio's section drafts carry lists (`items`) as well as words. Every answer also says which AI wrote it
 * (`provider`, `model`) and `fellBack: true` when the chosen one had run out and the other saved key answered. */
export type AiResult = Record<string, any>;

/** Same rule as functions/aiWriter.js aiKeyProblem ("" = fine or empty). */
export function aiKeyProblem(value: string): string {
  const v = value.trim();
  if (!v) return "";
  if (/^sk-or-/.test(v)) return "That's an OpenRouter key. Paste it in the OpenRouter box instead.";
  return /^[A-Za-z0-9_.-]{30,200}$/.test(v) ? "" : "That doesn't look like a Google AI key (it usually starts with AIza and is 39 characters).";
}

export type AiProvider = "gemini" | "openrouter";
/** What OpenRouter uses when the owner names no model (functions/aiWriter.js OPENROUTER_MODELS[0]). */
export const DEFAULT_OPENROUTER_MODEL = "google/gemini-2.5-flash";

/** Same rule as functions/aiWriter.js openRouterKeyProblem ("" = fine or empty). */
export function openRouterKeyProblem(value: string): string {
  const v = value.trim();
  if (!v) return "";
  return /^sk-or-[A-Za-z0-9_-]{20,200}$/.test(v) ? "" : "That doesn't look like an OpenRouter key (it starts with sk-or- and comes from openrouter.ai/keys).";
}

/** Same rule as functions/aiWriter.js openRouterModelProblem ("" = fine or empty, which means the default model). */
export function openRouterModelProblem(value: string): string {
  const v = value.trim();
  if (!v) return "";
  return v.length <= 120 && /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(v) ? "" : "Model names look like google/gemini-2.5-flash. Copy one from openrouter.ai/models.";
}

/** An error the editor can show; `needsKey` = point the owner at Settings › General › AI writing assistant. */
export class AiWriteError extends Error {
  needsKey: boolean;
  /** The server's answer (429 = the AI's allowance is used up, after the backup AI was tried too). */
  status: number;
  constructor(message: string, needsKey = false, status = 0) {
    super(message);
    this.needsKey = needsKey;
    this.status = status;
  }
}

/** Photos Describe with AI works on at once: a run finishes several times faster, and stays under the AI's per-minute limits. */
export const DESCRIBE_AT_ONCE = 3;

/**
 * Pure: runs `work` on every item, `limit` at a time, in order of starting. A failure doesn't stop the others,
 * but when `stopAfter(err)` says so no new item starts (the AI ran out, or no key is saved).
 * Resolves to how many succeeded and the first error.
 */
export async function runPool<T>(items: T[], limit: number, work: (item: T) => Promise<void>, stopAfter: (err: unknown) => boolean = () => false): Promise<{ done: number; failed: number; firstError: unknown }> {
  let next = 0;
  let done = 0;
  let failed = 0;
  let firstError: unknown = null;
  let stopped = false;
  const lane = async () => {
    while (!stopped && next < items.length) {
      const item = items[next++];
      try {
        await work(item);
        done += 1;
      } catch (err) {
        failed += 1;
        if (firstError === null) firstError = err;
        if (stopAfter(err)) stopped = true;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, lane));
  return { done, failed, firstError };
}

/** Pure: the public catalog facts sent for a book — never cost, stock, shelf or file fields. */
export function bookAiInput(book: Partial<Book> & Record<string, any>) {
  const list = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x ?? "").trim()).filter(Boolean) : []);
  return {
    title: searchText(book.title || ""),
    author: searchText(book.authorName || "") || bookCreators(book).join(", "),
    format: searchText(book.edition || "") || searchText(book.format || ""),
    editions: list((book.variants || []).map((v: any) => v?.name)),
    categories: list(book.categories),
    tags: list(book.tags),
    publisher: searchText(book.publisher || ""),
    publishDate: String(book.publishDate || ""),
    pageCount: Number(book.pageCount) || 0,
    language: searchText(book.language || ""),
    description: String(book.description || ""),
    preorder: book.preorder === true,
    comingSoon: book.comingSoon === true,
  };
}

/** Pure: the copy of a book photo Describe with AI sends (about 960px is plenty to see it; less to download). */
export function photoAiUrl(photo: { url?: string; srcset?: { url?: string; w?: number }[] } | null | undefined): string {
  const copies = (Array.isArray(photo?.srcset) ? photo!.srcset : []).filter((c) => c?.url && Number(c.w) > 0);
  const fit = copies.filter((c) => Number(c.w) >= 640 && Number(c.w) <= 1600).sort((a, b) => Math.abs(Number(a.w) - 960) - Math.abs(Number(b.w) - 960))[0];
  return String(fit?.url || photo?.url || "");
}

type AiTransport = (body: Record<string, unknown>) => Promise<{ status: number; data: any }>;
let transport: AiTransport | null = null;
/** The Studio fixture (studio/fixture/main.tsx) answers AI requests itself, so browser checks never reach Google. */
export function setAiTransport(next: AiTransport | null) { transport = next; }

/** Asks the shop's server to write; throws AiWriteError with a plain-English reason. */
export async function askAi(task: AiTask, input: Record<string, unknown>, extra: { siteName?: string; titleSuffix?: number } = {}): Promise<AiResult> {
  if (transport) {
    const { status, data } = await transport({ action: "aiWrite", task, input, ...extra });
    if (status !== 200 || !data?.result) throw new AiWriteError(data?.error || `The shop's server answered ${status}.`, data?.needsKey === true, status);
    return data.result as AiResult;
  }
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new AiWriteError("Sign in again as the shop administrator.");
  let res: Response;
  try {
    res = await functionFetch("createStripeCheckoutSession", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ action: "aiWrite", task, input, ...extra }),
    });
  } catch {
    throw new AiWriteError("Couldn't reach the shop's server. Check your connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.result) {
    throw new AiWriteError(data?.error || `The shop's server answered ${res.status}. Check that Cloud Functions are deployed.`, data?.needsKey === true, res.status);
  }
  return data.result as AiResult;
}

/** Settings card's Check key: one tiny request with the saved key for that service. */
export async function checkAiKey(provider: AiProvider = "gemini"): Promise<{ ok: boolean; message: string }> {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) return { ok: false, message: "Sign in again as the shop administrator." };
  try {
    const res = await functionFetch("createStripeCheckoutSession", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ action: "aiWrite", op: "check", provider }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, message: data.error || `The shop's server answered ${res.status}. Check that Cloud Functions are deployed.` };
    const who = provider === "openrouter" ? `OpenRouter${data.model ? ` (${data.model})` : ""}` : "Gemini";
    return data.ok
      ? { ok: true, message: `${who} answered with this key. The Write with AI buttons are ready in Books and Studio.` }
      : { ok: false, message: data.error || (provider === "openrouter" ? "OpenRouter refused the key." : "Google refused the key.") };
  } catch (err: any) {
    return { ok: false, message: err?.message || "Could not check the key." };
  }
}

/** Where the key goes, for error messages that need it. */
export const AI_SETTINGS_PATH = "Settings › General › AI writing assistant";
