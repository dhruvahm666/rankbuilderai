// Server-only helper for extracting the client IP from the current request.
// Lives in a .server.ts file so the import-protection plugin can keep
// `@tanstack/react-start/server` out of the client bundle.
import { getRequest, getRequestHeader } from "@tanstack/react-start/server";

export function getClientIp(): string {
  try {
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
