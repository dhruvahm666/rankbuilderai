import { createServerFn } from "@tanstack/react-start";
import type { GeneratedQuestion } from "@/lib/types";

interface GenerateInput {
  examLevel: "KCET" | "NEET" | "JEE Mains" | "JEE Advanced";
  questionType: "MCQ" | "Numerical" | "Mixed";
  count: number;
  topic?: string;
  imageDataUrl?: string; // data:image/...;base64,...
}

interface GenerateResult {
  questions: GeneratedQuestion[];
  error?: string;
}

const SYSTEM_PROMPT = `You are "Student Helper by Dhruva", an expert exam question generator for Indian competitive exams: JEE Mains, JEE Advanced, NEET, and KCET.

CORE RULES:
- Generate ORIGINAL PYQ-style questions inspired by frequently repeated, high-weightage concepts from NCERT and standard syllabus.
- If an image is provided, identify the topic/concept from it and stay STRICTLY within that same topic — but you may use related NCERT-level conceptual knowledge.
- If no image is provided, use the user's topic text.
- Avoid copying exact past year questions verbatim. Make them original but at the same difficulty level.
- Test understanding, application, and conceptual reasoning — NOT rote theory.

DIFFICULTY (must match real exam level):
- KCET → Moderate
- NEET → Moderate to slightly high
- JEE Mains → Moderate to high (application + multi-step)
- JEE Advanced → High (conceptual depth, tricky, multi-concept)

FORMAT:
- For "MCQ": exactly 4 options with exactly ONE correct answer.
- For "Numerical": a single numerical answer (string form, may include units).
- For "Mixed": a balanced mix of MCQ and Numerical.
- Every question must include a concise step-by-step solution (2-4 logical steps focusing on the concept used).

OUTPUT: You MUST respond by calling the "return_questions" tool with the structured questions. Do not return prose.`;

export const generateQuestions = createServerFn({ method: "POST" })
  .inputValidator((input: GenerateInput) => {
    if (!input || typeof input !== "object") throw new Error("Invalid input");
    const count = Math.max(5, Math.min(15, Math.floor(Number(input.count) || 5)));
    return {
      examLevel: input.examLevel,
      questionType: input.questionType,
      count,
      topic: (input.topic || "").slice(0, 500),
      imageDataUrl: input.imageDataUrl,
    } satisfies GenerateInput;
  })
  .handler(async ({ data }): Promise<GenerateResult> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { questions: [], error: "AI service not connected. Please check settings." };
    }

    const userParts: Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    > = [];

    const askText = `Generate exactly ${data.count} ${data.questionType === "Mixed" ? "mixed (MCQ + Numerical)" : data.questionType} questions for ${data.examLevel}.
${data.topic ? `Topic / context: ${data.topic}` : ""}
${data.imageDataUrl ? "An image has been provided — identify the underlying concept and generate questions on the SAME topic, including conceptually related sub-topics from NCERT." : ""}

Difficulty must reflect ${data.examLevel} standard. Return via the return_questions tool.`;

    userParts.push({ type: "text", text: askText });
    if (data.imageDataUrl) {
      userParts.push({ type: "image_url", image_url: { url: data.imageDataUrl } });
    }

    const tool = {
      type: "function" as const,
      function: {
        name: "return_questions",
        description: "Return the generated exam questions in structured form.",
        parameters: {
          type: "object",
          properties: {
            questions: {
              type: "array",
              minItems: data.count,
              maxItems: data.count,
              items: {
                type: "object",
                properties: {
                  type: { type: "string", enum: ["MCQ", "Numerical"] },
                  question: { type: "string" },
                  options: {
                    type: "array",
                    items: { type: "string" },
                    minItems: 4,
                    maxItems: 4,
                    description: "For MCQ only — exactly 4 options.",
                  },
                  correctIndex: {
                    type: "integer",
                    minimum: 0,
                    maximum: 3,
                    description: "For MCQ only — index of correct option (0-3).",
                  },
                  answer: {
                    type: "string",
                    description: "For Numerical only — the numerical answer (may include units).",
                  },
                  solution: {
                    type: "string",
                    description: "Step-by-step solution, 2-4 concise steps focusing on the concept.",
                  },
                },
                required: ["type", "question", "solution"],
                additionalProperties: false,
              },
            },
          },
          required: ["questions"],
          additionalProperties: false,
        },
      },
    };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 55_000);

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userParts },
          ],
          tools: [tool],
          tool_choice: { type: "function", function: { name: "return_questions" } },
        }),
      }).finally(() => clearTimeout(timeoutId));

      if (response.status === 429) {
        return { questions: [], error: "Usage limit reached. Please try later." };
      }
      if (response.status === 402) {
        return {
          questions: [],
          error: "AI credits exhausted. Please add funds in Settings → Workspace → Usage.",
        };
      }
      if (!response.ok) {
        console.error("AI gateway error", response.status, await response.text());
        return { questions: [], error: "AI service temporarily unavailable. Please try again." };
      }

      const json = await response.json();
      const toolCall = json?.choices?.[0]?.message?.tool_calls?.[0];
      if (!toolCall?.function?.arguments) {
        return { questions: [], error: "AI service temporarily unavailable. Please try again." };
      }
      const parsed = JSON.parse(toolCall.function.arguments);
      const raw = Array.isArray(parsed.questions) ? parsed.questions : [];

      const questions: GeneratedQuestion[] = [];
      for (const q of raw) {
        if (q.type === "MCQ" && Array.isArray(q.options) && q.options.length === 4) {
          const idx = Number(q.correctIndex);
          if (idx >= 0 && idx <= 3) {
            questions.push({
              type: "MCQ",
              question: String(q.question),
              options: [String(q.options[0]), String(q.options[1]), String(q.options[2]), String(q.options[3])],
              correctIndex: idx as 0 | 1 | 2 | 3,
              solution: String(q.solution || ""),
            });
          }
        } else if (q.type === "Numerical" && q.answer != null) {
          questions.push({
            type: "Numerical",
            question: String(q.question),
            answer: String(q.answer),
            solution: String(q.solution || ""),
          });
        }
      }

      if (questions.length === 0) {
        return { questions: [], error: "AI service temporarily unavailable. Please try again." };
      }

      return { questions };
    } catch (err) {
      console.error("generateQuestions failed", err);
      const isAbort = err instanceof Error && err.name === "AbortError";
      return {
        questions: [],
        error: isAbort
          ? "Generation took too long. Please try fewer questions or try again."
          : "AI service temporarily unavailable. Please try again.",
      };
    }
  });
