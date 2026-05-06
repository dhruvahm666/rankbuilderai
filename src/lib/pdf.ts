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
      toast.success("PDF Downloaded ✅", { id: progressId });
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
  
  // Fix ampersand-separated characters like &F&o&r& → For
  t = t.replace(/(?:&([A-Za-z0-9]);?)+/g, (match) => {
    return match.replace(/&([A-Za-z0-9]);?/g, '$1');
  });

  // Fix pattern where single characters are separated by & like &t&h&e&
  t = t.replace(/\b(?:[A-Za-z0-9]&){2,}[A-Za-z0-9]\b/g, (match) => {
    return match.replace(/&/g, '');
  });
  
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
  // Fix \ce{} chemistry — handle $$\ce{...}$$, $\ce{...}$, \ce{...}
  const fixCeInner = (inner: string) =>
    inner
      .replace(/<=>|<->/g, " ⇌ ")
      .replace(/->/g, " → ")
      .replace(/<-/g, " ← ")
      .replace(/\^\{([^}]*)\}/g, "$1")
      .replace(/\^([^\s{])/g, "$1")
      .replace(/\\_/g, "")
      .replace(/_\{([^}]*)\}/g, "$1")
      .replace(/_([^\s{])/g, "$1")
      .replace(/\\/g, "")
      .trim();
  t = t.replace(/\$\$\\ce\{([^}]*)\}\$\$/g, (_, inner) => fixCeInner(inner));
  t = t.replace(/\$\\ce\{([^}]*)\}\$?/g, (_, inner) => fixCeInner(inner));
  t = t.replace(/\\ce\{([^}]*)\}/g, (_, inner) => fixCeInner(inner));
  // Fix \text{}, \mathrm{}, \mathbf{}, \mathit{}
  t = t.replace(/\\text\{([^}]*)\}/g, "$1");
  t = t.replace(/\\mathrm\{([^}]*)\}/g, "$1");
  t = t.replace(/\\mathbf\{([^}]*)\}/g, "$1");
  t = t.replace(/\\mathit\{([^}]*)\}/g, "$1");
  // Fix raw arrows
  t = t.replace(/<=>/g, " ⇌ ");
  t = t.replace(/=>/g, " ⇒ ");
  // Strip LaTeX delimiters but keep content
  t = t.replace(/```[\s\S]*?```/g, "");
  t = t.replace(/`([^`]*)`/g, "$1");
  t = t.replace(/\$\$([\s\S]*?)\$\$/g, "$1");
  t = t.replace(/\$([^$\n]+?)\$/g, "$1");
  t = t.replace(/\\\[([\s\S]*?)\\\]/g, "$1");
  t = t.replace(/\\\(([\s\S]*?)\\\)/g, "$1");
  // Fix math expressions
  t = t.replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, "($1)/($2)");
  t = t.replace(/\\sqrt\{([^}]*)\}/g, "√($1)");
  t = t.replace(/\^\{([^}]*)\}/g, "$1");
  t = t.replace(/\^(-?\d+)/g, "$1");
  t = t.replace(/\^\{?([^}\s]+)\}?/g, "$1");
  // Math symbols
  t = t.replace(/\\times/g, "×");
  t = t.replace(/\\cdot/g, "·");
  t = t.replace(/\\div/g, "÷");
  t = t.replace(/\\pm/g, "±");
  t = t.replace(/\\mp/g, "∓");
  t = t.replace(/\\geq/g, "≥");
  t = t.replace(/\\leq/g, "≤");
  t = t.replace(/\\neq/g, "≠");
  t = t.replace(/\\approx/g, "≈");
  t = t.replace(/\\infty/g, "∞");
  t = t.replace(/\\alpha/g, "α");
  t = t.replace(/\\beta/g, "β");
  t = t.replace(/\\gamma/g, "γ");
  t = t.replace(/\\delta/g, "δ");
  t = t.replace(/\\epsilon/g, "ε");
  t = t.replace(/\\theta/g, "θ");
  t = t.replace(/\\omega/g, "ω");
  t = t.replace(/\\lambda/g, "λ");
  t = t.replace(/\\mu/g, "μ");
  t = t.replace(/\\sigma/g, "σ");
  t = t.replace(/\\pi/g, "π");
  t = t.replace(/\\rho/g, "ρ");
  t = t.replace(/\\phi/g, "φ");
  t = t.replace(/\\psi/g, "ψ");
  t = t.replace(/\\chi/g, "χ");
  t = t.replace(/\\eta/g, "η");
  t = t.replace(/\\kappa/g, "κ");
  t = t.replace(/\\tau/g, "τ");
  t = t.replace(/\\xi/g, "ξ");
  t = t.replace(/\\zeta/g, "ζ");
  t = t.replace(/\\partial/g, "∂");
  t = t.replace(/\\nabla/g, "∇");
  t = t.replace(/\\hbar/g, "ℏ");
  t = t.replace(/\\int/g, "∫");
  t = t.replace(/\\sum/g, "Σ");
  t = t.replace(/\\prod/g, "Π");
  t = t.replace(/\\lim/g, "lim");
  t = t.replace(/\\exp/g, "exp");
  t = t.replace(/\\log/g, "log");
  t = t.replace(/\\ln/g, "ln");
  t = t.replace(/\\sin/g, "sin");
  t = t.replace(/\\cos/g, "cos");
  t = t.replace(/\\tan/g, "tan");
  t = t.replace(/\\rightarrow/g, "→");
  t = t.replace(/\\leftarrow/g, "←");
  t = t.replace(/\\Rightarrow/g, "⇒");
  t = t.replace(/\\Leftarrow/g, "⟸");
  t = t.replace(/\\leftrightarrow/g, "↔");
  t = t.replace(/\\vec\{([^}]*)\}/g, "$1");
  t = t.replace(/\\(?:left|right|displaystyle|operatorname)\s*/g, "");
  t = t.replace(/\\begin\{[^}]*\}/g, "");
  t = t.replace(/\\end\{[^}]*\}/g, "");
  t = t.replace(/\\[a-zA-Z]+/g, "");
  t = t.replace(/[{}]/g, "");
  // Remove stray dollar signs
  t = t.replace(/\$/g, "");
  // Clean HTML tags and whitespace
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
  // Blue header bar
  pdf.setFillColor(...COLOR.headerBg);
  pdf.rect(0, 0, state.pageW, 54, "F");
  // Title in white
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(20);
  pdf.setTextColor(255, 255, 255);
  pdf.text(title, marginX, 34);
  state.y = 70;
  // Metadata line
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(...COLOR.muted);
  const metadata = [opts.subject, opts.examLevel, `${opts.totalQuestions} Questions`, opts.topic]
    .filter(Boolean)
    .join("  •  ");
  if (metadata) {
    pdf.text(metadata, marginX, state.y);
    state.y += 10;
  }
  // Divider
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

  checkNewPage(state, 60);

  // Question number box
  const numLabel = `Q${index + 1}`;
  pdf.setFillColor(...COLOR.accent);
  pdf.roundedRect(marginX, state.y - 10, 22, 14, 2, 2, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.setTextColor(255, 255, 255);
  pdf.text(numLabel, marginX + 11, state.y, { align: "center" });

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
    // Options in 2-column grid when short, else single column
    const optTexts = q.options.map((o) => cleanText(o));
    const maxOptLen = Math.max(...optTexts.map((o) => o.length));
    const twoCol = maxOptLen < 35 && maxW > 300;
    const colW = twoCol ? (maxW - 12) / 2 : maxW - 12;

    optTexts.forEach((optText, oi) => {
      const col = twoCol ? oi % 2 : 0;
      const row = twoCol ? Math.floor(oi / 2) : oi;
      if (col === 0) checkNewPage(state, 22);

      const optX = marginX + col * (colW + 12);
      const optY = twoCol
        ? state.y + row * 22 - (oi >= 2 ? 22 * Math.floor(oi / 2) : 0)
        : state.y;

      // Option box
      pdf.setFillColor(...COLOR.optionBg);
      pdf.setDrawColor(...COLOR.optionBorder);
      pdf.setLineWidth(0.3);
      pdf.roundedRect(optX, optY - 10, colW, 16, 2, 2, "FD");

      // Label bubble
      pdf.setFillColor(...COLOR.accent);
      pdf.circle(optX + 8, optY - 2, 5, "F");
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8);
      pdf.setTextColor(255, 255, 255);
      pdf.text(labels[oi], optX + 8, optY + 0.5, { align: "center" });

      // Option text
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      pdf.setTextColor(...COLOR.body);
      const lines = pdf.splitTextToSize(optText, colW - 22);
      pdf.text(lines[0] || optText, optX + 18, optY, { maxWidth: colW - 20 });

      if (!twoCol) state.y += 20;
    });

    if (twoCol) state.y += Math.ceil(q.options.length / 2) * 22 + 4;
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

  // Question text (abbreviated in solutions)
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

  // Answer chip
  const answerLabel =
    q.type === "MCQ"
      ? `✓  Correct Answer: (${labels[q.correctIndex]})  ${cleanText(q.options[q.correctIndex] ?? "")}`
      : `✓  Answer: ${cleanText(q.answer ?? "")}`;

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

  // Footer / page numbers
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
