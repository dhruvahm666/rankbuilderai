import { jsPDF } from "jspdf";
import { saveAs } from "file-saver";
import { toast } from "sonner";
import type { GeneratedQuestion } from "./types";

/**
 * PDF Download — Professional Multi-Page Layout
 * Section A: Questions only (1-2 pages)
 * Section B: Detailed Solutions (separate section)
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

function drawHeader(state: PageState, title: string, opts: { subject?: string; examLevel: string; topic?: string; totalQuestions: number }) {
  const { pdf, pageW, marginX } = state;
  
  // Color scheme: Professional dark blue
  const headerBgColor = [51, 65, 85]; // slate-700
  const headerTextColor = [255, 255, 255];
  const accentColor = [59, 130, 246]; // blue-500
  
  pdf.setFillColor(...headerBgColor);
  pdf.rect(0, 0, pageW, 60, "F");
  
  // Title
  pdf.setFontSize(20);
  pdf.setTextColor(...headerTextColor);
  pdf.setFont("helvetica", "bold");
  pdf.text(title, marginX, 25);
  
  // Metadata subtitle
  pdf.setFontSize(9);
  pdf.setTextColor(200, 200, 200);
  pdf.setFont("helvetica", "normal");
  const metadata = [opts.subject, opts.examLevel, `${opts.totalQuestions} Questions`, opts.topic]
    .filter(Boolean)
    .join(" • ");
  pdf.text(metadata, marginX, 40);
  
  state.y = 75;
}

function drawSectionTitle(state: PageState, title: string) {
  const { pdf, marginX, pageW, maxW } = state;
  const accentColor = [59, 130, 246];
  
  pdf.setFontSize(16);
  pdf.setTextColor(...accentColor);
  pdf.setFont("helvetica", "bold");
  pdf.text(title, marginX, state.y);
  
  state.y += 6;
  
  // Underline
  pdf.setDrawColor(...accentColor);
  pdf.setLineWidth(1.5);
  pdf.line(marginX, state.y, marginX + maxW, state.y);
  
  state.y += 16;
}

function checkNewPage(state: PageState, needed = 20) {
  if (state.y + needed > state.pageH - state.marginY) {
    state.pdf.addPage();
    state.y = state.marginY;
  }
}

function drawQuestion(state: PageState, q: GeneratedQuestion, index: number) {
  const { pdf, marginX, pageW, maxW } = state;
  const labels = ["a", "b", "c", "d"] as const;
  
  checkNewPage(state, 60);
  
  const boxStartY = state.y - 4;
  
  // Question number and type badge
  pdf.setFontSize(12);
  pdf.setTextColor(51, 65, 85);
  pdf.setFont("helvetica", "bold");
  pdf.text(`Q${index + 1}.`, marginX, state.y + 2);
  
  pdf.setFontSize(8);
  pdf.setTextColor(100, 100, 100);
  pdf.setFont("helvetica", "normal");
  pdf.text(q.type, pageW - marginX - 5, state.y + 2, { align: "right" });
  
  state.y += 14;
  
  // Question text
  const qText = cleanText(q.question);
  pdf.setFontSize(10);
  pdf.setTextColor(30, 30, 30);
  pdf.setFont("helvetica", "normal");
  const qLines = pdf.splitTextToSize(qText, maxW - 8);
  const qH = qLines.length * 5.5;
  
  checkNewPage(state, qH + 15);
  pdf.text(qLines, marginX + 4, state.y);
  state.y += qH + 8;
  
  // Options or numerical input placeholder
  if (q.type === "MCQ") {
    q.options.forEach((opt, oi) => {
      const optText = cleanText(opt);
      const optLines = pdf.splitTextToSize(optText, maxW - 50);
      const optH = Math.max(optLines.length * 5.2 + 6, 14);
      
      checkNewPage(state, optH + 4);
      
      // Option box background
      pdf.setFillColor(250, 250, 250);
      pdf.setDrawColor(220, 220, 220);
      pdf.setLineWidth(0.3);
      pdf.roundedRect(marginX, state.y - 8, maxW, optH, 2, 2, "FD");
      
      // Option label
      pdf.setFontSize(10);
      pdf.setTextColor(59, 130, 246);
      pdf.setFont("helvetica", "bold");
      pdf.text(`(${labels[oi]})`, marginX + 4, state.y + 1);
      
      // Option text
      pdf.setTextColor(35, 35, 35);
      pdf.setFont("helvetica", "normal");
      pdf.text(optLines, marginX + 28, state.y + 1);
      
      state.y += optH + 2;
    });
  } else {
    // Numerical answer space
    checkNewPage(state, 20);
    pdf.setFillColor(240, 248, 255);
    pdf.setDrawColor(180, 210, 230);
    pdf.setLineWidth(0.4);
    pdf.roundedRect(marginX, state.y - 8, maxW, 16, 2, 2, "FD");
    
    pdf.setFontSize(9);
    pdf.setTextColor(80, 80, 140);
    pdf.setFont("helvetica", "italic");
    pdf.text("[Answer: _____________]", marginX + 4, state.y + 2);
    
    state.y += 18;
  }
  
  // Question border
  pdf.setDrawColor(220, 220, 220);
  pdf.setLineWidth(0.5);
  pdf.roundedRect(marginX - 4, boxStartY, maxW + 8, state.y - boxStartY + 2, 4, 4, "S");
  
  state.y += 10;
}

function drawSolution(state: PageState, q: GeneratedQuestion, index: number) {
  const { pdf, marginX, pageW, maxW } = state;
  const labels = ["a", "b", "c", "d"] as const;
  
  checkNewPage(state, 40);
  
  // Solution header
  pdf.setFontSize(12);
  pdf.setTextColor(51, 65, 85);
  pdf.setFont("helvetica", "bold");
  pdf.text(`Q${index + 1} Solution`, marginX, state.y);
  
  state.y += 8;
  
  // Separator line
  pdf.setDrawColor(200, 200, 200);
  pdf.setLineWidth(0.3);
  pdf.line(marginX, state.y, marginX + maxW, state.y);
  
  state.y += 8;
  
  // Solution text
  const solText = cleanText(q.solution);
  pdf.setFontSize(9);
  pdf.setTextColor(40, 40, 40);
  pdf.setFont("helvetica", "normal");
  const solLines = pdf.splitTextToSize(solText, maxW - 4);
  const solH = solLines.length * 5.5;
  
  checkNewPage(state, solH + 12);
  pdf.text(solLines, marginX + 2, state.y);
  state.y += solH + 10;
  
  // Correct answer box
  const answerLabel = q.type === "MCQ" 
    ? `Answer: (${labels[q.correctIndex]}) ${cleanText(q.options[q.correctIndex] ?? "")}`
    : `Answer: ${cleanText(q.answer ?? "")}`;
  
  pdf.setFillColor(240, 253, 244);
  pdf.setDrawColor(34, 197, 94);
  pdf.setLineWidth(0.5);
  pdf.roundedRect(marginX, state.y - 8, maxW, 16, 2, 2, "FD");
  
  pdf.setFontSize(10);
  pdf.setTextColor(22, 163, 74);
  pdf.setFont("helvetica", "bold");
  pdf.text(answerLabel, marginX + 4, state.y + 2, { maxWidth: maxW - 8 });
  
  state.y += 20;
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
  const marginX = 35;
  const marginY = 35;
  const maxW = pageW - marginX * 2;
  
  let state: PageState = {
    y: marginY,
    pageW,
    pageH,
    marginX,
    marginY,
    maxW,
    pdf,
  };

  // ════════════════════════════════════════════════════════════════
  // SECTION A: QUESTIONS PAGE
  // ════════════════════════════════════════════════════════════════
  drawHeader(state, "Practice Questions", opts);
  drawSectionTitle(state, "QUESTIONS");
  
  opts.questions.forEach((q, i) => {
    drawQuestion(state, q, i);
  });

  // ════════════════════════════════════════════════════════════════
  // SECTION B: SOLUTIONS PAGE (New Page)
  // ════════════════════════════════════════════════════════════════
  pdf.addPage();
  state.y = marginY;
  
  drawHeader(state, "Solutions & Explanations", opts);
  drawSectionTitle(state, "DETAILED SOLUTIONS");
  
  opts.questions.forEach((q, i) => {
    drawSolution(state, q, i);
  });

  // ════════════════════════════════════════════════════════════════
  // PAGE NUMBERS & FOOTER
  // ════════════════════════════════════════════════════════════════
  const totalPages = (pdf as any).internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    pdf.setPage(p);
    
    // Footer line
    pdf.setDrawColor(200, 200, 200);
    pdf.setLineWidth(0.3);
    pdf.line(marginX, pageH - 20, pageW - marginX, pageH - 20);
    
    // Page number
    pdf.setFontSize(8);
    pdf.setTextColor(120, 120, 120);
    pdf.setFont("helvetica", "normal");
    pdf.text(
      `Page ${p} of ${totalPages}`,
      pageW / 2,
      pageH - 10,
      { align: "center" }
    );
  }

  // ════════════════════════════════════════════════════════════════
  // SAVE TO DEVICE
  // ════════════════════════════════════════════════════════════════
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
