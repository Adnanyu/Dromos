import * as TaskManager from 'expo-task-manager'
import * as Location from 'expo-location'
import { workoutTracker }   from '../tracking/tracker'
import { liveSurface }      from '../tracking/liveSurface'
import { liveSocket }       from '../api/websocket'
import { useActivityStore } from '../store/activity.store'

export const WORKOUT_LOCATION_TASK = 'dromos-workout-location'

// Task definitions must run at module load, before the app registers — this
// file is imported for its side effect at the top of app/index.tsx.
TaskManager.defineTask(WORKOUT_LOCATION_TASK, async ({ data, error }) => {
  if (error || !data) return
  const { locations } = data as { locations: Location.LocationObject[] }
  const store = useActivityStore.getState()

  for (const loc of locations) {
    const accepted = workoutTracker.ingest({
      latitude:  loc.coords.latitude,
      longitude: loc.coords.longitude,
      accuracy:  loc.coords.accuracy,
      speed:     loc.coords.speed,
      heading:   loc.coords.heading,
      altitude:  loc.coords.altitude,
      timestamp: loc.timestamp,
    })
    if (!accepted) continue

    liveSocket.pushPoint({
      lat:         accepted.position.lat,
      lng:         accepted.position.lng,
      elevation_m: loc.coords.altitude ?? undefined,
      accuracy_m:  loc.coords.accuracy ?? undefined,
      speed_kmh:   loc.coords.speed != null ? loc.coords.speed * 3.6 : undefined,
      ts:          loc.timestamp,
    })

    store.updateStats(
      accepted.heading != null
        ? { current_position: accepted.position, heading: accepted.heading }
        : { current_position: accepted.position },
    )
  }

  // Keep the lock screen / Dynamic Island current while the app UI is asleep.
  liveSurface.update(
    workoutTracker.distanceM,
    workoutTracker.windowPace(),
    store.stats.off_route,
  )
})

/**
 * Begin OS-level background location delivery into WORKOUT_LOCATION_TASK.
 * The foreground watcher can stay subscribed — the tracker dedupes fixes by
 * timestamp, so double delivery is harmless.
 */
export async function startBackgroundLocation(): Promise<void> {
  await Location.startLocationUpdatesAsync(WORKOUT_LOCATION_TASK, {
    accuracy:                         Location.Accuracy.BestForNavigation,
    distanceInterval:                 5,
    deferredUpdatesInterval:          1_000,
    pausesUpdatesAutomatically:       false,
    activityType:                     Location.ActivityType.Fitness,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'Dromos — workout in progress',
      notificationBody:  'Tracking your route and pace',
      notificationColor: '#0d7c66',
    },
  })
}

export async function stopBackgroundLocation(): Promise<void> {
  const started = await Location.hasStartedLocationUpdatesAsync(WORKOUT_LOCATION_TASK).catch(() => false)
  if (started) {
    await Location.stopLocationUpdatesAsync(WORKOUT_LOCATION_TASK).catch(() => {})
  }
}
