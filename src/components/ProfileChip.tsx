import { useState } from "react";
import { LogOut, User } from "lucide-react";
import { clearProfile, useProfile } from "@/lib/profile";

/**
 * Small "Welcome, Dhruva (NEET Student)" chip with a tiny menu to reset
 * the local profile. Renders nothing until profile is loaded (no flash).
 */
export function ProfileChip() {
  const { profile, ready } = useProfile();
  const [open, setOpen] = useState(false);

  if (!ready || !profile) return null;

  const subtitle =
    profile.profession === "Student"
      ? `${profile.exam} Student`
      : profile.profession === "Lecturer"
      ? `${profile.exam} Lecturer`
      : profile.exam;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full border border-border bg-background/70 px-2.5 py-1.5 text-left transition hover:border-primary/40 hover:bg-secondary/60"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <User className="h-3.5 w-3.5" />
        </span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-[12px] font-semibold">
            Welcome, {profile.name}
          </span>
          <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">
            {subtitle}
          </span>
        </span>
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            role="menu"
            className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-xl border border-border bg-card shadow-lg"
          >
            <div className="border-b border-border px-3 py-2.5">
              <div className="text-sm font-bold">{profile.name}</div>
              <div className="text-[11px] text-muted-foreground">{subtitle}</div>
              {profile.college && (
                <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {profile.college}
                </div>
              )}
            </div>
            <button
              onClick={() => {
                if (confirm("Reset your profile? You'll be asked for details again.")) {
                  clearProfile();
                  setOpen(false);
                }
              }}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-secondary/60"
            >
              <LogOut className="h-4 w-4" />
              Reset profile
            </button>
          </div>
        </>
      )}
    </div>
  );
}
