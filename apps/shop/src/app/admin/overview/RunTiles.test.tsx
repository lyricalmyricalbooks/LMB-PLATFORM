// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DONE_KEY, RunRow, RunTiles, todoTone } from "./OverviewParts";

const row = (label: string, count: number | null, loading = false) =>
  <RunRow key={label} label={label} one={label.replace(/s /, " ")} count={count} loading={loading} detail="Waiting" onOpen={vi.fn()} openLabel="Open" />;

describe("Home's To do tiles", () => {
  it("shows only the lines with something to do, one tile each", () => {
    const html = renderToStaticMarkup(<RunTiles>{[row("orders to ship", 2), row("reviews to moderate", 0), row("messages unread", 1)]}</RunTiles>);
    expect(html.match(/rp-todo-tile"/g)).toHaveLength(2);
    expect(html).toContain("orders to ship");
    expect(html).not.toContain("reviews to moderate");
  });

  it("says it is counting while nothing has arrived, and all clear after", () => {
    expect(renderToStaticMarkup(<RunTiles>{[row("orders to ship", null, true)]}</RunTiles>)).toContain("Counting…");
    expect(renderToStaticMarkup(<RunTiles>{[row("orders to ship", 0)]}</RunTiles>)).toContain("Nothing needs you right now.");
  });
});

describe("Mark done on a To do tile", () => {
  it("hides the tile until its count changes, and keeps the choice in this browser", async () => {
    const { createRoot } = await import("react-dom/client");
    const { act } = await import("react");
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const draw = (n: number) => act(async () => { root.render(<RunTiles>{[row("orders to ship", n), row("messages unread", 1)]}</RunTiles>); });
    await draw(2);
    const done = () => [...host.querySelectorAll<HTMLButtonElement>(".rp-todo-done")];
    expect(done()).toHaveLength(2);
    await act(async () => { done()[0].click(); });
    expect(host.textContent).not.toContain("orders to ship");
    expect(JSON.parse(localStorage.getItem(DONE_KEY)!)).toEqual({ "|orders to ship": 2 });
    await draw(2);
    expect(host.textContent).not.toContain("orders to ship");
    await draw(3);
    expect(host.textContent).toContain("3 orders to ship");
    await act(async () => { done().forEach((b) => b.click()); });
    expect(host.textContent).toContain("All clear");
    await act(async () => { root.unmount(); });
  });

  it("gives each kind of job its tone", () => {
    expect(todoTone("Orders")).toBe("mint");
    expect(todoTone("Sales")).toBe("apricot");
    expect(todoTone("Payments")).toBe("plain");
    expect(todoTone("Stock")).toBe("sky");
    expect(todoTone("Messages")).toBe("lilac");
  });
});
