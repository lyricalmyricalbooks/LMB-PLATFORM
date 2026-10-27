// @vitest-environment jsdom
import React, { act, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { CatalogControls, applyCatalogControls, appliedFilters, filterView, EMPTY_FILTERS, type CatalogFilterState, type SortKey } from "./CatalogControls";
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const books = [
  { id: "p", title: "Zine", format: "Paperback", retailPrice: 12 },
  { id: "h", title: "Atlas", format: "Hardcover", retailPrice: 45 },
  { id: "e", title: "Poems", retailPrice: 0, variants: [{ id: "eb", name: "E-book", price: 9, stock: 3 }] },
];

function Shop() {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [inStockOnly, setInStockOnly] = useState(false);
  const [filters, setFilters] = useState<CatalogFilterState>(EMPTY_FILTERS);
  const view = useMemo(() => filterView(books), []);
  const applied = appliedFilters(filters, view);
  const items = applyCatalogControls(books, query, sort, inStockOnly, applied.priceRange, applied.formats);
  return <>
    <CatalogControls query={query} setQuery={setQuery} sort={sort} setSort={setSort} inStockOnly={inStockOnly} setInStockOnly={setInStockOnly}
      resultCount={items.length} design={{}} filters={filters} setFilters={setFilters} availableFormats={view.availableFormats} showPrice={view.showPrice} />
    <ul>{items.map(b => <li key={b.id}>{b.title}</li>)}</ul>
  </>;
}

it("format chips, price boxes and Clear filters narrow and restore the shop grid", async () => {
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  const root = createRoot(container);
  await act(async () => { root.render(<Shop />); });
  const titles = () => [...container.querySelectorAll("li")].map(li => li.textContent);
  const chips = [...container.querySelectorAll<HTMLButtonElement>('[data-store-region="catalogFormat"] button')];
  expect(chips.map(b => b.textContent)).toEqual(["Paperback", "Hardcover", "E-book"]);
  expect(container.querySelector('[data-store-region="catalogClear"]')).toBeNull();

  await act(async () => { chips[2].click(); });
  expect(chips[2].getAttribute("aria-pressed")).toBe("true");
  expect(titles()).toEqual(["Poems"]);
  expect(container.textContent).toContain("1 results");

  await act(async () => { chips[2].click(); });
  const max = container.querySelectorAll<HTMLInputElement>('[data-store-region="catalogPrice"] input')[1];
  expect(max.getAttribute("aria-label")).toBe("Price Max");
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(max, "15");
    max.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(titles().sort()).toEqual(["Poems", "Zine"]);

  const clear = container.querySelector<HTMLButtonElement>('[data-store-region="catalogClear"]')!;
  expect(clear.textContent).toBe("Clear filters");
  await act(async () => { clear.click(); });
  expect(titles()).toHaveLength(3);
  expect(container.querySelector('[data-store-region="catalogClear"]')).toBeNull();
  await act(async () => root.unmount());
});
