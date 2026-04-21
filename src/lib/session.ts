import { create } from "zustand";
import type { ExamLevel, GeneratedQuestion, Mode, QuestionType } from "./types";

interface SessionState {
  questions: GeneratedQuestion[];
  examLevel: ExamLevel;
  questionType: QuestionType;
  mode: Mode;
  topic: string;
  // user answers indexed by question index. MCQ -> 0-3, Numerical -> string
  answers: Record<number, number | string | undefined>;
  setSession: (s: {
    questions: GeneratedQuestion[];
    examLevel: ExamLevel;
    questionType: QuestionType;
    mode: Mode;
    topic: string;
  }) => void;
  setAnswer: (i: number, v: number | string) => void;
  reset: () => void;
}

export const useSession = create<SessionState>((set) => ({
  questions: [],
  examLevel: "JEE Mains",
  questionType: "MCQ",
  mode: "practice",
  topic: "",
  answers: {},
  setSession: (s) => set({ ...s, answers: {} }),
  setAnswer: (i, v) => set((st) => ({ answers: { ...st.answers, [i]: v } })),
  reset: () => set({ questions: [], answers: {}, topic: "" }),
}));

export function isCorrect(q: GeneratedQuestion, ans: number | string | undefined): boolean {
  if (ans === undefined || ans === "") return false;
  if (q.type === "MCQ") return ans === q.correctIndex;
  // numerical: tolerant compare
  const a = String(ans).trim().toLowerCase().replace(/\s+/g, "");
  const b = String(q.answer).trim().toLowerCase().replace(/\s+/g, "");
  if (a === b) return true;
  const an = parseFloat(a);
  const bn = parseFloat(b);
  if (!isNaN(an) && !isNaN(bn)) return Math.abs(an - bn) < 1e-3;
  return false;
}
