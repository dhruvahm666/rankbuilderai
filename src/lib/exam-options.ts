import type { ExamLevel, QuestionType, Subject } from "./types";

/**
 * Subject-specific filtering rules (applied EVERYWHERE in the app):
 *  - Biology  → NEET + KCET only (no JEE)
 *  - Maths    → JEE Mains + JEE Advanced + KCET only (no NEET)
 *  - Physics / Chemistry → all four
 *
 * Question types:
 *  - Biology  → MCQ, Diagram Based, Mixed (no Numerical)
 *  - others   → MCQ, Numerical, Mixed (unchanged)
 */
export function examLevelsFor(subject: Subject | null | undefined): ExamLevel[] {
  if (subject === "Biology") return ["NEET", "KCET"];
  if (subject === "Maths") return ["JEE Mains", "JEE Advanced", "KCET"];
  return ["KCET", "NEET", "JEE Mains", "JEE Advanced"];
}

export function questionTypesFor(subject: Subject | null | undefined): QuestionType[] {
  if (subject === "Biology") return ["MCQ", "Diagram Based", "Mixed"];
  return ["MCQ", "Numerical", "Mixed"];
}

/** Pick a sensible default exam level for a subject, honouring an existing pick if it's still valid. */
export function clampExamLevel(
  subject: Subject | null | undefined,
  current: ExamLevel,
  preferred?: ExamLevel,
): ExamLevel {
  const allowed = examLevelsFor(subject);
  if (allowed.includes(current)) return current;
  if (preferred && allowed.includes(preferred)) return preferred;
  return allowed[0];
}

export function clampQuestionType(
  subject: Subject | null | undefined,
  current: QuestionType,
): QuestionType {
  const allowed = questionTypesFor(subject);
  return allowed.includes(current) ? current : allowed[0];
}
