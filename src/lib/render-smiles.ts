/**
 * Renders [smiles]...[/smiles] tokens in the DOM to clean 2D structural
 * formulas using SmilesDrawer. Browser-only — the smiles-drawer package's
 * ESM entry is broken under SSR (missing src/Drawer file), so we lazy-load
 * it from the dist UMD bundle on the client only.
 */

let drawerPromise: Promise<any> | null = null;
let SmilesDrawerLib: any = null;

function loadSmilesDrawer(): Promise<any> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (SmilesDrawerLib) return Promise.resolve(SmilesDrawerLib);
  if (drawerPromise) return drawerPromise;

  drawerPromise = new Promise((resolve) => {
    try {
      // Use dynamic import on the dist bundle path so SSR never resolves it.
      // @ts-ignore — no types
      import(/* @vite-ignore */ "smiles-drawer/dist/smiles-drawer.min.js")
        .then((mod) => {
          SmilesDrawerLib =
            (mod as any).default || (mod as any).SmilesDrawer || (window as any).SmilesDrawer || mod;
          resolve(SmilesDrawerLib);
        })
        .catch((err) => {
          console.warn("smiles-drawer dynamic import failed", err);
          resolve(null);
        });
    } catch (err) {
      console.warn("smiles-drawer load threw", err);
      resolve(null);
    }
  });
  return drawerPromise;
}

let drawer: any = null;
function getDrawer(SD: any) {
  if (drawer) return drawer;
  try {
    const Ctor = SD?.Drawer || SD?.SvgDrawer;
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

export function renderSmiles(root: HTMLElement | null = typeof document !== "undefined" ? document.body : null) {
  if (!root || typeof window === "undefined") return;

  // Quick check: any smiles token in the subtree at all?
  const html = root.textContent || "";
  if (html.indexOf("[smiles]") === -1) return;

  loadSmilesDrawer().then((SD) => {
    if (!SD) return;
    const d = getDrawer(SD);
    if (!d) return;
    doRender(root, SD, d);
  });
}

function doRender(root: HTMLElement, SD: any, d: any) {
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
        SD.parse(
          smiles,
          (tree: any) => {
            try {
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
