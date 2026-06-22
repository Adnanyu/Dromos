import { useState, useEffect, useRef, useCallback } from 'react'
import * as Location from 'expo-location'
import type { LatLng } from '../types/api'

export interface LocationState {
  coords:     LatLng | null
  accuracy:   number | null
  altitude:   number | null
  speed:      number | null
  hasPermission: boolean
  error:      string | null
}

/** Request foreground location permission once. */
export async function requestLocationPermission(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync()
  return status === 'granted'
}

/** Request background location permission (needed during active workouts). */
export async function requestBackgroundPermission(): Promise<boolean> {
  const { status } = await Location.requestBackgroundPermissionsAsync()
  return status === 'granted'
}

/** Get the device's current position once. */
export async function getCurrentPosition(): Promise<LatLng | null> {
  try {
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    })
    return { lat: pos.coords.latitude, lng: pos.coords.longitude }
  } catch {
    return null
  }
}

/**
 * Hook that continuously watches the device's GPS position.
 * Pass `enabled=false` to stop tracking (e.g. when activity is paused).
 */
export function useWatchPosition(
  enabled: boolean,
  onPosition: (coords: LatLng, altitude: number | null, speed: number | null) => void
) {
  const subRef = useRef<Location.LocationSubscription | null>(null)

  useEffect(() => {
    if (!enabled) {
      subRef.current?.remove()
      subRef.current = null
      return
    }

    let cancelled = false

    Location.watchPositionAsync(
      {
        accuracy:          Location.Accuracy.BestForNavigation,
        timeInterval:      1_000,   // minimum 3 s between updates
        distanceInterval:  1,       // or 5 m moved
      },
      (loc) => {
        if (cancelled) return
        onPosition(
          { lat: loc.coords.latitude, lng: loc.coords.longitude },
          loc.coords.altitude,
          loc.coords.speed != null ? loc.coords.speed * 3.6 : null  // m/s → km/h
        )
      }
    ).then((sub) => {
      if (cancelled) sub.remove()
      else subRef.current = sub
    })

    return () => {
      cancelled = true
      subRef.current?.remove()
      subRef.current = null
    }
  }, [enabled, onPosition])
}

/** Simple hook to get the current position once on mount. */
export function useCurrentLocation() {
  const [location, setLocation] = useState<LatLng | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    const granted = await requestLocationPermission()
    if (!granted) { setError('Location permission denied'); setLoading(false); return }
    const pos = await getCurrentPosition()
    setLocation(pos)
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  return { location, loading, error, refresh }
}
