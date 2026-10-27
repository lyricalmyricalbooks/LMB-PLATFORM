import { test, expect } from "vitest";
import { createRequire } from "node:module";
const { clientIpOf, ipKey } = createRequire(import.meta.url)("./rateLimit");
const req = xff => ({ headers: { "x-forwarded-for": xff } });

test("a client-typed X-Forwarded-For can't choose the rate-limit key", () => {
  expect(clientIpOf(req("1.2.3.4, 203.0.113.9"))).toBe("203.0.113.9");
  expect(clientIpOf(req("9.9.9.9, 203.0.113.9"))).toBe("203.0.113.9");
});
test("Google load balancer and private hops are skipped", () => {
  expect(clientIpOf(req("203.0.113.9, 35.191.4.2"))).toBe("203.0.113.9");
  expect(clientIpOf(req("203.0.113.9, 10.0.0.1"))).toBe("203.0.113.9");
  expect(clientIpOf(req("203.0.113.9"))).toBe("203.0.113.9");
});

test("#44 IPv6 clients are limited by their /64; IPv4 and mapped addresses by themselves", () => {
  expect(ipKey("2001:db8:1:2:aaaa:bbbb:cccc:dddd")).toBe(ipKey("2001:0db8:0001:0002::1"));
  expect(ipKey("2001:db8:1:3::1")).not.toBe(ipKey("2001:db8:1:2::1"));
  expect(ipKey("203.0.113.9")).toBe("203.0.113.9");
  expect(ipKey("::ffff:203.0.113.9")).toBe("203.0.113.9");
  expect(ipKey("unknown")).toBe("unknown");
});
