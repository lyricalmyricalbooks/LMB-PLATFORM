import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DataTable } from "./components";

const columns = [{ key: "n", header: "Name", render: (r: { n: string }) => r.n }];

describe("DataTable rows", () => {
  it("clickable rows are keyboard reachable", () => {
    const html = renderToStaticMarkup(
      <DataTable columns={columns} rows={[{ n: "A" }]} rowKey={(r) => r.n} onRowClick={() => {}} />,
    );
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('data-clickable="true"');
  });
  it("plain rows stay out of the tab order", () => {
    const html = renderToStaticMarkup(<DataTable columns={columns} rows={[{ n: "A" }]} rowKey={(r) => r.n} />);
    expect(html).not.toMatch(/<tr[^>]*tabindex/);
  });
});
