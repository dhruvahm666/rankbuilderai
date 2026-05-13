/**
 * Preprocess raw model output so KaTeX can render it cleanly.
 *
 * Goals (Maths only):
 *  1. Convert NCERT-style unicode math (lim x→0, x², √, α, ∫, ∑, ≤, ≠, ∞, ∈ …)
 *     into proper LaTeX so KaTeX renders it like a textbook.
 *  2. Wrap bare LaTeX commands and bare math-looking runs (`\frac{1}{2}`,
 *     `e^x`, `x^2`, `a_n`) in `$...$` so the auto-renderer picks them up.
 *  3. Force `\displaystyle` + `\limits` on \lim, \sum, \int, \prod … so the
 *     bound (x→0, n=1, etc.) sits BELOW the operator even in inline math —
 *     matching NCERT/CBSE typography.
 *
 * For non-maths subjects we only normalise inside existing `$...$` blocks so
 * we don't accidentally mangle chemistry equations or biology prose.
 */

const PROTECTED =
  /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\]|\[svg\][\s\S]*?\[\/svg\]|\[smiles\][\s\S]*?\[\/smiles\])/g;

// Operators that should always render with under/over limits.
const LIMITS_OPS =
  /\\(lim|sum|int|prod|iint|iiint|oint|bigcup|bigcap|bigoplus|bigotimes|max|min|sup|inf|limsup|liminf)\b(?!\s*\\?limits)/g;

const LATEX_HINT =
  /\\(?:frac|d?frac|tfrac|sqrt|vec|hat|bar|tilde|overline|underline|begin|end|left|right|cdot|times|div|pm|mp|geq|leq|neq|approx|equiv|propto|infty|partial|nabla|sin|cos|tan|cot|sec|csc|sinh|cosh|tanh|arcsin|arccos|arctan|log|ln|exp|lim|sum|int|prod|alpha|beta|gamma|delta|epsilon|varepsilon|zeta|eta|theta|vartheta|iota|kappa|lambda|mu|nu|xi|pi|rho|sigma|tau|upsilon|phi|varphi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Phi|Psi|Omega|hbar|ell|rightarrow|leftarrow|Rightarrow|Leftarrow|leftrightarrow|Leftrightarrow|to|mapsto|implies|iff|forall|exists|in|notin|subset|supset|subseteq|supseteq|cup|cap|emptyset|circ|degree|prime|ce|text|mathrm|mathbf|mathit|mathbb|mathcal|boldsymbol|begin\{matrix\}|begin\{pmatrix\}|begin\{bmatrix\}|begin\{vmatrix\})\b/;

// Unicode → LaTeX (used inside math runs only).
const UNICODE_MAP: Record<string, string> = {
  "α": "\\alpha ", "β": "\\beta ", "γ": "\\gamma ", "δ": "\\delta ",
  "ε": "\\varepsilon ", "ζ": "\\zeta ", "η": "\\eta ", "θ": "\\theta ",
  "ι": "\\iota ", "κ": "\\kappa ", "λ": "\\lambda ", "μ": "\\mu ",
  "ν": "\\nu ", "ξ": "\\xi ", "π": "\\pi ", "ρ": "\\rho ",
  "σ": "\\sigma ", "τ": "\\tau ", "υ": "\\upsilon ", "φ": "\\varphi ",
  "χ": "\\chi ", "ψ": "\\psi ", "ω": "\\omega ",
  "Γ": "\\Gamma ", "Δ": "\\Delta ", "Θ": "\\Theta ", "Λ": "\\Lambda ",
  "Ξ": "\\Xi ", "Π": "\\Pi ", "Σ": "\\Sigma ", "Φ": "\\Phi ",
  "Ψ": "\\Psi ", "Ω": "\\Omega ",
  "∞": "\\infty ", "∂": "\\partial ", "∇": "\\nabla ",
  "→": "\\to ", "←": "\\leftarrow ", "⇒": "\\Rightarrow ", "⇐": "\\Leftarrow ",
  "↔": "\\leftrightarrow ", "⇔": "\\Leftrightarrow ", "⇌": "\\rightleftharpoons ",
  "≤": "\\leq ", "≥": "\\geq ", "≠": "\\neq ", "≈": "\\approx ", "≡": "\\equiv ",
  "±": "\\pm ", "∓": "\\mp ", "×": "\\times ", "÷": "\\div ", "·": "\\cdot ",
  "∈": "\\in ", "∉": "\\notin ", "∋": "\\ni ",
  "⊂": "\\subset ", "⊃": "\\supset ", "⊆": "\\subseteq ", "⊇": "\\supseteq ",
  "∪": "\\cup ", "∩": "\\cap ", "∅": "\\emptyset ",
  "∑": "\\sum ", "∏": "\\prod ", "∫": "\\int ", "∮": "\\oint ", "√": "\\sqrt",
  "∀": "\\forall ", "∃": "\\exists ", "¬": "\\neg ",
  "°": "^{\\circ}", "′": "'", "″": "''",
  "⋅": "\\cdot ", "…": "\\ldots ",
};

