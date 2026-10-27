import { describe, expect, it } from "vitest";
import { matchCustomers, matchOrders } from "./globalSearch";

const orders = [
  { id: "a1", orderId: "LM-1042", customer: { email: "Ann@x.com", name: "Ann Lee" } },
  { id: "a2", orderId: "LM-2000", customer: { email: "ann@x.com", name: "Ann Lee" } },
  { id: "t", orderId: "LM-1043", isTest: true, customer: { email: "t@x.com" } },
];

describe("global search", () => {
  it("finds orders by number with or without #, email or name, never test orders", () => {
    expect(matchOrders(orders, "#LM-1042").map((o) => o.id)).toEqual(["a1"]);
    expect(matchOrders(orders, "lm-104").map((o) => o.id)).toEqual(["a1"]);
    expect(matchOrders(orders, "ann@x").map((o) => o.id)).toEqual(["a1", "a2"]);
    expect(matchOrders(orders, "")).toEqual([]);
  });
  it("lists each customer once", () => {
    expect(matchCustomers(orders, "lee")).toEqual([{ email: "ann@x.com", name: "Ann Lee" }]);
    expect(matchCustomers(orders, "an")).toEqual([]);
  });
});
