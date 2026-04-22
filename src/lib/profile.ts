import { useEffect, useState } from "react";

export type Profession = "Student" | "Lecturer" | "Other";
export type ExamPrep = "NEET" | "JEE" | "KCET";

export interface UserProfile {
  name: string;
  profession: Profession;
  exam: ExamPrep;
  college: string;
  createdAt: number;
}

const KEY = "shd:user-profile:v1";

export function loadProfile(): UserProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as UserProfile;
    if (!p.name || !p.profession || !p.exam) return null;
    return p;
  } catch {
    return null;
  }
}

export function saveProfile(p: UserProfile) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(p));
  window.dispatchEvent(new CustomEvent("shd:profile-updated"));
}

export function clearProfile() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent("shd:profile-updated"));
}

/** React hook — returns { profile, ready }. `ready` flips true after hydration. */
export function useProfile() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setProfile(loadProfile());
    setReady(true);
    const onUpdate = () => setProfile(loadProfile());
    window.addEventListener("shd:profile-updated", onUpdate);
    window.addEventListener("storage", onUpdate);
    return () => {
      window.removeEventListener("shd:profile-updated", onUpdate);
      window.removeEventListener("storage", onUpdate);
    };
  }, []);

  return { profile, ready };
}
