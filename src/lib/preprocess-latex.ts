/**
 * Preprocess raw model output so KaTeX can render it cleanly.
 *
 * Two jobs:
 * 1. Force display-style placement of limits on \lim, \sum, \int, \prod, etc.
 *    so subscripts/superscripts appear above/below the operator (NCERT-style),
 *    even in inline math. Done by inserting `\limits` after the operator.
 * 2. If the source contains bare LaTeX commands (\frac, \rightarrow, \alpha …)
 *    that are NOT already wrapped in $...$, \(...\) or \[...\], wrap the
 *    LaTeX-looking runs in `$...$` so the auto-renderer picks them up.
 *
 * We never touch text already inside math delimiters, [svg]…[/svg], or
 * [smiles]…[/smiles] blocks.
 */

const PROTECTED =
  /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\]|\[svg\][\s\S]*?\[\/svg\]|\[smiles\][\s\S]*?\[\/smiles\])/g;

// Operators that should always render with under/over limits.
const LIMITS_OPS =
  /\\(lim|sum|int|prod|iint|iiint|oint|bigcup|bigcap|bigoplus|bigotimes|max|min|sup|inf)\b(?!\\?limits)/g;

// Tokens that signal the surrounding text is LaTeX and needs wrapping.
const LATEX_HINT =
  /\\(?:frac|d?frac|tfrac|sqrt|vec|hat|bar|tilde|overline|underline|begin|end|left|right|cdot|times|div|pm|mp|geq|leq|neq|approx|equiv|propto|infty|partial|nabla|sin|cos|tan|cot|sec|csc|sinh|cosh|tanh|log|ln|exp|lim|sum|int|prod|alpha|beta|gamma|delta|epsilon|varepsilon|zeta|eta|theta|vartheta|iota|kappa|lambda|mu|nu|xi|pi|rho|sigma|tau|upsilon|phi|varphi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Phi|Psi|Omega|hbar|ell|rightarrow|leftarrow|Rightarrow|Leftarrow|leftrightarrow|Leftrightarrow|to|mapsto|implies|iff|forall|exists|in|notin|subset|supset|cup|cap|emptyset|circ|degree|prime|ce|text|mathrm|mathbf|mathit|mathbb|mathcal|boldsymbol)\b/;

function addLimits(s: string): string {
  return s.replace(LIMITS_OPS, (_, op) => `\\${op}\\limits`);
}

/**
 * Greedily match a LaTeX-looking expression starting at a `\command`.
 * Captures the command, optional `\limits`, repeated _{...}/^{...} or _x/^x
 * scripts, and immediately-following `{...}` arg groups (up to 4 deep).
 * Allows neighbouring tokens (digits, +, -, =, parens, comma, simple ops)
 * to be pulled into the same math run so we don't end up with
 * `$\frac{1}{2}$ x + 1` when the whole thing should be one expression.
 */
const LATEX_RUN = new RegExp(
  // start: a command or a math-y char adjacent to one
  String.raw`(?:` +
    // a backslash command with optional args/scripts
    String.raw`\\[a-zA-Z]+\*?(?:\\limits)?` +
    String.raw`(?:\s*(?:_|\^)\s*(?:\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}|[A-Za-z0-9+\-]))*` +
    String.raw`(?:\s*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})*` +
  String.raw`)` +
  // optional trailing bridge to an adjacent latex token / simple math
  String.raw`(?:\s*(?:[=+\-*/().,;:]|\d+(?:\.\d+)?|[A-Za-z](?:_\{[^{}]*\}|\^\{[^{}]*\}|_[A-Za-z0-9]|\^[A-Za-z0-9])?)\s*)*` +
  String.raw`(?:\\[a-zA-Z]+\*?(?:\\limits)?(?:\s*(?:_|\^)\s*(?:\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}|[A-Za-z0-9+\-]))*(?:\s*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})*)*`,
  "g",
);

function wrapBareLatex(s: string): string {
  if (!LATEX_HINT.test(s)) return s;
  return s.replace(LATEX_RUN, (m) => {
    const trimmed = m.trim();
    if (!trimmed || !trimmed.startsWith("\\")) return m;
    // Don't double-wrap if already inside a $ pair (paranoia — split should prevent this).
    if (/^\$.*\$$/.test(trimmed)) return m;
    const lead = m.match(/^\s*/)?.[0] ?? "";
    const tail = m.match(/\s*$/)?.[0] ?? "";
    return `${lead}$${trimmed}$${tail}`;
  });
}

export function preprocessLatex(text: string | null | undefined): string {
  if (!text) return "";
  const parts = String(text).split(PROTECTED);
  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i];
    if (i % 2 === 1) {
      // Protected math/svg block: only inject \limits inside math, never wrap.
      if (
        seg.startsWith("$") ||
        seg.startsWith("\\(") ||
        seg.startsWith("\\[")
      ) {
        parts[i] = addLimits(seg);
      }
      continue;
    }
    parts[i] = addLimits(wrapBareLatex(seg));
  }
  return parts.join("");
}
