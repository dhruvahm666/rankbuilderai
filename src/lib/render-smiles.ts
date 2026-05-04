/**
 * SMILES rendering — currently disabled. The smiles-drawer npm package has a
 * broken ESM entry that crashes SSR. Until we adopt a Worker-compatible
 * alternative, [smiles]...[/smiles] tokens are rendered as styled inline text
 * so the rest of the page keeps working.
 */

const SMILES_TOKEN_RE = /\[smiles\]([\s\S]+?)\[\/smiles\]/g;

export function renderSmiles(root: HTMLElement | null = typeof document !== "undefined" ? document.body : null) {
  if (!root || typeof window === "undefined") return;
  if ((root.textContent || "").indexOf("[smiles]") === -1) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (parent.closest(".smiles-rendered")) return NodeFilter.FILTER_REJECT;
      if (parent.closest(".katex")) return NodeFilter.FILTER_REJECT;
      const tag = parent.tagName;
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "TEXTAREA" || tag === "INPUT") {
        return NodeFilter.FILTER_REJECT;
      }
      return node.nodeValue && node.nodeValue.indexOf("[smiles]") !== -1
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });

  const targets: Text[] = [];
  let cur = walker.nextNode();
  while (cur) {
    targets.push(cur as Text);
    cur = walker.nextNode();
  }

  for (const textNode of targets) {
    const text = textNode.nodeValue || "";
    SMILES_TOKEN_RE.lastIndex = 0;
    if (!SMILES_TOKEN_RE.test(text)) continue;
    SMILES_TOKEN_RE.lastIndex = 0;

    const frag = document.createDocumentFragment();
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = SMILES_TOKEN_RE.exec(text)) !== null) {
      if (m.index > last) {
        frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      }
      const smiles = m[1].trim();
      const wrapper = document.createElement("code");
      wrapper.className = "smiles-rendered";
      wrapper.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, monospace";
      wrapper.style.fontSize = "0.92em";
      wrapper.style.padding = "1px 6px";
      wrapper.style.borderRadius = "4px";
      wrapper.style.background = "rgba(0,0,0,0.05)";
      wrapper.textContent = smiles;
      frag.appendChild(wrapper);
      last = m.index + m[0].length;
    }
    if (last < text.length) {
      frag.appendChild(document.createTextNode(text.slice(last)));
    }
    textNode.parentNode?.replaceChild(frag, textNode);
  }
}
