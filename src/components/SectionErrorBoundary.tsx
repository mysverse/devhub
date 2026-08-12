"use client";

import { Component, type ReactNode } from "react";
import SectionUnavailable from "@/components/SectionUnavailable";

/**
 * Catches a render failure in one page section.
 *
 * A class component because React error boundaries have no hook equivalent,
 * and the repo has no error-boundary dependency to reach for. It renders the
 * same SectionUnavailable card the admin board uses for a failed data load, so
 * "this part is broken" looks the same everywhere.
 *
 * Only the digest survives to the client in production, which is deliberate —
 * it is also the value that matches the server log line.
 */
export default class SectionErrorBoundary extends Component<
  { children: ReactNode; title?: string },
  { failed: boolean; digest?: string }
> {
  state = { failed: false, digest: undefined as string | undefined };

  static getDerivedStateFromError(error: Error & { digest?: string }) {
    return { failed: true, digest: error.digest };
  }

  componentDidCatch(error: Error & { digest?: string }) {
    console.error(
      `Section render error${this.props.title ? ` (${this.props.title})` : ""}:`,
      error.digest ?? error,
    );
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <SectionUnavailable
        title={
          this.props.title
            ? `${this.props.title} couldn't be loaded`
            : "This section couldn't be loaded"
        }
        detail={this.state.digest}
        emptyWarning={false}
      />
    );
  }
}
