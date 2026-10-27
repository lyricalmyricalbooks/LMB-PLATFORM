/** Admin review signal only. Publication status decides public visibility; titles do not. */
export function isPlaceholderCatalogRecord(book) {
  const title = String(book?.title || "").trim();
  return /\b(test|sample|demo|placeholder|sss|copy)\b/i.test(title);
}
