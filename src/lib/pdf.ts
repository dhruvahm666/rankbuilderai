import { jsPDF } from "jspdf";
import html2canvas from "html2canvas-pro";
import { saveAs } from "file-saver";
import { toast } from "sonner";
import renderMathInElement from "katex/contrib/auto-render";
import "katex/dist/katex.min.css";
import "katex/contrib/mhchem";
import { preprocessLatex } from "./preprocess-latex";
import type { GeneratedQuestion } from "./types";

/* ------------------------------------------------------------------ */
/* Text normalization — produces clean Unicode for chemistry & math   */
/* ------------------------------------------------------------------ */

const SUB_DIGIT: Record<string, string> = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄",
  "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
};
const SUP_DIGIT: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴",
  "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  "+": "⁺", "-": "⁻", "n": "ⁿ",
};
const toSub = (s: string) => s.split("").map((c) => SUB_DIGIT[c] ?? c).join("");
const toSup = (s: string) => s.split("").map((c) => SUP_DIGIT[c] ?? c).join("");

function stripJunk(s: string): string {
  if (!s) return "";
  let t = s;
  // Strip embedded SVG / SMILES / HTML tags
  t = t.replace(/\[svg\][\s\S]*?\[\/svg\]/gi, "");
  t = t.replace(/<svg[\s\S]*?<\/svg>/gi, "");
  t = t.replace(/\[smiles\][\s\S]*?\[\/smiles\]/gi, "");
  t = t.replace(/<[^>]+>/g, "");
  // HTML entities
  t = t
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, c) => String.fromCharCode(parseInt(c, 16)))
    .replace(/&[a-zA-Z]+;/g, "");
  return t;
}

function normalizeMath(s: string): string {
  let t = stripJunk(s);

  // Equilibrium / arrow shorthand → real Unicode
  t = t
    .replace(/<=+>/g, "⇌")
    .replace(/<-+>/g, "↔")
    .replace(/-+>/g, "→")
    .replace(/<-+/g, "←")
    .replace(/=+>/g, "⇒")
    .replace(/\\rightleftharpoons/g, "⇌")
    .replace(/\\rightarrow/g, "→")
    .replace(/\\leftarrow/g, "←")
    .replace(/\\Rightarrow/g, "⇒")
    .replace(/\\leftrightarrow/g, "↔");

  // Common Greek
  const greek: [RegExp, string][] = [
    [/\\Delta/g, "Δ"], [/\\alpha/g, "α"], [/\\beta/g, "β"], [/\\gamma/g, "γ"],
    [/\\delta/g, "δ"], [/\\theta/g, "θ"], [/\\lambda/g, "λ"], [/\\mu/g, "μ"],
    [/\\pi/g, "π"], [/\\sigma/g, "σ"], [/\\omega/g, "ω"], [/\\phi/g, "φ"],
  ];
  for (const [re, ch] of greek) t = t.replace(re, ch);

  // Math operators
  t = t
    .replace(/\\times/g, "×").replace(/\\cdot/g, "·").replace(/\\div/g, "÷")
    .replace(/\\pm/g, "±").replace(/\\geq/g, "≥").replace(/\\leq/g, "≤")
    .replace(/\\neq/g, "≠").replace(/\\approx/g, "≈").replace(/\\infty/g, "∞");

  // \frac{a}{b} → (a)/(b), \sqrt{x} → √(x)
  t = t.replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, "($1)/($2)");
  t = t.replace(/\\sqrt\{([^}]*)\}/g, "√($1)");

  // Drop $...$ delimiters (keep the inside)
  t = t.replace(/\$\$([\s\S]*?)\$\$/g, "$1").replace(/\$([^$\n]+?)\$/g, "$1");
  // Drop remaining unknown LaTeX commands & braces
  t = t.replace(/\\[a-zA-Z]+/g, "").replace(/[{}]/g, "");

  // Subscripts: H_2 → H₂, [H_3O+] → [H₃O⁺]
  t = t.replace(/([A-Za-z\)\]])_(\d+)/g, (_, base, d) => `${base}${toSub(d)}`);

  // Inline chemistry subscripts: H2O → H₂O, NH3 → NH₃, PCl5 → PCl₅, CO2, etc.
  // After an element letter cluster, any digits are subscripts.
  t = t.replace(/\b([A-Z][a-z]?(?:[A-Z][a-z]?)*)(\d+)/g, (m, sym, d) => {
    // Avoid mangling things like "10" in "x10": only if first char is a capital letter.
    return `${sym}${toSub(d)}`;
  });

  // Closing-bracket subscripts: )2 → )₂, ]3 → ]₃
  t = t.replace(/([\)\]])(\d+)(?![\d.])/g, (_, b, d) => `${b}${toSub(d)}`);

  // Superscripts: x^2, ^-5, ^(-5), 10^-5, mol/L^2
  t = t.replace(/\^\(([+-]?\d+n?)\)/g, (_, e) => toSup(e));
  t = t.replace(/\^([+-]?\d+n?)/g, (_, e) => toSup(e));

  // Charges directly attached: Na+ → Na⁺, Mg2+ → Mg²⁺, SO4^2- handled above
  t = t.replace(/([A-Za-z\)\]₀-₉])(\d*)([+-])(?![\d\w])/g, (m, base, n, sign) => {
    const supN = n ? toSup(n) : "";
    return `${base}${supN}${sign === "+" ? "⁺" : "⁻"}`;
  });

  // Kc, Kp, Ka, Kb subscripts
  t = t.replace(/\bK([cpabswf])\b/g, (_, x) => `K${toSub("0").length ? "" : ""}` + ({ c: "꜀", p: "ₚ", a: "ₐ", b: "ᵦ", s: "ₛ", w: "w", f: "f" }[x as string] ?? x));
  // Fallback simple: keep "Kc" as is if unicode fancy fails — readable either way.

  // x10 → ×10 when next to a digit
  t = t.replace(/(\d)\s*x\s*10/g, "$1×10");

  // Collapse whitespace
  t = t.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n");
  return t.trim();
}

