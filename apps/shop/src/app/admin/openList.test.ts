import { describe, expect, it } from "vitest";
import { lookName, openRows, rowsLeft } from "./openList";
import { runSteps } from "./startRun";
import { openButtonLabel } from "./launchCheck";

const facts = { email: "owner@example.com", name: "Moth Press", country: "Canada", look: "aurel", lookStyle: "cobalt", provider: "stripe" as const };

describe("the one list on Home (sign-up to open shop plan, move 4)", () => {
  it("starts with the account and the name done, then the run's steps, contact and shipping as one row", () => {
    const rows = openRows(runSteps("stripe"), "bring", { ...facts });
    expect(rows.map((r) => [r.id, r.state])).toEqual([
      ["account", "done"], ["name", "done"], ["look", "done"], ["bring", "now"], ["payments", "next"], ["delivery", "next"],
    ]);
    expect(rows[0].detail).toBe("Signed in as owner@example.com");
    expect(rows[1].detail).toBe("Moth Press · Canada");
    expect(rows[2].detail).toBe("Aurel, in Cobalt. Make it yours whenever you like.");
    expect(rowsLeft(rows)).toBe(3);
  });

  it("keeps the contact and shipping row open until both are done", () => {
    const steps = runSteps(null);
    expect(openRows(steps, "details").find((r) => r.id === "delivery")?.state).toBe("now");
    expect(openRows(steps, "shipping").find((r) => r.id === "delivery")?.state).toBe("now");
    expect(openRows(steps, "final").every((r) => r.state === "done")).toBe(true);
    expect(rowsLeft(openRows(steps, "final"))).toBe(0);
  });

  it("has no Get paid row on a shop's own keys, and a services shop's last row is contact only", () => {
    expect(openRows(runSteps(null), "look").map((r) => r.id)).not.toContain("payments");
    const services = openRows(runSteps("square", true), "payments", { provider: "square" });
    expect(services.map((r) => r.id)).toEqual(["account", "name", "look", "services", "payments", "delivery"]);
    expect(services.find((r) => r.id === "payments")?.detail).toContain("Square");
    expect(services.find((r) => r.id === "delivery")?.title).toBe("Contact details");
  });

  it("reads a look's id as its name", () => {
    expect(lookName("press-marquee")).toBe("Marquee");
    expect(lookName("aurel")).toBe("Aurel");
    expect(lookName("")).toBe("");
  });

  it("the top bar counts the list's rows while the run is on, and Ready to sell otherwise", () => {
    expect(openButtonLabel(5, 3)).toBe("Open · 3 to go");
    expect(openButtonLabel(5, null)).toBe("Open to shoppers · 5 steps");
    expect(openButtonLabel(0, null)).toBe("Open to shoppers");
    expect(openButtonLabel(2, 0)).toBe("Open to shoppers");
  });
});
