import { Platform } from 'react-native'
import { requireOptionalNativeModule } from 'expo-modules-core'

/**
 * JS bridge to the Dromos workout Live Activity (ActivityKit).
 *
 * `requireOptionalNativeModule` returns null when the native side is absent
 * (Android, or an iOS binary built before this module existed) — every call
 * degrades to a no-op so callers never need platform guards.
 */
const native = Platform.OS === 'ios'
  ? requireOptionalNativeModule<{
      areActivitiesEnabled(): boolean
      start(activityType: string, startedAtMs: number): Promise<boolean>
      update(distanceM: number, paceSecPerKm: number, offRoute: boolean): Promise<void>
      end(distanceM: number, paceSecPerKm: number): Promise<void>
    }>('ExpoWorkoutActivity')
  : null

/** True when this device can show Live Activities (iOS 16.2+, user enabled). */
export function areActivitiesEnabled(): boolean {
  try {
    return native?.areActivitiesEnabled() ?? false
  } catch {
    return false
  }
}

/** Start the workout Live Activity. Resolves false when unsupported. */
export async function startActivity(activityType: string, startedAtMs: number): Promise<boolean> {
  try {
    return (await native?.start(activityType, startedAtMs)) ?? false
  } catch {
    return false
  }
}

export async function updateActivity(distanceM: number, paceSecPerKm: number, offRoute: boolean): Promise<void> {
  try {
    await native?.update(distanceM, paceSecPerKm, offRoute)
  } catch {
    // Live Activity updates are best-effort — never disturb the workout.
  }
}

export async function endActivity(distanceM: number, paceSecPerKm: number): Promise<void> {
  try {
    await native?.end(distanceM, paceSecPerKm)
  } catch {
    // ignore
  }
}
