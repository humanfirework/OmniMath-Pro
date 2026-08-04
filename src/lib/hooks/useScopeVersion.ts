/**
 * OmniMath Pro — useScopeVersion
 *
 * React binding for the shared engine scope (`@/lib/engine/mathInstance`).
 * Returns a monotonically increasing number that changes whenever any
 * user variable is created, updated (console assignment, slider drag),
 * deleted, or the scope is reset / rehydrated.
 *
 * Plot components add the returned value to their sampling `useMemo`
 * dependency list so curves re-sample automatically when variables
 * change — this is what makes Desmos-style sliders drive plots live.
 */

'use client';

import { useSyncExternalStore } from 'react';
import { getScopeVersion, subscribeScope } from '@/lib/engine/mathInstance';

// Server snapshot: version is always 0 during SSR / static export.
const getServerSnapshot = () => 0;

export function useScopeVersion(): number {
  return useSyncExternalStore(subscribeScope, getScopeVersion, getServerSnapshot);
}
