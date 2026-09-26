import { TriangleAlert } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  failed: boolean;
}

/**
 * Last line of defence: if rendering throws, show a calm recovery screen instead of a
 * blank page. Videos live only in memory, so reloading starts fresh.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled interface error', error, info.componentStack);
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="fatal" role="alert">
        <div className="fatal__card glass">
          <TriangleAlert size={34} strokeWidth={1.7} className="fatal__icon" />
          <h1 className="t-title2">Something went wrong</h1>
          <p className="t-subhead t-secondary">
            Break It Down hit an unexpected problem. Your videos never leave your device, so reloading is safe, though
            you’ll need to open your video again.
          </p>
          <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </div>
    );
  }
}
