import { createServerFn } from "@tanstack/react-start";
import type { GeneratedQuestion } from "@/lib/types";
import { getClientIp } from "./client-ip.server";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 12;
const rateBuckets = new Map<string, number[]>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const arr = (rateBuckets.get(ip) ?? []).filter((t) => t > cutoff);
  if (arr.length >= RATE_LIMIT_MAX_REQUESTS) {
    rateBuckets.set(ip, arr);
    return false;
  }
  arr.push(now);
  rateBuckets.set(ip, arr);
  if (rateBuckets.size > 5000) {
    for (const [k, v] of rateBuckets) {
      const filtered = v.filter((t) => t > cutoff);
      if (filtered.length === 0) rateBuckets.delete(k);
      else rateBuckets.set(k, filtered);
    }
  }
  return true;
}

interface GenerateInput {
  examLevel: "KCET" | "NEET" | "JEE Mains" | "JEE Advanced";
  questionType: "MCQ" | "Numerical" | "Mixed" | "Diagram Based";
  count: number;
  topic?: string;
  imageDataUrl?: string;
  subject?: "Physics" | "Chemistry" | "Maths" | "Biology";
}

interface GenerateResult {
  questions: GeneratedQuestion[];
  error?: string;
}

const ALLOWED_EXAM_LEVELS = new Set(["KCET", "NEET", "JEE Mains", "JEE Advanced"]);
const ALLOWED_SUBJECTS = new Set(["Physics", "Chemistry", "Maths", "Biology"]);
const ALLOWED_IMAGE_PREFIX = /^data:image\/(png|jpe?g|webp);base64,/i;
const MAX_IMAGE_DATA_URL_LENGTH = 7_000_000;

