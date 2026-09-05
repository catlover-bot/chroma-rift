import { Component, type ErrorInfo, type PropsWithChildren } from 'react';

import type { CanvasLifecycle } from './canvasLifecycle';

/** Native R3F forwards reconciler errors by throwing from its RN Canvas. */
export class CanvasFailureBoundary extends Component<PropsWithChildren<{ lifecycle: CanvasLifecycle }>, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.lifecycle.fail(error, 'scene mount', info.componentStack);
  }
  render() { return this.state.failed ? null : this.props.children; }
}
