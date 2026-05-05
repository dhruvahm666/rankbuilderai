import { jsPDF } from "jspdf";
import { saveAs } from "file-saver";
import { toast } from "sonner";
import type { GeneratedQuestion } from "./types";

/**
 * PDF Download — Clean exam-paper layout
 * Section A: Questions
 * Section B: Detailed Solutions (new page)
 */
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
  return s
    .replace(/\[svg\][\s\S]*?\[\/svg\]/gi, "[Diagram]")
    .replace(/<svg[\s\S]*?<\/svg>/gi, "[Diagram]")
    .replace(/\[smiles\][\s\S]*?\[\/smiles\]/gi, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\$\$([\s\S]*?)\$\$/g, "$1")
    .replace(/\$([^$\n]+?)\$/g, "$1")
    .replace(/\\\[([\s\S]*?)\\\]/g, "$1")
    .replace(/\\\(([\s\S]*?)\\\)/g, "$1")
    .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, "($1)/($2)")
    .replace(/\\sqrt\{([^}]*)\}/g, "√($1)")
    .replace(/\\times/g, "×")
    .replace(/\\cdot/g, "·")
    .replace(/\\div/g, "÷")
    .replace(/\\pm/g, "±")
    .replace(/\\geq/g, "≥")
    .replace(/\\leq/g, "≤")
    .replace(/\\neq/g, "≠")
    .replace(/\\approx/g, "≈")
    .replace(/\\infty/g, "∞")
    .replace(/\\alpha/g, "α")
    .replace(/\\beta/g, "β")
    .replace(/\\gamma/g, "γ")
    .replace(/\\delta/g, "δ")
    .replace(/\\theta/g, "θ")
    .replace(/\\omega/g, "ω")
    .replace(/\\lambda/g, "λ")
    .replace(/\\mu/g, "μ")
    .replace(/\\sigma/g, "σ")
    .replace(/\\pi/g, "π")
    .replace(/\\int/g, "∫")
    .replace(/\\sum/g, "Σ")
    .replace(/\\lim/g, "lim")
    .replace(/\\rightarrow/g, "→")
    .replace(/\\leftarrow/g, "←")
    .replace(/\\Rightarrow/g, "⇒")
    .replace(/\\vec\{([^}]*)\}/g, "$1")
    .replace(/\\(?:left|right|displaystyle|text|mathrm|mathbf|operatorname)\s*/g, "")
    .replace(/\\begin\{[^}]*\}/g, "")
    .replace(/\\end\{[^}]*\}/g, "")
    .replace(/\\[a-zA-Z]+/g, "")
    .replace(/[{}]/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
  ink: [25, 32, 45] as const,
  body: [40, 48, 60] as const,
  muted: [110, 118, 130] as const,
  rule: [220, 224, 230] as const,
  accent: [37, 99, 235] as const,
  accentSoft: [239, 246, 255] as const,
  successText: [21, 128, 61] as const,
  successBg: [240, 253, 244] as const,
  successBorder: [187, 230, 200] as const,
};

function drawHeader(
  state: PageState,
  title: string,
  opts: { subject?: string; examLevel: string; topic?: string; totalQuestions: number },
) {
  const { pdf, marginX, maxW } = state;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.setTextColor(...COLOR.ink);
  pdf.text(title, marginX, state.y);
  state.y += 8;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9.5);
  pdf.setTextColor(...COLOR.muted);
  const metadata = [opts.subject, opts.examLevel, `${opts.totalQuestions} Questions`, opts.topic]
    .filter(Boolean)
    .join("  •  ");
  if (metadata) {
    pdf.text(metadata, marginX, state.y);
    state.y += 8;
  }

  pdf.setDrawColor(...COLOR.ink);
  pdf.setLineWidth(0.8);
  pdf.line(marginX, state.y, marginX + maxW, state.y);
  state.y += 18;
}

