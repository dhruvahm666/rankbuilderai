import { generateQuestions } from "@/server/generate-questions";
import type { GeneratedQuestion } from "@/lib/types";
import type { ExamLevel, QuestionType, Subject } from "@/lib/types";

export interface BatchInput {
  examLevel: ExamLevel;
  questionType: QuestionType;
  count: number;
  topic?: string;
  imageDataUrl?: string;
  subject?: Subject;
}

export interface BatchProgress {
  generated: number;
  total: number;
  batchIndex: number;
  totalBatches: number;
  attempt: number;
}

const BATCH_SIZE = 5;
const MAX_ATTEMPTS = 3;
const SERVER_MIN = 5; // server enforces min 5

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runBatchWithRetry(
  data: BatchInput,
  desiredCount: number,
  onProgress: (attempt: number) => void,
): Promise<{ questions: GeneratedQuestion[]; error?: string }> {
  let lastError: string | undefined;
  // Server enforces min 5 — request at least 5 and trim to desiredCount on the client.
  const requestCount = Math.max(SERVER_MIN, desiredCount);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    onProgress(attempt);
    try {
      const res = await generateQuestions({
        data: {
          examLevel: data.examLevel,
          questionType: data.questionType,
          count: requestCount,
          topic: data.topic,
          imageDataUrl: data.imageDataUrl,
          subject: data.subject,
        },
      });
      if (res.questions && res.questions.length > 0 && !res.error) {
        return { questions: res.questions.slice(0, desiredCount) };
      }
      lastError = res.error || "No questions returned.";
    } catch (err) {
      lastError =
        err instanceof Error ? err.message : "Network error. Please retry.";
    }
    // Exponential backoff between attempts (except after final)
    if (attempt < MAX_ATTEMPTS) {
      const delay = 800 * Math.pow(2, attempt - 1) + Math.random() * 300;
      await sleep(delay);
    }
  }
  return { questions: [], error: lastError || "Generation failed." };
}

/**
 * Split question generation into batches of 5 to avoid overloading the API.
 * Each batch retries up to 3 times with exponential backoff.
 * Returns all collected questions (best-effort: returns whatever succeeded
 * along with an error if any batch ultimately failed).
 */
export async function generateInBatches(
  input: BatchInput,
  onProgress?: (p: BatchProgress) => void,
): Promise<{ questions: GeneratedQuestion[]; error?: string }> {
  const total = Math.max(1, Math.floor(input.count));
  const batches: number[] = [];
  let remaining = total;
  while (remaining > 0) {
    const take = Math.min(BATCH_SIZE, remaining);
    batches.push(take);
    remaining -= take;
  }

  const collected: GeneratedQuestion[] = [];
  let firstError: string | undefined;

  for (let i = 0; i < batches.length; i++) {
    const batchCount = batches[i];
    onProgress?.({
      generated: collected.length,
      total,
      batchIndex: i + 1,
      totalBatches: batches.length,
      attempt: 1,
    });

    const res = await runBatchWithRetry(input, batchCount, (attempt) => {
      onProgress?.({
        generated: collected.length,
        total,
        batchIndex: i + 1,
        totalBatches: batches.length,
        attempt,
      });
    });

    if (res.questions.length > 0) {
      collected.push(...res.questions);
    } else if (!firstError && res.error) {
      firstError = res.error;
    }

    // Small spacing between batches so the gateway never gets hammered
    if (i < batches.length - 1) {
      await sleep(400);
    }
  }

  onProgress?.({
    generated: collected.length,
    total,
    batchIndex: batches.length,
    totalBatches: batches.length,
    attempt: 1,
  });

  if (collected.length === 0) {
    return { questions: [], error: firstError || "Generation failed. Please retry." };
  }
  return collected.length < total
    ? { questions: collected, error: firstError }
    : { questions: collected };
}
