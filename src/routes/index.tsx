import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Upload,
  Sparkles,
  BookOpen,
  X,
  ImageIcon,
  Loader2,
  Atom,
  FlaskConical,
  Sigma,
  Leaf,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { generateInBatches, type BatchProgress } from "@/lib/generate-batches";
import { useSession } from "@/lib/session";
import { useProfile } from "@/lib/profile";
import { ProfileGate } from "@/components/ProfileGate";
import { ProfileChip } from "@/components/ProfileChip";
import type { ExamLevel, Mode, QuestionType, Subject } from "@/lib/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Student Helper by Dhruva — JEE, NEET & KCET PYQ Generator" },
      {
        name: "description",
        content:
          "Pick Physics, Chemistry, Maths or Biology. Upload an image or type a topic. Get exam-grade PYQ-style questions with detailed solutions.",
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

interface SubjectMeta {
  name: Subject;
  Icon: typeof Atom;
  bg: string; // gradient bg classes
  ring: string;
  text: string;
  chip: string;
  examDefault: ExamLevel;
}

const SUBJECTS: SubjectMeta[] = [
  {
    name: "Physics",
    Icon: Atom,
    bg: "from-sky-500/15 to-sky-600/5",
    ring: "ring-sky-500/40",
    text: "text-sky-700 dark:text-sky-300",
    chip: "bg-sky-500",
    examDefault: "JEE Mains",
  },
  {
    name: "Chemistry",
    Icon: FlaskConical,
    bg: "from-emerald-500/15 to-emerald-600/5",
    ring: "ring-emerald-500/40",
    text: "text-emerald-700 dark:text-emerald-300",
    chip: "bg-emerald-500",
    examDefault: "JEE Mains",
  },
  {
    name: "Maths",
    Icon: Sigma,
    bg: "from-rose-500/15 to-rose-600/5",
    ring: "ring-rose-500/40",
    text: "text-rose-700 dark:text-rose-300",
    chip: "bg-rose-500",
    examDefault: "JEE Mains",
  },
  {
    name: "Biology",
    Icon: Leaf,
    bg: "from-amber-500/15 to-amber-600/5",
    ring: "ring-amber-500/40",
    text: "text-amber-700 dark:text-amber-300",
    chip: "bg-amber-500",
    examDefault: "NEET",
  },
];

function Home() {
  const navigate = useNavigate();
  const setSession = useSession((s) => s.setSession);
  const { profile } = useProfile();

  const [subject, setSubject] = useState<Subject | null>(null);
  const [examLevel, setExamLevel] = useState<ExamLevel>("JEE Mains");
  const [questionType, setQuestionType] = useState<QuestionType>("MCQ");
  const [count, setCount] = useState(10);
  const [mode, setMode] = useState<Mode>("practice");
  const [topic, setTopic] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageName, setImageName] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Pre-select exam level once based on saved profile preference
  const didPreselect = useRef(false);
  useEffect(() => {
    if (didPreselect.current || !profile) return;
    didPreselect.current = true;
    if (profile.exam === "NEET") setExamLevel("NEET");
    else if (profile.exam === "KCET") setExamLevel("KCET");
    else if (profile.exam === "JEE") setExamLevel("JEE Mains");
  }, [profile]);

  function pickSubject(s: SubjectMeta) {
    setSubject(s.name);
    // Sensible default exam for the subject (keeps profile pref if set)
    if (!didPreselect.current) setExamLevel(s.examDefault);
    if (s.name === "Biology") setQuestionType("MCQ");
    setImageDataUrl(null);
    setImageName("");
    setTopic("");
  }

  function pickImage() {
    fileRef.current?.click();
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file (JPG, PNG, or WEBP).");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5 MB.");
      return;
    }
    try {
      const dataUrl = await readAsDataURL(file);
      // sanity check: make sure it's an actual image data URL
      if (!/^data:image\/(png|jpe?g|webp|gif);base64,/.test(dataUrl)) {
        toast.error("Could not read that image. Try another file.");
        return;
      }
      setImageDataUrl(dataUrl);
      setImageName(file.name);
    } catch {
      toast.error("Could not read that image. Try another file.");
    }
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
    setProgress({
      generated: 0,
      total: count,
      batchIndex: 1,
      totalBatches: Math.max(1, Math.ceil(count / 5)),
      attempt: 1,
    });

    try {
      const res = await generateInBatches(
        {
          examLevel,
          questionType,
          count,
          topic: topic.trim() || undefined,
          imageDataUrl: imageDataUrl || undefined,
          subject: subject || undefined,
        },
        (p) => setProgress(p),
      );

      if (res.questions.length === 0) {
        toast.error(res.error || "Something went wrong. Please retry.", {
          action: { label: "Retry", onClick: () => onGenerate() },
        });
        return;
      }

      if (res.error) {
        // Partial success — let the user know but continue with what we have
        toast.warning(
          `Got ${res.questions.length} of ${count} questions. ${res.error}`,
        );
      }

      setSession({
        questions: res.questions,
        examLevel,
        questionType,
        mode,
        topic: topic.trim(),
        subject: subject || undefined,
      });
      navigate({ to: mode === "mock" ? "/mock" : "/practice" });
    } catch {
      toast.error("Something went wrong. Please retry.", {
        action: { label: "Retry", onClick: () => onGenerate() },
      });
    } finally {
      setLoading(false);
      setProgress(null);
    }
  }

  const activeMeta = subject ? SUBJECTS.find((s) => s.name === subject)! : null;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-border/60">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <button
            onClick={() => setSubject(null)}
            className="flex items-center gap-2 text-left"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <BookOpen className="h-5 w-5" />
            </div>
            <div className="leading-tight">
              <div className="font-display text-lg font-bold">Student Helper</div>
              <div className="text-xs text-muted-foreground">by Dhruva</div>
            </div>
          </button>
          <ProfileChip />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-10 md:py-14">
        {/* Hero */}
        <section className="mb-8 md:mb-10">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border bg-secondary/60 px-3 py-1 text-xs font-medium text-secondary-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            PYQ-style questions, generated for you
          </div>
          <h1 className="font-display text-4xl font-black leading-[1.05] tracking-tight text-balance md:text-6xl">
            Master concepts the <span className="italic text-primary">examiners</span> love to repeat.
          </h1>
          <p className="mt-4 max-w-2xl text-muted-foreground md:text-lg">
            {subject
              ? `${subject} • Upload a chapter image or type a topic, and we'll build an exam-grade question set.`
              : "Pick a subject to get started. Each subject has its own focused question generator."}
          </p>
        </section>

        {/* Subject cards */}
        <section className="mb-8">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
            {SUBJECTS.map((s) => {
              const isActive = subject === s.name;
              const Icon = s.Icon;
              return (
                <button
                  key={s.name}
                  onClick={() => pickSubject(s)}
                  className={`group relative overflow-hidden rounded-2xl border bg-gradient-to-br ${s.bg} p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md ${
                    isActive
                      ? `border-transparent ring-2 ${s.ring} shadow-md`
                      : "border-border"
                  }`}
                >
                  <div
                    className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-sm ${s.chip}`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className={`font-display text-lg font-bold ${s.text}`}>
                    {s.name}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {s.name === "Biology"
                      ? "NEET-focused"
                      : s.name === "Maths"
                        ? "JEE & KCET"
                        : "All exams"}
                  </div>
                </button>
              );
            })}
          </div>
          {!subject && (
            <p className="mt-3 text-center text-xs text-muted-foreground">
              ↑ Tap a subject to open its generator
            </p>
          )}
        </section>

        {/* Configurator — only shows once a subject is selected */}
        {subject && activeMeta && (
          <section className="paper-card rounded-2xl p-5 md:p-8">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-xl text-white ${activeMeta.chip}`}
                >
                  <activeMeta.Icon className="h-5 w-5" />
                </div>
                <div>
                  <div className={`font-display text-xl font-bold ${activeMeta.text}`}>
                    {subject}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Questions will be generated only from {subject}.
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSubject(null)}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-secondary"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Change
              </button>
            </div>

            {/* Image upload */}
            <div className="mb-6">
              <Label className="mb-2 block text-sm font-semibold">
                Reference image (optional)
              </Label>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={onFile}
              />
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
                      AI will identify the {subject.toLowerCase()} concept and stay on-topic.
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
                      Textbook page, notes, or diagram (JPG / PNG / WEBP, max 5 MB)
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
                placeholder={topicPlaceholder(subject)}
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
                <span className="font-display text-2xl font-bold tabular-nums text-primary">
                  {count}
                </span>
              </div>
              <input
                type="range"
                min={5}
                max={30}
                step={1}
                value={count}
                onChange={(e) => setCount(parseInt(e.target.value))}
                className="w-full accent-[var(--primary)]"
              />
              <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                <span>5</span>
                <span>30</span>
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
                  <div className="text-xs text-muted-foreground">
                    All questions + instant solutions
                  </div>
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
                  <Sparkles className="mr-2 h-5 w-5" /> Generate {count} {subject} questions
                </>
              )}
            </Button>
            <p className="mt-3 text-center text-xs text-muted-foreground">
              <ImageIcon className="mr-1 inline h-3 w-3" />
              Powered by AI vision — your image stays private.
            </p>
          </section>
        )}

        <footer className="mt-10 text-center text-xs text-muted-foreground">
          Built for serious aspirants. Concept-first, not memorization.
        </footer>
      </main>
    </div>
  );
}

function topicPlaceholder(subject: Subject): string {
  switch (subject) {
    case "Physics":
      return "e.g. Rotational Motion, Electromagnetic Induction, Optics";
    case "Chemistry":
      return "e.g. Coordination Compounds, Chemical Kinetics, Aldehydes & Ketones";
    case "Maths":
      return "e.g. Definite Integration, Probability, Conic Sections";
    case "Biology":
      return "e.g. Human Reproduction, Photosynthesis, Genetics";
  }
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
