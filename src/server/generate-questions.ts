import { createServerFn } from "@tanstack/react-start";
import type { GeneratedQuestion } from "@/lib/types";

interface GenerateInput {
  examLevel: "KCET" | "NEET" | "JEE Mains" | "JEE Advanced";
  questionType: "MCQ" | "Numerical" | "Mixed";
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

BIOLOGY:
- Prefer questions on identification, function, and "match the following" style where useful.
- When a diagram helps (heart, neuron, flower, DNA, cell, nephron, brain), include a SIMPLE labeled text-diagram inside the question. Example:
   Diagram (label the parts):

      [Cell Body] —— [Axon] —— [Axon Terminal]
           |
       [Dendrites]

- For match-the-following, format as two clean aligned columns inside the question text:
   Column I              Column II
   (a) Mitochondria      (i) Protein synthesis
   (b) Ribosome          (ii) Powerhouse of cell
   (c) Nucleus           (iii) Genetic control

OPTIONS (MCQ):
- Each option is just the value/phrase. Do NOT prefix with "(a)", "A.", "1)" — the UI adds labels.
- Keep options parallel in style and length where possible.

SOLUTION STYLE:
- Read like a teacher on a blackboard. Short sentences. Use the SAME textbook formatting rules above.
- 2–4 numbered or sequential steps focusing on the key concept and the final answer.
- Use newlines between steps so the solution is easy to read.

UNITS: write normally — m/s, m/s², kg, N, mol, J, kJ/mol, K, Pa.

OUTPUT: You MUST respond by calling the "return_questions" tool with the structured questions. Do not return prose. Every "question", "options" entry, "answer" and "solution" string MUST already be in the clean textbook format described above.`;

export const generateQuestions = createServerFn({ method: "POST" })
  .inputValidator((input: GenerateInput) => {
    if (!input || typeof input !== "object") throw new Error("Invalid input");
    const count = Math.max(5, Math.min(30, Math.floor(Number(input.count) || 5)));
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
