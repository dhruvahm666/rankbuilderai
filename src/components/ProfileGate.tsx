import { useState } from "react";
import { toast } from "sonner";
import { GraduationCap, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  saveProfile,
  useProfile,
  type ExamPrep,
  type Profession,
  type TeachSubject,
} from "@/lib/profile";

const PROFESSIONS: Profession[] = ["Student", "Lecturer", "Other"];
const STUDENT_GOALS: { label: string; value: ExamPrep }[] = [
  { label: "KCET", value: "KCET" },
  { label: "NEET", value: "NEET" },
  { label: "JEE Mains", value: "JEE" },
  { label: "JEE Adv.", value: "JEE" },
];
const TEACH_SUBJECTS: TeachSubject[] = ["Physics", "Chemistry", "Maths", "Biology"];

/**
 * Blocks the UI until the user has filled in their one-time profile.
 * Reads/writes only localStorage — does not touch any other app state.
 */
export function ProfileGate({ children }: { children: React.ReactNode }) {
  const { profile, ready } = useProfile();

  // Avoid SSR/hydration flash
  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!profile) return <ProfileSetup />;

  return <>{children}</>;
}

function ProfileSetup() {
  const [name, setName] = useState("");
  const [profession, setProfession] = useState<Profession>("Student");
  // Student goal — one of NEET / JEE / KCET (used for app pre-selection)
  const [goal, setGoal] = useState<ExamPrep>("NEET");
  // Lecturer's teaching subject
  const [teaches, setTeaches] = useState<TeachSubject>("Physics");
  const [college, setCollege] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedCollege = college.trim();

    if (trimmedName.length < 2) {
      toast.error("Please enter your name (min 2 characters).");
      return;
    }
    if (trimmedName.length > 60) {
      toast.error("Name must be under 60 characters.");
      return;
    }
    if (trimmedCollege.length > 120) {
      toast.error("College name must be under 120 characters.");
      return;
    }

    setSubmitting(true);
    saveProfile({
      name: trimmedName,
      profession,
      // For Lecturers we still store an exam preference (defaults to JEE) for back-compat
      exam: profession === "Student" ? goal : "JEE",
      teaches: profession === "Lecturer" ? teaches : undefined,
      college: trimmedCollege,
      createdAt: Date.now(),
    });
    toast.success(`Welcome, ${trimmedName}!`);
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="paper-card w-full max-w-md rounded-2xl p-6 md:p-8">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <GraduationCap className="h-5 w-5" />
          </div>
          <div>
            <div className="font-display text-xl font-bold leading-tight">
              Welcome to Student Helper
            </div>
            <div className="text-xs text-muted-foreground">
              A quick one-time setup — by Dhruva
            </div>
          </div>
        </div>

        <p className="mb-5 text-sm text-muted-foreground">
          Tell us a little about you so we can personalise your experience.
          You won't see this screen again on this device.
        </p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label htmlFor="pf-name" className="mb-1.5 block text-sm font-semibold">
              Name
            </Label>
            <Input
              id="pf-name"
              autoFocus
              autoComplete="name"
              maxLength={60}
              placeholder="e.g. Dhruva"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-background"
            />
          </div>

          <div>
            <Label className="mb-1.5 block text-sm font-semibold">Profession</Label>
            <div className="grid grid-cols-3 gap-2">
              {PROFESSIONS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setProfession(p)}
                  className={`rounded-lg border px-3 py-2.5 text-sm font-semibold transition ${
                    profession === p
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background hover:border-primary/40"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {profession === "Student" && (
            <div>
              <Label className="mb-1.5 block text-sm font-semibold">
                What is your goal?
              </Label>
              <div className="grid grid-cols-2 gap-2">
                {STUDENT_GOALS.map((g) => (
                  <button
                    key={g.label}
                    type="button"
                    onClick={() => setGoal(g.value)}
                    className={`rounded-lg border px-3 py-2.5 text-sm font-semibold transition ${
                      goal === g.value
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background hover:border-primary/40"
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {profession === "Lecturer" && (
            <div>
              <Label className="mb-1.5 block text-sm font-semibold">
                Which subject do you teach?
              </Label>
              <div className="grid grid-cols-2 gap-2">
                {TEACH_SUBJECTS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setTeaches(s)}
                    className={`rounded-lg border px-3 py-2.5 text-sm font-semibold transition ${
                      teaches === s
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background hover:border-primary/40"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="pf-college" className="mb-1.5 block text-sm font-semibold">
              College / School{" "}
              <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="pf-college"
              autoComplete="organization"
              maxLength={120}
              placeholder="e.g. PES University, Bangalore"
              value={college}
              onChange={(e) => setCollege(e.target.value)}
              className="bg-background"
            />
          </div>

          <Button
            type="submit"
            disabled={submitting}
            size="lg"
            className="mt-2 h-12 w-full text-base font-bold"
          >
            <Sparkles className="mr-2 h-5 w-5" />
            Save and Continue
          </Button>
        </form>
      </div>
    </div>
  );
}
