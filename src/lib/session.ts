import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { ExamLevel, GeneratedQuestion, Mode, QuestionType, Subject } from "./types";

interface SessionState {
  questions: GeneratedQuestion[];
  examLevel: ExamLevel;
  questionType: QuestionType;
  mode: Mode;
  topic: string;
  subject?: Subject;
  // user answers indexed by question index. MCQ -> 0-3, Numerical -> string
  answers: Record<number, number | string | undefined>;
  setSession: (s: {
    questions: GeneratedQuestion[];
    examLevel: ExamLevel;
    questionType: QuestionType;
    mode: Mode;
    topic: string;
    subject?: Subject;
  }) => void;
  setAnswer: (i: number, v: number | string) => void;
  reset: () => void;
}

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      questions: [],
      examLevel: "JEE Mains",
      questionType: "MCQ",
      mode: "practice",
      topic: "",
      subject: undefined,
      answers: {},
      setSession: (s) => set({ ...s, answers: {} }),
      setAnswer: (i, v) => set((st) => ({ answers: { ...st.answers, [i]: v } })),
      reset: () => set({ questions: [], answers: {}, topic: "" }),
    }),
    {
      name: "exam-ace-session",
      storage: createJSONStorage(() => sessionStorage),
      partialize: ({ questions, examLevel, questionType, mode, topic, subject, answers }) => ({
        questions,
        examLevel,
        questionType,
        mode,
        topic,
        subject,
        answers,
      }),
    },
  ),
);

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
