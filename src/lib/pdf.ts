import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { saveAs } from "file-saver";
import { toast } from "sonner";
import type { GeneratedQuestion } from "./types";

/**
 * PDF Download — Direct Device Storage
 *
 * Spec (permanent):
 *  - Hide all UI buttons/controls before capture
 *  - html2canvas with scale:2, useCORS:true, allowTaint:true, logging:false
 *  - canvas.toDataURL("image/jpeg", 0.95) added page-by-page (never raw HTML/text)
 *  - jsPDF.output("blob")
 *  - Android/Desktop: createObjectURL + hidden anchor + click + revokeObjectURL
 *  - iOS: detected via /iPad|iPhone|iPod/ → FileSaver.saveAs
 *  - "Preparing PDF..." toast while running, "PDF Downloaded ✅" on success
 *  - 3 silent retries on failure, no raw error ever shown
 */
export async function downloadTestPDF(opts: {
  questions: GeneratedQuestion[];
  examLevel: string;
  topic?: string;
  subject?: string;
}) {
  const FILENAME = "Questions.pdf";
  const progressId = toast.loading("Preparing PDF...");

  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await runDownload(opts, FILENAME);
      toast.success("PDF Downloaded ✅", { id: progressId });
      return;
    } catch (err) {
      lastErr = err;
      console.warn(`PDF download attempt ${attempt} failed`, err);
      // exponential backoff before silent retry
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 400 * Math.pow(2, attempt - 1)));
      }
    }
  }

  console.error("PDF download failed after 3 attempts", lastErr);
  toast.error("Could not save the PDF. Please try again.", { id: progressId });
}

async function runDownload(
  opts: {
    questions: GeneratedQuestion[];
    examLevel: string;
    topic?: string;
    subject?: string;
  },
  filename: string,
) {
  // 1) Hide all interactive UI (buttons, inputs, sticky headers) so the
  //    capture is pure printed content. We toggle a class on <html> and
  //    restore it in finally.
  document.documentElement.classList.add("pdf-capturing");

  // 2) Build a clean offscreen render root that mirrors the live questions.
  const root = buildPrintRoot(opts);
  document.body.appendChild(root);

  try {
    // Wait for fonts + KaTeX/SVG to settle
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    try {
      await (document as any).fonts?.ready;
    } catch {
      /* ignore */
    }

    const canvas = await html2canvas(root, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      backgroundColor: "#ffffff",
      windowWidth: root.scrollWidth,
    });

    const pdf = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 32;
    const usableW = pageW - margin * 2;
    const usableH = pageH - margin * 2;

    const imgW = usableW;
    const pxPerPt = canvas.width / imgW;
    const pageHpx = usableH * pxPerPt;

    let y = 0;
    let first = true;
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
      // toDataURL JPEG @ 0.95 — added as image, NEVER raw HTML/text
      const dataUrl = slice.toDataURL("image/jpeg", 0.95);
      pdf.addImage(dataUrl, "JPEG", margin, margin, imgW, sliceH / pxPerPt);
      first = false;
      y += sliceH;
    }

    // 3) Save to device internal storage
    const blob = pdf.output("blob");
    const isiOS =
      typeof navigator !== "undefined" &&
      /iPad|iPhone|iPod/.test(navigator.userAgent) &&
      !(navigator as any).MSStream;

    if (isiOS) {
      // iOS Safari ignores the anchor download attribute — FileSaver handles it
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
      }, 1000);
    }
  } finally {
    root.remove();
    document.documentElement.classList.remove("pdf-capturing");
  }
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Strip every form of "raw code" from a string before it goes into the PDF
 * fallback path: SVG blocks, SMILES tokens, LaTeX delimiters, markdown
 * fences, HTML tags. The output is plain readable text only — never any
 * code-looking residue.
 */
