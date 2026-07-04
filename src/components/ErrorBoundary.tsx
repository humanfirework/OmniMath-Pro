'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Bug } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (typeof console !== 'undefined') {
      console.error('[ErrorBoundary] caught error:', error, errorInfo);
    }
  }

  handleReload = () => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('omnimath-pro-v2');
        localStorage.removeItem('omnimath-pipeline-v1');
      } catch {
        // ignore
      }
      window.location.reload();
    }
  };

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-background p-6 text-center">
          <div className="grid size-16 place-items-center rounded-full bg-destructive/10">
            <AlertTriangle className="size-8 text-destructive" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-foreground">出现了一个错误</h2>
            <p className="max-w-md text-sm text-muted-foreground">
              应用遇到了意外问题。你可以尝试重试，或重置应用状态后重新加载。
            </p>
          </div>
          {this.state.error && (
            <div className="max-w-md overflow-auto rounded-md border border-border/60 bg-muted/40 p-3 text-left">
              <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                <Bug className="size-3" /> 错误详情
              </div>
              <pre className="font-mono text-[11px] text-foreground/70">
                {this.state.error.message}
              </pre>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Button variant="default" size="sm" onClick={this.handleRetry}>
              重试
            </Button>
            <Button variant="outline" size="sm" onClick={this.handleReload}>
              <RefreshCw className="mr-1.5 size-3.5" />
              重置并重载
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
