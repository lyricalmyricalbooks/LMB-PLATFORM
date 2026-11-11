import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RunRow, RunTiles } from "./OverviewParts";

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
