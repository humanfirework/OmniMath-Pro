'use client';

import { Workbench } from '@/components/workbench/Workbench';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export default function Home() {
  return (
    <ErrorBoundary>
      <Workbench />
    </ErrorBoundary>
  );
}