/* ------------------------------------------------------------------ */
/* HTML rendering                                                     */
/* ------------------------------------------------------------------ */

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Format a string for the PDF: wrap bare LaTeX in `$…$` (so KaTeX picks it up),
 * apply chemistry/Unicode normalization to the non-math parts only, and escape
 * HTML safely. The actual math rendering happens later when we run
 * renderMathInElement on the wrapper.
 */
function fmt(s: string): string {
  const pre = preprocessLatex(s ?? "");
  // Split into [text, math, text, math, …] where math chunks include their delimiters.
  const parts = pre.split(/(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\])/g);
  const out: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i];
    if (i % 2 === 1) {
      // Math chunk: keep the delimiters and the body verbatim — KaTeX will
      // render this. We must NOT html-escape `\` or `{}` inside math.
      out.push(seg);
    } else {
      out.push(escapeHtml(normalizeMath(seg)).replace(/\n/g, "<br>"));
    }
  }
  return out.join("");
}

const OPTION_LABELS = ["A", "B", "C", "D"] as const;

function renderQuestionCard(q: GeneratedQuestion, idx: number): string {
  const diff = (q as any).difficulty as string | undefined;
  const diffClass =
    diff === "Hard" ? "diff-hard" : diff === "Medium" ? "diff-med" : "diff-easy";

  let body = "";
  if (q.type === "MCQ") {
    body = `<ol class="opts">${q.options
      .map((o, i) => `<li><span class="lbl">${OPTION_LABELS[i]}</span><span class="opt-text">${fmt(o)}</span></li>`)
      .join("")}</ol>`;
  } else {
    body = `<div class="answer-line">Answer: <span class="blank"></span></div>`;
  }

  return `
    <article class="qcard">
      <header class="qhead">
        <span class="qnum">Q${idx + 1}</span>
        <div class="badges">
          ${diff ? `<span class="badge ${diffClass}">${escapeHtml(diff)}</span>` : ""}
          <span class="badge type">${escapeHtml(q.type)}</span>
        </div>
      </header>
      <div class="qtext">${fmt(q.question)}</div>
      ${body}
    </article>
  `;
}

function splitSteps(raw: string): string[] {
  const t = normalizeMath(raw ?? "").trim();
  if (!t) return [];
  // Split on "Step N:", "1.", "1)", or blank lines
  const lines = t.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const steps: string[] = [];
  let buf = "";
  const stepMarker = /^(?:step\s*\d+\s*[:.\)]|[(]?\d{1,2}[\).:]|\u2022|-)\s*/i;
  for (const line of lines) {
    if (stepMarker.test(line)) {
      if (buf) steps.push(buf.trim());
      buf = line.replace(stepMarker, "");
    } else {
      buf += (buf ? " " : "") + line;
    }
  }
  if (buf) steps.push(buf.trim());
  return steps.length ? steps : [t];
}

