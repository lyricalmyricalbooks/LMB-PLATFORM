// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { installTranslateSafeDom } from "./translateSafeDom";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/** What Chrome's translator does: each text node becomes <font><font>translated</font></font>. */
function translate(root: Element) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  for (const node of nodes) {
    if (node.parentElement?.closest('[translate="no"]')) continue;
    const outer = document.createElement("font");
    const inner = document.createElement("font");
    inner.textContent = `[fr] ${node.data}`;
    outer.appendChild(inner);
    node.parentNode!.replaceChild(outer, node);
  }
}

function Bag({ open, total }: { open: boolean; total: string }) {
  return (
    <div>
      {open && "Your bag"}
      <p>Free shipping</p>
      <span translate="no">{total}</span>
    </div>
  );
}

describe("installTranslateSafeDom", () => {
  it("keeps React working after the page was translated", () => {
    installTranslateSafeDom();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<Bag open total="CA$ 20.00" />));
    translate(host);
    // Removing a translated text node and inserting before one used to throw NotFoundError.
    expect(() => act(() => root.render(<Bag open={false} total="CA$ 40.00" />))).not.toThrow();
    expect(() => act(() => root.render(<Bag open total="CA$ 60.00" />))).not.toThrow();
    // translate="no" keeps the live total React's own node, so it still updates.
    expect(host.querySelector("span")!.textContent).toBe("CA$ 60.00");
    expect(host.textContent).toContain("[fr] Free shipping");
    act(() => root.unmount());
  });

  it("installs once and leaves normal DOM calls alone", () => {
    installTranslateSafeDom();
    expect(installTranslateSafeDom()).toBe(false);
    const parent = document.createElement("div");
    const a = parent.appendChild(document.createElement("a"));
    const b = document.createElement("b");
    parent.insertBefore(b, a);
    expect([...parent.children].map(e => e.tagName)).toEqual(["B", "A"]);
    parent.removeChild(a);
    expect(parent.children.length).toBe(1);
    // A node that isn't a child is ignored instead of throwing.
    expect(() => parent.removeChild(document.createElement("i"))).not.toThrow();
  });
});
