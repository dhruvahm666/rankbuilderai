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

  // Step 1: Remove all SVG blocks, SMILES blocks, and HTML tags
  t = t.replace(/\[svg\][\s\S]*?\[\/svg\]/gi, "");
  t = t.replace(/<svg[\s\S]*?<\/svg>/gi, "");
  t = t.replace(/\[smiles\][\s\S]*?\[\/smiles\]/gi, "");
  t = t.replace(/<[^>]+>/g, "");

  // Step 2: Fix all HTML entities
  t = t.replace(/&amp;/g, "&");
  t = t.replace(/&lt;/g, "<");
  t = t.replace(/&gt;/g, ">");
  t = t.replace(/&nbsp;/g, " ");
  t = t.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
  t = t.replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(Number("0x" + code)));
  t = t.replace(/&[a-zA-Z]+;/g, "");

  // Step 3: Fix all broken equilibrium and arrow symbols
  t = t.replace(/!IM/g, "⇌");
  t = t.replace(/!im/g, "⇌");
  t = t.replace(/!O/g, "⇒");
  t = t.replace(/!'/g, "→");
  t = t.replace(/"H(?![a-zA-Z])/g, "≈");
  t = t.replace(/"([GHSN])/g, (_, letter) => {
    if (letter === "G") return "ΔG";
    if (letter === "H") return "ΔH";
    if (letter === "S") return "ΔS";
    if (letter === "n") return "Δn";
    return _;
  });

  // Step 4: Fix all negative superscript patterns
  t = t.replace(/\{(\d)\}/g, (_, digit) => {
    const superscripts = ["⁻⁰", "⁻¹", "⁻²", "⁻³", "⁻⁴", "⁻⁵", "⁻⁶", "⁻⁷", "⁻⁸", "⁻⁹"];
    return superscripts[Number(digit)] || _;
  });
  t = t.replace(/\{\s+([tuvwx])\}/g, (_, letter) => {
    const mapping: { [key: string]: string } = {
      "t": "⁻⁴",
      "u": "⁻⁵",
      "v": "⁻⁶",
      "w": "⁻⁷",
      "x": "⁻⁸"
    };
    return mapping[letter] || _;
  });
  t = t.replace(/\{(\d)\s+([tuvwx])\}/g, (_, digit, letter) => {
    const superscripts = ["⁻⁰", "⁻¹", "⁻²", "⁻³", "⁻⁴", "⁻⁵", "⁻⁶", "⁻⁷", "⁻⁸", "⁻⁹"];
    const mapping: { [key: string]: string } = {
      "t": "⁻⁴",
      "u": "⁻⁵",
      "v": "⁻⁶",
      "w": "⁻⁷",
      "x": "⁻⁸"
    };
    return (superscripts[Number(digit)] || "") + (mapping[letter] || "");
  });

  // Step 5: Fix all ionic charge symbols
  t = t.replace(/([A-Z][a-z]?)\s+z/g, "$1⁺");
  t = t.replace(/([A-Z][a-z]?)\s+\{/g, "$1⁻{");

  // Step 6: Fix the square root symbol
  t = t.replace(/"([\[\w])/g, "√$1");

  // Step 7: Fix all garbled superscript letters
  t = t.replace(/\b(\w)\s+t\b/g, "$1⁴");
  t = t.replace(/\b(\w)\s+u\b/g, "$1⁵");
  t = t.replace(/\b(\w)\s+v\b/g, "$1⁶");
  t = t.replace(/\b(\w)\s+w\b/g, "$1⁷");
  t = t.replace(/\b(\w)\s+x\b/g, "$1⁸");

  // Step 8: Fix all limit notation
  t = t.replace(/lim_([a-zA-Z])\s*"/g, "lim($1→∞)");
  t = t.replace(/lim_([a-zA-Z])\s+(\d+)/g, "lim($1→$2)");
  t = t.replace(/lim_([a-zA-Z])→([\d\w]+)/g, "lim($1→$2)");

  // Step 9: Remove all double backslashes and single backslashes as literal text
  t = t.replace(/""\\\\/g, " ");
  t = t.replace(/\\\\/g, " ");
  t = t.replace(/\\([a-zA-Z]+)/g, (match) => {
    const knownCommands = [
      "frac", "sqrt", "alpha", "beta", "gamma", "delta", "epsilon", "theta", "lambda", "mu",
      "pi", "sigma", "omega", "phi", "rho", "eta", "tau", "xi", "zeta", "psi", "chi",
      "Delta", "Sigma", "Omega", "Pi", "Gamma", "Lambda",
      "times", "cdot", "div", "pm", "mp", "geq", "leq", "neq", "approx", "infty",
      "int", "sum", "prod", "lim", "exp", "log", "ln", "sin", "cos", "tan",
      "sec", "csc", "cot", "arcsin", "arccos", "arctan", "sinh", "cosh", "tanh",
      "text", "mathrm", "mathbf", "mathit", "mathcal", "mathbb",
      "vec", "hat", "tilde", "bar", "dot", "ddot", "partial", "nabla", "hbar",
      "rightarrow", "leftarrow", "Rightarrow", "Leftarrow", "leftrightarrow",
      "begin", "end", "left", "right", "displaystyle", "operatorname", "ce"
    ];
    return knownCommands.includes(match.slice(1)) ? match : "";
  });

  // Step 10: Fix all LaTeX table formatting
  t = t.replace(/lccc|cccc|ccc|cc/g, "");
  t = t.replace(/\\\\\s*/g, "\n");
  t = t.replace(/(?<!\w)&(?!\w)/g, " | ");

  // Step 11: Fix all LaTeX math commands
  t = t.replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, "($1)/($2)");
  t = t.replace(/\\sqrt\{([^}]*)\}/g, "√($1)");
  t = t.replace(/\\sqrt(\w)/g, "√$1");
  
  // Greek letters
  t = t.replace(/\\alpha/g, "α");
  t = t.replace(/\\beta/g, "β");
  t = t.replace(/\\gamma/g, "γ");
  t = t.replace(/\\delta/g, "δ");
  t = t.replace(/\\epsilon/g, "ε");
  t = t.replace(/\\theta/g, "θ");
  t = t.replace(/\\lambda/g, "λ");
  t = t.replace(/\\mu/g, "μ");
  t = t.replace(/\\pi/g, "π");
  t = t.replace(/\\sigma/g, "σ");
  t = t.replace(/\\omega/g, "ω");
  t = t.replace(/\\phi/g, "φ");
  t = t.replace(/\\rho/g, "ρ");
  t = t.replace(/\\eta/g, "η");
  t = t.replace(/\\tau/g, "τ");
  t = t.replace(/\\xi/g, "ξ");
  t = t.replace(/\\zeta/g, "ζ");
  t = t.replace(/\\psi/g, "ψ");
  t = t.replace(/\\chi/g, "χ");
  t = t.replace(/\\Delta/g, "Δ");
  t = t.replace(/\\Sigma/g, "Σ");
  t = t.replace(/\\Omega/g, "Ω");
  t = t.replace(/\\Pi/g, "Π");
  t = t.replace(/\\Gamma/g, "Γ");
  t = t.replace(/\\Lambda/g, "Λ");
  
  // Math operators
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
  t = t.replace(/\\int/g, "∫");
  t = t.replace(/\\sum/g, "∑");
  t = t.replace(/\\prod/g, "∏");
  t = t.replace(/\\partial/g, "∂");
  t = t.replace(/\\nabla/g, "∇");

  // Step 12: Remove all remaining LaTeX delimiters but keep content
  t = t.replace(/\$\$[\s\S]*?\$\$/g, (match) => match.slice(2, -2));
  t = t.replace(/\$([^$\n]+?)\$/g, "$1");
  t = t.replace(/\\\[[\s\S]*?\\\]/g, (match) => match.slice(2, -2));
  t = t.replace(/\\\([\s\S]*?\\\)/g, (match) => match.slice(2, -2));
  t = t.replace(/```[\s\S]*?```/g, (match) => match.slice(3, -3));
  t = t.replace(/`([^`]*)`/g, "$1");

  // Step 13: Remove all remaining unknown LaTeX commands, curly braces, and dollar signs
  t = t.replace(/\\[a-zA-Z]+/g, "");
  t = t.replace(/[{}]/g, "");
  t = t.replace(/\$/g, "");

  // Step 14: Clean up all extra whitespace
  t = t.replace(/  +/g, " ");
  t = t.replace(/\n{3,}/g, "\n\n");
  
  // Convert all remaining Unicode special chars to ASCII for jsPDF compatibility
  t = t.replace(/₀/g,"0").replace(/₁/g,"1").replace(/₂/g,"2").replace(/₃/g,"3")
       .replace(/₄/g,"4").replace(/₅/g,"5").replace(/₆/g,"6").replace(/₇/g,"7")
       .replace(/₈/g,"8").replace(/₉/g,"9");
  t = t.replace(/⁰/g,"^0").replace(/¹/g,"^1").replace(/²/g,"^2").replace(/³/g,"^3")
       .replace(/⁴/g,"^4").replace(/⁵/g,"^5").replace(/⁶/g,"^6").replace(/⁷/g,"^7")
       .replace(/⁸/g,"^8").replace(/⁹/g,"^9").replace(/ⁿ/g,"^n");
  t = t.replace(/⁺/g,"^+").replace(/⁻/g,"^-");
  t = t.replace(/α/g,"alpha").replace(/β/g,"beta").replace(/γ/g,"gamma")
       .replace(/δ/g,"delta").replace(/ε/g,"epsilon").replace(/θ/g,"theta")
       .replace(/λ/g,"lambda").replace(/μ/g,"mu").replace(/π/g,"pi")
       .replace(/σ/g,"sigma").replace(/ω/g,"omega").replace(/φ/g,"phi")
       .replace(/ρ/g,"rho").replace(/η/g,"eta").replace(/τ/g,"tau")
       .replace(/Δ/g,"Delta").replace(/Σ/g,"Sigma").replace(/Ω/g,"Omega")
       .replace(/Π/g,"Pi").replace(/Γ/g,"Gamma").replace(/Λ/g,"Lambda");
  t = t.replace(/⇌/g," <=> ").replace(/→/g," -> ").replace(/←/g," <- ")
       .replace(/⇒/g," => ").replace(/↔/g," <-> ").replace(/⟶/g," -> ");
  t = t.replace(/×/g,"x").replace(/÷/g,"/").replace(/±/g,"+/-")
       .replace(/≤/g,"<=").replace(/≥/g,">=").replace(/≠/g,"!=")
       .replace(/≈/g,"~").replace(/∞/g,"inf").replace(/∫/g,"integral")
       .replace(/∑/g,"sum").replace(/√/g,"sqrt").replace(/∂/g,"d")
       .replace(/∇/g,"nabla").replace(/°/g," deg").replace(/·/g,".");
  t = t.replace(/—/g,"-").replace(/–/g,"-").replace(/…/g,"...");
  t = t.replace(/[^\x00-\x7F]/g, "");

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
