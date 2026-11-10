import { Component, type ErrorInfo, type ReactElement, type ReactNode } from "react";

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
