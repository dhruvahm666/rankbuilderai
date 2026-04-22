import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Upload, Sparkles, BookOpen, X, ImageIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { generateQuestions } from "@/server/generate-questions";
import { useSession } from "@/lib/session";
import { useProfile } from "@/lib/profile";
import { ProfileGate } from "@/components/ProfileGate";
import { ProfileChip } from "@/components/ProfileChip";
import type { ExamLevel, Mode, QuestionType } from "@/lib/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Student Helper by Dhruva — JEE, NEET & KCET PYQ Generator" },
      {
        name: "description",
        content:
          "Upload a textbook image or type a topic. Generate exam-grade PYQ-style questions with detailed solutions. Practice or take a timed mock test.",
      },
    ],
  }),
  component: HomeRoute,
  ssr: false,
});

function HomeRoute() {
  return (
    <ProfileGate>
      <Home />
    </ProfileGate>
  );
}

const EXAM_LEVELS: ExamLevel[] = ["KCET", "NEET", "JEE Mains", "JEE Advanced"];
const Q_TYPES: QuestionType[] = ["MCQ", "Numerical", "Mixed"];

function Home() {
  const navigate = useNavigate();
  const setSession = useSession((s) => s.setSession);
  const { profile } = useProfile();

  const [examLevel, setExamLevel] = useState<ExamLevel>("JEE Mains");
  const [questionType, setQuestionType] = useState<QuestionType>("MCQ");
  const [count, setCount] = useState(10);
  const [mode, setMode] = useState<Mode>("practice");
  const [topic, setTopic] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageName, setImageName] = useState("");
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Pre-select exam level once, based on saved profile preference
  const didPreselect = useRef(false);
  useEffect(() => {
    if (didPreselect.current || !profile) return;
    didPreselect.current = true;
    if (profile.exam === "NEET") setExamLevel("NEET");
    else if (profile.exam === "KCET") setExamLevel("KCET");
    else if (profile.exam === "JEE") setExamLevel("JEE Mains");
  }, [profile]);

  function pickImage() {
    fileRef.current?.click();
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImageDataUrl(reader.result as string);
      setImageName(file.name);
    };
    reader.readAsDataURL(file);
  }

  function clearImage() {
    setImageDataUrl(null);
    setImageName("");
    if (fileRef.current) fileRef.current.value = "";
  }

  async function onGenerate() {
    if (!imageDataUrl && !topic.trim()) {
      toast.error("Add a topic or upload an image to generate questions.");
      return;
    }
    setLoading(true);
    try {
      const res = await generateQuestions({
        data: {
          examLevel,
          questionType,
          count,
          topic: topic.trim() || undefined,
          imageDataUrl: imageDataUrl || undefined,
        },
      });
      if (res.error || res.questions.length === 0) {
        toast.error(res.error || "Could not generate questions. Try again.");
        return;
      }
      setSession({
        questions: res.questions,
        examLevel,
        questionType,
        mode,
        topic: topic.trim(),
      });
      navigate({ to: mode === "mock" ? "/mock" : "/practice" });
    } catch {
      toast.error("AI service temporarily unavailable. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-border/60">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <BookOpen className="h-5 w-5" />
            </div>
            <div className="leading-tight">
              <div className="font-display text-lg font-bold">Student Helper</div>
              <div className="text-xs text-muted-foreground">by Dhruva</div>
            </div>
          </div>
          <ProfileChip />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-10 md:py-16">
        {/* Hero */}
        <section className="mb-10 md:mb-14">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border bg-secondary/60 px-3 py-1 text-xs font-medium text-secondary-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            PYQ-style questions, generated for you
          </div>
          <h1 className="font-display text-4xl font-black leading-[1.05] tracking-tight text-balance md:text-6xl">
            Master concepts the <span className="italic text-primary">examiners</span> love to repeat.
          </h1>
          <p className="mt-4 max-w-2xl text-muted-foreground md:text-lg">
            Upload a chapter image or type a topic. We generate original, exam-grade questions with
            detailed solutions — built on the patterns that show up year after year.
          </p>
        </section>

        {/* Configurator */}
        <section className="paper-card rounded-2xl p-5 md:p-8">
          {/* Image upload */}
          <div className="mb-6">
            <Label className="mb-2 block text-sm font-semibold">Reference image (optional)</Label>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
            {imageDataUrl ? (
              <div className="flex items-start gap-3 rounded-xl border border-border bg-secondary/40 p-3">
                <img
                  src={imageDataUrl}
                  alt="uploaded reference"
                  className="h-20 w-20 rounded-lg object-cover"
                />
                <div className="flex-1 overflow-hidden">
                  <div className="truncate text-sm font-medium">{imageName}</div>
                  <div className="text-xs text-muted-foreground">
                    AI will identify the concept and stay on-topic.
                  </div>
                  <button
                    onClick={clearImage}
                    className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <X className="h-3 w-3" /> Remove
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={pickImage}
                className="flex w-full items-center gap-3 rounded-xl border-2 border-dashed border-border bg-secondary/30 px-4 py-5 text-left transition hover:border-primary/50 hover:bg-secondary/60"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-amber/40">
                  <Upload className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold">Tap to upload an image</div>
                  <div className="text-xs text-muted-foreground">
                    Textbook page, notes, or diagram (max 5 MB)
                  </div>
                </div>
              </button>
            )}
          </div>

          {/* Topic */}
          <div className="mb-6">
            <Label htmlFor="topic" className="mb-2 block text-sm font-semibold">
              Topic / chapter {imageDataUrl ? "(extra hint, optional)" : "(required if no image)"}
            </Label>
            <Input
              id="topic"
              placeholder="e.g. Rotational Motion, Coordination Compounds, Integration"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="bg-background"
            />
          </div>

          {/* Exam level */}
          <div className="mb-6">
            <Label className="mb-2 block text-sm font-semibold">Exam level</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {EXAM_LEVELS.map((lvl) => (
                <button
                  key={lvl}
                  onClick={() => setExamLevel(lvl)}
                  className={`rounded-lg border px-3 py-2.5 text-sm font-semibold transition ${
                    examLevel === lvl
                      ? "border-primary bg-primary text-primary-foreground shadow-sm"
                      : "border-border bg-background hover:border-primary/40"
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>
          </div>

          {/* Question type */}
          <div className="mb-6">
            <Label className="mb-2 block text-sm font-semibold">Question type</Label>
            <div className="grid grid-cols-3 gap-2">
              {Q_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => setQuestionType(t)}
                  className={`rounded-lg border px-3 py-2.5 text-sm font-semibold transition ${
                    questionType === t
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background hover:border-primary/40"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Count */}
          <div className="mb-6">
            <div className="mb-2 flex items-center justify-between">
              <Label className="text-sm font-semibold">Number of questions</Label>
              <span className="font-display text-2xl font-bold tabular-nums text-primary">{count}</span>
            </div>
            <input
              type="range"
              min={5}
              max={15}
              step={1}
              value={count}
              onChange={(e) => setCount(parseInt(e.target.value))}
              className="w-full accent-[var(--primary)]"
            />
            <div className="mt-1 flex justify-between text-xs text-muted-foreground">
              <span>5</span>
              <span>15</span>
            </div>
          </div>

          {/* Mode */}
          <div className="mb-7">
            <Label className="mb-2 block text-sm font-semibold">Mode</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setMode("practice")}
                className={`rounded-lg border p-3 text-left transition ${
                  mode === "practice"
                    ? "border-primary bg-primary/5 ring-2 ring-primary/30"
                    : "border-border bg-background hover:border-primary/40"
                }`}
              >
                <div className="text-sm font-bold">Practice</div>
                <div className="text-xs text-muted-foreground">All questions + instant solutions</div>
              </button>
              <button
                onClick={() => setMode("mock")}
                className={`rounded-lg border p-3 text-left transition ${
                  mode === "mock"
                    ? "border-primary bg-primary/5 ring-2 ring-primary/30"
                    : "border-border bg-background hover:border-primary/40"
                }`}
              >
                <div className="text-sm font-bold">Mock Test</div>
                <div className="text-xs text-muted-foreground">90s per Q, score at the end</div>
              </button>
            </div>
          </div>

          <Button
            onClick={onGenerate}
            disabled={loading}
            size="lg"
            className="h-12 w-full text-base font-bold"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Generating questions...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-5 w-5" /> Generate {count} questions
              </>
            )}
          </Button>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            <ImageIcon className="mr-1 inline h-3 w-3" />
            Powered by AI vision — your image stays private.
          </p>
        </section>

        <footer className="mt-10 text-center text-xs text-muted-foreground">
          Built for serious aspirants. Concept-first, not memorization.
        </footer>
      </main>
    </div>
  );
}