function stripCode(s: string): string {
  if (!s) return "";
  return s
    // [svg]...[/svg], [smiles]...[/smiles] (any custom token blocks)
    .replace(/\[svg\][\s\S]*?\[\/svg\]/gi, "")
    .replace(/\[smiles\][\s\S]*?\[\/smiles\]/gi, "")
    // Fenced code / inline code
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]*)`/g, "$1")
    // LaTeX delimiters — keep the inner expression, drop the markers
    .replace(/\$\$([\s\S]*?)\$\$/g, "$1")
    .replace(/\$([^$\n]+?)\$/g, "$1")
    .replace(/\\\[([\s\S]*?)\\\]/g, "$1")
    .replace(/\\\(([\s\S]*?)\\\)/g, "$1")
    // Common LaTeX commands → readable form
    .replace(/\\frac\s*\{([^}]*)\}\s*\{([^}]*)\}/g, "($1)/($2)")
    .replace(/\\sqrt\s*\{([^}]*)\}/g, "√($1)")
    .replace(/\\(?:left|right|displaystyle|text|mathrm|mathbf|operatorname)\s*/g, "")
    .replace(/\\[a-zA-Z]+/g, "")
    .replace(/[{}]/g, "")
    // Stray HTML / SVG tags
    .replace(/<[^>]+>/g, "")
    // Collapse whitespace
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}


function buildPrintRoot(opts: {
  questions: GeneratedQuestion[];
  examLevel: string;
  topic?: string;
  subject?: string;
}): HTMLDivElement {
  const root = document.createElement("div");
  root.style.position = "fixed";
  root.style.left = "-10000px";
  root.style.top = "0";
  root.style.width = "780px";
  root.style.padding = "32px";
  root.style.background = "#ffffff";
  root.style.color = "#1a1a1a";
  root.style.fontFamily = '"Inter", system-ui, sans-serif';
  root.style.fontSize = "14px";
  root.style.lineHeight = "1.7";
  root.className = "pdf-print-root";

  const labels = ["a", "b", "c", "d"] as const;
  const liveArticles = Array.from(document.querySelectorAll<HTMLElement>("article.paper-card"));

  const header = `
    <div style="border-bottom:2px solid #1a1a1a;padding-bottom:10px;margin-bottom:18px;">
      <div style="font-family:'Fraunces',Georgia,serif;font-size:22px;font-weight:800;">
        Student Helper <span style="color:#9b1d1d">by Dhruva</span>
      </div>
      <div style="font-size:12px;color:#555;margin-top:4px;">
        ${opts.subject ? escapeHtml(opts.subject) + " • " : ""}${escapeHtml(opts.examLevel)} • ${opts.questions.length} questions${opts.topic ? " • " + escapeHtml(opts.topic) : ""}
      </div>
    </div>
  `;

  let body = `<h2 style="font-family:'Fraunces',Georgia,serif;font-size:18px;font-weight:800;margin:6px 0 14px;">Questions</h2>`;

  opts.questions.forEach((q, i) => {
    let qBlock = "";
    const live = liveArticles[i];
    const liveStem = live?.querySelector(".exam-q");
    if (liveStem) {
      qBlock = `<div class="stem-clone" style="margin:6px 0 10px;">${(liveStem as HTMLElement).outerHTML}</div>`;
    } else {
      qBlock = `<div style="margin:6px 0 10px;white-space:pre-wrap;">${escapeHtml(stripCode(q.question))}</div>`;
    }

    let opts_html = "";
    if (q.type === "MCQ") {
      opts_html = `<ol style="list-style:none;padding:0;margin:6px 0 0;display:grid;gap:6px;">` +
        q.options.map((o, oi) => `
          <li style="display:flex;gap:10px;padding:6px 8px;border:1px solid #e5dccd;border-radius:6px;">
            <span style="font-weight:700;color:#9b1d1d;">(${labels[oi]})</span>
            <span style="flex:1;white-space:pre-wrap;">${escapeHtml(stripCode(o))}</span>
          </li>`).join("") + `</ol>`;

    let opts_html = "";
    if (q.type === "MCQ") {
      opts_html = `<ol style="list-style:none;padding:0;margin:6px 0 0;display:grid;gap:6px;">` +
        q.options.map((o, oi) => `
          <li style="display:flex;gap:10px;padding:6px 8px;border:1px solid #e5dccd;border-radius:6px;">
            <span style="font-weight:700;color:#9b1d1d;">(${labels[oi]})</span>
            <span style="flex:1;white-space:pre-wrap;">${escapeHtml(o)}</span>
          </li>`).join("") + `</ol>`;
    } else {
      opts_html = `<div style="margin-top:6px;color:#555;font-style:italic;">(Numerical answer)</div>`;
    }

    body += `
      <div style="page-break-inside:avoid;margin-bottom:18px;padding:14px 16px;border:1px solid #e5dccd;border-radius:10px;background:#fffaf2;">
        <div style="font-family:'Fraunces',Georgia,serif;font-weight:800;color:#9b1d1d;font-size:16px;margin-bottom:6px;">Q${i + 1}.</div>
        ${qBlock}
        ${opts_html}
      </div>`;
  });

  // Answer key
  body += `<div style="page-break-before:always;"></div>`;
  body += `<h2 style="font-family:'Fraunces',Georgia,serif;font-size:20px;font-weight:800;margin:6px 0 14px;">Answer Key</h2>`;
  body += `<ol style="padding-left:22px;">`;
  opts.questions.forEach((q, i) => {
    const ans =
      q.type === "MCQ"
        ? `(${labels[q.correctIndex]}) ${q.options[q.correctIndex]}`
        : q.answer;
    body += `<li style="margin-bottom:6px;"><strong>Q${i + 1}:</strong> ${escapeHtml(ans)}</li>`;
  });
  body += `</ol>`;

  // Solutions
  body += `<div style="page-break-before:always;"></div>`;
  body += `<h2 style="font-family:'Fraunces',Georgia,serif;font-size:20px;font-weight:800;margin:6px 0 14px;">Detailed Solutions</h2>`;
  opts.questions.forEach((q, i) => {
    const live = liveArticles[i];
    const liveSol = live?.querySelectorAll(".exam-q")[1];
    const solHtml = liveSol
      ? (liveSol as HTMLElement).outerHTML
      : `<div style="white-space:pre-wrap;">${escapeHtml(q.solution)}</div>`;
    const ans =
      q.type === "MCQ"
        ? `(${labels[q.correctIndex]}) ${q.options[q.correctIndex]}`
        : q.answer;
    body += `
      <div style="page-break-inside:avoid;margin-bottom:16px;">
        <div style="font-weight:700;color:#9b1d1d;margin-bottom:4px;">Q${i + 1}.</div>
        <div style="margin-bottom:6px;">${live?.querySelector(".exam-q") ? (live!.querySelector(".exam-q") as HTMLElement).outerHTML : escapeHtml(q.question)}</div>
        <div style="font-weight:600;margin:6px 0;">Answer: ${escapeHtml(ans)}</div>
        <div style="background:#f7f0e3;padding:10px 12px;border-radius:6px;border:1px solid #e5dccd;">${solHtml}</div>
      </div>`;
  });

  root.innerHTML = header + body;
  return root;
}
