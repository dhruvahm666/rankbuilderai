import { Fragment } from "react";

/**
 * Detects whether a chunk of lines should render as a centered monospace
 * "exam block" (reactions, organic structures, text diagrams, match-the-
 * following columns, "Given:/Find:" data blocks) vs normal prose.
 *
 * Heuristics — kept conservative so plain prose stays as prose.
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
  | { kind: "block"; text: string; isMatch: boolean };

function segment(text: string): Segment[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: Segment[] = [];
  let i = 0;
  while (i < lines.length) {
    const kind = blockKindFor(lines[i]);
    if (kind) {
      const buf: string[] = [];
      const isMatch = kind === "match" || kind === "given";
      // Group consecutive block-like lines (allow single blank line gaps)
      while (i < lines.length) {
        const cur = lines[i];
        const next = lines[i + 1] ?? "";
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
      // Trim trailing blank lines
      while (buf.length && buf[buf.length - 1].trim() === "") buf.pop();
      if (buf.length) out.push({ kind: "block", text: buf.join("\n"), isMatch });
    } else {
      const buf: string[] = [];
      while (i < lines.length && blockKindFor(lines[i]) === null) {
        buf.push(lines[i]);
        i++;
      }
      const txt = buf.join("\n").replace(/\n{3,}/g, "\n\n").trim();
      if (txt) out.push({ kind: "prose", text: txt });
    }
  }
  return out;
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
    <div className={`exam-q ${className}`}>
      {segments.map((seg, idx) => {
        if (seg.kind === "prose") {
          return (
            <p key={idx} className={proseClass}>
              {seg.text}
            </p>
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
