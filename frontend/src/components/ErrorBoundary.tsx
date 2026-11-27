import { Component, type ReactNode } from "react";
import { Button, Eyebrow } from "./ui";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  override render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="boot-screen boot-screen--error" role="alert">
        <Eyebrow>THE SHELVES NEED A MOMENT</Eyebrow>
        <h1>This page couldn’t be opened.</h1>
        <p>Refresh to try again.</p>
        <Button className="button button--primary" onClick={() => window.location.reload()} type="button">
          Refresh page
        </Button>
      </main>
    );
  }
}
