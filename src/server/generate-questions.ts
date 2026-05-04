import { createServerFn } from "@tanstack/react-start";
import type { GeneratedQuestion } from "@/lib/types";

// SECURITY: Lightweight in-memory IP-based rate limiter to prevent abuse of the
// AI question generation endpoint (which costs API credits per call). The
// endpoint must remain unauthenticated because the app uses a profile-only
// flow rather than Supabase Auth, so a per-IP sliding window is the practical
// guard against credit exhaustion and automated scraping.
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 12; // max calls per IP per window
const rateBuckets = new Map<string, number[]>();

async function getClientIp(): Promise<string> {
  try {
    // Dynamic import keeps the server-only module out of the client bundle.
    const { getRequest, getRequestHeader } = await import("@tanstack/react-start/server");
    const req = getRequest();
    // Prefer CDN-set headers that clients cannot forge.
    const cf = getRequestHeader("cf-connecting-ip") || req?.headers.get("cf-connecting-ip");
    if (cf) return cf.trim();
    const real = getRequestHeader("x-real-ip") || req?.headers.get("x-real-ip");
    if (real) return real.trim();
    // x-forwarded-for last — take the rightmost entry (set by the trusted proxy),
    // since clients can prepend arbitrary values to the left side.
    const xff = getRequestHeader("x-forwarded-for") || req?.headers.get("x-forwarded-for");
    if (xff) {
      const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
      if (parts.length) return parts[parts.length - 1]!;
    }
  } catch {
    // ignore — fall through to anonymous bucket
  }
  return "anonymous";
}

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
  // Opportunistic cleanup so the map doesn't grow forever
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
  imageDataUrl?: string; // data:image/...;base64,...
  subject?: "Physics" | "Chemistry" | "Maths" | "Biology";
}

interface GenerateResult {
  questions: GeneratedQuestion[];
  error?: string;
}

