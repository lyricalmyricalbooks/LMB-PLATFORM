import { Component, type ReactNode } from "react";
import { ErrorState } from "./riso/components";
import { isStaleChunkError, reloadForNewBuild } from "../lib/staleBuild";

/**
 * Keeps one broken admin page from taking the whole admin down: the menu and header stay, and the page area shows a
 * "try again" box. Opening another page (a new `resetKey`) clears it. A page whose code could not be fetched after an
 * update reloads once to pick up the new version (lib/staleBuild.ts).
 */
export class AdminPageBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("Admin page error:", error);
    if (isStaleChunkError(error)) reloadForNewBuild();
  }

  componentDidUpdate(previous: Readonly<{ resetKey: string }>) {
    if (this.state.error && previous.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    const stale = isStaleChunkError(this.state.error);
    return (
      <ErrorState
        title={stale ? "The admin was updated" : "This page hit a problem"}
        description={stale
          ? "Reload to open the newest version. Nothing you saved is lost."
          : "Your other pages still work. Try again, or open another page from the menu."}
        onRetry={() => (stale ? window.location.reload() : this.setState({ error: null }))}
      />
    );
  }
}
