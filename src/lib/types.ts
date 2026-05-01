export type ExamLevel = "KCET" | "NEET" | "JEE Mains" | "JEE Advanced";
export type QuestionType = "MCQ" | "Numerical" | "Mixed" | "Diagram Based";
export type Mode = "practice" | "mock";
export type Subject = "Physics" | "Chemistry" | "Maths" | "Biology";
export type Difficulty = "Easy" | "Medium" | "Hard";

export interface MCQQuestion {
  type: "MCQ";
  question: string;
  options: [string, string, string, string];
  correctIndex: 0 | 1 | 2 | 3;
  solution: string;
  difficulty?: Difficulty;
}

export interface NumericalQuestion {
  type: "Numerical";
  question: string;
  answer: string;
  solution: string;
  difficulty?: Difficulty;
}

export type GeneratedQuestion = MCQQuestion | NumericalQuestion;

export interface GenerateConfig {
  examLevel: ExamLevel;
  questionType: QuestionType;
  count: number;
  topic?: string;
  imageDataUrl?: string;
  subject?: Subject;
}