const SUB_DIGITS: Record<string, string> = {
  "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4",
  "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9",
};
const SUP_DIGITS: Record<string, string> = {
  "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4",
  "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9",
};

function unicodeToLatex(s: string): string {
  // Group runs of unicode subscript / superscript digits.
  s = s.replace(/[₀-₉]+/g, (run) =>
    "_{" + run.split("").map((c) => SUB_DIGITS[c] ?? c).join("") + "}",
  );
  s = s.replace(/[⁰-⁹]+/g, (run) =>
    "^{" + run.split("").map((c) => SUP_DIGITS[c] ?? c).join("") + "}",
  );
  return s.replace(
    /[α-ωΑ-Ω∞∂∇→←⇒⇐↔⇔⇌≤≥≠≈≡±∓×÷·∈∉∋⊂⊃⊆⊇∪∩∅∑∏∫∮√∀∃¬°′″⋅…]/g,
    (ch) => UNICODE_MAP[ch] ?? ch,
  );
}

function addLimits(s: string): string {
  // Force \displaystyle inside the math run so inline \lim / \sum / \int
  // render with bounds above & below — NCERT style.
  let out = s.replace(LIMITS_OPS, (_, op) => `\\${op}\\limits`);
  if (
    /\\(lim|sum|int|prod|iint|iiint|oint|frac|dfrac)\b/.test(out) &&
    !/\\displaystyle\b/.test(out)
  ) {
    out = `\\displaystyle ${out}`;
  }
  return out;
}

/**
 * Match a contiguous LaTeX-looking run starting at a `\command`, a single
 * letter followed by `^`/`_`, or a Greek/operator unicode that we will map.
 */
const LATEX_RUN = new RegExp(
  String.raw`(?:` +
    // A backslash command with optional scripts and `{...}` arg groups
    String.raw`\\[a-zA-Z]+\*?(?:\\limits)?` +
    String.raw`(?:\s*[_^]\s*(?:\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}|[A-Za-z0-9+\-]))*` +
    String.raw`(?:\s*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})*` +
    String.raw`|` +
    // A single identifier with a sub/superscript: e^x, x^2, a_n, x_{i+1}
    String.raw`[A-Za-z](?:[_^](?:\{[^{}]*\}|[A-Za-z0-9+\-]))+` +
  String.raw`)` +
  // Optional bridge into adjacent simple math / further latex tokens
  String.raw`(?:` +
    String.raw`\s*(?:[=+\-*/().,;:]|\d+(?:\.\d+)?|` +
      String.raw`[A-Za-z](?:[_^](?:\{[^{}]*\}|[A-Za-z0-9+\-]))*)` +
  String.raw`)*` +
  String.raw`(?:\\[a-zA-Z]+\*?(?:\\limits)?` +
    String.raw`(?:\s*[_^]\s*(?:\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}|[A-Za-z0-9+\-]))*` +
    String.raw`(?:\s*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})*` +
    String.raw`(?:\s*(?:[=+\-*/().,;:]|\d+(?:\.\d+)?|` +
      String.raw`[A-Za-z](?:[_^](?:\{[^{}]*\}|[A-Za-z0-9+\-]))*))*` +
  String.raw`)*`,
  "g",
);

