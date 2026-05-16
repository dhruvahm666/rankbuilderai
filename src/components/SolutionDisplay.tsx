import React from "react";
import { QuestionBody, InlineMathText } from "./QuestionBody";
import type { GeneratedQuestion } from "@/lib/types";

const OPTION_LABELS = ["a", "b", "c", "d"] as const;

/**
 * Normalize a raw solution string into discrete reasoning steps.
 * The model often returns "1. foo 2. bar 3. baz" inline, so we insert
 * newline breaks before common step markers, then split on blank lines.
 */
const SUB_DIGITS = ["₀", "₁", "₂", "₃", "₄", "₅", "₆", "₇", "₈", "₉"];
const SUP_DIGITS = ["⁰", "¹", "²", "³", "⁴", "⁵", "⁶", "⁷", "⁸", "⁹"];

function toSub(d: string) {
  return d.replace(/\d/g, (n) => SUB_DIGITS[Number(n)]);
}
function toSup(d: string) {
  return d.replace(/\d/g, (n) => SUP_DIGITS[Number(n)]);
}

/** Normalize plain-text chemistry / math notation the model sometimes emits
 *  in raw ASCII ("H2", "<=>", "Fe2+") into Unicode the renderer expects. */
function normalizeChemistry(text: string): string {
  // Skip math, smiles and svg blocks — only touch surrounding prose.
  const PROTECT = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\]|\[smiles\][\s\S]*?\[\/smiles\]|\[svg\][\s\S]*?\[\/svg\])/g;
  return text
    .split(PROTECT)
    .map((seg, i) => {
      if (i % 2 === 1) return seg; // protected block
      let s = seg;
      // Arrows
      s = s.replace(/<=>/g, "⇌").replace(/<-->/g, "⇌");
      s = s.replace(/-->/g, "→").replace(/->/g, "→");
      // Charges on ions: Fe2+, SO42-, NH4+
      s = s.replace(/([A-Z][a-z]?\d*)(\d*)([+\-])/g, (_m, base, n, sign) => {
        // base may already contain digits — split element vs subscript.
        const em = base.match(/^([A-Z][a-z]?)(\d*)$/);
        const elem = em ? em[1] : base;
        const sub = em ? em[2] : "";
        const subOut = sub ? toSub(sub) : "";
        const supOut = (n ? toSup(n) : "") + sign;
        return `${elem}${subOut}${supOut}`;
      });
      // Element followed by digit subscript: H2, O2, NH3, CO2, SO4
      s = s.replace(/\b([A-Z][a-z]?)(\d+)/g, (_m, el, n) => `${el}${toSub(n)}`);
      // x^2 / x^{2} → x²
      s = s.replace(/\^\{(\d+)\}/g, (_m, n) => toSup(n));
      s = s.replace(/\^(\d)/g, (_m, n) => toSup(n));
      return s;
    })
    .join("");
}

type SolutionStep = { label?: string; body: string };

const STEP_HEADER_RE =
  /^\s*Step\s*(\d+)\s*[—\-–:]\s*([^\n:]+?)\s*:\s*$/im;
const STEP_HEADER_GLOBAL_RE =
  /^\s*Step\s*(\d+)\s*[—\-–:]\s*([^\n:]+?)\s*:\s*$/gim;