function drawSectionTitle(state: PageState, title: string) {
  const { pdf, marginX } = state;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
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
  lineHeight = 13,
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
  const labels = ["a", "b", "c", "d"] as const;

  // Keep the question header with at least its first lines on the same page
  checkNewPage(state, 50);

  const numLabel = `Q${index + 1}.`;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.setTextColor(...COLOR.ink);
  const numWidth = pdf.getTextWidth(numLabel) + 6;
  pdf.text(numLabel, marginX, state.y);

  // Type pill on the right
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7.5);
  pdf.setTextColor(...COLOR.accent);
  pdf.text(q.type.toUpperCase(), marginX + maxW, state.y, { align: "right" });

  // Question text — hanging indent under the number
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  pdf.setTextColor(...COLOR.body);
  const textX = marginX + numWidth;
  const textW = maxW - numWidth;
  drawWrappedText(state, cleanText(q.question), textX, textW, 14);

  state.y += 6;

  if (q.type === "MCQ") {
    q.options.forEach((opt, oi) => {
      const optText = cleanText(opt);
      const labelStr = `(${labels[oi]})`;
      const optX = marginX + 12;
      const labelW = 18;

      checkNewPage(state, 18);

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10.5);
      pdf.setTextColor(...COLOR.accent);
      pdf.text(labelStr, optX, state.y);

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10.5);
      pdf.setTextColor(...COLOR.body);
      drawWrappedText(state, optText, optX + labelW, maxW - 12 - labelW, 13);

      state.y += 2;
    });
  } else {
    checkNewPage(state, 22);
    pdf.setFont("helvetica", "italic");
    pdf.setFontSize(10);
    pdf.setTextColor(...COLOR.muted);
    pdf.text("Answer: ____________________________", marginX + 12, state.y);
    state.y += 14;
  }

  state.y += 10;

  // Subtle separator between questions
  pdf.setDrawColor(...COLOR.rule);
  pdf.setLineWidth(0.3);
  pdf.line(marginX, state.y, marginX + maxW, state.y);
  state.y += 14;
}

function drawSolution(state: PageState, q: GeneratedQuestion, index: number) {
  const { pdf, marginX, maxW } = state;
  const labels = ["a", "b", "c", "d"] as const;

  checkNewPage(state, 50);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.setTextColor(...COLOR.ink);
  pdf.text(`Q${index + 1}.`, marginX, state.y);
  state.y += 14;

  // Solution body
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10.5);
  pdf.setTextColor(...COLOR.body);
  drawWrappedText(state, cleanText(q.solution), marginX, maxW, 14);

  state.y += 6;

  // Answer chip
  const answerLabel =
    q.type === "MCQ"
      ? `Answer:  (${labels[q.correctIndex]})  ${cleanText(q.options[q.correctIndex] ?? "")}`
      : `Answer:  ${cleanText(q.answer ?? "")}`;

  const ansLines = pdf.splitTextToSize(answerLabel, maxW - 16);
  const boxH = ansLines.length * 13 + 12;
  checkNewPage(state, boxH + 6);

  pdf.setFillColor(...COLOR.successBg);
  pdf.setDrawColor(...COLOR.successBorder);
  pdf.setLineWidth(0.5);
  pdf.roundedRect(marginX, state.y, maxW, boxH, 3, 3, "FD");

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10.5);
  pdf.setTextColor(...COLOR.successText);
  let ty = state.y + 13;
  for (const line of ansLines) {
    pdf.text(line, marginX + 8, ty);
    ty += 13;
  }
  state.y += boxH + 16;

  // Separator between solutions
  pdf.setDrawColor(...COLOR.rule);
  pdf.setLineWidth(0.3);
  pdf.line(marginX, state.y, marginX + maxW, state.y);
  state.y += 14;
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
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const marginX = 48;
  const marginY = 56;
  const maxW = pageW - marginX * 2;

  const state: PageState = {
    y: marginY,
    pageW,
    pageH,
    marginX,
    marginY,
    maxW,
    pdf,
  };

  // SECTION A — Questions
  drawHeader(state, "Practice Questions", { ...opts, totalQuestions: opts.questions.length });
  drawSectionTitle(state, "Questions");
  opts.questions.forEach((q, i) => drawQuestion(state, q, i));

  // SECTION B — Solutions
  pdf.addPage();
  state.y = marginY;
  drawHeader(state, "Solutions & Explanations", {
    ...opts,
    totalQuestions: opts.questions.length,
  });
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

  // Save
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
    setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(url);
    }, 1500);
  }
}
