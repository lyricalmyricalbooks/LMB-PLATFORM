// The platform's help answers (LMB-PLATFORM help/articles.js, plain JS), read by the admin's Help page (HelpPage.tsx).
declare module "@help/articles.js" {
  export interface HelpArticleSource {
    id: string; topic: string; question: string; answer: string[]; steps?: string[]; where?: string[];
    plans?: string[]; books?: boolean;
  }
  export const TOPICS: readonly string[];
  export const ARTICLES: readonly HelpArticleSource[];
  export function articlesFor(plan: "both" | "shop" | "stockroom", sells?: string | null): HelpArticleSource[];
  export function searchArticles(text: string, list?: readonly HelpArticleSource[]): HelpArticleSource[];
}
