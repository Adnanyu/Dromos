import { useAuthStore } from '../store/auth.store'
import {
  formatDistance,
  formatDistanceShort,
  formatPace,
  formatSpeed,
  formatElevation,
  formatDuration,
  formatDurationWords,
} from '../utils/format'
import type { Units } from '../types/api'

/** Returns the authenticated user's unit preference (defaults to metric). */
export function useUnits(): Units {
  return useAuthStore(s => s.user?.units ?? 'metric')
}

/**
 * Returns format functions pre-bound to the user's preferred unit system.
 *
 * Use this everywhere a measurement is displayed so the preference is
 * respected automatically without passing `units` manually each time.
 *
 *   const { distance, pace, elevation } = useFormatters()
 *   distance(5000)   // "5.00 km" or "3.11 mi" depending on preference
 */
export function useFormatters() {
  const units = useUnits()

  return {
    units,
    distance:      (metres: number | null | undefined)   => formatDistance(metres, units),
    distanceShort: (metres: number | null | undefined)   => formatDistanceShort(metres, units),
    pace:          (secPerKm: number | null | undefined) => formatPace(secPerKm, units),
    speed:         (kmh: number | null | undefined)      => formatSpeed(kmh, units),
    elevation:     (metres: number | null | undefined)   => formatElevation(metres, units),
    // Duration has no unit variant — kept here for a single import
    duration:      (seconds: number | null | undefined)  => formatDuration(seconds),
    durationWords: (seconds: number | null | undefined)  => formatDurationWords(seconds),
  } as const
}
