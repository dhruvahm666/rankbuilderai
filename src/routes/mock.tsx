import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Clock, Download, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSession, isCorrect } from "@/lib/session";
import { downloadTestPDF } from "@/lib/pdf";

export const Route = createFileRoute("/mock")({
  head: () => ({ meta: [{ title: "Mock Test — Student Helper by Dhruva" }] }),
  component: MockPage,
  ssr: false,
});

const SECONDS_PER_Q = 90;

function MockPage() {
  const navigate = useNavigate();
  const { questions, examLevel, topic, answers, setAnswer } = useSession();
  const [idx, setIdx] = useState(0);
  const [timeLeft, setTimeLeft] = useState(SECONDS_PER_Q);
  const [done, setDone] = useState(false);
  const [numericalDraft, setNumericalDraft] = useState("");
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (done || questions.length === 0) return;
    setTimeLeft(SECONDS_PER_Q);
    setNumericalDraft("");
    const t = setInterval(() => {
      setTimeLeft((s) => {
        if (s <= 1) {
          clearInterval(t);
          advance();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, done, questions.length]);

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
          <h2 className="font-display text-xl font-bold">No test loaded</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Generate a question set to start a mock test.
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

  function advance() {
    const q = questions[idx];
    if (q.type === "Numerical" && numericalDraft.trim() && answers[idx] === undefined) {
      setAnswer(idx, numericalDraft.trim());
    }
    if (idx + 1 >= questions.length) {
      setDone(true);
    } else {
      setIdx(idx + 1);
    }
  }

  if (done) {
    const correct = questions.reduce((n, q, i) => n + (isCorrect(q, answers[i]) ? 1 : 0), 0);
    const pct = Math.round((correct / questions.length) * 100);

    return (
      <div className="min-h-screen">
        <header className="border-b border-border/60">
          <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
            <Link to="/" className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-secondary">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="font-display text-base font-bold">Mock Test — Result</div>
          </div>
        </header>

        <main className="mx-auto max-w-2xl px-4 py-8">
          <div className="paper-card rounded-2xl p-6 text-center md:p-10">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber/40">
              <Trophy className="h-8 w-8 text-primary" />
            </div>
            <div className="text-sm uppercase tracking-widest text-muted-foreground">Final Score</div>
            <div className="font-display text-7xl font-black text-primary">
              {correct}<span className="text-3xl text-muted-foreground">/{questions.length}</span>
            </div>
            <div className="mt-1 text-lg font-semibold">{pct}%</div>
            <div className="mt-2 text-sm text-muted-foreground">
              {examLevel}{topic ? ` • ${topic}` : ""}
            </div>
          </div>

          <h2 className="mt-8 mb-3 font-display text-xl font-bold">Answer Key</h2>
          <div className="paper-card divide-y divide-border rounded-xl">
            {questions.map((q, i) => {
              const userAns = answers[i];
              const ok = isCorrect(q, userAns);
              const correctText =
                q.type === "MCQ"
                  ? `${["A", "B", "C", "D"][q.correctIndex]}. ${q.options[q.correctIndex]}`
                  : q.answer;
              return (
                <div key={i} className="flex items-start gap-3 p-3 text-sm">
                  <span
                    className={`mt-0.5 inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                      ok
                        ? "bg-success/20 text-success"
                        : "bg-destructive/20 text-destructive"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="flex-1 font-semibold">{correctText}</span>
                </div>
              );
            })}
          </div>

          <div className="mt-6 grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => navigate({ to: "/practice" })}>
              View Solutions
            </Button>
            <Button onClick={() => downloadTestPDF({ questions, examLevel, topic })}>
              <Download className="mr-1 h-4 w-4" /> Download PDF
            </Button>
          </div>
          <Button variant="ghost" className="mt-3 w-full" onClick={() => navigate({ to: "/" })}>
            New test
          </Button>
        </main>
      </div>
    );
  }

  const q = questions[idx];
  const pct = (timeLeft / SECONDS_PER_Q) * 100;
  const danger = timeLeft <= 15;

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/60">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <Link to="/" className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-secondary">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="font-display text-base font-bold">Mock Test</div>
          <div className="ml-auto text-sm font-semibold tabular-nums">
            {idx + 1} / {questions.length}
          </div>
        </div>
        <div className="mx-auto max-w-3xl px-4 pb-3">
          <div className="flex items-center gap-2">
            <Clock className={`h-4 w-4 ${danger ? "text-destructive" : "text-primary"}`} />
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
              <div
                className={`h-full transition-all duration-1000 ease-linear ${
                  danger ? "bg-destructive" : "bg-primary"
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className={`w-10 text-right text-sm font-bold tabular-nums ${danger ? "text-destructive" : ""}`}>
              {timeLeft}s
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        <article className="paper-card rounded-xl p-5 md:p-6">
          <div className="mb-2 flex items-baseline gap-2">
            <span className="font-display text-lg font-bold text-primary">Q{idx + 1}.</span>
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
              {q.type}
            </span>
          </div>
          <p className="mb-5 whitespace-pre-wrap text-[16px] leading-7">{q.question}</p>

          {q.type === "MCQ" ? (
            <div className="space-y-2">
              {q.options.map((opt, oi) => {
                const selected = answers[idx] === oi;
                return (
                  <button
                    key={oi}
                    onClick={() => setAnswer(idx, oi)}
                    className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left text-sm transition ${
                      selected
                        ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                        : "border-border hover:border-primary/40 hover:bg-secondary/50"
                    }`}
                  >
                    <span className="mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-current text-[11px] font-bold">
                      {["A", "B", "C", "D"][oi]}
                    </span>
                    <span className="flex-1 whitespace-pre-wrap leading-6">{opt}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <Input
              type="text"
              inputMode="decimal"
              placeholder="Enter numerical answer"
              value={numericalDraft}
              onChange={(e) => setNumericalDraft(e.target.value)}
              className="bg-background text-base"
              autoFocus
            />
          )}
        </article>

        <Button onClick={advance} size="lg" className="mt-5 h-12 w-full text-base font-bold">
          {idx + 1 === questions.length ? "Finish Test" : "Next Question"}
        </Button>
      </main>
    </div>
  );
}
