/**
 * Top-level error boundary for the showcase.
 *
 * Replaces silent blank screens — when a child route or component throws
 * during render, we surface the error text + stack + a "Reset" button
 * instead of crashing into a blank document. Critical for dev: without
 * this, a single typo anywhere in the tree shows nothing in the DOM.
 */

import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallbackLabel?: string;
}

interface State {
  error: Error | null;
  info: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[showcase] caught error:", error, info);
    this.setState({ info });
  }

  reset = (): void => {
    this.setState({ error: null, info: null });
  };

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    const { error, info } = this.state;

    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
        <div className="w-full max-w-2xl rounded-2xl border border-primary/40 bg-card p-6 shadow-lift">
          <div className="mb-4 flex items-center gap-3">
            <div
              className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/40"
              style={{ background: "var(--accent-dim)" }}
            >
              <AlertTriangle size={18} className="text-primary" />
            </div>
            <div>
              <h1 className="font-display text-lg font-semibold uppercase tracking-tight">Something broke</h1>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {this.props.fallbackLabel ?? "A component crashed during render."}
              </p>
            </div>
          </div>

          <pre className="mb-4 max-h-64 overflow-auto rounded-lg border border-border bg-secondary p-3 font-mono text-xs">
            <span className="text-primary">{error.name}: {error.message}</span>
            {info?.componentStack && (
              <>
                {"\n\n"}
                <span className="text-muted-foreground">{info.componentStack.trim()}</span>
              </>
            )}
            {error.stack && (
              <>
                {"\n\n"}
                <span className="text-muted-foreground/70">{error.stack}</span>
              </>
            )}
          </pre>

          <div className="flex gap-2">
            <button
              onClick={this.reset}
              className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-[var(--accent-soft)]"
            >
              <RotateCcw size={13} /> Reset
            </button>
            <button
              onClick={() => window.location.reload()}
              className="flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
            >
              Reload page
            </button>
          </div>
        </div>
      </div>
    );
  }
}
