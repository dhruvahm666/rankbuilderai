import { Fragment } from "react";
import { InlineMath, BlockMath } from "react-katex";
import "katex/dist/katex.min.css";

/**
 * Detects whether a chunk of lines should render as a centered monospace
 * "exam block" (reactions, organic structures, text diagrams, match-the-
 * following columns, "Given:/Find:" data blocks) vs normal prose.
 */
const REACTION_RE = /[→⇌⇒⇔]/;
const STRUCTURE_RE = /(CH[₀-₉0-9]?|—|--|⌬|\bC=O\b|\bC≡C\b|\bOH\b|\bNH[₂2]\b|\bNO[₂2]\b)/;
const DIAGRAM_RE = /[┌┐└┘─│├┤┬┴┼+|=]{2,}|\[[^\]]+\]/;
const GIVEN_RE = /^\s*(Given|Find|Data|To find|Required)\s*:/i;
const COLUMN_RE = /^\s*(Column\s*I|Column\s*II|\([a-d]\)|\([ivx]+\))/i;
const MATCH_HEADER_RE = /Column\s*I\s+Column\s*II/i;

function blockKindFor(line: string): "reaction" | "structure" | "diagram" | "match" | "given" | null {
  if (MATCH_HEADER_RE.test(line) || COLUMN_RE.test(line)) return "match";
  if (GIVEN_RE.test(line)) return "given";
  if (REACTION_RE.test(line)) return "reaction";
  if (DIAGRAM_RE.test(line)) return "diagram";
  if (STRUCTURE_RE.test(line) && /[—–-]{1,}|⌬/.test(line)) return "structure";
  return null;
}

type Segment =
  | { kind: "prose"; text: string }
  | { kind: "block"; text: string; isMatch: boolean }
  | { kind: "svg"; svg: string };

/** Pull out [svg]...[/svg] blocks first so the line-by-line segmenter doesn't mangle them. */
const SVG_RE = /\[svg\]([\s\S]*?)\[\/svg\]/gi;

function sanitizeSvg(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed.toLowerCase().startsWith("<svg")) return null;
  // Strip anything obviously dangerous. Best-effort, never block render on errors.
  const cleaned = trimmed
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/javascript:/gi, "");
  if (cleaned.length > 8000) return null;
  return cleaned;
}

function segment(text: string): Segment[] {
  // 1) Extract SVG blocks up-front and replace with placeholders we can re-inject.
  const svgs: string[] = [];
  const placeholders: string[] = [];
  const withoutSvg = text.replace(SVG_RE, (_m, inner) => {
    const safe = sanitizeSvg(String(inner));
    if (!safe) return ""; // drop broken svg silently — never show raw code
    const token = `\u0000SVG${svgs.length}\u0000`;
    svgs.push(safe);
    placeholders.push(token);
    return `\n${token}\n`;
  });

  const lines = withoutSvg.replace(/\r\n/g, "\n").split("\n");
  const out: Segment[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const svgIdx = placeholders.indexOf(line.trim());
    if (svgIdx !== -1) {
      out.push({ kind: "svg", svg: svgs[svgIdx] });
      i++;
      continue;
    }
    const kind = blockKindFor(line);
    if (kind) {
      const buf: string[] = [];
      const isMatch = kind === "match" || kind === "given";
      while (i < lines.length) {
        const cur = lines[i];
        const next = lines[i + 1] ?? "";
        if (placeholders.includes(cur.trim())) break;
        const curIsBlock = blockKindFor(cur) !== null || (cur.trim() === "" && blockKindFor(next));
        if (!curIsBlock && cur.trim() !== "") break;
        if (cur.trim() === "" && buf.length === 0) {
          i++;
          continue;
        }
        buf.push(cur);
        i++;
        if (cur.trim() === "" && blockKindFor(next) === null) break;
      }
      while (buf.length && buf[buf.length - 1].trim() === "") buf.pop();
      if (buf.length) out.push({ kind: "block", text: buf.join("\n"), isMatch });
    } else {
      const buf: string[] = [];
      while (i < lines.length) {
        const cur = lines[i];
        if (placeholders.includes(cur.trim())) break;
        if (blockKindFor(cur) !== null) break;
        buf.push(cur);
        i++;
      }
      const txt = buf.join("\n").replace(/\n{3,}/g, "\n\n").trim();
      if (txt) out.push({ kind: "prose", text: txt });
    }
  }
  return out;
}