const SYSTEM_PROMPT = `You are "Student Helper by Dhruva", an expert exam question generator for Indian competitive exams: JEE Mains, JEE Advanced, NEET, and KCET. Your output must look and read like a clean MTG / Arihant printed exam preparation book — never like code.

LANGUAGE & STYLE (NCERT + MTG FINGERTIPS):
- Frame every question in the style of NCERT textbooks and MTG Fingertips.
- Use clear, simple, precise language. Sentences must be formal and exam-standard.
- Questions must read like they are from a printed Indian textbook — not AI-generated.
- No conversational filler ("Let's", "Imagine that", "Hey", "you know"). No emojis. No exclamation marks.
- Prefer crisp NCERT phrasing: "Which of the following...", "The value of ... is", "Identify the correct statement", "A particle of mass m moves...".
- Do NOT change question difficulty, the MCQ/Numerical format, the number of options, or the correct-answer logic. Only the wording and presentation must match NCERT/MTG style.

CORE RULES:
- Generate ORIGINAL PYQ-style questions inspired by frequently repeated, high-weightage concepts from NCERT and standard syllabus.
- If an image is provided, identify the topic/concept from it and stay STRICTLY within that same topic — but you may use related NCERT-level conceptual knowledge.
- If no image is provided, use the user's topic text.
- Avoid copying exact past year questions verbatim. Make them original but at the same difficulty level.
- Test understanding, application, and conceptual reasoning — NOT rote theory.
- Keep difficulty fully intact. NEVER simplify the concept — only simplify the wording and formatting.

DIFFICULTY (must match real exam level):
- KCET → Moderate
- NEET → Moderate to slightly high
- JEE Mains → Moderate to high (application + multi-step)
- JEE Advanced → High (conceptual depth, tricky, multi-concept)

FORMAT:
- For "MCQ": exactly 4 options with exactly ONE correct answer. Each option must be self-contained and short.
- For "Numerical": a single numerical answer (string form, may include units).
- For "Mixed": a balanced mix of MCQ and Numerical.
- Every question must include a concise step-by-step solution (2-4 logical steps focusing on the concept used).
- Begin questions with friendly, simple verbs: "Find", "Evaluate", "Compute", "Identify", "Which of the following", "What is".

GLOBAL TEXTBOOK FORMATTING (STRICTLY FOLLOW — NEVER WRITE CODE-STYLE):
- For complex mathematics (fractions, integrals with limits, summations, square roots over expressions, matrices, derivatives), wrap the expression in KaTeX delimiters so it renders as proper math:
   - Inline: $\\frac{a}{b}$, $\\int_0^1 x^2\\,dx$, $\\sqrt{x^2 + 1}$, $\\lim_{x \\to 0} \\frac{\\sin x}{x}$
   - Display (centered, on its own line): $$\\int_0^{\\pi} \\sin x \\, dx = 2$$
- Use KaTeX ONLY for math. Do NOT wrap chemical reactions, organic structures, biology diagrams, match-the-following columns, plain prose or option text in $...$.
- For SIMPLE math that reads naturally inline (like x², H₂O, CO₂, x + y = 5, sin θ = 1/2), prefer Unicode characters and the rules below — no KaTeX needed.
- NO markdown, NO backticks, NO code blocks, NO asterisks (use × for multiplication).
- Outside of KaTeX delimiters, use proper Unicode textbook characters directly:
  - Superscripts: x², x³, xⁿ, 10⁻³, e^x → write as eˣ
  - Subscripts: H₂O, CO₂, x₁, x₂, aₙ
  - Math symbols: × (not *), ÷ or / written as fraction line, ± , ≤ , ≥ , ≠ , ≈ , ∞ , √ , ∫ , Σ , Δ , ∇ , ∂
  - Greek: α β γ δ ε θ λ μ π ρ σ τ φ ω Ω
  - Arrows: → ⇌ ⇒ ⇔
- Fractions: write inline as "(a + b) / 2" using a real division slash with spaces, OR use Unicode like ½, ⅓, ¼ when simple. NEVER write \\frac.
- Square roots: write as √5 , √(x² + 1). NEVER \\sqrt.
- Powers: x², x³, x⁴, eˣ, 2ⁿ. For variable powers like x to the n, write xⁿ.
- Integrals: write as ∫ from a to b of f(x) dx. NEVER \\int.
- Spacing: leave a clean blank line between the question stem and any equation/structure/diagram block, and another blank line after the block before continuing. Reactions, structures, "Given:/Find:" data, match-the-following columns, and text diagrams MUST appear on their own lines (never inline inside a paragraph) so the renderer can format them as a centered block.

MATHEMATICS:
- Convert every expression into proper textbook form using the Unicode rules above.
- Examples of correct style:
   "Find the value of x² + 2x + 1 when x = 3."
   "Evaluate ∫ from 0 to 1 of (x² + 1) dx."
   "If sin θ = 1/2 and θ lies in the first quadrant, find cos θ."
- NEVER write "x^2", "x**2", "2*x", "sqrt(5)", or "(1/2)*x".

CHEMISTRY (REACTIONS — STRICT NCERT TEXTBOOK STYLE):
- When the question concerns a chemical change, ALWAYS auto-generate the FULL BALANCED chemical equation tied to the concept (combustion, neutralisation, displacement, redox, esterification, hydrolysis, dehydration, addition, substitution, etc.). Never describe a reaction in words when an equation can be written.
- Place every reaction on its OWN line, separated by blank lines from the surrounding prose, so it renders as a centred reaction block. Never inline a full reaction inside a sentence.
- Use proper arrows: → for forward, ⇌ for equilibrium, ⇒ for "implies". Above-arrow conditions go in parentheses immediately after the arrow, e.g. → (conc. H₂SO₄, Δ).
- Subscripts must always be Unicode (H₂O, CO₂, SO₄, NH₃, C₆H₁₂O₆), never "H2O" or "H_2O".
- Charges and oxidation states must always be Unicode superscripts (Na⁺, Cl⁻, Fe²⁺, Fe³⁺, SO₄²⁻, NH₄⁺, MnO₄⁻). Never "Fe^2+" or "Fe2+".
- Show physical states when standard: (s), (l), (g), (aq). Example: AgNO₃(aq) + NaCl(aq) → AgCl(s) + NaNO₃(aq).
- For equilibrium constants, rate laws, electrode potentials, or the Nernst equation, use KaTeX so it renders as proper math:
   $$K_c = \\frac{[NH_3]^2}{[N_2][H_2]^3}$$
   $$E = E^\\circ - \\frac{0.059}{n} \\log Q$$
- For organic chemistry, ALWAYS show the structural formula, not just the name. Emit it on its OWN line as a SMILES token wrapped in [smiles]...[/smiles]. The renderer will draw it as a clean 2D NCERT-style structure. Examples:
   [smiles]CCO[/smiles]                       (ethanol)
   [smiles]CC(=O)O[/smiles]                   (acetic acid)
   [smiles]CC(=O)OC[/smiles]                  (methyl acetate)
   [smiles]c1ccccc1O[/smiles]                 (phenol)
   [smiles]Oc1ccc(cc1)[N+](=O)[O-][/smiles]   (4-nitrophenol)
   [smiles]CC(C)C[/smiles]                    (isobutane)
- You MAY ALSO show the same compound in linear text form on the line above the SMILES token (e.g. "CH₃ — CH₂ — OH") for students who prefer condensed notation, but the [smiles]...[/smiles] token MUST always be present whenever a structure is involved.
- For full reactions involving structures, write each side as its own SMILES on its own line, joined by an arrow line:
   [smiles]CCO[/smiles]
   → (conc. H₂SO₄, 443 K)
   [smiles]C=C[/smiles] + H₂O
- NEVER put SMILES inside $...$ — KaTeX does not parse SMILES. Always use the [smiles]...[/smiles] token.
- NEVER write raw LaTeX outside $...$ / $$...$$. NEVER write "->" — use →. NEVER write "<=>" — use ⇌. NEVER write "H2SO4" — use H₂SO₄. NEVER write "Fe2+" — use Fe²⁺.
- Show charges as superscripts: Na⁺, Cl⁻, SO₄²⁻, NH₄⁺.
- Show oxidation states in roman numerals in brackets: Fe(III), Mn(VII).
- For numerical chemistry questions, use this clean block layout inside the question text:

   Given:
   ΔH = -286 kJ/mol
   T = 298 K
   n = 2 mol

   Find: the value of ΔG.

BIOLOGY (NCERT + MTG FINGERTIPS COLOURED DIAGRAMS — STRICT, PERMANENT):
- Prefer questions on identification, function, and "match the following" style where useful.
- Whenever a diagram genuinely helps the question (Botany: dicot/monocot stem, dicot/monocot root, root apex, plant cell, animal cell, cell organelles, flower parts, photosynthesis, vascular bundles. Zoology: human heart, lungs, kidney, nephron, brain, neuron, digestive system, reproductive system, eye, ear, circulatory system, chromosomes, endocrine glands), you MUST embed a clean coloured anatomical SVG diagram inside a [svg]...[/svg] block on its own line. The diagram must look like the NCERT Class 11 / Class 12 textbook printed in colour, in the MTG Fingertips style.
- The Biology SVG MUST follow ALL of these rules without exception:
  • viewBox="0 0 500 500" on every Biology diagram.
  • White background. Clean black outlines (stroke="#000" or "#1a1a1a"), consistent stroke-width (1.5 to 2).
  • Anatomically correct, proportional. Every distinct part must be its own closed shape — never overlap or merge two different organs/tissues into one path.
  • Realistic biological colours (use these EXACT fills, never the same colour for two different parts in one diagram):
      - Xylem → #BEE3F8 (light blue)
      - Phloem → #FED7AA (light orange)
      - Cortex → #C6F6D5 (light green)
      - Epidermis → #FEF3C7 (light yellow)
      - Pith → #FEE2E2 (light pink-red)
      - Endodermis → #DDD6FE (light lavender)
      - Heart oxygenated chambers / arteries → #E53E3E (red)
      - Heart deoxygenated chambers / veins → #3182CE (blue)
      - Neuron body → #E9D8FD (light purple) with nucleus #553C9A (dark purple) and yellow nucleolus #F6E05E
      - Cell membrane → #FBB6CE (light pink)
      - Nucleus → #6B46C1 (dark purple)
      - Chloroplast → #38A169 (green) with darker green grana
      - Mitochondria → #DD6B20 (orange) with darker cristae
      - Cytoplasm → #F0FFF4 (very light green-grey)
      - Lungs → #FBB6CE (pink) with #F687B3 bronchi
      - Kidney cortex → #C53030, medulla → #FBD38D
      - Brain regions: cerebrum #FBB6CE, cerebellum #B794F4, brainstem #F6AD55
      - Bones → #FFF5E6, cartilage → #BEE3F8
      - Glands → #FAF089
  • EVERY label MUST be placed OUTSIDE its shape, in a clean sans-serif <text> (font-family="Inter, Arial, sans-serif", font-size 11–13, fill="#1a1a1a", stroke="none"). Labels must NEVER overlap each other and NEVER sit on top of any coloured shape.
  • Each label is connected to its part by a single straight thin leader line (stroke="#1a1a1a", stroke-width="0.8") ending precisely at the part it names. No arrowheads, no curves.
  • No clutter. Zero decorative elements. No gradients, no filters, no <script>, no <foreignObject>, no external images, no <image>, no <use href="http…">.
  • Self-contained, ≤ 20 KB.
- For "Diagram Based" Biology questions the [svg] block is MANDATORY and the stem must reference a labelled part (e.g. "Identify the structure marked A" or "The part labelled X performs the function of:").
- Match-the-following format (when used) — two clean aligned columns inside the question text:
   Column I              Column II
   (a) Mitochondria      (i) Protein synthesis
   (b) Ribosome          (ii) Powerhouse of cell
   (c) Nucleus           (iii) Genetic control

AUTO DIAGRAMS — Physics & Maths (BEST EFFORT, only when genuinely useful):
- For Physics (circuits, ray diagrams, force diagrams, v-t graphs) and Maths (graphs, geometric figures, coordinate plots) you MAY embed a clean inline SVG diagram inside the question text using a [svg]...[/svg] block on its own line.
- The SVG MUST: have a viewBox attribute, use stroke="currentColor" and fill="none" or "currentColor" so it adapts to light/dark mode (Physics/Maths only — Biology uses real biological colours as above), be self-contained, ≤ 4 KB, plain shapes + <text> labels only. NO <script>, NO <foreignObject>, NO external images.
- Example (Physics):
   [svg]<svg viewBox="0 0 200 120" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" fill="none" stroke-width="1.5"><circle cx="60" cy="60" r="30"/><line x1="90" y1="60" x2="160" y2="60"/><text x="60" y="65" text-anchor="middle" fill="currentColor" stroke="none" font-size="10">Lens</text></svg>[/svg]
- If you cannot draw a clean diagram, OMIT the [svg] block entirely — never insert broken or empty SVG.

OPTIONS (MCQ):
- Each option is just the value/phrase. Do NOT prefix with "(a)", "A.", "1)" — the UI adds labels.
- Keep options parallel in style and length where possible.

DIAGRAM BASED (Biology only):
- When questionType is "Diagram Based", every question is type "MCQ" testing identification, labelling or interpretation of a biological diagram. The coloured NCERT/MTG [svg] block defined in the BIOLOGY section above is MANDATORY in every such question.

DIFFICULTY MIX (every batch):
- Tag each question with a "difficulty" field: "Easy" | "Medium" | "Hard".
- Aim for roughly 40% Easy (recall / direct fact / formula), 35% Medium (application / multi-concept / numerical), 25% Hard (HOTS — assertion-reason, case-based, multi-statement, diagram interpretation).
- Difficulty must still respect the exam level (a "Hard" KCET question is easier than a "Hard" JEE Advanced question).

SOLUTION STYLE:
- Read like a teacher on a blackboard. Short sentences. Use the SAME textbook formatting rules above.
- 2–4 numbered or sequential steps focusing on the key concept and the final answer.
- Use newlines between steps so the solution is easy to read.

UNITS: write normally — m/s, m/s², kg, N, mol, J, kJ/mol, K, Pa.

OUTPUT: You MUST respond by calling the "return_questions" tool with the structured questions. Do not return prose. Every "question", "options" entry, "answer" and "solution" string MUST already be in the clean textbook format described above.`;