function renderSolutionCard(q: GeneratedQuestion, idx: number): string {
  const steps = splitSteps(q.solution || "");
  const stepsHtml = steps
    .map((s, i) => `<li><span class="step-n">${i + 1}</span><span class="step-t">${escapeHtml(s).replace(/\n/g, "<br>")}</span></li>`)
    .join("");

  const ans =
    q.type === "MCQ"
      ? `(${OPTION_LABELS[q.correctIndex]}) ${normalizeMath(q.options[q.correctIndex] ?? "")}`
      : normalizeMath(q.answer ?? "");

  return `
    <article class="scard">
      <header class="qhead">
        <span class="qnum">Q${idx + 1}</span>
        <span class="badge type">Solution</span>
      </header>
      <div class="qpreview">${fmt(q.question)}</div>
      <ol class="steps">${stepsHtml}</ol>
      <div class="answer-box"><span class="ans-label">Correct Answer:</span> <span class="ans-val">${escapeHtml(ans)}</span></div>
    </article>
  `;
}

function buildHtml(opts: {
  questions: GeneratedQuestion[];
  examLevel: string;
  topic?: string;
  subject?: string;
}): string {
  const date = new Date().toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" });
  const meta = [opts.subject, opts.examLevel, opts.topic].filter(Boolean).join(" • ");

  const css = `
    *{box-sizing:border-box}
    .pdf-root{width:794px;padding:48px 56px;background:#fff;color:#0f172a;
      font-family:"Times New Roman", Georgia, serif;font-size:14px;line-height:1.55;}
    .doc-header{border-bottom:3px double #1e3a8a;padding-bottom:14px;margin-bottom:22px;}
    .doc-title{font-size:24px;font-weight:700;color:#1e3a8a;letter-spacing:.3px;margin:0;}
    .doc-sub{display:flex;justify-content:space-between;font-size:12px;color:#475569;margin-top:6px;}
    .section-title{font-family:"Helvetica",Arial,sans-serif;font-size:13px;font-weight:700;
      letter-spacing:1px;color:#1e3a8a;text-transform:uppercase;background:#eff6ff;
      padding:8px 12px;border-left:4px solid #1e3a8a;margin:18px 0 14px;}
    .qcard,.scard{border:1px solid #cbd5e1;border-radius:6px;padding:14px 16px;margin-bottom:14px;
      page-break-inside:avoid;background:#fff;}
    .qhead{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;}
    .qnum{display:inline-block;background:#1e3a8a;color:#fff;font-weight:700;font-family:Helvetica,Arial,sans-serif;
      padding:3px 10px;border-radius:4px;font-size:12px;letter-spacing:.5px;}
    .badges{display:flex;gap:6px;}
    .badge{font-family:Helvetica,Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:.5px;
      padding:3px 8px;border-radius:10px;text-transform:uppercase;}
    .badge.type{background:#e0e7ff;color:#3730a3;}
    .diff-easy{background:#dcfce7;color:#166534;}
    .diff-med{background:#fef3c7;color:#92400e;}
    .diff-hard{background:#fee2e2;color:#991b1b;}
    .qtext{font-size:14px;color:#0f172a;margin-bottom:10px;white-space:pre-wrap;}
    .opts{list-style:none;padding:0;margin:8px 0 0;display:grid;grid-template-columns:1fr 1fr;gap:6px 14px;}
    .opts li{display:flex;gap:8px;align-items:flex-start;border:1px solid #e2e8f0;border-radius:4px;
      padding:6px 10px;background:#f8fafc;}
    .opts .lbl{font-weight:700;color:#1e3a8a;font-family:Helvetica,Arial,sans-serif;min-width:18px;}
    .answer-line{margin-top:6px;color:#475569;font-style:italic;}
    .blank{display:inline-block;border-bottom:1px dashed #94a3b8;min-width:260px;height:14px;}
    .qpreview{font-size:12.5px;color:#64748b;font-style:italic;margin:6px 0 10px;
      padding:6px 10px;background:#f8fafc;border-left:3px solid #cbd5e1;border-radius:2px;}
    .steps{list-style:none;padding:0;margin:0;}
    .steps li{display:flex;gap:10px;align-items:flex-start;margin-bottom:8px;}
    .step-n{flex:0 0 22px;height:22px;border-radius:50%;background:#1e3a8a;color:#fff;
      font-family:Helvetica,Arial,sans-serif;font-weight:700;font-size:11px;
      display:inline-flex;align-items:center;justify-content:center;}
    .step-t{flex:1;white-space:pre-wrap;}
    .answer-box{margin-top:12px;padding:10px 14px;background:#f0fdf4;border:2px solid #86efac;
      border-radius:6px;color:#14532d;font-weight:700;}
    .ans-label{color:#166534;letter-spacing:.4px;}
    .ans-val{color:#052e16;font-weight:700;}
  `;

  const head = `
    <div class="doc-header">
      <h1 class="doc-title">Practice Worksheet</h1>
      <div class="doc-sub"><span>${escapeHtml(meta)}</span><span>${escapeHtml(date)} • ${opts.questions.length} Questions</span></div>
    </div>`;

  const questions = opts.questions.map((q, i) => renderQuestionCard(q, i)).join("");
  const solutions = opts.questions.map((q, i) => renderSolutionCard(q, i)).join("");

  return `
    <style>${css}</style>
    <div class="pdf-root" id="pdf-root">
      ${head}
      <div class="section-title">Questions</div>
      ${questions}
      <div style="page-break-before:always"></div>
      ${head}
      <div class="section-title">Detailed Solutions</div>
      ${solutions}
    </div>
  `;
}