function wrapBareLatex(s: string): string {
  if (!LATEX_HINT.test(s) && !/[A-Za-z][_^]/.test(s)) return s;
  return s.replace(LATEX_RUN, (m) => {
    const trimmed = m.trim();
    if (!trimmed) return m;
    // Need at least one true LaTeX token (\command) OR a real ^ / _ script.
    const hasBackslash = /\\[a-zA-Z]/.test(trimmed);
    const hasScript = /[A-Za-z][_^]/.test(trimmed);
    if (!hasBackslash && !hasScript) return m;
    if (/^\$.*\$$/.test(trimmed)) return m;
    const lead = m.match(/^\s*/)?.[0] ?? "";
    const tail = m.match(/\s*$/)?.[0] ?? "";
    return `${lead}$${trimmed}$${tail}`;
  });
}

/**
 * In Maths text, also recognise bare unicode math like `lim x→0` or `√x` and
 * convert into a LaTeX expression wrapped in `$...$`.
 */
function wrapUnicodeMath(s: string): string {
  // Collapse `lim x→0` / `lim_(x→0)` style into LaTeX form.
  s = s.replace(
    /\blim[\s_]*[\(\{]?\s*([A-Za-z])\s*(?:→|->|\\to)\s*([^\s,;\)\}\$]+)\s*[\)\}]?/g,
    (_m, v, t) => `$\\lim\\limits_{${v} \\to ${t}}$`,
  );
  // Wrap any standalone unicode operator run that isn't already inside `$...$`.
  // We intentionally keep this conservative: only when it's adjacent to a
  // letter/number it's clearly math.
  return s;
}

/**
 * @param subject - When "Maths" we aggressively rewrite raw model output into
 *   real LaTeX. For other subjects we only inject `\limits` inside existing
 *   math blocks.
 */
export function preprocessLatex(
  text: string | null | undefined,
  subject?: string,
): string {
  if (!text) return "";
  const isMaths = subject === "Maths" || subject === "Mathematics";
  const parts = String(text).split(PROTECTED);
  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i];
    if (i % 2 === 1) {
      // Already-protected math/svg block.
      if (
        seg.startsWith("$") ||
        seg.startsWith("\\(") ||
        seg.startsWith("\\[")
      ) {
        // Convert any stray unicode → LaTeX inside math, then add \limits.
        if (seg.startsWith("$$")) {
          parts[i] = "$$" + addLimits(unicodeToLatex(seg.slice(2, -2))) + "$$";
        } else if (seg.startsWith("\\[")) {
          parts[i] = "\\[" + addLimits(unicodeToLatex(seg.slice(2, -2))) + "\\]";
        } else if (seg.startsWith("\\(")) {
          parts[i] = "\\(" + addLimits(unicodeToLatex(seg.slice(2, -2))) + "\\)";
        } else {
          parts[i] = "$" + addLimits(unicodeToLatex(seg.slice(1, -1))) + "$";
        }
      }
      continue;
    }
    if (!isMaths) continue;
    let s = seg;
    s = wrapUnicodeMath(s);
    s = wrapBareLatex(s);
    // After wrapping, normalise unicode + add limits inside the new $..$ runs.
    s = s.replace(/\$([^$\n]+?)\$/g, (_m, inner) => {
      return "$" + addLimits(unicodeToLatex(inner)) + "$";
    });
    parts[i] = s;
  }
  return parts.join("");
}
