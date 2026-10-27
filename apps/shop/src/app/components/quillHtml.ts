// The HTML our rich-text editors save. Quill 2 draws lists and code blocks differently from Quill 1
// (every list is an <ol> of <li data-list="bullet|ordered"> with a hidden <span class="ql-ui">; code is
// <div class="ql-code-block-container">), and its getSemanticHTML() turns every space into &nbsp; and every
// video into a plain link. Page bodies and rich-text sections saved before the upgrade are Quill 1 HTML and
// the storefront renders that shape (ul = bullets, ol = numbers, li.ql-indent-N), so the editor always
// saves Quill 1 markup: same data, same look, nothing to migrate.

/** Quill 1-shaped HTML for the editor's contents (`root` = `quill.root`, never changed). */
export function editorHtml(root: HTMLElement): string {
  const doc = root.ownerDocument;
  const copy = root.cloneNode(true) as HTMLElement;
  copy.querySelectorAll(".ql-ui").forEach((el) => el.remove());

  // One Quill 2 <ol> holds every kind of list item; split it into <ul>/<ol> runs like Quill 1 wrote them.
  copy.querySelectorAll("ol").forEach((list) => {
    const items = Array.from(list.children).filter((el) => el.tagName === "LI");
    if (!items.some((li) => li.hasAttribute("data-list"))) return;
    const runs: HTMLElement[] = [];
    let current: HTMLElement | null = null;
    let currentKind = "";
    for (const li of items) {
      const kind = li.getAttribute("data-list") || "ordered";
      if (!current || kind !== currentKind) {
        current = doc.createElement(kind === "ordered" ? "ol" : "ul");
        if (kind === "checked" || kind === "unchecked") current.setAttribute("data-checked", kind === "checked" ? "true" : "false");
        currentKind = kind;
        runs.push(current);
      }
      li.removeAttribute("data-list");
      current.appendChild(li);
    }
    list.replaceWith(...runs);
  });

  // Code blocks: Quill 1 saved <pre class="ql-syntax">, one text line per row.
  copy.querySelectorAll(".ql-code-block-container").forEach((box) => {
    const pre = doc.createElement("pre");
    pre.className = "ql-syntax";
    pre.setAttribute("spellcheck", "false");
    const lines = Array.from(box.querySelectorAll(".ql-code-block")).map((line) => line.textContent || "");
    pre.textContent = `${lines.join("\n")}\n`;
    box.replaceWith(pre);
  });

  return copy.innerHTML;
}
