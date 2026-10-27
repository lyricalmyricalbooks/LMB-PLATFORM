import { describe, it, expect } from "vitest";
import { getFilteredItems } from "./selectors";
import type { Book } from "./types";

describe("getFilteredItems", () => {
  const nowISO = "2024-01-15T12:00:00Z";

  const books: Book[] = [
    {
      id: "1",
      title: "Published, past schedule, correct category",
      status: "published",
      scheduleDate: "2024-01-10T12:00:00Z",
      categories: ["Fiction", "New"],
      retailPrice: 10,
      stockLevel: 10,
    },
    {
      id: "2",
      title: "Draft status",
      status: "draft",
      scheduleDate: "2024-01-10T12:00:00Z",
      categories: ["Fiction"],
      retailPrice: 10,
      stockLevel: 10,
    },
    {
      id: "3",
      title: "Future schedule date",
      status: "published",
      scheduleDate: "2024-01-20T12:00:00Z",
      categories: ["Fiction"],
      retailPrice: 10,
      stockLevel: 10,
    },
    {
      id: "4",
      title: "No schedule date",
      status: "published",
      categories: ["Fiction"],
      retailPrice: 10,
      stockLevel: 10,
    },
    {
      id: "5",
      title: "Wrong category",
      status: "published",
      scheduleDate: "2024-01-10T12:00:00Z",
      categories: ["Non-Fiction"],
      retailPrice: 10,
      stockLevel: 10,
    },
    {
      id: "6",
      title: "Publications category item",
      status: "published",
      categories: ["Some Category"],
      retailPrice: 10,
      stockLevel: 10,
    },
    {
      id: "placeholder",
      title: "test",
      status: "published",
      categories: ["Fiction"],
      retailPrice: 10,
      stockLevel: 1,
    },
    {
      id: "copy",
      title: "Copy",
      status: "published",
      categories: ["Fiction"],
      retailPrice: 10,
      stockLevel: 1,
    },
    {
      id: "7",
      title: "Exact schedule time",
      status: "published",
      scheduleDate: "2024-01-15T12:00:00Z",
      categories: ["Fiction"],
      retailPrice: 10,
      stockLevel: 10,
    },
  ];

  it("filters correctly by string category", () => {
    const result = getFilteredItems(books, "Fiction", nowISO);
    expect(result).toHaveLength(5);
    expect(result.map(b => b.id)).toEqual(["1", "4", "placeholder", "copy", "7"]);
  });

  it("filters correctly by object category", () => {
    const result = getFilteredItems(books, { name: "Fiction" }, nowISO);
    expect(result).toHaveLength(5);
    expect(result.map(b => b.id)).toEqual(["1", "4", "placeholder", "copy", "7"]);
  });

  it("returns all published valid items when category is PUBLICATIONS string", () => {
    const result = getFilteredItems(books, "PUBLICATIONS", nowISO);
    // Publication status controls visibility; admin review does not hide by title.
    expect(result).toHaveLength(7);
    expect(result.map(b => b.id)).toEqual(["1", "4", "5", "6", "placeholder", "copy", "7"]);
  });

  it("returns all published valid items when category is PUBLICATIONS object", () => {
    const result = getFilteredItems(books, { name: "PUBLICATIONS" }, nowISO);
    // Publication status controls visibility; admin review does not hide by title.
    expect(result).toHaveLength(7);
    expect(result.map(b => b.id)).toEqual(["1", "4", "5", "6", "placeholder", "copy", "7"]);
  });

  it("handles missing categories array on book", () => {
     const bookWithoutCategories: Book = {
        id: "8",
        title: "No categories",
        status: "published",
        retailPrice: 10,
        stockLevel: 10,
     };
     const result = getFilteredItems([...books, bookWithoutCategories], "Fiction", nowISO);
     expect(result.find(b => b.id === "8")).toBeUndefined();
  });
});