export const generateQuestions = createServerFn({ method: "POST" })
  .inputValidator((input: GenerateInput) => {
    if (!input || typeof input !== "object") throw new Error("Invalid input");
    const count = Math.max(5, Math.min(30, Math.floor(Number(input.count) || 5)));
    const allowedTypes = new Set(["MCQ", "Numerical", "Mixed", "Diagram Based"]);
    const qt = allowedTypes.has(input.questionType) ? input.questionType : "MCQ";
    if (!ALLOWED_EXAM_LEVELS.has(input.examLevel)) throw new Error("Invalid examLevel");
    let subject: GenerateInput["subject"] = undefined;
    if (input.subject !== undefined && input.subject !== null) {
      if (!ALLOWED_SUBJECTS.has(input.subject)) throw new Error("Invalid subject");
      subject = input.subject;
    }
    let imageDataUrl: string | undefined = undefined;
    if (typeof input.imageDataUrl === "string" && input.imageDataUrl.length > 0) {
      if (input.imageDataUrl.length > MAX_IMAGE_DATA_URL_LENGTH) throw new Error("Image is too large (max ~5 MB).");
      if (!ALLOWED_IMAGE_PREFIX.test(input.imageDataUrl)) throw new Error("Unsupported image format.");
      imageDataUrl = input.imageDataUrl;
    }
    return { examLevel: input.examLevel, questionType: qt, count, topic: (input.topic || "").slice(0, 500), imageDataUrl, subject } satisfies GenerateInput;
  })
  .handler(async ({ data }): Promise<GenerateResult> => {
    const ip = getClientIp();
    if (!checkRateLimit(ip)) return { questions: [], error: "Too many requests. Please wait a moment and try again." };

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return { questions: [], error: "AI service not connected. Please check settings." };

    const userParts: Array<{ type: "text"; text: string } | { type: "image"; source: { type: "base64"; media_type: string; data: string } }> = [];

    const subjectLine = data.subject ? `Subject: ${data.subject}.` : "";
    const typeDesc = data.questionType === "Mixed" ? "mixed (MCQ + Numerical)" : data.questionType === "Diagram Based" ? "diagram-based MCQ" : data.questionType;

    const askText = `Generate exactly ${data.count} ${typeDesc} questions for ${data.examLevel}.
${subjectLine}
${data.topic ? `Topic / context: ${data.topic}` : ""}
Format output as a JSON tool call with the "return_questions" function.`;

    userParts.push({ type: "text", text: askText });

    if (data.imageDataUrl) {
      const matches = data.imageDataUrl.match(/^data:(image\/[a-z]+);base64,(.+)$/i);
      if (matches) {
        userParts.push({ type: "image", source: { type: "base64", media_type: matches[1], data: matches[2] } });
      }
    }

    const tool = {
      name: "return_questions",
      description: "Return the generated exam questions in structured form.",
      input_schema: {
        type: "object",
        properties: {
          questions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: { type: "string", enum: ["MCQ", "Numerical"] },
                question: { type: "string" },
                options: { type: "array", items: { type: "string" }, minItems: 4, maxItems: 4 },
                correctIndex: { type: "integer", minimum: 0, maximum: 3 },
                answer: { type: "string" },
                difficulty: { type: "string", enum: ["Easy", "Medium", "Hard"] },
                solution: { type: "string" },
              },
              required: ["type", "question", "solution"],
            },
          },
        },
        required: ["questions"],
      },
    };

    try {
      let response: Response | null = null;
      let lastNetworkErr: unknown = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 55_000);
        try {
          response = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            signal: controller.signal,
            headers: {
              "x-api-key": apiKey,
              "anthropic-version": "2023-06-01",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "claude-haiku-4-5-20251001",
              max_tokens: 4096,
              system: "You are an expert exam question generator for Indian competitive exams: JEE Mains, JEE Advanced, NEET, and KCET. Generate high quality exam questions and return them using the return_questions tool.",
              messages: [{ role: "user", content: userParts }],
              tools: [tool],
              tool_choice: { type: "tool", name: "return_questions" },
            }),
          });
        } catch (err) {
          lastNetworkErr = err;
          response = null;
        } finally {
          clearTimeout(timeoutId);
        }
        if (response && (response.ok || response.status === 429 || response.status === 402)) break;
        if (attempt < 3) await new Promise((r) => setTimeout(r, 600 * Math.pow(2, attempt - 1)));
      }

      if (!response) return { questions: [], error: "AI service temporarily unavailable. Please try again." };
      if (response.status === 429) return { questions: [], error: "Usage limit reached. Please try later." };
      if (response.status === 402) return { questions: [], error: "AI credits exhausted." };
      if (!response.ok) return { questions: [], error: "AI service temporarily unavailable. Please try again." };

      const json = await response.json();
      const toolUse = json?.content?.find((b: { type: string }) => b.type === "tool_use");
      if (!toolUse?.input) return { questions: [], error: "AI service temporarily unavailable. Please try again." };

      const raw = Array.isArray(toolUse.input.questions) ? toolUse.input.questions : [];
      const questions: GeneratedQuestion[] = [];
      const allowedDiff = new Set(["Easy", "Medium", "Hard"]);

      for (const q of raw) {
        const difficulty = allowedDiff.has(q?.difficulty) ? q.difficulty : undefined;
        if (q.type === "MCQ" && Array.isArray(q.options) && q.options.length === 4) {
          const idx = Number(q.correctIndex);
          if (idx >= 0 && idx <= 3) {
            questions.push({ type: "MCQ", question: String(q.question), options: [String(q.options[0]), String(q.options[1]), String(q.options[2]), String(q.options[3])], correctIndex: idx as 0 | 1 | 2 | 3, solution: String(q.solution || ""), difficulty });
          }
        } else if (q.type === "Numerical" && q.answer != null) {
          questions.push({ type: "Numerical", question: String(q.question), answer: String(q.answer), solution: String(q.solution || ""), difficulty });
        }
      }

      if (questions.length === 0) return { questions: [], error: "AI service temporarily unavailable. Please try again." };
      return { questions };
    } catch (err) {
      const isAbort = err instanceof Error && err.name === "AbortError";
      return { questions: [], error: isAbort ? "Generation took too long. Please try fewer questions." : "AI service temporarily unavailable. Please try again." };
    }
  });
