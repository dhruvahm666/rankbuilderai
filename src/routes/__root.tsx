import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { useGlobalMathRenderer } from "@/lib/render-math";
import { GlobalErrorBoundary } from "@/components/GlobalErrorBoundary";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground font-display">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Student Helper by Dhruva — JEE, NEET & KCET Question Generator" },
      {
        name: "description",
        content:
          "Generate PYQ-style questions for JEE Mains, JEE Advanced, NEET and KCET. Practice mode, mock tests, detailed solutions and PDF download.",
      },
      { name: "author", content: "Dhruva" },
      { property: "og:title", content: "Student Helper by Dhruva — JEE, NEET & KCET Question Generator" },
      { property: "og:description", content: "Exam Ace Pro generates AI-powered exam questions for JEE, NEET, and KCET." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Student Helper by Dhruva — JEE, NEET & KCET Question Generator" },
      { name: "description", content: "Exam Ace Pro generates AI-powered exam questions for JEE, NEET, and KCET." },
      { name: "twitter:description", content: "Exam Ace Pro generates AI-powered exam questions for JEE, NEET, and KCET." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/075706e7-e621-4922-a3b3-f9ec0a5fcb8a/id-preview-7a4f4814--48b865d0-2521-4cae-a34f-f1c9f81fde27.lovable.app-1776781266913.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/075706e7-e621-4922-a3b3-f9ec0a5fcb8a/id-preview-7a4f4814--48b865d0-2521-4cae-a34f-f1c9f81fde27.lovable.app-1776781266913.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "preload",
        as: "font",
        type: "font/woff2",
        href: "https://fonts.gstatic.com/s/fraunces/v38/6NU78FyLNQOQZAnv9bYEvDiIdE9Ea92uemAk_WBq8U_9v0c2Wa0KxC9TeP2Xz5c.woff2",
        crossOrigin: "anonymous",
      },
      {
        rel: "preload",
        as: "font",
        type: "font/woff2",
        href: "https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7W0Q5nw.woff2",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700;9..144,900&family=Inter:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  useGlobalMathRenderer();
  return (
    <GlobalErrorBoundary>
      <Outlet />
      <Toaster richColors position="top-center" />
    </GlobalErrorBoundary>
  );
}
