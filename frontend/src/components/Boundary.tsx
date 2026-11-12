import { Component, type ErrorInfo, type ReactElement, type ReactNode } from "react";

const CHUNK_RECOVERY_KEY = "breaker.chunk-reload";

function reloadStaleChunk(): void {
  try {
    const previous = Number(
      window.sessionStorage.getItem(CHUNK_RECOVERY_KEY) ?? "0",
    );
    if (Date.now() - previous < 15_000) return;
    window.sessionStorage.setItem(CHUNK_RECOVERY_KEY, String(Date.now()));
  } catch {
    return;
  }
  window.location.reload();
}

export async function loadChunk<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (error) {
    reloadStaleChunk();
    throw error;
  }
}

type Props = {
  children: ReactNode;
  fallback: (error: Error, retry: () => void) => ReactElement;
};

type State = { error: Error | null };

export class Boundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (error === null) return this.props.children;

    return this.props.fallback(error, () => this.setState({ error: null }));
  }
}
