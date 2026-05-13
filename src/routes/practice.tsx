import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, BookOpen, Check, Download, Eye, EyeOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSession, isCorrect } from "@/lib/session";
import { downloadTestPDF } from "@/lib/pdf";
import { QuestionBody, InlineMathText } from "@/components/QuestionBody";
import { SolutionDisplay } from "@/components/SolutionDisplay";
import { DifficultyPill } from "@/components/DifficultyPill";
import { toast } from "sonner";

async function handleDownloadPDF(args: Parameters<typeof downloadTestPDF>[0]) {
  try {
    await downloadTestPDF(args);
  } catch (err) {
    console.error("PDF download failed", err);
    toast.error("Could not save the PDF. Please try again.");
  }
}

export const Route = createFileRoute("/practice")({
  head: () => ({ meta: [{ title: "Practice — Student Helper by Dhruva" }] }),
  component: PracticePage,
  ssr: false,
});

function PracticePage() {
  const { questions, examLevel, topic, subject, answers, setAnswer } = useSession();
  const [showSolutions, setShowSolutions] = useState(false);
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center px-5">
        <div className="paper-card max-w-sm rounded-2xl p-6 text-center">
          <h2 className="font-display text-xl font-bold">No questions yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Generate a question set first.
          </p>
          <Link
            to="/"
            className="mt-4 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Go to setup
          </Link>
        </div>
      </div>
    );
  }

  const correctCount = questions.reduce(
    (n, q, i) => n + (isCorrect(q, answers[i]) ? 1 : 0),
    0
  );

  return (
    <div className="min-h-screen pb-20">
      <header className="sticky top-0 z-10 border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <Link
            to="/"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-secondary"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" />
            <div className="font-display text-base font-bold">Practice</div>
          </div>
          <div className="ml-auto text-xs text-muted-foreground">
            {examLevel} • {questions.length}Q
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        {topic && <p className="mb-4 text-sm text-muted-foreground">Topic: {topic}</p>}

        <div className="mb-4 flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSolutions((s) => !s)}
          >
            {showSolutions ? <EyeOff className="mr-1 h-4 w-4" /> : <Eye className="mr-1 h-4 w-4" />}
            {showSolutions ? "Hide all solutions" : "Show all solutions"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleDownloadPDF({ questions, examLevel, topic, subject })}
          >
            <Download className="mr-1 h-4 w-4" /> PDF
          </Button>
        </div>

        <div className="space-y-4">
          {questions.map((q, i) => {
            const ans = answers[i];
            const correct = isCorrect(q, ans);
            const showSol = showSolutions || revealed[i];
            return (
              <article key={i} className="paper-card rounded-xl p-5 md:p-6">
                <header className="mb-3 flex items-baseline justify-between gap-3">
                  <span className="exam-qnum text-lg">Q{i + 1}.</span>
                  <span className="flex items-center gap-2">
                    <DifficultyPill difficulty={q.difficulty} />
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-secondary-foreground">
                      {q.type}
                    </span>
                  </span>
                </header>

                <QuestionBody text={q.question} subject={subject} />

                {q.type === "MCQ" ? (
                  <ul className="exam-options">
                    {q.options.map((opt, oi) => {
                      const selected = ans === oi;
                      const isAnswer = oi === q.correctIndex;
                      const showState = ans !== undefined;
                      let cls =
                        "flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left text-[14.5px] leading-7 transition w-full";
                      if (showState && isAnswer) cls += " border-success bg-success/10";
                      else if (showState && selected && !isAnswer)
                        cls += " border-destructive bg-destructive/10";
                      else if (selected) cls += " border-primary bg-primary/5";
                      else cls += " border-border hover:border-primary/40 hover:bg-secondary/50";
                      return (
                        <li key={oi}>
                          <button onClick={() => setAnswer(i, oi)} className={cls}>
                            <span className="exam-option-label mt-0.5 text-primary">
                              ({["a", "b", "c", "d"][oi]})
                            </span>
                            <InlineMathText text={opt} className="flex-1 whitespace-pre-wrap" subject={subject} />
                            {showState && isAnswer && <Check className="mt-1 h-4 w-4 flex-shrink-0 text-success" />}
                            {showState && selected && !isAnswer && (
                              <X className="mt-1 h-4 w-4 flex-shrink-0 text-destructive" />
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      inputMode="decimal"
                      placeholder="Your numerical answer"
                      value={(ans as string) ?? ""}
                      onChange={(e) => setAnswer(i, e.target.value)}
                      className="bg-background"
                    />
                    {ans !== undefined && ans !== "" && (
                      <div
                        className={`flex items-center justify-center rounded-md px-3 text-sm font-semibold ${
                          correct
                            ? "bg-success/15 text-success"
                            : "bg-destructive/15 text-destructive"
                        }`}
                      >
                        {correct ? "Correct" : <>Ans: <InlineMathText text={q.answer} subject={subject} /></>}
                      </div>
                    )}
                  </div>
                )}

                {!showSol && (
                  <button
                    onClick={() => setRevealed((r) => ({ ...r, [i]: true }))}
                    className="mt-3 text-xs font-semibold text-primary hover:underline"
                  >
                    Show solution
                  </button>
                )}
                {showSol && (
                  <SolutionDisplay question={q} subject={subject} />
                )}
              </article>
            );
          })}
        </div>

        <div className="paper-card mt-6 rounded-xl p-4 text-center">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Score</div>
          <div className="font-display text-4xl font-black text-primary">
            {correctCount} / {questions.length}
          </div>
        </div>
      </main>
    </div>
  );
}
