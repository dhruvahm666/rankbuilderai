import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
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
      await runDownload(opts, FILENAME);
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

async function runDownload(
  opts: {
    questions: GeneratedQuestion[];
    examLevel: string;
    topic?: string;
    subject?: string;
  },
  filename: string,
) {
  document.documentElement.classList.add("pdf-capturing");
  const root = buildPrintRoot(opts);
  document.body.appendChild(root);

  try {
    await new Promise((r) => setTimeout(r, 800));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    try { await (document as any).fonts?.ready; } catch { /* ignore */ }

    const images = root.querySelectorAll("img");
    await Promise.all(
      Array.from(images).map(
        (img) =>
          new Promise((r) => {
            if (img.complete) return r(null);
            img.onload = () => r(null);
            img.onerror = () => r(null);
          }),
      ),
    );

    const canvas = await html2canvas(root, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      backgroundColor: "#ffffff",
      windowWidth: 780,
      width: root.scrollWidth,
      height: root.scrollHeight,
      onclone: (clonedDoc) => {
        const clonedRoot = clonedDoc.querySelector(".pdf-print-root") as HTMLElement;
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
      pdf.addImage(dataUrl, "JPEG", margin, margin, imgW, sliceH / pxPerPt);
      first = false;
      y += sliceH;
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
      setTimeout(() => {
        a.remove();
        URL.revokeObjectURL(url);
      }, 1500);
    }
  } finally {
    root.remove();
    document.documentElement.classList.remove("pdf-capturing");
  }
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function stripCode(s: string): string {
  if (!s) return "";
  return s
    .replace(/\[svg\][\s\S]*?\[\/svg\]/gi, "")
    .replace(/\[smiles\][\s\S]*?\[\/smiles\]/gi, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\$\$([\s\S]*?)\$\$/g, "$1")
    .replace(/\$([^$\n]+?)\$/g, "$1")
    .replace(/\\\[([\s\S]*?)\\\]/g, "$1")
    .replace(/\\\(([\s\S]*?)\\\)/g, "$1")
    .replace(/\\frac\s*\{([^}]*)\}\s*\{([^}]*)\}/g, "($1)/($2)")
    .replace(/\\sqrt\s*\{([^}]*)\}/g, "√($1)")
    .replace(/\\(?:left|right|displaystyle|text|mathrm|mathbf|operatorname)\s*/g, "")
    .replace(/\\[a-zA-Z]+/g, "")
    .replace(/[{}]/g, "")
    .replace(/<[^>]+>/g, "")
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
  root.style.cssText = `
    position: fixed;
    left: -10000px;
    top: 0;
    width: 780px;
    padding: 32px;
    background: #ffffff;
    color: #1a1a1a;
    font-family: Inter, system-ui, sans-serif;
    font-size: 14px;
    line-height: 1.7;
    overflow: visible;
    word-wrap: break-word;
    overflow-wrap: break-word;
  `;
  root.className = "pdf-print-root";

  const labels = ["a", "b", "c", "d"] as const;

  const liveArticles = Array.from(
    document.querySelectorAll<HTMLElement>("article.paper-card"),
  );

  const header = `
    <div style="border-bottom:2px solid #1a1a1a;padding-bottom:10px;margin-bottom:24px;">
      <div style="font-size:22px;font-weight:800;">
        Student Helper <span style="color:#9b1d1d">by Dhruva</span>
      </div>
      <div style="font-size:12px;color:#555;margin-top:4px;">
        ${opts.subject ? escapeHtml(opts.subject) + " • " : ""}${escapeHtml(opts.examLevel)} • ${opts.questions.length} Questions${opts.topic ? " • " + escapeHtml(opts.topic) : ""}
      </div>
    </div>
  `;

  let body = `<h2 style="font-size:18px;font-weight:800;margin:0 0 16px;">Questions</h2>`;

  opts.questions.forEach((q, i) => {
    let qBlock = "";
    const live = liveArticles[i];
    const liveStem = live?.querySelector(".exam-q");
    if (liveStem) {
      const clone = liveStem.cloneNode(true) as HTMLElement;
      clone.style.cssText = "margin:6px 0 10px;word-wrap:break-word;overflow-wrap:break-word;max-width:100%;";
      qBlock = `<div style="margin:6px 0 10px;">${clone.outerHTML}</div>`;
    } else {
      qBlock = `<div style="margin:6px 0 10px;white-space:pre-wrap;word-wrap:break-word;">${escapeHtml(stripCode(q.question))}</div>`;
    }

    let optsHtml = "";
    if (q.type === "MCQ") {
      optsHtml =
        `<ol style="list-style:none;padding:0;margin:8px 0 0;display:grid;gap:6px;">` +
        q.options
          .map(
            (o, oi) => `
          <li style="display:flex;gap:10px;padding:7px 10px;border:1px solid #e5dccd;border-radius:6px;word-wrap:break-word;">
            <span style="font-weight:700;color:#9b1d1d;flex-shrink:0;">(${labels[oi]})</span>
            <span style="flex:1;white-space:pre-wrap;word-wrap:break-word;">${escapeHtml(stripCode(o))}</span>
          </li>`,
          )
          .join("") +
        `</ol>`;
    } else {
      optsHtml = `<div style="margin-top:8px;padding:8px 10px;border:1px dashed #ccc;border-radius:6px;color:#555;font-style:italic;">Numerical Answer</div>`;
    }

    body += `
      <div style="page-break-inside:avoid;margin-bottom:18px;padding:14px 16px;border:1px solid #e5dccd;border-radius:10px;background:#fffaf2;">
        <div style="font-weight:800;color:#9b1d1d;font-size:16px;margin-bottom:6px;">Q${i + 1}.</div>
        ${qBlock}
        ${optsHtml}
      </div>`;
  });

  body += `<div style="page-break-before:always;padding-top:8px;"></div>`;
  body += `<h2 style="font-size:20px;font-weight:800;margin:0 0 16px;border-bottom:2px solid #1a1a1a;padding-bottom:8px;">Answer Key</h2>`;
  body += `<table style="width:100%;border-collapse:collapse;">`;
  body += `<tr style="background:#fffaf2;"><th style="padding:8px 12px;border:1px solid #e5dccd;text-align:left;">Q No.</th><th style="padding:8px 12px;border:1px solid #e5dccd;text-align:left;">Answer</th><th style="padding:8px 12px;border:1px solid #e5dccd;text-align:left;">Type</th></tr>`;
  opts.questions.forEach((q, i) => {
    const ans =
      q.type === "MCQ"
        ? `(${labels[q.correctIndex]}) ${stripCode(q.options[q.correctIndex])}`
        : stripCode(q.answer);
    body += `<tr>
      <td style="padding:7px 12px;border:1px solid #e5dccd;font-weight:700;">Q${i + 1}</td>
      <td style="padding:7px 12px;border:1px solid #e5dccd;">${escapeHtml(ans)}</td>
      <td style="padding:7px 12px;border:1px solid #e5dccd;color:#555;">${q.type}</td>
    </tr>`;
  });
  body += `</table>`;

  root.innerHTML = header + body;
  return root;
}
