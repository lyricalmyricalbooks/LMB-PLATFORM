// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { bookIdForTitle, clickedCardTitle, itemForTitle, listNameOf } from "./ga4Lists";
import { ga4BookItem } from "./ga4";

const books = [{ id: "b1", title: "Salt" }, { id: "b2", title: "Night  Poems" }];

function page(html: string) {
  document.body.innerHTML = html;
  return document.body;
}

describe("Google Analytics book lists", () => {
  it("names the list from the nearest data-ga-list, else Shop", () => {
    page(`<section data-ga-list="Related books"><a class="fm-card" href="/books/salt"><p class="fm-card-title">Salt</p></a></section><p id="lone" class="fm-card-title">X</p>`);
    expect(listNameOf(document.querySelector(".fm-card-title"))).toBe("Related books");
    expect(listNameOf(document.getElementById("lone"))).toBe("Shop");
  });

  it("joins a card to its book by title (same id view_item and add_to_cart send)", () => {
    expect(bookIdForTitle("Salt", books)).toBe("b1");
    expect(bookIdForTitle("night poems", books)).toBe("b2");
    expect(bookIdForTitle("Unknown", books)).toBe("");
    page(`<p class="fm-card-title">  Salt </p>`);
    expect(itemForTitle(document.querySelector(".fm-card-title")!, books)).toEqual({ item_name: "Salt", item_id: "b1" });
    page(`<p class="fm-card-title">New book</p>`);
    expect(itemForTitle(document.querySelector(".fm-card-title")!, books)).toEqual({ item_name: "New book" });
  });

  it("counts a click on the card as opening the book, but not its buttons", () => {
    page(`<article class="fm-card"><a href="/books/salt"><img id="img"/><p class="fm-card-title">Salt</p></a><button id="add"><span id="inner">Add</span></button></article>`);
    expect(clickedCardTitle(document.getElementById("img"))?.textContent).toBe("Salt");
    expect(clickedCardTitle(document.getElementById("inner"))).toBeNull();
    page(`<a href="/about" id="plain">About</a>`);
    expect(clickedCardTitle(document.getElementById("plain"))).toBeNull();
  });

  it("search results (role=option links) count too", () => {
    page(`<div data-ga-list="Search results"><a role="option" href="/books/salt"><span id="t" class="fm-card-title">Salt</span></a></div>`);
    const title = clickedCardTitle(document.getElementById("t"));
    expect(title && listNameOf(title)).toBe("Search results");
  });

  it("names a wishlist/stock-alert book from the shop data, keeping the id", () => {
    expect(ga4BookItem("b1", books)).toEqual({ item_id: "b1", item_name: "Salt" });
    expect(ga4BookItem("zz", books)).toEqual({ item_id: "zz" });
  });
});