/**
 * Render math segments inside prose. Supports:
 *  - $$...$$  → block math
 *  - $...$    → inline math
 *  - \(...\)  → inline math
 *  - \[...\]  → block math
 */
type MathPart =
  | { type: "text"; value: string }
  | { type: "inline"; value: string }
  | { type: "block"; value: string };

function parseMath(text: string): MathPart[] {
  const parts: MathPart[] = [];
  // Combined regex: $$...$$ | \[...\] | $...$ | \(...\)
  const re = /(\$\$[\s\S]+?\$\$)|(\\\[[\s\S]+?\\\])|(\$[^$\n]+?\$)|(\\\([\s\S]+?\\\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: "text", value: text.slice(last, m.index) });
    const tok = m[0];
    if (tok.startsWith("$$")) {
      parts.push({ type: "block", value: tok.slice(2, -2).trim() });
    } else if (tok.startsWith("\\[")) {
      parts.push({ type: "block", value: tok.slice(2, -2).trim() });
    } else if (tok.startsWith("\\(")) {
      parts.push({ type: "inline", value: tok.slice(2, -2).trim() });
    } else {
      parts.push({ type: "inline", value: tok.slice(1, -1).trim() });
    }
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });
  return parts.length ? parts : [{ type: "text", value: text }];
}

function ProseWithMath({ text, className }: { text: string; className: string }) {
  const parts = parseMath(text);
  return (
    <p className={className}>
      {parts.map((p, i) => {
        if (p.type === "text") return <Fragment key={i}>{p.value}</Fragment>;
        if (p.type === "inline") {
          try {
            return <InlineMath key={i} math={p.value} />;
          } catch {
            return <Fragment key={i}>{p.value}</Fragment>;
          }
        }
        try {
          return (
            <span key={i} className="my-2 block">
              <BlockMath math={p.value} />
            </span>
          );
        } catch {
          return <Fragment key={i}>{p.value}</Fragment>;
        }
      })}
    </p>
  );
}

/**
 * Inline KaTeX-aware renderer for short strings (option text, answers,
 * table cells). Renders math inside $...$, $$...$$, \(...\), \[...\] and
 * leaves the rest as plain text. No <p> wrapper, so it can sit inside
 * buttons / list items without breaking layout.
 */
export function InlineMathText({ text, className = "" }: { text: string; className?: string }) {
  const parts = parseMath(text || "");
  return (
    <span className={className}>
      {parts.map((p, i) => {
        if (p.type === "text") return <Fragment key={i}>{p.value}</Fragment>;
        if (p.type === "inline") {
          try {
            return <InlineMath key={i} math={p.value} />;
          } catch {
            return <Fragment key={i}>{p.value}</Fragment>;
          }
        }
        try {
          return <InlineMath key={i} math={p.value} />;
        } catch {
          return <Fragment key={i}>{p.value}</Fragment>;
        }
      })}
    </span>
  );
}

export function QuestionBody({
  text,
  className = "",
  size = "md",
}: {
  text: string;
  className?: string;
  size?: "sm" | "md";
}) {
  const segments = segment(text || "");
  const proseClass =
    size === "sm"
      ? "stem text-[14px] leading-7"
      : "stem text-[15px] leading-7";
  return (
    <div className={`exam-q ${className}`} style={{ width: "100%", maxWidth: "100%", overflowWrap: "break-word", wordBreak: "break-word" }}>
      {segments.map((seg, idx) => {
        if (seg.kind === "prose") {
          return <ProseWithMath key={idx} text={seg.text} className={proseClass} />;
        }
        if (seg.kind === "svg") {
          return (
            <div
              key={idx}
              className="exam-block svg-rendered my-3 flex justify-center bg-transparent border-0 p-2"
              style={{ background: "transparent", border: 0 }}
              // sanitised in segment(); never comes from user input
              dangerouslySetInnerHTML={{ __html: seg.svg }}
            />
          );
        }
        return (
          <Fragment key={idx}>
            <pre className={`exam-block ${seg.isMatch ? "is-match" : ""}`}>
              {seg.text}
            </pre>
          </Fragment>
        );
      })}
    </div>
  );
}
