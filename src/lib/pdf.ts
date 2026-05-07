import { jsPDF } from "jspdf";
import { saveAs } from "file-saver";
import { toast } from "sonner";
import type { GeneratedQuestion } from "./types";

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

function cleanText(s: string): string {
  if (!s) return "";
  let t = s;

  // Remove SVG and SMILES blocks
  t = t.replace(/\[svg\][\s\S]*?\[\/svg\]/gi, "[Diagram]");
  t = t.replace(/<svg[\s\S]*?<\/svg>/gi, "[Diagram]");
  t = t.replace(/\[smiles\][\s\S]*?\[\/smiles\]/gi, "");

  // Fix HTML entities
  t = t.replace(/&amp;/g, "&");
  t = t.replace(/&lt;/g, "<");
  t = t.replace(/&gt;/g, ">");
  t = t.replace(/&nbsp;/g, " ");
  t = t.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
  t = t.replace(/&[a-zA-Z]+;/g, "");

  // ── FIX GARBLED jsPDF SYMBOLS ──────────────────────────────────────────────
  // These appear because jsPDF maps special Unicode chars to wrong glyphs
  t = t.replace(/!Ì/g, " <=> ");
  t = t.replace(/!ì/g, " <=> ");
  t = t.replace(/Ì/g, " <=> ");
  t = t.replace(/!Ò/g, " => ");
  t = t.replace(/leftharpoons/g, " <=> ");
  t = t.replace(/\\rightleftharpoons/g, " <=> ");
  t = t.replace(/"H\b/g, "~");
  t = t.replace(/"h\b/g, "~");
  t = t.replace(/\bÀ\b/g, "pi");
  t = t.replace(/¸/g, "theta");
  t = t.replace(/!'/g, "->");
  // Fix garbled superscripts: jsPDF maps x⁴ to "x t", x⁵ to "x u" etc.
  t = t.replace(/\bx t\b/g, "x^4");
  t = t.replace(/\bx u\b/g, "x^5");
  t = t.replace(/\bx v\b/g, "x^6");
  t = t.replace(/\be t\b/g, "e^4");
  t = t.replace(/\be u\b/g, "e^5");
  t = t.replace(/O\(x t\)/g, "O(x^4)");
  t = t.replace(/O\(x u\)/g, "O(x^5)");
  t = t.replace(/O\(x v\)/g, "O(x^6)");
  t = t.replace(/\b(\w)\s+t\b(?!\s*=)/g, "$1^4");
  t = t.replace(/\b(\w)\s+u\b(?!\s*=)/g, "$1^5");
  t = t.replace(/\b(\w)\s+v\b(?!\s*=)/g, "$1^6");

  // ── FIX lim NOTATION ──────────────────────────────────────────────────────
  t = t.replace(/lim_x\s*0/g, "lim(x->0)");
  t = t.replace(/lim_x\s*"\s*/g, "lim(x->inf)");
  t = t.replace(/lim_n\s*"\s*/g, "lim(n->inf)");
  t = t.replace(/lim_x\s*infty/g, "lim(x->inf)");
  t = t.replace(/lim_n\s*infty/g, "lim(n->inf)");
  t = t.replace(/lim_([a-zA-Z])\s*→\s*([^\s,]+)/g, "lim($1->$2)");
  t = t.replace(/lim_([a-zA-Z])\s+([^\s,]+)/g, "lim($1->$2)");
  // Fix infinity symbol garbling
  t = t.replace(/\b"\s*$/gm, " inf");
  t = t.replace(/\b" /g, " inf ");
  t = t.replace(/→"\b/g, "->inf");
  t = t.replace(/\b([a-zA-Z])\s*"\b/g, "$1->inf");

  // ── FIX SUBSCRIPT VARIABLES ───────────────────────────────────────────────
  t = t.replace(/K_p/g, "Kp");
  t = t.replace(/K_c/g, "Kc");
  t = t.replace(/K_eq/g, "Keq");
  t = t.replace(/K_sp/g, "Ksp");
  t = t.replace(/n_g/g, "delta_n");
  t = t.replace(/([A-Za-z])_\{([^}]*)\}/g, "$1($2)");
  t = t.replace(/([A-Za-z])_([0-9])/g, "$1$2");

  // ── FIX \ce{} CHEMISTRY ───────────────────────────────────────────────────
  const fixCeInner = (inner: string) =>
    inner
      .replace(/<=>|<->/g, " <=> ")
      .replace(/->/g, " -> ")
      .replace(/<-/g, " <- ")
      .replace(/\^\{([^}]*)\}/g, "^$1")
      .replace(/\^([^\s{])/g, "^$1")
      .replace(/_\{([^}]*)\}/g, "$1")
      .replace(/_([^\s{])/g, "$1")
      .replace(/\\/g, "")
      .trim();
  t = t.replace(/\$\$\\ce\{([^}]*)\}\$\$/g, (_, inner) => fixCeInner(inner));
  t = t.replace(/\$\\ce\{([^}]*)\}\$?/g, (_, inner) => fixCeInner(inner));
  t = t.replace(/\\ce\{([^}]*)\}/g, (_, inner) => fixCeInner(inner));

  // ── FIX LaTeX TEXT COMMANDS ───────────────────────────────────────────────
  t = t.replace(/\\text\{([^}]*)\}/g, "$1");
  t = t.replace(/\\mathrm\{([^}]*)\}/g, "$1");
  t = t.replace(/\\mathbf\{([^}]*)\}/g, "$1");
  t = t.replace(/\\mathit\{([^}]*)\}/g, "$1");

  // ── FIX LaTeX TABLES ──────────────────────────────────────────────────────
  t = t.replace(/\\begin\{[^}]*\}/g, "\n");
  t = t.replace(/\\end\{[^}]*\}/g, "\n");
  t = t.replace(/lccc\s*/g, "");
  t = t.replace(/\\\\\s*/g, "\n");
  t = t.replace(/(?<!\w)&(?!\w)/g, " | ");

  // ── FIX ARROWS ────────────────────────────────────────────────────────────
  t = t.replace(/<=>/g, " <=> ");
  t = t.replace(/=>/g, " => ");
  t = t.replace(/\\rightarrow/g, " -> ");
  t = t.replace(/\\leftarrow/g, " <- ");
  t = t.replace(/\\Rightarrow/g, " => ");
  t = t.replace(/\\leftrightarrow/g, " <-> ");

  // ── STRIP LaTeX DELIMITERS ────────────────────────────────────────────────
  t = t.replace(/```[\s\S]*?```/g, "");
  t = t.replace(/`([^`]*)`/g, "$1");
  t = t.replace(/\$\$([\s\S]*?)\$\$/g, "$1");
  t = t.replace(/\$([^$\n]+?)\$/g, "$1");
  t = t.replace(/\\\[([\s\S]*?)\\\]/g, "$1");
  t = t.replace(/\\\(([\s\S]*?)\\\)/g, "$1");

  // ── FIX MATH EXPRESSIONS ─────────────────────────────────────────────────
  t = t.replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, "($1)/($2)");
  t = t.replace(/\\sqrt\{([^}]*)\}/g, "sqrt($1)");
  t = t.replace(/\^\{([^}]*)\}/g, "^($1)");
  t = t.replace(/\^(-?\d+)/g, "^$1");

  // ── MATH SYMBOLS ──────────────────────────────────────────────────────────
  t = t.replace(/\\times/g, "x");
  t = t.replace(/\\cdot/g, ".");
  t = t.replace(/\\div/g, "/");
  t = t.replace(/\\pm/g, "+/-");
  t = t.replace(/\\mp/g, "-/+");
  t = t.replace(/\\geq/g, ">=");
  t = t.replace(/\\leq/g, "<=");
  t = t.replace(/\\neq/g, "!=");
  t = t.replace(/\\approx/g, "~");
  t = t.replace(/\\infty/g, "inf");
  t = t.replace(/\\alpha/g, "alpha");
  t = t.replace(/\\beta/g, "beta");
  t = t.replace(/\\gamma/g, "gamma");
  t = t.replace(/\\delta/g, "delta");
  t = t.replace(/\\epsilon/g, "epsilon");
  t = t.replace(/\\theta/g, "theta");
  t = t.replace(/\\omega/g, "omega");
  t = t.replace(/\\lambda/g, "lambda");
  t = t.replace(/\\mu/g, "mu");
  t = t.replace(/\\sigma/g, "sigma");
  t = t.replace(/\\pi/g, "pi");
  t = t.replace(/\\rho/g, "rho");
  t = t.replace(/\\phi/g, "phi");
  t = t.replace(/\\psi/g, "psi");
  t = t.replace(/\\chi/g, "chi");
  t = t.replace(/\\eta/g, "eta");
  t = t.replace(/\\kappa/g, "kappa");
  t = t.replace(/\\tau/g, "tau");
  t = t.replace(/\\xi/g, "xi");
  t = t.replace(/\\zeta/g, "zeta");
  t = t.replace(/\\partial/g, "d/d");
  t = t.replace(/\\nabla/g, "nabla");
  t = t.replace(/\\hbar/g, "h-bar");
  t = t.replace(/\\int/g, "integral");
  t = t.replace(/\\sum/g, "sum");
  t = t.replace(/\\prod/g, "product");
  t = t.replace(/\\lim/g, "lim");
  t = t.replace(/\\exp/g, "exp");
  t = t.replace(/\\log/g, "log");
  t = t.replace(/\\ln/g, "ln");
  t = t.replace(/\\sin/g, "sin");
  t = t.replace(/\\cos/g, "cos");
  t = t.replace(/\\tan/g, "tan");

  // ── FINAL CLEANUP ─────────────────────────────────────────────────────────
  t = t.replace(/\\vec\{([^}]*)\}/g, "$1");
  t = t.replace(/\\(?:left|right|displaystyle|operatorname)\s*/g, "");
  t = t.replace(/\\[a-zA-Z]+/g, "");
  t = t.replace(/[{}]/g, "");
  t = t.replace(/\$/g, "");
  t = t.replace(/<[^>]+>/g, "");
  t = t.replace(/[ \t]+/g, " ");
  t = t.replace(/\n{3,}/g, "\n\n");
  return t.trim();
}

interface PageState {
  y: number;
  pageW: number;
  pageH: number;
  marginX: number;
  marginY: number;
  maxW: number;
  pdf: jsPDF;
}

const COLOR = {
  ink: [15, 23, 42] as const,
  body: [30, 41, 59] as const,
  muted: [100, 116, 139] as const,
  rule: [203, 213, 225] as const,
  accent: [37, 99, 235] as const,
  successText: [21, 128, 61] as const,
  successBg: [240, 253, 244] as const,
  successBorder: [187, 230, 200] as const,
  headerBg: [37, 99, 235] as const,
  optionBg: [248, 250, 252] as const,
  optionBorder: [226, 232, 240] as const,
};

function drawHeader(
  state: PageState,
  title: string,
  opts: { subject?: string; examLevel: string; topic?: string; totalQuestions: number },
) {
  const { pdf, marginX, maxW } = state;
  pdf.setFillColor(...COLOR.headerBg);
  pdf.rect(0, 0, state.pageW, 54, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(20);
  pdf.setTextColor(255, 255, 255);
  pdf.text(title, marginX, 34);
  state.y = 70;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(...COLOR.muted);
  const metadata = [opts.subject, opts.examLevel, `${opts.totalQuestions} Questions`, opts.topic]
    .filter(Boolean)
    .join("  -  ");
  if (metadata) {
    pdf.text(metadata, marginX, state.y);
    state.y += 10;
  }
  pdf.setDrawColor(...COLOR.rule);
  pdf.setLineWidth(0.5);
  pdf.line(marginX, state.y, marginX + maxW, state.y);
  state.y += 16;
}

function drawSectionTitle(state: PageState, title: string) {
  const { pdf, marginX, maxW } = state;
  checkNewPage(state, 30);
  pdf.setFillColor(239, 246, 255);
  pdf.rect(marginX - 4, state.y - 11, maxW + 8, 16, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.setTextColor(...COLOR.accent);
  pdf.text(title.toUpperCase(), marginX, state.y);
  state.y += 14;
}

function checkNewPage(state: PageState, needed = 20) {
  if (state.y + needed > state.pageH - state.marginY - 14) {
    state.pdf.addPage();
    state.y = state.marginY;
  }
}

function drawWrappedText(
  state: PageState,
  text: string,
  x: number,
  maxWidth: number,
  lineHeight = 14,
): number {
  const lines = state.pdf.splitTextToSize(text, maxWidth);
  let consumed = 0;
  for (const line of lines) {
    checkNewPage(state, lineHeight);
    state.pdf.text(line, x, state.y);
    state.y += lineHeight;
    consumed += lineHeight;
  }
  return consumed;
}

function drawQuestion(state: PageState, q: GeneratedQuestion, index: number) {
  const { pdf, marginX, maxW } = state;
  const labels = ["A", "B", "C", "D"] as const;

  checkNewPage(state, 80);

  // Question number box
  pdf.setFillColor(...COLOR.accent);
  pdf.roundedRect(marginX, state.y - 10, 22, 14, 2, 2, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.setTextColor(255, 255, 255);
  pdf.text(`Q${index + 1}`, marginX + 11, state.y, { align: "center" });

  // Type pill
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7.5);
  pdf.setTextColor(...COLOR.accent);
  pdf.text(q.type.toUpperCase(), marginX + maxW, state.y, { align: "right" });

  // Difficulty
  if ((q as any).difficulty) {
    const diff = (q as any).difficulty as string;
    const diffColor: [number, number, number] =
      diff === "Hard" ? [220, 38, 38] : diff === "Medium" ? [217, 119, 6] : [22, 163, 74];
    pdf.setTextColor(...diffColor);
    pdf.setFontSize(7.5);
    const diffX = marginX + maxW - pdf.getTextWidth(q.type.toUpperCase()) - 28;
    pdf.text(diff.toUpperCase(), diffX, state.y, { align: "right" });
  }

  state.y += 6;

  // Question text
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  pdf.setTextColor(...COLOR.body);
  drawWrappedText(state, cleanText(q.question), marginX + 26, maxW - 26, 14);
  state.y += 6;

  if (q.type === "MCQ") {
    const optTexts = q.options.map((o) => cleanText(o));
    const colW = maxW - 12;

    optTexts.forEach((optText, oi) => {
      const optX = marginX;
      pdf.setFontSize(10);
      pdf.setFont("helvetica", "normal");
      const lines = pdf.splitTextToSize(optText, colW - 26);
      const lineH = 13;
      const boxH = Math.max(26, lines.length * lineH + 14);

      checkNewPage(state, boxH + 8);

      // Option box
      pdf.setFillColor(...COLOR.optionBg);
      pdf.setDrawColor(...COLOR.optionBorder);
      pdf.setLineWidth(0.3);
      pdf.roundedRect(optX, state.y - 10, colW, boxH, 2, 2, "FD");

      // Label bubble
      pdf.setFillColor(...COLOR.accent);
      pdf.circle(optX + 8, state.y + 2, 5, "F");
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8);
      pdf.setTextColor(255, 255, 255);
      pdf.text(labels[oi], optX + 8, state.y + 4.5, { align: "center" });

      // Option text — ALL lines shown
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      pdf.setTextColor(...COLOR.body);
      lines.forEach((line: string, li: number) => {
        pdf.text(line, optX + 18, state.y + li * lineH);
      });

      state.y += boxH + 6;
    });
  } else {
    checkNewPage(state, 22);
    pdf.setFillColor(...COLOR.optionBg);
    pdf.setDrawColor(...COLOR.optionBorder);
    pdf.setLineWidth(0.3);
    pdf.roundedRect(marginX, state.y - 10, maxW, 18, 2, 2, "FD");
    pdf.setFont("helvetica", "italic");
    pdf.setFontSize(10);
    pdf.setTextColor(...COLOR.muted);
    pdf.text("Answer: ____________________________________________", marginX + 8, state.y);
    state.y += 18;
  }

  state.y += 10;
  pdf.setDrawColor(...COLOR.rule);
  pdf.setLineWidth(0.3);
  pdf.line(marginX, state.y, marginX + maxW, state.y);
  state.y += 12;
}

function drawSolution(state: PageState, q: GeneratedQuestion, index: number) {
  const { pdf, marginX, maxW } = state;
  const labels = ["A", "B", "C", "D"] as const;

  checkNewPage(state, 60);

  // Question number
  pdf.setFillColor(...COLOR.accent);
  pdf.roundedRect(marginX, state.y - 10, 22, 14, 2, 2, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.setTextColor(255, 255, 255);
  pdf.text(`Q${index + 1}`, marginX + 11, state.y, { align: "center" });
  state.y += 6;

  // Question preview
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(...COLOR.muted);
  const qLines = pdf.splitTextToSize(cleanText(q.question), maxW - 26);
  const preview = qLines.slice(0, 2).join(" ") + (qLines.length > 2 ? "..." : "");
  pdf.text(preview, marginX + 26, state.y, { maxWidth: maxW - 26 });
  state.y += 14;

  // Solution label
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.setTextColor(...COLOR.accent);
  pdf.text("SOLUTION", marginX, state.y);
  state.y += 12;

  // Solution body
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10.5);
  pdf.setTextColor(...COLOR.body);
  drawWrappedText(state, cleanText(q.solution), marginX + 8, maxW - 8, 14);
  state.y += 6;

  // Answer box — using plain ASCII to avoid garbled chars
  const answerLabel =
    q.type === "MCQ"
      ? `Correct Answer: (${labels[q.correctIndex]})  ${cleanText(q.options[q.correctIndex] ?? "")}`
      : `Answer: ${cleanText(q.answer ?? "")}`;

  const ansLines = pdf.splitTextToSize(answerLabel, maxW - 20);
  const boxH = ansLines.length * 13 + 14;
  checkNewPage(state, boxH + 8);

  pdf.setFillColor(...COLOR.successBg);
  pdf.setDrawColor(...COLOR.successBorder);
  pdf.setLineWidth(0.5);
  pdf.roundedRect(marginX, state.y, maxW, boxH, 3, 3, "FD");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10.5);
  pdf.setTextColor(...COLOR.successText);
  let ty = state.y + 13;
  for (const line of ansLines) {
    pdf.text(line, marginX + 10, ty);
    ty += 13;
  }
  state.y += boxH + 14;

  pdf.setDrawColor(...COLOR.rule);
  pdf.setLineWidth(0.3);
  pdf.line(marginX, state.y, marginX + maxW, state.y);
  state.y += 12;
}

async function buildAndSave(
  opts: {
    questions: GeneratedQuestion[];
    examLevel: string;
    topic?: string;
    subject?: string;
  },
  filename: string,
) {
  const pdf = new jsPDF({ unit: "pt", format: "a4", compress: true });
  pdf.setLanguage("en-US");
  pdf.setFont("helvetica", "normal");

  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const marginX = 48;
  const marginY = 56;
  const maxW = pageW - marginX * 2;
  const state: PageState = { y: marginY, pageW, pageH, marginX, marginY, maxW, pdf };

  // SECTION A — Questions
  drawHeader(state, "Practice Questions", { ...opts, totalQuestions: opts.questions.length });
  drawSectionTitle(state, "Questions");
  opts.questions.forEach((q, i) => drawQuestion(state, q, i));

  // SECTION B — Solutions
  pdf.addPage();
  state.y = marginY;
  drawHeader(state, "Solutions & Explanations", { ...opts, totalQuestions: opts.questions.length });
  drawSectionTitle(state, "Detailed Solutions");
  opts.questions.forEach((q, i) => drawSolution(state, q, i));

  // Page numbers
  const totalPages = (pdf as any).internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    pdf.setPage(p);
    pdf.setDrawColor(...COLOR.rule);
    pdf.setLineWidth(0.3);
    pdf.line(marginX, pageH - 28, pageW - marginX, pageH - 28);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);
    pdf.setTextColor(...COLOR.muted);
    pdf.text("Student Helper by Dhruva", marginX, pageH - 16);
    pdf.text(`Page ${p} of ${totalPages}`, pageW - marginX, pageH - 16, { align: "right" });
  }

  // Save to device
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
}
