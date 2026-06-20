import { Component, type ReactNode } from "react";

interface GraphCanvasErrorBoundaryProps {
  children: ReactNode;
}

interface GraphCanvasErrorBoundaryState {
  error: string | null;
}

export class GraphCanvasErrorBoundary extends Component<
  GraphCanvasErrorBoundaryProps,
  GraphCanvasErrorBoundaryState
> {
  state: GraphCanvasErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): GraphCanvasErrorBoundaryState {
    return {
      error: error instanceof Error ? error.message : String(error),
    };
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="tome-graph-error">
          Graph render error: {this.state.error}
        </div>
      );
    }

    return this.props.children;
  }
}