function splitIntoSteps(raw: string): SolutionStep[] {
  if (!raw) return [];
  let text = normalizeChemistry(raw.replace(/\r\n/g, "\n").trim());

  // Strip a leading "Solution:" / "Solution -" header — we render our own.
  text = text.replace(/^\s*solution\s*[:\-—]?\s*/i, "");

  // Strip a trailing "Answer: ..." — the footer renders the canonical answer.
  text = text.replace(/\n?\s*(?:Final\s+)?Answer\s*[:\-]\s*[^\n]*\s*$/i, "");

  // Preferred path: model returned the strict "Step N — Label:" structure.
  if (STEP_HEADER_RE.test(text)) {
    // Ensure each "Step N — Label:" sits on its own line so the regex split is clean.
    const normalized = text.replace(
      /\s*(Step\s*\d+\s*[—\-–:]\s*[^\n:]+?:)\s*/gi,
      "\n\n$1\n",
    );
    const parts = normalized.split(STEP_HEADER_GLOBAL_RE);
    // split() with a regex containing groups yields: [pre, num, label, body, num, label, body, ...]
    const steps: SolutionStep[] = [];
    for (let i = 1; i + 2 < parts.length; i += 3) {
      const label = (parts[i + 1] || "").trim();
      const body = (parts[i + 2] || "").trim();
      if (label || body) steps.push({ label, body });
    }
    if (steps.length) return steps;
  }

  // Fallback: legacy inline "1. foo 2. bar" or paragraph solutions.
  let legacy = text
    .replace(/\s+(?=(?:Step\s*\d+\s*[:.\-]))/gi, "\n")
    .replace(/(?<=\S)\s+(\d{1,2})[.)]\s+(?=[A-Z(\[\$\\])/g, "\n$1. ")
    .replace(/\s+(?=\((?:i|ii|iii|iv|v|vi|vii|viii|ix|x)\)\s)/g, "\n");

  const lines = legacy.split("\n");
  const steps: SolutionStep[] = [];
  let buf: string[] = [];
  const flush = () => {
    const s = buf.join("\n").trim();
    if (s) steps.push({ body: s });
    buf = [];
  };
  const isStepStart = (l: string) =>
    /^\s*(?:Step\s*\d+\s*[:.\-]|\d{1,2}[.)]\s+|[-•]\s+)/i.test(l);

  for (const line of lines) {
    if (line.trim() === "") {
      flush();
      continue;
    }
    if (isStepStart(line) && buf.length) flush();
    const cleaned = line.replace(
      /^\s*(?:Step\s*\d+\s*[:.\-]\s*|\d{1,2}[.)]\s+|[-•]\s+)/i,
      "",
    );
    buf.push(cleaned);
  }
  flush();

  return steps.length ? steps : [{ body: text }];
}

/** Render a body string, turning **bold** markers into <strong> while
 *  delegating math/chemistry to QuestionBody. We split on bold markers and
 *  recombine so KaTeX still sees clean text inside each fragment. */
function renderBodyWithBold(text: string, subject?: string) {
  const parts = text.split(/(\*\*[^*\n]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) => {
        const m = p.match(/^\*\*([^*\n]+)\*\*$/);
        if (m) {
          return (
            <strong key={i} className="font-bold text-foreground">
              <InlineMathText text={m[1]} subject={subject} />
            </strong>
          );
        }
        if (!p) return null;
        return <QuestionBody key={i} text={p} size="sm" subject={subject} />;
      })}
    </>
  );
}

export const SolutionDisplay = React.memo(function SolutionDisplay({
  question,
  subject,
}: {
  question: GeneratedQuestion;
  subject?: string;
}) {
  const steps = splitIntoSteps(question.solution || "");

  const answerNode =
    question.type === "MCQ" ? (
      <>
        <span className="text-primary">
          ({OPTION_LABELS[question.correctIndex]})
        </span>{" "}
        <InlineMathText
          text={question.options[question.correctIndex] ?? ""}
          className="text-foreground"
          subject={subject}
        />
      </>
    ) : (
      <InlineMathText text={question.answer ?? ""} className="text-foreground" subject={subject} />
    );

  return (
    <section className="solution-box mt-4 rounded-xl border border-primary/20 bg-primary/[0.04] p-4 md:p-5">
      <header className="mb-3 flex items-center gap-2">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
          ✓
        </span>
        <h3 className="font-display text-xs font-bold uppercase tracking-[0.18em] text-primary">
          Solution
        </h3>
      </header>

      <ol className="space-y-4">
        {steps.map((step, i) => (
          <li key={i} className="flex items-start gap-3 leading-7">
            <span className="mt-1 inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-primary/30 bg-background text-[11px] font-bold tabular-nums text-primary">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <QuestionBody text={step} size="sm" subject={subject} />
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-5 rounded-lg border-2 border-success/40 bg-success/10 px-4 py-3 shadow-sm">
        <div className="font-display text-[11px] font-bold uppercase tracking-[0.18em] text-success">
          Correct Answer
        </div>
        <div className="mt-1 text-[16px] font-bold leading-7 text-foreground">
          {answerNode}
        </div>
      </div>
    </section>
  );
});