const ALLOWED_EXAM_LEVELS = new Set(["KCET", "NEET", "JEE Mains", "JEE Advanced"]);
const ALLOWED_SUBJECTS = new Set(["Physics", "Chemistry", "Maths", "Biology"]);
const ALLOWED_IMAGE_PREFIX = /^data:image\/(png|jpe?g|webp);base64,/i;
// ~5 MB raw → ~7 MB base64-encoded. Reject anything larger to prevent abuse.
const MAX_IMAGE_DATA_URL_LENGTH = 7_000_000;

export const generateQuestions = createServerFn({ method: "POST" })
  .inputValidator((input: GenerateInput) => {
    if (!input || typeof input !== "object") throw new Error("Invalid input");
    const count = Math.max(5, Math.min(30, Math.floor(Number(input.count) || 5)));
    const allowedTypes = new Set(["MCQ", "Numerical", "Mixed", "Diagram Based"]);
    const qt = allowedTypes.has(input.questionType) ? input.questionType : "MCQ";

    // SECURITY: validate examLevel/subject against strict allowlists to prevent
    // prompt injection via fields that are interpolated into the AI system prompt.
    if (!ALLOWED_EXAM_LEVELS.has(input.examLevel)) {
      throw new Error("Invalid examLevel");
    }
    let subject: GenerateInput["subject"] = undefined;
    if (input.subject !== undefined && input.subject !== null) {
      if (!ALLOWED_SUBJECTS.has(input.subject)) {
        throw new Error("Invalid subject");
      }
      subject = input.subject;
    }

    // SECURITY: enforce server-side cap on imageDataUrl size and MIME type so
    // a direct caller cannot bypass the client 5 MB limit or send non-image data.
    let imageDataUrl: string | undefined = undefined;
    if (typeof input.imageDataUrl === "string" && input.imageDataUrl.length > 0) {
      if (input.imageDataUrl.length > MAX_IMAGE_DATA_URL_LENGTH) {
        throw new Error("Image is too large (max ~5 MB).");
      }
      if (!ALLOWED_IMAGE_PREFIX.test(input.imageDataUrl)) {
        throw new Error("Unsupported image format. Use PNG, JPEG, or WebP.");
      }
      imageDataUrl = input.imageDataUrl;
    }

    return {
      examLevel: input.examLevel,
      questionType: qt,
      count,
      topic: (input.topic || "").slice(0, 500),
      imageDataUrl,
      subject,
    } satisfies GenerateInput;
  })
  .handler(async ({ data }): Promise<GenerateResult> => {
    // SECURITY: per-IP rate limit to prevent AI credit exhaustion / scraping.
    const ip = await getClientIp();
    if (!checkRateLimit(ip)) {
      return {
        questions: [],
        error: "Too many requests. Please wait a moment and try again.",
      };
    }

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { questions: [], error: "AI service not connected. Please check settings." };
    }

    const userParts: Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    > = [];

    const subjectLine = data.subject ? `Subject: ${data.subject}.` : "";
    const typeDesc =
      data.questionType === "Mixed"
        ? "mixed (MCQ + Numerical)"
        : data.questionType === "Diagram Based"
          ? "diagram-based MCQ (each question must reference a labelled [svg] diagram embedded in the stem)"
          : data.questionType;

    const askText = `Generate exactly ${data.count} ${typeDesc} questions for ${data.examLevel}.
${subjectLine}
${data.topic ? `Topic / context: ${data.topic}` : ""}
${data.imageDataUrl ? "An image has been provided — identify the underlying concept and generate questions on the SAME topic, including conceptually related sub-topics from NCERT." : ""}

Difficulty must reflect ${data.examLevel} standard, with a ~40/35/25 Easy/Medium/Hard mix tagged on each question. Return via the return_questions tool.`;

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
                  difficulty: {
                    type: "string",
                    enum: ["Easy", "Medium", "Hard"],
                    description: "Difficulty tier for the difficulty pill shown in the UI.",
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
      // Silent server-side retry (3 attempts) for transient network / 5xx errors.
      // 429 (rate limit) and 402 (credits) are NOT retried — they need user action.
      let response: Response | null = null;
      let lastNetworkErr: unknown = null;
      const MAX_FETCH_ATTEMPTS = 3;
      for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 55_000);
        try {
          response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
          });
        } catch (err) {
          lastNetworkErr = err;
          response = null;
        } finally {
          clearTimeout(timeoutId);
        }

        // Stop retrying on success or on errors the user must resolve
        if (response && (response.ok || response.status === 429 || response.status === 402)) break;

        // Retry on network failure or 5xx
        if (attempt < MAX_FETCH_ATTEMPTS) {
          const delay = 600 * Math.pow(2, attempt - 1) + Math.random() * 250;
          await new Promise((r) => setTimeout(r, delay));
        }
      }

      if (!response) {
        console.error("AI gateway network failure", lastNetworkErr);
        return { questions: [], error: "AI service temporarily unavailable. Please try again." };
      }
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
      const allowedDiff = new Set(["Easy", "Medium", "Hard"]);
      for (const q of raw) {
        const difficulty = allowedDiff.has(q?.difficulty) ? q.difficulty : undefined;
        if (q.type === "MCQ" && Array.isArray(q.options) && q.options.length === 4) {
          const idx = Number(q.correctIndex);
          if (idx >= 0 && idx <= 3) {
            questions.push({
              type: "MCQ",
              question: String(q.question),
              options: [String(q.options[0]), String(q.options[1]), String(q.options[2]), String(q.options[3])],
              correctIndex: idx as 0 | 1 | 2 | 3,
              solution: String(q.solution || ""),
              difficulty,
            });
          }
        } else if (q.type === "Numerical" && q.answer != null) {
          questions.push({
            type: "Numerical",
            question: String(q.question),
            answer: String(q.answer),
            solution: String(q.solution || ""),
            difficulty,
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
