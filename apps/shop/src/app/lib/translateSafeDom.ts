// Browser page translation (Chrome's built-in Google Translate, Edge, Safari) swaps the page's text nodes for its own
// <font> wrappers. React still holds the original nodes, so its next removeChild/insertBefore on one of them throws
// "NotFoundError: The node to be removed is not a child of this node" and the whole storefront goes blank — usually the
// moment a translated shopper opens the bag, changes a filter or follows a link. This is the patch React's maintainers
// suggest (React issue 11538 on GitHub): when the node React names has already been moved by the translator, skip the call
// instead of crashing. Ordinary DOM calls are untouched.
//
// Translation still can't update text React changes later (the translated copy is a different node), so live numbers —
// prices, totals — carry translate="no" and stay React's own nodes.

type Patched = { __lmTranslateSafe?: boolean };

export function installTranslateSafeDom(proto: typeof Node.prototype | undefined = typeof Node === "function" ? Node.prototype : undefined): boolean {
  if (!proto || (proto as unknown as Patched).__lmTranslateSafe) return false;
  const originalRemoveChild = proto.removeChild;
  const originalInsertBefore = proto.insertBefore;

  proto.removeChild = function removeChild<T extends Node>(this: Node, child: T): T {
    if (child && child.parentNode !== this) return child;
    return originalRemoveChild.call(this, child) as T;
  };

  proto.insertBefore = function insertBefore<T extends Node>(this: Node, node: T, reference: Node | null): T {
    // The reference node was taken out by the translator: append instead of throwing.
    if (reference && reference.parentNode !== this) return originalInsertBefore.call(this, node, null) as T;
    return originalInsertBefore.call(this, node, reference) as T;
  };

  (proto as unknown as Patched).__lmTranslateSafe = true;
  return true;
}
