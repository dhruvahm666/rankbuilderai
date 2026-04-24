import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import type { GeneratedQuestion } from "./types";

/**
 * Render the visible practice/mock questions container into a clean,
 * MTG-style PDF using html2canvas. Falls back to a text-only PDF if no
 * suitable DOM element is found.
 */
export async function downloadTestPDF(opts: {
  questions: GeneratedQuestion[];
  examLevel: string;
  topic?: string;
  subject?: string;
}) {
  const root = buildPrintRoot(opts);
  document.body.appendChild(root);

  try {
    // Wait for fonts / KaTeX to settle
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    try {
      await (document as any).fonts?.ready;
    } catch {
      /* ignore font load errors */
    }

    const canvas = await html2canvas(root, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      windowWidth: root.scrollWidth,
      logging: false,
    });

    const pdf = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 32;
    const usableW = pageW - margin * 2;
    const usableH = pageH - margin * 2;

    const imgW = usableW;
    const imgH = (canvas.height * imgW) / canvas.width;

    if (imgH <= usableH) {
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", margin, margin, imgW, imgH);
    } else {
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
        pdf.addImage(
          slice.toDataURL("image/jpeg", 0.92),
          "JPEG",
          margin,
          margin,
          imgW,
          sliceH / pxPerPt,
        );
        first = false;
        y += sliceH;
      }
    }

    const filename = `Student_Helper_${(opts.subject || opts.examLevel).replace(/\s+/g, "_")}.pdf`;

    // Save via blob URL + anchor — works reliably on desktop AND mobile
    // (iOS Safari, Android Chrome) and bypasses popup blockers that can
    // break jsPDF's default save() in some browsers.
    try {
      const blob = pdf.output("blob");
      triggerBlobDownload(blob, filename);
    } catch (blobErr) {
      console.warn("Blob download failed, falling back to jsPDF.save()", blobErr);
      try {
        pdf.save(filename);
      } catch (saveErr) {
        console.error("PDF save failed entirely", saveErr);
        throw new Error("Could not save the PDF on this device.");
      }
    }
  } finally {
    root.remove();
  }
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  // Some mobile browsers ignore download on cross-origin URLs; blob: is same-origin.
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  // Give the browser a tick to start the download before revoking
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 1000);
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Render KaTeX-style $...$ / $$...$$ in text by leaving them as Unicode-ish
 * fallback. We use the existing browser KaTeX CSS via dynamic import in the
 * snapshot. To keep PDF clean & self-contained, we render a print sheet
 * containing the same DOM markup our QuestionBody produces (KaTeX HTML),
 * by mounting a temporary React-free DOM mirror that re-uses the live
 * .exam-q nodes when available, falling back to a styled text version.
 */
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

  // Try to clone live rendered question articles for richest output (preserves KaTeX)
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
      // Clone live KaTeX-rendered DOM so the PDF matches the screen exactly
      qBlock = `<div class="stem-clone" style="margin:6px 0 10px;">${(liveStem as HTMLElement).outerHTML}</div>`;
    } else {
      qBlock = `<div style="margin:6px 0 10px;white-space:pre-wrap;">${escapeHtml(q.question)}</div>`;
    }

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

  // Answer key page
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