/* ------------------------------------------------------------------ */
/* Build PDF from HTML                                                */
/* ------------------------------------------------------------------ */

async function buildAndSave(
  opts: { questions: GeneratedQuestion[]; examLevel: string; topic?: string; subject?: string },
  filename: string,
) {
  document.documentElement.classList.add("pdf-capturing");
  const wrapper = document.createElement("div");
  wrapper.style.position = "fixed";
  wrapper.style.left = "-10000px";
  wrapper.style.top = "0";
  wrapper.style.background = "#fff";
  wrapper.innerHTML = buildHtml(opts);
  document.body.appendChild(wrapper);

  try {
    const root = wrapper.querySelector<HTMLDivElement>("#pdf-root")!;
    // Wait for fonts and layout to settle
    await new Promise((r) => setTimeout(r, 400));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))));
    try { await (document as any).fonts?.ready; } catch { /* ignore */ }

    const images = root.querySelectorAll("img");
    await Promise.all(
      Array.from(images).map(
        (img) =>
          new Promise((r) => {
            if ((img as HTMLImageElement).complete) return r(null);
            img.addEventListener("load", () => r(null));
            img.addEventListener("error", () => r(null));
          }),
      ),
    );

    const canvas = await html2canvas(root, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      allowTaint: true,
      logging: false,
      windowWidth: root.scrollWidth,
      width: root.scrollWidth,
      height: root.scrollHeight,
      onclone: (clonedDoc) => {
        const clonedRoot = clonedDoc.getElementById("pdf-root") as HTMLElement | null;
        if (clonedRoot) {
          clonedRoot.style.position = "relative";
          clonedRoot.style.left = "0";
          clonedRoot.style.overflow = "visible";
        }
      },
    });

    const pdf = new jsPDF({ unit: "pt", format: "a4", compress: true });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 28;
    const usableW = pageW - margin * 2;
    const usableH = pageH - margin * 2;

    const imgW = usableW;
    const pxPerPt = canvas.width / imgW;
    const pageHpx = usableH * pxPerPt;

    let y = 0;
    let first = true;
    let pageNum = 0;
    const totalPages = Math.max(1, Math.ceil(canvas.height / pageHpx));

    while (y < canvas.height) {
      const sliceH = Math.min(pageHpx, canvas.height - y);
      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = sliceH;
      const ctx = slice.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(canvas, 0, y, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
      if (!first) pdf.addPage();
      const dataUrl = slice.toDataURL("image/jpeg", 0.92);
      pdf.addImage(dataUrl, "JPEG", margin, margin, imgW, sliceH / pxPerPt, undefined, "FAST");
      first = false;
      y += sliceH;
      pageNum++;

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8.5);
      pdf.setTextColor(120, 120, 120);
      pdf.text("Student Helper by Dhruva", margin, pageH - 12);
      pdf.text(`Page ${pageNum} of ${totalPages}`, pageW - margin, pageH - 12, { align: "right" });
    }

    const blob = pdf.output("blob");
    const isiOS =
      typeof navigator !== "undefined" &&
      /iPad|iPhone|iPod/.test(navigator.userAgent) &&
      !(navigator as any).MSStream;

    if (isiOS) {
      saveAs(blob, filename);
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.rel = "noopener";
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 1500);
    }
  } finally {
    wrapper.remove();
    document.documentElement.classList.remove("pdf-capturing");
  }
}

export async function downloadTestPDF(opts: {
  questions: GeneratedQuestion[];
  examLevel: string;
  topic?: string;
  subject?: string;
}) {
  const FILENAME = "Questions.pdf";
  const progressId = toast.loading("Preparing PDF... Please wait");
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await buildAndSave(opts, FILENAME);
      toast.success("PDF Downloaded successfully", { id: progressId });
      return;
    } catch (err) {
      lastErr = err;
      console.warn(`PDF attempt ${attempt} failed`, err);
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 600 * Math.pow(2, attempt - 1)));
      }
    }
  }
  console.error("PDF failed after 3 attempts", lastErr);
  toast.error("Download failed. Please try again.", { id: progressId });
}
