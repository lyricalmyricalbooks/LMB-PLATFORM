// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { rememberColumns, rememberedColumns } from "./columnMemory";

afterEach(() => localStorage.clear());

describe("column memory (plan 23.41)", () => {
  it("recalls a match by heading, whatever its case or spacing", () => {
    rememberColumns(["Cost to buyer"], { "Cost to buyer": "retailPrice" });
    expect(rememberedColumns(["COST TO  BUYER", "Writer"])).toEqual({ "COST TO  BUYER": "retailPrice" });
  });

  it("forgets a heading set back to Leave out, and keeps the others", () => {
    rememberColumns(["Cost to buyer", "Writer"], { "Cost to buyer": "retailPrice", Writer: "subtitle" });
    rememberColumns(["Writer"], {});
    expect(rememberedColumns(["Cost to buyer", "Writer"])).toEqual({ "Cost to buyer": "retailPrice" });
  });

  it("never recalls ID, an unknown field or broken storage", () => {
    localStorage.setItem("colophon.importColumns.v1", JSON.stringify({ books: { code: "id", odd: "nope", writer: "subtitle" } }));
    expect(rememberedColumns(["Code", "Odd", "Writer"])).toEqual({ Writer: "subtitle" });
    localStorage.setItem("colophon.importColumns.v1", "{not json");
    expect(rememberedColumns(["Writer"])).toEqual({});
    rememberColumns(["Writer"], { Writer: "subtitle" });
    expect(rememberedColumns(["Writer"])).toEqual({ Writer: "subtitle" });
  });

  it("keeps each kind of file apart", () => {
    rememberColumns(["Writer"], { Writer: "subtitle" }, "books");
    expect(rememberedColumns(["Writer"], "customers")).toEqual({});
  });
});
