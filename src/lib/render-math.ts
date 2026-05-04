/**
 * Global KaTeX auto-renderer.
 *
 * Scans a DOM container for raw LaTeX delimiters ($...$, $$...$$, \(...\), \[...\])
 * and renders them with KaTeX. Safe to call repeatedly: KaTeX skips elements that
 * already contain rendered output (.katex), and we additionally tag processed
 * text nodes via a `data-math-rendered` marker on their parent.
 *
 * Pair with `useGlobalMathRenderer()` to get a MutationObserver that auto-runs
 * this whenever the DOM under <body> changes (new question loaded, options
 * updated, answer revealed, etc.).
 */
import { useEffect } from "react";
import renderMathInElement from "katex/contrib/auto-render";
import "katex/dist/katex.min.css";
import { renderSmiles } from "@/lib/render-smiles";

const DELIMITERS = [
  { left: "$$", right: "$$", display: true },
  { left: "\\[", right: "\\]", display: true },
  { left: "\\(", right: "\\)", display: false },
  { left: "$", right: "$", display: false },
];

// Skip elements where math should not be processed (inputs, code blocks,
// elements already rendered by react-katex, our pre-formatted exam blocks).
const IGNORED_TAGS = [
  "script",
  "noscript",
  "style",
  "textarea",
  "pre",
  "code",
  "input",
  "select",
  "option",
];

// Skip CSS classes that contain pre-rendered math from react-katex, or
// blocks we never want to scan.
const IGNORED_CLASSES = /(^|\s)(katex|katex-display|katex-html|exam-block|smiles-rendered|svg-rendered)(\s|$)/;

let scheduled = false;

export function renderMath(root: HTMLElement | null = document.body) {
  if (!root) return;
  try {
    renderMathInElement(root, {
      delimiters: DELIMITERS,
      throwOnError: false,
      strict: false,
      // SECURITY: trust must be false to prevent XSS via \href{javascript:...},
      // \url, \htmlId and similar commands that would otherwise render as live
      // executable links. AI-generated content can be influenced by user input,
      // so we never grant trust to KaTeX.
      trust: false,
      ignoredTags: IGNORED_TAGS,
      ignoredClasses: ["katex", "katex-display", "katex-html", "exam-block"],
    });
  } catch (err) {
    // Never let a render error break the page
    console.warn("KaTeX auto-render failed", err);
  }
}

/** Coalesce multiple rapid calls into one render on the next animation frame. */
function scheduleRender(root: HTMLElement) {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    renderMath(root);
    try {
      renderSmiles(root);
    } catch (err) {
      console.warn("renderSmiles failed", err);
    }
  });
}

/**
 * Mount once at the app root. Runs renderMath on the whole document and then
 * keeps it in sync with any DOM mutation (new questions, revealed answers,
 * updated options, etc.).
 */
export function useGlobalMathRenderer() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const root = document.body;
    if (!root) return;

    // Initial pass
    scheduleRender(root);

    const observer = new MutationObserver((mutations) => {
      // Ignore mutations that come from KaTeX itself to avoid infinite loops.
      let relevant = false;
      for (const m of mutations) {
        const target = m.target as HTMLElement | null;
        if (!target) continue;
        const cls = (target.className && typeof target.className === "string"
          ? target.className
          : (target as any).className?.baseVal || "") as string;
        if (cls && IGNORED_CLASSES.test(cls)) continue;
        // Ignore mutations entirely inside an existing katex / smiles tree
        if (target.closest && (target.closest(".katex") || target.closest(".smiles-rendered"))) continue;
        relevant = true;
        break;
      }
      if (relevant) scheduleRender(root);
    });

    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => observer.disconnect();
  }, []);
}
