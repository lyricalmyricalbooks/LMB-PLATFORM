export const FEED_FILE: string;
export interface MerchantFeedItem {
  id: string; groupId: string; title: string; description: string; link: string; image: string; additionalImages: string[];
  price: string; salePrice: string; saleDates: string; availability: "in_stock" | "out_of_stock" | "preorder" | "backorder";
  availabilityDate: string; gtin: string; brand: string; condition: string; googleCategory: string; productType: string; bundle: boolean; creators: string[];
}
export interface MerchantFeedSkip { id: string; title: string; reason: string }
export function shopDate(now?: Date): string;
export function releaseArrived(scheduleDate: unknown, now?: Date): boolean;
export function unitPrice(book: any, variant: any, now?: Date): number;
export function preorderDate(book: any, now?: Date): string | null;
export function stockOf(book: any, variantId?: string | null): number;
export function bundleStock(book: any, getBook: (id: string) => any): number;
export function isbn13(value: unknown): string;
export function creatorNames(book: any): string[];
export function isLive(book: any, now?: Date): boolean;
export function plain(value: unknown): string;
export function cut(text: string, max: number): string;
export function merchantFeedItems(siteUrl: string, books: any[], options?: { shopName?: string; now?: Date }): { items: MerchantFeedItem[]; skipped: MerchantFeedSkip[] };
export function merchantFeedXml(siteUrl: string, items: MerchantFeedItem[], options?: { shopName?: string }): string;
