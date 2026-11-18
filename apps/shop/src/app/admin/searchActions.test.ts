import { describe, expect, it } from "vitest";
import { jobLabel, orderByNumber, searchJobs } from "./searchActions";

describe("search that does things", () => {
  it("reads adding a product and making a discount", () => {
    expect(searchJobs("add product")).toEqual([{ kind: "newProduct" }]);
    expect(searchJobs("New book")).toEqual([{ kind: "newProduct" }]);
    expect(searchJobs("make a discount")).toEqual([{ kind: "newDiscount" }]);
    expect(searchJobs("create code")).toEqual([{ kind: "newDiscount" }]);
  });
  it("reads an order job with or without #", () => {
    expect(searchJobs("refund 1042")).toEqual([{ kind: "order", verb: "refund", number: "1042" }]);
    expect(searchJobs("ship #WEB-1041")).toEqual([{ kind: "order", verb: "ship", number: "web-1041" }]);
    expect(searchJobs("order 7")).toEqual([{ kind: "order", verb: "open", number: "7" }]);
  });
  it("reads turning on a way to sell", () => {
    expect(searchJobs("turn on events")).toEqual([{ kind: "waysToSell", way: "Events" }]);
    expect(jobLabel(searchJobs("turn on gizmos")[0])).toBe("Choose your ways to sell");
  });
  it("leaves an ordinary name search alone", () => {
    expect(searchJobs("moth press")).toEqual([]);
    expect(searchJobs("ad")).toEqual([]);
  });
  it("finds the order a number means", () => {
    const orders = [{ id: "a1", orderId: "#1042" }, { id: "b2", orderId: "WEB-1041" }];
    expect(orderByNumber(orders, "1042")?.id).toBe("a1");
    expect(orderByNumber(orders, "web-1041")?.id).toBe("b2");
    expect(orderByNumber(orders, "9")).toBeUndefined();
  });
});
