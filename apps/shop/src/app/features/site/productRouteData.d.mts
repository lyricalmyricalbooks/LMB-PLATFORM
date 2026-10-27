export function resolveProductRoutes<T extends { id: string; slug?: string; title?: string }>(books: T[]): Array<T & { slug: string }>;
