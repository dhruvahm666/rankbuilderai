import { jsPDF } from "jspdf";
import { saveAs } from "file-saver";
import { toast } from "sonner";
import type { GeneratedQuestion } from "./types";

/**
 * PDF Download — Pure jsPDF text (NO html2canvas)
 * html2canvas was crashing on KaTeX external fonts.
 * This approach never fails — converts all math to readable symbols.
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
  const marginX = 40;
  const marginY = 40;
  const maxW = pageW - marginX * 2;
  let y = marginY;
  const labels = ["a", "b", "c", "d"] as const;

  function checkNewPage(needed = 20) {
    if (y + needed > pageH - marginY) {
      pdf.addPage();
      y = marginY;
    }
  }

  // ── HEADER ──────────────────────────────────────────────
  pdf.setFillColor(155, 29, 29);
  pdf.rect(0, 0, pageW, 52, "F");
  pdf.setFontSize(18);
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.text("Student Helper by Dhruva", marginX, 28);
  pdf.setFontSize(10);
  pdf.setFont("helvetica", "normal");
  const subtitle = [opts.subject, opts.examLevel, opts.questions.length + " Questions", opts.topic]
    .filter(Boolean).join(" • ");
  pdf.text(subtitle, marginX, 44);
  y = 72;

  // ── QUESTIONS ────────────────────────────────────────────
  pdf.setFontSize(14);
  pdf.setTextColor(155, 29, 29);
  pdf.setFont("helvetica", "bold");
  pdf.text("QUESTIONS", marginX, y);
  y += 6;
  pdf.setDrawColor(155, 29, 29);
  pdf.setLineWidth(1);
  pdf.line(marginX, y, pageW - marginX, y);
  y += 16;

  opts.questions.forEach((q, i) => {
    checkNewPage(80);
    const boxStartY = y - 6;

    // Q number + type badge
    pdf.setFontSize(13);
    pdf.setTextColor(155, 29, 29);
    pdf.setFont("helvetica", "bold");
    pdf.text(`Q${i + 1}.`, marginX, y + 2);
    pdf.setFontSize(8);
    pdf.setTextColor(100, 100, 100);
    pdf.setFont("helvetica", "normal");
    pdf.text(q.type, pageW - marginX - 5, y + 2, { align: "right" });
    y += 16;

    // Question text
    const qText = cleanText(q.question);
    pdf.setFontSize(11);
    pdf.setTextColor(25, 25, 25);
    pdf.setFont("helvetica", "normal");
    const qLines = pdf.splitTextToSize(qText, maxW - 10);
    const qH = qLines.length * 16;
    checkNewPage(qH + 10);
    pdf.text(qLines, marginX + 8, y);
    y += qH + 8;

    // Options or numerical
    if (q.type === "MCQ") {
      q.options.forEach((opt, oi) => {
        const optText = cleanText(opt);
        const optLines = pdf.splitTextToSize(optText, maxW - 45);
        const optH = optLines.length * 14 + 12;
        checkNewPage(optH + 4);

        pdf.setFillColor(252, 249, 242);
        pdf.setDrawColor(220, 210, 195);
        pdf.setLineWidth(0.4);
        pdf.roundedRect(marginX, y - 10, maxW, optH, 3, 3, "FD");

        pdf.setFontSize(10.5);
        pdf.setTextColor(155, 29, 29);
        pdf.setFont("helvetica", "bold");
        pdf.text(`(${labels[oi]})`, marginX + 6, y + 2);

        pdf.setTextColor(35, 35, 35);
        pdf.setFont("helvetica", "normal");
        pdf.text(optLines, marginX + 32, y + 2);
        y += optH + 5;
      });
    } else {
      checkNewPage(28);
      pdf.setFillColor(240, 248, 255);
      pdf.setDrawColor(180, 210, 230);
      pdf.roundedRect(marginX, y - 10, maxW, 24, 3, 3, "FD");
      pdf.setFontSize(10);
      pdf.setTextColor(80, 80, 140);
      pdf.setFont("helvetica", "italic");
      pdf.text("Write your numerical answer here:", marginX + 8, y + 6);
      y += 26;
    }

    // Question border box
    pdf.setDrawColor(229, 220, 205);
    pdf.setLineWidth(0.5);
    pdf.roundedRect(marginX - 6, boxStartY, maxW + 12, y - boxStartY + 4, 5, 5, "S");
    y += 14;
  });

  // ── ANSWER KEY PAGE ──────────────────────────────────────
  pdf.addPage();
  y = marginY;

  pdf.setFillColor(155, 29, 29);
  pdf.rect(0, 0, pageW, 44, "F");
  pdf.setFontSize(16);
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.text("ANSWER KEY", marginX, 28);
  y = 60;

  // Table header
  const col1 = marginX;
  const col2 = marginX + 55;
  const col3 = marginX + 270;
  const rowH = 22;

  pdf.setFillColor(255, 240, 220);
  pdf.rect(col1, y - 14, maxW, rowH, "F");
  pdf.setFontSize(10);
  pdf.setTextColor(155, 29, 29);
  pdf.setFont("helvetica", "bold");
  pdf.text("Q No.", col1 + 4, y);
  pdf.text("Correct Answer", col2 + 4, y);
  pdf.text("Type", col3 + 4, y);
  y += rowH;

  opts.questions.forEach((q, i) => {
    const ans =
      q.type === "MCQ"
        ? `(${labels[q.correctIndex]}) ${cleanText(q.options[q.correctIndex] ?? "")}`
        : cleanText(q.answer ?? "");

    const ansLines = pdf.splitTextToSize(ans, 200);
    const rH = Math.max(rowH, ansLines.length * 14 + 8);
    checkNewPage(rH + 4);

    if (i % 2 === 0) {
      pdf.setFillColor(252, 249, 242);
      pdf.rect(col1, y - 14, maxW, rH, "F");
    }

    pdf.setFontSize(10);
    pdf.setTextColor(40, 40, 40);
    pdf.setFont("helvetica", "bold");
    pdf.text(`Q${i + 1}`, col1 + 4, y);

    pdf.setFont("helvetica", "normal");
    pdf.text(ansLines, col2 + 4, y);

    pdf.setTextColor(100, 100, 100);
    pdf.text(q.type, col3 + 4, y);

    pdf.setDrawColor(220, 210, 195);
    pdf.setLineWidth(0.3);
    pdf.line(col1, y + rH - 14, pageW - marginX, y + rH - 14);
    y += rH;
  });

  // ── PAGE NUMBERS ─────────────────────────────────────────
  const totalPages = (pdf as any).internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    pdf.setPage(p);
    pdf.setFontSize(8);
    pdf.setTextColor(160, 160, 160);
    pdf.setFont("helvetica", "normal");
    pdf.text(
      `Page ${p} of ${totalPages}  •  Student Helper by Dhruva`,
      pageW / 2, pageH - 12, { align: "center" },
    );
  }

  // ── SAVE TO DEVICE ────────────────────────────────────────
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
