/**
 * Top-level error boundary for the showcase.
 *
 * Replaces silent black screens — when a child route or component throws
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
      <div
        className="min-h-screen flex items-center justify-center p-6 text-white"
        style={{ background: "#08080C" }}
      >
        <div
          className="max-w-2xl w-full rounded-2xl p-6"
          style={{ background: "#111114", border: "1px solid rgba(248,113,113,0.25)" }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.35)" }}
            >
              <AlertTriangle size={18} className="text-red-400" />
            </div>
            <div>
              <h1 className="font-bold text-lg">Something broke</h1>
              <p className="text-white/45 text-xs mt-0.5">
                {this.props.fallbackLabel ?? "A component crashed during render."}
              </p>
            </div>
          </div>

          <pre
            className="text-xs font-mono p-3 rounded-lg overflow-auto max-h-64 mb-4"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <span className="text-red-300">{error.name}: {error.message}</span>
            {info?.componentStack && (
              <>
                {"\n\n"}
                <span className="text-white/40">{info.componentStack.trim()}</span>
              </>
            )}
            {error.stack && (
              <>
                {"\n\n"}
                <span className="text-white/30">{error.stack}</span>
              </>
            )}
          </pre>

          <div className="flex gap-2">
            <button
              onClick={this.reset}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
              style={{ background: "white", color: "black" }}
            >
              <RotateCcw size={13} /> Reset
            </button>
            <button
              onClick={() => window.location.reload()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
            >
              Reload page
            </button>
          </div>
        </div>
      </div>
    );
  }
}
