import { Component, type ErrorInfo, type ReactNode } from "react";

type ErrorBoundaryProps = {
  children: ReactNode;
  /** Optional fallback UI. Receives error and reset function. */
  fallback?: (props: { error: Error; resetError: () => void }) => ReactNode;
};

type ErrorBoundaryState = {
  error: Error | null;
  errorInfo: ErrorInfo | null;
};

/**
 * ErrorBoundary — catches React render errors and displays a recovery UI.
 * Prevents the entire app from crashing when a single component fails.
 *
 * Usage:
 *   <ErrorBoundary>
 *     <SomeComponent />
 *   </ErrorBoundary>
 *
 *   <ErrorBoundary fallback={({ error, resetError }) => <div>...</div>}>
 *     <SomeComponent />
 *   </ErrorBoundary>
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });

    // Structured log for debugging
    console.error("[Curator] Uncaught render error:", {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo?.componentStack
    });
  }

  resetError = (): void => {
    this.setState({ error: null, errorInfo: null });
  };

  render(): ReactNode {
    const { error, errorInfo } = this.state;

    if (error) {
      // Custom fallback
      if (this.props.fallback) {
        return this.props.fallback({ error, resetError: this.resetError });
      }

      // Default dark-themed error UI
      return (
        <div style={{
          padding: 24,
          background: "rgba(248,113,113,0.06)",
          border: "1px solid rgba(248,113,113,0.2)",
          borderRadius: 12,
          margin: 16,
          fontFamily: "'Inter', system-ui, sans-serif",
          color: "#f0f0f5"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 20 }}>⚠</span>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "#f87171", margin: 0 }}>
              Something went wrong
            </h3>
          </div>

          <p style={{ fontSize: 12, color: "#9ca3b8", lineHeight: 1.6, marginBottom: 12 }}>
            A component encountered an error. This shouldn't affect other parts of the app.
          </p>

          <details style={{ marginBottom: 12 }}>
            <summary style={{ fontSize: 11, color: "#5c6380", cursor: "pointer", marginBottom: 8 }}>
              Error details
            </summary>
            <pre style={{
              fontSize: 11,
              padding: 12,
              background: "rgba(0,0,0,0.3)",
              borderRadius: 8,
              overflow: "auto",
              maxHeight: 200,
              color: "#f87171",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all"
            }}>
              {error.message}
              {"\n\n"}
              {error.stack}
              {errorInfo?.componentStack ? `\n\nComponent Stack:${errorInfo.componentStack}` : ""}
            </pre>
          </details>

          <button
            onClick={this.resetError}
            style={{
              padding: "8px 16px",
              background: "#6366f1",
              border: "none",
              borderRadius: 8,
              color: "#fff",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: "0 0 12px rgba(99,102,241,0.35)"
            }}
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
