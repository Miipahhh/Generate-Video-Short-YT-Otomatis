import { useSyncExternalStore } from 'react';
import { getStudioState, subscribeStudio } from './studioStore.js';

/** Baca state Studio yang hidup di luar React — otomatis re-render saat state berubah. */
export function useStudioState() {
  return useSyncExternalStore(subscribeStudio, getStudioState);
}
