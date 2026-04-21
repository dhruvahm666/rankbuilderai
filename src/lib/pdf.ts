import { jsPDF } from "jspdf";
import type { GeneratedQuestion } from "./types";

export function downloadTestPDF(opts: {
  questions: GeneratedQuestion[];
  examLevel: string;
  topic?: string;
}) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 48;
  const maxWidth = pageWidth - margin * 2;
  let y = margin;

  const ensure = (h: number) => {
    if (y + h > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  };

  const writeWrapped = (text: string, fontSize: number, isBold = false) => {
    doc.setFont("helvetica", isBold ? "bold" : "normal");
    doc.setFontSize(fontSize);
    const lines = doc.splitTextToSize(text, maxWidth);
    for (const line of lines) {
      ensure(fontSize + 4);
      doc.text(line, margin, y);
      y += fontSize + 4;
    }
  };

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("Student Helper by Dhruva", margin, y);
  y += 24;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`${opts.examLevel} • ${opts.questions.length} questions${opts.topic ? ` • ${opts.topic}` : ""}`, margin, y);
  y += 18;
  doc.setDrawColor(180);
  doc.line(margin, y, pageWidth - margin, y);
  y += 18;

  // Questions
  writeWrapped("Questions", 14, true);
  y += 4;
  opts.questions.forEach((q, i) => {
    writeWrapped(`Q${i + 1}. ${q.question}`, 11, true);
    if (q.type === "MCQ") {
      const labels = ["A", "B", "C", "D"] as const;
      q.options.forEach((opt, oi) => writeWrapped(`   ${labels[oi]}. ${opt}`, 11));
    } else {
      writeWrapped("   (Numerical answer)", 10);
    }
    y += 6;
  });

  // Answer key
  doc.addPage();
  y = margin;
  writeWrapped("Answer Key", 16, true);
  y += 4;
  opts.questions.forEach((q, i) => {
    const ans =
      q.type === "MCQ" ? `${["A", "B", "C", "D"][q.correctIndex]}. ${q.options[q.correctIndex]}` : q.answer;
    writeWrapped(`Q${i + 1}. ${ans}`, 11);
  });

  // Solutions
  doc.addPage();
  y = margin;
  writeWrapped("Detailed Solutions", 16, true);
  y += 4;
  opts.questions.forEach((q, i) => {
    writeWrapped(`Q${i + 1}. ${q.question}`, 11, true);
    const ans =
      q.type === "MCQ" ? `${["A", "B", "C", "D"][q.correctIndex]}. ${q.options[q.correctIndex]}` : q.answer;
    writeWrapped(`Answer: ${ans}`, 11);
    writeWrapped(`Solution: ${q.solution}`, 11);
    y += 8;
  });

  doc.save("Student_Helper_Test.pdf");
}
