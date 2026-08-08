/**
 * OmniMath Pro — useAnimVersion
 *
 * React binding for the parameter-playback animation version
 * (`@/lib/engine/mathInstance`). Returns a monotonically increasing number
 * that changes whenever a parameter playback animation advances a frame.
 *
 * Only components that must redraw live during parameter animation
 * (currently just Plot2DCanvas) subscribe here. This keeps the per-frame
 * React footprint tiny: DemosPanel / AdvancedPanel / FacetGrid / 3D panels
 * do NOT re-render on animation ticks (they only re-render on real
 * scopeVersion changes), which is what enables Desmos-smooth playback.
 */

'use client';

import { useSyncExternalStore } from 'react';
import { getAnimVersion, subscribeAnim } from '@/lib/engine/mathInstance';

// Server snapshot: version is always 0 during SSR / static export.
const getServerSnapshot = () => 0;

export function useAnimVersion(): number {
  return useSyncExternalStore(subscribeAnim, getAnimVersion, getServerSnapshot);
}
