import { Component, type ReactNode } from "react";

interface State {
  hasError: boolean;
  message?: string;
}

/**
 * Global error boundary — wraps the entire app at the root. Prevents any
 * unexpected render error from showing the user a blank screen or a raw
 * stack trace. Logs the underlying error for debugging.
 */
export class GlobalErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error?.message };
  }

  componentDidCatch(error: Error, info: unknown) {
    // Never show the raw error to the user — log it for engineers only.
    console.error("App crash caught by GlobalErrorBoundary:", error, info);
  }

  reset = () => {
    this.setState({ hasError: false, message: undefined });
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="paper-card max-w-md rounded-2xl p-6 text-center">
          <div className="font-display text-xl font-bold">Something went wrong.</div>
          <p className="mt-2 text-sm text-muted-foreground">
            We hit an unexpected hiccup. You can refresh the page or try again.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <button
              onClick={this.reset}
              className="rounded-md border border-border px-4 py-2 text-sm font-semibold hover:bg-secondary"
            >
              Try again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
