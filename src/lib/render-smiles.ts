/**
 * Renders [smiles]...[/smiles] tokens in the DOM to clean 2D structural
 * formulas using SmilesDrawer. Safe to run repeatedly — each token is
 * replaced with a <span class="smiles-rendered"> wrapper so the next pass
 * skips it.
 *
 * The MutationObserver in src/lib/render-math.ts schedules a render-math
 * pass on every DOM mutation; we hook into the same lifecycle by exposing
 * `renderSmiles()` and calling it from the global hook.
 */
// @ts-ignore — smiles-drawer ships its own types but not for the default export shape we use
import SmilesDrawer from "smiles-drawer";

let drawer: any = null;

function getDrawer() {
  if (drawer) return drawer;
  try {
    // SmilesDrawer.Drawer is the 2D structure renderer
    const Ctor = (SmilesDrawer as any).Drawer || (SmilesDrawer as any).SvgDrawer;
    if (!Ctor) return null;
    drawer = new Ctor({
      width: 280,
      height: 200,
      bondThickness: 1.1,
      bondLength: 22,
      shortBondLength: 0.8,
      bondSpacing: 4,
      atomVisualization: "default",
      isomeric: true,
      debug: false,
      terminalCarbons: false,
      explicitHydrogens: false,
      compactDrawing: true,
      fontSizeLarge: 11,
      fontSizeSmall: 8,
      padding: 6,
      experimental: false,
    });
    return drawer;
  } catch (err) {
    console.warn("SmilesDrawer init failed", err);
    return null;
  }
}

const SMILES_TOKEN_RE = /\[smiles\]([\s\S]+?)\[\/smiles\]/g;

/**
 * Walks all text nodes in `root`, replaces [smiles]...[/smiles] tokens with
 * <span class="smiles-rendered"><svg/></span> blocks.
 */
export function renderSmiles(root: HTMLElement | null = document.body) {
  if (!root || typeof window === "undefined") return;
  const d = getDrawer();
  if (!d) return;

  // Find text nodes that contain the token. Skip already-rendered wrappers
  // and elements that should never be touched.
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
      const wrapper = document.createElement("span");
      wrapper.className = "smiles-rendered";
      wrapper.style.display = "block";
      wrapper.style.margin = "8px auto";
      wrapper.style.textAlign = "center";

      try {
        (SmilesDrawer as any).parse(
          smiles,
          (tree: any) => {
            try {
              // Render to a temporary canvas, then read back as an inline SVG-like img
              const canvas = document.createElement("canvas");
              canvas.width = 280;
              canvas.height = 200;
              canvas.style.maxWidth = "100%";
              canvas.style.height = "auto";
              d.draw(tree, canvas, "light", false);
              wrapper.appendChild(canvas);
            } catch (err) {
              console.warn("SmilesDrawer draw failed", err, smiles);
              wrapper.textContent = smiles;
            }
          },
          (err: unknown) => {
            console.warn("SmilesDrawer parse failed", err, smiles);
            wrapper.textContent = smiles;
          },
        );
      } catch (err) {
        console.warn("SmilesDrawer threw", err, smiles);
        wrapper.textContent = smiles;
      }

      frag.appendChild(wrapper);
      last = m.index + m[0].length;
    }
    if (last < text.length) {
      frag.appendChild(document.createTextNode(text.slice(last)));
    }
    textNode.parentNode?.replaceChild(frag, textNode);
  }
}
