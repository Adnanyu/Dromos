import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import * as WorkoutActivity from '../../modules/expo-workout-activity'

// ActivityKit rate-limits updates and the Live Activity timer ticks natively,
// so ~one content update per 5s is plenty for distance/pace.
const UPDATE_THROTTLE_MS = 5_000

type Surface = 'live-activity' | 'system-notification' | 'none'

/**
 * Picks the best lock-screen progress surface the device supports:
 *
 * 1. iOS 16.2+ with Live Activities enabled → ActivityKit Live Activity
 *    (Dynamic Island on supported iPhones, lock-screen card otherwise —
 *    iOS chooses automatically per device).
 * 2. Android → nothing here: the foreground-service notification created by
 *    `startLocationUpdatesAsync` IS the persistent progress surface.
 * 3. Older iOS / Live Activities disabled → a static local notification
 *    marking the workout in progress, dismissed when it ends.
 */
class LiveSurface {
  private surface: Surface = 'none'
  private lastUpdateAt = 0
  private notificationId: string | null = null

  async start(activityType: string, startedAtMs: number): Promise<void> {
    this.lastUpdateAt = 0

    if (Platform.OS === 'ios' && WorkoutActivity.areActivitiesEnabled()) {
      const started = await WorkoutActivity.startActivity(activityType, startedAtMs)
      if (started) {
        this.surface = 'live-activity'
        return
      }
    }

    if (Platform.OS !== 'ios') {
      this.surface = 'none'
      return
    }

    // iOS fallback tier: static "in progress" notification. iOS offers no
    // sanctioned way to silently mutate a delivered notification, so this
    // stays static rather than pretending to be live.
    try {
      const perm = await Notifications.requestPermissionsAsync()
      if (perm.granted) {
        this.notificationId = await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Workout in progress',
            body:  'Dromos is tracking your route. Open the app for live stats.',
          },
          trigger: null,
        })
        this.surface = 'system-notification'
      }
    } catch {
      this.surface = 'none'
    }
  }

  /** Throttled push of the latest stats to the Live Activity. */
  update(distanceM: number, paceSecPerKm: number, offRoute: boolean): void {
    if (this.surface !== 'live-activity') return
    const now = Date.now()
    if (now - this.lastUpdateAt < UPDATE_THROTTLE_MS) return
    this.lastUpdateAt = now
    void WorkoutActivity.updateActivity(distanceM, paceSecPerKm, offRoute)
  }

  async end(distanceM: number, paceSecPerKm: number): Promise<void> {
    if (this.surface === 'live-activity') {
      await WorkoutActivity.endActivity(distanceM, paceSecPerKm)
    }
    if (this.notificationId) {
      await Notifications.dismissNotificationAsync(this.notificationId).catch(() => {})
      this.notificationId = null
    }
    this.surface = 'none'
  }
}

export const liveSurface = new LiveSurface()
