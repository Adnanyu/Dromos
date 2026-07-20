import React, {
  useEffect, useRef, useState, useMemo,
} from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet, Alert,
  Animated, PanResponder, Dimensions,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import * as Location from 'expo-location'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { liveSocket }          from '../../api/websocket'
import { tokenStorage }        from '../../api/client'
import { useUpdateActivity }   from '../../hooks/useActivities'
import { useActivityStore }    from '../../store/activity.store'
import { workoutTracker }      from '../../tracking/tracker'
import { liveSurface }         from '../../tracking/liveSurface'
import { startBackgroundLocation, stopBackgroundLocation } from '../../tasks/backgroundLocation'
import { RouteMap }            from '../../components/route/RouteMap'
import { colors, fontSize, fontWeight, spacing, radius } from '../../theme'
import { formatDuration } from '../../utils/format'
import type { PlanStackParamList } from '../../types/navigation'
import type { GeneratedRoute, GpsPoint } from '../../types/api'

// ── Constants ──────────────────────────────────────────────────────────────
// The sheet is always SHEET_H tall (50 % of screen). In collapsed state it
// slides almost entirely off-screen — only PEEK_H pixels protrude above the
// bottom edge, showing the drag pill + compact stat strip. Pulling up snaps
// it to translateY=0, occupying the full 50 %.
const SCREEN_H    = Dimensions.get('window').height
const SHEET_H     = Math.round(SCREEN_H * 0.50)
const PEEK_H      = 82    // px visible when collapsed (handle + stat strip)
const COLLAPSED_Y = SHEET_H - PEEK_H   // translateY that hides most of sheet
const EXPANDED_Y  = 0                  // translateY when fully open
const SWIPE_THRESH = 36   // px drag needed to trigger snap

// GPS filtering, distance accumulation, and pace live in
// src/tracking/tracker.ts — shared with the background-location task so the
// numbers stay identical whether the app is open or the phone is locked.

// Shortest signed delta (degrees) from `from` to `to`, in [-180, 180].
// Plain subtraction breaks at the compass wraparound: low-pass-filtering
// 359° toward 1° must nudge the arrow 2° clockwise, not swing it 358° the
// long way through south.
function shortestAngleDelta(from: number, to: number): number {
  let d = (to - from) % 360
  if (d > 180) d -= 360
  if (d < -180) d += 360
  return d
}

// ── Pace formatter: seconds-per-km → "M:SS /km" ────────────────────────────
function fmtPace(sPerKm: number): string {
  if (sPerKm <= 0 || !isFinite(sPerKm)) return '--:--'
  const m = Math.floor(sPerKm / 60)
  const s = Math.round(sPerKm % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

// ── Distance formatter: metres → "X.XX km" or "X,XXX m" ───────────────────
function fmtDistance(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(2)} km`
  return `${Math.round(m)} m`
}

// ── Types ──────────────────────────────────────────────────────────────────
type Props = NativeStackScreenProps<PlanStackParamList, 'ActiveActivity'>

// ═══════════════════════════════════════════════════════════════════════════
export function ActiveActivityScreen({ navigation, route }: Props) {
  const { activityId, generatedRoute, activityType } = route.params
  // Subscribe with selectors, not to the whole store: current_position and
  // heading change on every GPS fix / compass event, and routing them through
  // this component would re-render the entire screen at fix cadence. Only
  // LiveTrackingMap (below) subscribes to those; the screen itself only needs
  // the slow-moving server-derived values.
  const elevationGainM = useActivityStore(s => s.stats.elevation_gain_m)
  const offRoute       = useActivityStore(s => s.stats.off_route)
  const setStatus      = useActivityStore(s => s.setStatus)
  const { mutate: updateActivity } = useUpdateActivity(activityId)
  const insets = useSafeAreaInsets()

  const [isPaused,    setIsPaused]   = useState(false)
  const [lockScreenUpdates, setLockScreenUpdates] = useState(false)
  // Live-connection indicator only — tracking is fully on-device, so a lost
  // socket never interrupts the workout; we just tell the user quietly.
  const [wsConnected, setWsConnected] = useState(true)
  const [elapsedSec,  setElapsed]    = useState(0)
  const elapsedRef   = useRef(0)
  const timerRef     = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── On-device tracking state ─────────────────────────────────────────────
  // GPS filtering / distance / pace accumulate in the shared workoutTracker
  // singleton (also fed by the background task). The screen keeps only 1 Hz
  // *display* copies, refreshed by the timer tick.
  const [deviceDistM,  setDeviceDistM]  = useState(0)   // metres accumulated
  const [devicePaceS,  setDevicePaceS]  = useState(0)   // smoothed s/km, 0 = stopped
  const headingRef    = useRef(0)      // low-pass filter state for the compass

  // ── Activity colour ──────────────────────────────────────────────────────
  const activityColor = useMemo(() => ({
    running: colors.running,
    cycling: colors.cycling,
    hiking:  colors.hiking,
  }[activityType] ?? colors.primary), [activityType])

  // ─────────────────────────────────────────────────────────────────────────
  // WebSocket — server handles route-deviation, elevation, off-route alerts.
  // Distance and pace are now computed on-device (below).
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true

    async function connect() {
      const token = await tokenStorage.getAccess()
      if (!token || !mounted) return

      liveSocket.connect(activityId, token, {
        onConnected: () => { if (mounted) setWsConnected(true) },
        onStats: (msg) => {
          if (!mounted) return
          // We still accept elevation_gain_m and off_route from the server
          // (those need the full route context), but ignore server-side
          // distance/pace in favour of phone values computed below.
          useActivityStore.getState().updateStats({
            elevation_gain_m: msg.elevation_gain_m,
            off_route:        msg.off_route ?? false,
          })
        },
        onDisconnected: (code) => {
          if (code !== 1000 && mounted) {
            setWsConnected(false)
            setTimeout(connect, 3_000)
          }
        },
      })
    }

    connect()
    return () => {
      mounted = false
      liveSocket.flushNow()
      liveSocket.disconnect()
    }
  }, [activityId])

  // ─────────────────────────────────────────────────────────────────────────
  // Elapsed timer + 1 Hz stat refresh
  //
  // The timer runs from mount, independent of the WebSocket: the workout
  // clock and on-device stats must keep working when the server is slow or
  // unreachable. (Previously the timer only started on WS connect, so an
  // offline session showed a frozen 0:00.)
  //
  // Each tick refreshes the displayed distance, recomputes pace from the
  // tracker's sliding window (the tick cadence is what makes pace decay to
  // "--:--" when the runner stops), and forwards stats to the lock-screen
  // surface (Live Activity / notification) — throttled inside liveSurface.
  // ─────────────────────────────────────────────────────────────────────────
  function startTimer() {
    if (timerRef.current) return
    timerRef.current = setInterval(() => {
      elapsedRef.current += 1
      setElapsed(elapsedRef.current)
      const pace = workoutTracker.windowPace()
      setDeviceDistM(workoutTracker.distanceM)
      setDevicePaceS(pace)
      liveSurface.update(
        workoutTracker.distanceM,
        pace,
        useActivityStore.getState().stats.off_route,
      )
    }, 1_000)
  }
  function stopTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }

  // Workout lifecycle: fresh tracker per activity, and a lock-screen surface
  // (Dynamic Island / lock-screen card / notification, per device support)
  // that lives exactly as long as this screen.
  useEffect(() => {
    workoutTracker.reset()
    liveSurface.start(activityType, Date.now())
    startTimer()
    return () => {
      stopTimer()
      liveSurface.end(workoutTracker.distanceM, 0)
      stopBackgroundLocation()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ─────────────────────────────────────────────────────────────────────────
  // GPS — on-device distance accumulation + speed → pace
  //
  // expo-location provides:
  //   coords.latitude, coords.longitude   — precise position
  //   coords.speed                        — m/s (null on first fix)
  //   coords.altitude                     — metres (null on some devices)
  //   coords.heading                      — degrees from true north (0–360)
  //
  // We use coords.heading for the arrow and accumulate distance ourselves
  // using Haversine so the value is always available even when the server
  // is lagging or offline.
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null
    let active = true

    async function startWatching() {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted' || !active) return

      // ── Warm start ─────────────────────────────────────────────────────
      // A cold BestForNavigation fix can take several seconds. The OS
      // usually has a recent cached position — show it immediately so the
      // map centres on the runner right away. It seeds the *display* only:
      // distance accumulation starts from the first live fix, so a slightly
      // stale cached point can never add phantom metres.
      const cached = await Location.getLastKnownPositionAsync({
        maxAge:           60_000,
        requiredAccuracy: 150,
      }).catch(() => null)
      if (cached && active && !useActivityStore.getState().stats.current_position) {
        useActivityStore.getState().updateStats({
          current_position: { lat: cached.coords.latitude, lng: cached.coords.longitude },
        })
      }

      if (!active) return
      sub = await Location.watchPositionAsync(
        {
          accuracy:          Location.Accuracy.BestForNavigation,
          distanceInterval:  0.5,
          timeInterval:      250,
          mayShowUserSettingsDialog: true,
        },
        (loc) => {
          if (!active) return

          // Quality filtering, jump rejection, distance accumulation, and
          // the pace window all happen in the shared tracker (also fed by
          // the background task — duplicate fixes are deduped by timestamp).
          // A null result means the fix was rejected or tracking is paused.
          const accepted = workoutTracker.ingest({
            latitude:  loc.coords.latitude,
            longitude: loc.coords.longitude,
            accuracy:  loc.coords.accuracy,
            speed:     loc.coords.speed,
            heading:   loc.coords.heading,
            altitude:  loc.coords.altitude,
            timestamp: loc.timestamp,
          })
          if (!accepted) return

          const store = useActivityStore.getState()
          if (accepted.heading != null) {
            // GPS course dominates while moving; compass (below) yields via
            // workoutTracker.gpsMoving.
            headingRef.current = accepted.heading
            store.updateStats({ current_position: accepted.position, heading: accepted.heading })
          } else {
            store.updateStats({ current_position: accepted.position })
          }

          // ── Forward raw point to server ────────────────────────────────
          const point: GpsPoint = {
            lat:          accepted.position.lat,
            lng:          accepted.position.lng,
            elevation_m:  loc.coords.altitude    ?? undefined,
            accuracy_m:   loc.coords.accuracy     ?? undefined,
            speed_kmh:    loc.coords.speed != null ? loc.coords.speed * 3.6 : undefined,
            ts:           loc.timestamp,
          }
          liveSocket.pushPoint(point)
        },
      )
    }

    startWatching()
    return () => {
      active = false
      sub?.remove()
    }
    // Mount-once by design: restarting watchPositionAsync mid-activity drops
    // the GPS lock for seconds. Pause state lives in workoutTracker.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ─────────────────────────────────────────────────────────────────────────
  // Compass heading — at-rest and low-speed
  //
  // expo-location's watchHeadingAsync uses the device magnetometer + gyro
  // fusion (CoreLocation on iOS, SensorManager on Android) without requiring
  // expo-sensors. It fires whenever the heading changes by ≥1°, giving
  // smooth updates at all speeds.
  //
  // Strategy:
  //   • watchPositionAsync (above) sets heading when speed > 0.5 m/s because
  //     GPS-course is more accurate than compass while running.
  //   • watchHeadingAsync (here) updates heading when the user is slow/still,
  //     so the arrow keeps pointing the right way even when stationary.
  //   gpsMovingRef (declared at component scope above) gates between the two.
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null
    let active = true

    async function startCompass() {
      // Permission is already granted by the GPS effect above; this call is
      // a no-op if granted, harmless if not.
      await Location.requestForegroundPermissionsAsync().catch(() => null)
      if (!active) return

      sub = await Location.watchHeadingAsync((heading) => {
        if (!active) return
        // trueHeading is preferred (accounts for magnetic declination).
        // Fall back to magHeading if trueHeading is -1 (unavailable on some
        // Android devices without a network fix for declination lookup).
        const deg =
          heading.trueHeading >= 0 ? heading.trueHeading : heading.magHeading

        // Low-pass filter to smooth jitter — via the shortest arc, so
        // filtering 359° toward 1° nudges the arrow 2° clockwise instead of
        // spinning it the long way through south (the wraparound artifact
        // that made the arrow twirl when facing north).
        if (!workoutTracker.gpsMoving) {
          const h = headingRef.current
          const smoothed = (h + shortestAngleDelta(h, deg) * 0.25 + 360) % 360
          headingRef.current = smoothed
          useActivityStore.getState().updateStats({ heading: smoothed })
        }
      })
    }

    startCompass()
    return () => {
      active = false
      sub?.remove()
    }
  }, [])

  // ─────────────────────────────────────────────────────────────────────────
  // Controls
  // ─────────────────────────────────────────────────────────────────────────
  function handlePause() {
    setIsPaused(true)
    stopTimer()
    // The tracker breaks position continuity on pause so movement during
    // the pause never counts as distance.
    workoutTracker.setPaused(true)
    setDevicePaceS(0)
    liveSocket.flushNow()
    updateActivity({ status: 'paused' })
    setStatus('paused')
  }

  function handleResume() {
    setIsPaused(false)
    workoutTracker.setPaused(false)
    startTimer()
    updateActivity({ status: 'in_progress' })
    setStatus('in_progress')
  }

  async function handleToggleLock() {
    if (lockScreenUpdates) {
      await stopBackgroundLocation()
      setLockScreenUpdates(false)
      return
    }
    // Background ("Always") permission is what lets tracking continue with
    // the screen locked. With it granted, the OS delivers fixes into the
    // background task, which feeds the same tracker (and the Live Activity)
    // while the app UI is asleep.
    const { status } = await Location.requestBackgroundPermissionsAsync().catch(() => ({ status: 'denied' as const }))
    if (status !== 'granted') {
      Alert.alert(
        'Background access needed',
        'Allow "Always" location access so Dromos can keep tracking while your phone is locked.',
      )
      return
    }
    try {
      await startBackgroundLocation()
      setLockScreenUpdates(true)
    } catch {
      Alert.alert('Could not enable', 'Background tracking could not be started on this device.')
    }
  }

  function handleStop() {
    Alert.alert('End activity?', 'This will save your workout.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'End',    style: 'destructive', onPress: confirmStop },
    ])
  }

  function confirmStop() {
    stopTimer()
    liveSurface.end(workoutTracker.distanceM, workoutTracker.windowPace())
    stopBackgroundLocation()
    liveSocket.flushNow()
    liveSocket.disconnect()
    updateActivity(
      { status: 'completed' },
      {
        onSuccess: () => navigation.replace('ActivitySummary', { activityId }),
        onError:   () => navigation.replace('ActivitySummary', { activityId }),
      },
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Swipeable bottom sheet
  //
  // translateY convention (all positive, moving DOWN):
  //   EXPANDED_Y  (0)          → sheet top is at 50 % screen height  ✓
  //   COLLAPSED_Y (SHEET_H - PEEK_H) → only PEEK_H px peek above bottom
  //
  // We start collapsed so the map gets the full screen on launch.
  // ─────────────────────────────────────────────────────────────────────────
  const [expanded,   setExpanded]  = useState(false)
  const expandedRef  = useRef(false)          // mutable copy for PanResponder closures
  const sheetY       = useRef(new Animated.Value(COLLAPSED_Y)).current

  function snapTo(toExpanded: boolean) {
    expandedRef.current = toExpanded
    setExpanded(toExpanded)
    Animated.spring(sheetY, {
      toValue:         toExpanded ? EXPANDED_Y : COLLAPSED_Y,
      useNativeDriver: true,
      tension:         68,
      friction:        13,
    }).start()
  }

  const panResponder = useRef(
    PanResponder.create({
      // Only claim the gesture if vertical movement dominates
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dy) > 5 && Math.abs(g.dy) > Math.abs(g.dx),

      onPanResponderMove: (_, g) => {
        const base  = expandedRef.current ? EXPANDED_Y : COLLAPSED_Y
        const next  = base + g.dy
        // Clamp: can't go above EXPANDED_Y or more than 16 px below COLLAPSED_Y
        const clamped = Math.max(EXPANDED_Y - 12, Math.min(COLLAPSED_Y + 16, next))
        sheetY.setValue(clamped)
      },

      onPanResponderRelease: (_, g) => {
        const shouldExpand = expandedRef.current
          ? g.dy < SWIPE_THRESH             // stay expanded unless pulled down far enough
          : g.dy < -SWIPE_THRESH            // snap open on upward swipe
        snapTo(shouldExpand)
      },
    }),
  ).current

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  const paceLabel  = fmtPace(devicePaceS)
  const distLabel  = fmtDistance(deviceDistM)
  const timeLabel  = formatDuration(elapsedSec)

  return (
    <View style={styles.container}>
      {/* ── Full-screen map ─────────────────────────────────────────────── */}
      {generatedRoute ? (
        <LiveTrackingMap generatedRoute={generatedRoute} />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.mapFallback]} />
      )}

      {/* ── Status banners (non-blocking — never interrupt a live workout) ─ */}
      {(offRoute || !wsConnected) && (
        <SafeAreaView style={styles.bannerWrap} pointerEvents="none">
          {offRoute && (
            <View style={styles.offRouteBanner}>
              <Ionicons name="warning-outline" size={14} color={colors.warning} />
              <Text style={styles.offRouteText}>Off route — recalculating…</Text>
            </View>
          )}
          {!wsConnected && (
            <View style={styles.wsBanner}>
              <Ionicons name="cloud-offline-outline" size={14} color={colors.textMuted} />
              <Text style={styles.wsBannerText}>Reconnecting — your workout keeps recording</Text>
            </View>
          )}
        </SafeAreaView>
      )}

      {/* ── Bottom sheet ────────────────────────────────────────────────── */}
      {/*
          Always SHEET_H (50 % screen) tall, anchored to bottom.
          translateY slides it: COLLAPSED_Y hides everything except the
          PEEK_H strip; EXPANDED_Y = 0 reveals the full panel.
      */}
      <Animated.View
        style={[styles.sheet, { height: SHEET_H, transform: [{ translateY: sheetY }] }]}
        {...panResponder.panHandlers}
      >
        {/* ── Drag handle — always visible ────────────────────────────── */}
        <View style={styles.handleRow}>
          <View style={styles.dragHandle} />
        </View>

        {/* ── Peek stats — fade OUT as sheet opens ────────────────────── */}
        <Animated.View
          style={[
            styles.peekStrip,
            {
              opacity: sheetY.interpolate({
                inputRange:  [COLLAPSED_Y * 0.7, COLLAPSED_Y],
                outputRange: [0, 1],
                extrapolate: 'clamp',
              }),
            },
          ]}
          pointerEvents={expanded ? 'none' : 'auto'}
        >
          <View style={styles.peekStats}>
            <PeekStat label="KM"   value={distLabel} accent={activityColor} />
            <View style={styles.peekDivider} />
            <PeekStat label="PACE" value={paceLabel} />
            <View style={styles.peekDivider} />
            <PeekStat label="TIME" value={timeLabel} />
            <View style={styles.peekDivider} />
            <View style={styles.peekStatusWrap}>
              <View style={[styles.statusDot, { backgroundColor: isPaused ? colors.warning : colors.success }]} />
              <Text style={styles.peekStatusText}>{isPaused ? 'Paused' : 'Live'}</Text>
            </View>
          </View>
        </Animated.View>

        {/* ── Expanded content — fades IN as sheet opens ──────────────── */}
        <Animated.View
          style={[
            styles.expandedBody,
            {
              // sits absolutely so it doesn't push peek stats down
              ...StyleSheet.absoluteFillObject,
              top: 44,   // below the drag handle row
              opacity: sheetY.interpolate({
                inputRange:  [COLLAPSED_Y * 0.7, COLLAPSED_Y],
                outputRange: [1, 0],
                extrapolate: 'clamp',
              }),
            },
          ]}
          pointerEvents={expanded ? 'auto' : 'none'}
        >
          {/* Full stats grid */}
          <View style={styles.statsGrid}>
            <StatCell label="Distance" value={distLabel}  accent={activityColor}  />
            <StatCell label="Pace"     value={paceLabel} />
            <StatCell label="Time"     value={timeLabel} />
            <StatCell label="Elevation" value={`+${Math.round(elevationGainM ?? 0)} m`} />
          </View>

          {/* Divider */}
          <View style={styles.expandDivider} />

          {/* Controls */}
          <View style={styles.controls}>
            {/* Stop */}
            <View style={styles.controlGroup}>
              <TouchableOpacity style={styles.stopBtn} onPress={handleStop} activeOpacity={0.8}>
                <Ionicons name="stop" size={24} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.controlLabel}>Stop</Text>
            </View>

            {/* Pause / Resume — primary action, larger */}
            <View style={styles.controlGroup}>
              <TouchableOpacity
                style={[styles.pauseBtn, { borderColor: activityColor }]}
                onPress={isPaused ? handleResume : handlePause}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={isPaused ? 'play' : 'pause'}
                  size={32}
                  color={activityColor}
                />
              </TouchableOpacity>
              <Text style={styles.controlLabel}>{isPaused ? 'Resume' : 'Pause'}</Text>
            </View>

            {/* Lock screen */}
            <View style={styles.controlGroup}>
              <TouchableOpacity
                style={[styles.auxBtn, lockScreenUpdates && { backgroundColor: activityColor + '18', borderColor: activityColor }]}
                onPress={handleToggleLock}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={lockScreenUpdates ? 'phone-portrait' : 'lock-closed-outline'}
                  size={22}
                  color={lockScreenUpdates ? activityColor : colors.textMuted}
                />
              </TouchableOpacity>
              <Text style={styles.controlLabel}>{lockScreenUpdates ? 'Live Lock' : 'Lock'}</Text>
            </View>
          </View>

          {/* Bottom safe-area padding */}
          <View style={{ height: insets.bottom + spacing.sm }} />
        </Animated.View>
      </Animated.View>
    </View>
  )
}

// ── Live tracking map ───────────────────────────────────────────────────────
// Isolated so that only THIS component re-renders at GPS-fix / compass
// cadence. The parent screen deliberately does not subscribe to
// current_position or heading — see the selector note at the top of
// ActiveActivityScreen.
function LiveTrackingMap({ generatedRoute }: { generatedRoute: GeneratedRoute }) {
  const livePosition = useActivityStore(s => s.stats.current_position)
  const heading      = useActivityStore(s => s.stats.heading)

  return (
    <RouteMap
      geometry={generatedRoute.geometry}
      startPoint={generatedRoute.start_point}
      endPoint={generatedRoute.end_point}
      livePosition={livePosition}
      heading={heading}
      followPosition
      style={StyleSheet.absoluteFill}
    />
  )
}

// ── Peek stat — compact single-line item shown in collapsed strip ───────────
function PeekStat({
  label, value, accent,
}: { label: string; value: string; accent?: string }) {
  return (
    <View style={peek.cell}>
      <Text style={[peek.value, accent ? { color: accent } : undefined]}>{value}</Text>
      <Text style={peek.label}>{label}</Text>
    </View>
  )
}

const peek = StyleSheet.create({
  cell:  { alignItems: 'center', flex: 1 },
  value: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.white },
  label: { fontSize: 9, color: colors.textMuted, letterSpacing: 0.8, fontWeight: fontWeight.semibold },
})

// ── Expanded stat cell — shown in the full grid ─────────────────────────────
function StatCell({
  label, value, accent, large,
}: { label: string; value: string; accent?: string; large?: boolean }) {
  return (
    <View style={stat.cell}>
      <Text style={[stat.value, large && stat.valueLg, accent ? { color: accent } : undefined]}>
        {value}
      </Text>
      <Text style={stat.label}>{label}</Text>
    </View>
  )
}

const stat = StyleSheet.create({
  cell:    { flex: 1, alignItems: 'center', gap: 2, paddingVertical: spacing.sm },
  value:   { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.white },
  valueLg: { fontSize: 42, lineHeight: 46 },
  label:   { fontSize: fontSize.xs, color: colors.textMuted, letterSpacing: 0.8 },
})

// ── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: colors.background },
  mapFallback: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.surface },

  // Off-route banner — floats above map near top
  bannerWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-start',
    alignItems:     'center',
    paddingTop:     spacing.sm,
  },
  offRouteBanner: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               6,
    backgroundColor:   colors.warning + '22',
    borderWidth:       0.5,
    borderColor:       colors.warning,
    borderRadius:      radius.full,
    paddingVertical:   spacing.xs,
    paddingHorizontal: spacing.md,
  },
  offRouteText: {
    color:      colors.warning,
    fontSize:   fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
  wsBanner: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               6,
    marginTop:         spacing.xs,
    backgroundColor:   'rgba(7,17,31,0.85)',
    borderWidth:       0.5,
    borderColor:       'rgba(255,255,255,0.15)',
    borderRadius:      radius.full,
    paddingVertical:   spacing.xs,
    paddingHorizontal: spacing.md,
  },
  wsBannerText: {
    color:      colors.textMuted,
    fontSize:   fontSize.xs,
    fontWeight: fontWeight.medium,
  },

  // ── Sheet ─────────────────────────────────────────────────────────────────
  // Fixed height = 50 % screen, always positioned at bottom.
  // translateY moves it: COLLAPSED_Y almost hides it; 0 reveals in full.
  sheet: {
    position:             'absolute',
    bottom:               0,
    left:                 0,
    right:                0,
    backgroundColor:      'rgba(7,17,31,0.96)',
    borderTopLeftRadius:  24,
    borderTopRightRadius: 24,
    borderTopWidth:       0.5,
    borderTopColor:       'rgba(255,255,255,0.1)',
    shadowColor:          '#000',
    shadowOffset:         { width: 0, height: -6 },
    shadowOpacity:        0.4,
    shadowRadius:         16,
    elevation:            24,
    overflow:             'hidden',
  },

  // ── Drag handle row — always on top ──────────────────────────────────────
  handleRow: {
    height:         44,
    alignItems:     'center',
    justifyContent: 'center',
  },
  dragHandle: {
    width:           44,
    height:          4,
    borderRadius:    2,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },

  // ── Peek strip — compact stats, fades out when expanded ───────────────────
  peekStrip: {
    paddingHorizontal: spacing.lg,
  },

  // Compact horizontal stat strip inside peek
  peekStats: {
    flexDirection:  'row',
    alignItems:     'center',
    width:          '100%',
  },
  peekDivider: {
    width:           0.5,
    height:          24,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  peekStatusWrap: {
    flex:           1,
    alignItems:     'center',
    flexDirection:  'column',
    gap:            3,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  peekStatusText: {
    fontSize:   9,
    color:      colors.textMuted,
    fontWeight: fontWeight.semibold,
    letterSpacing: 0.8,
  },

  // ── Expanded body — absolute overlay, fades in over peek strip ───────────
  expandedBody: {
    paddingHorizontal: spacing.xl,
    paddingTop:        spacing.sm,
  },

  // 2 × 2 stat grid
  statsGrid: {
    flexDirection:  'row',
    flexWrap:       'wrap',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius:    radius.lg,
    borderWidth:     0.5,
    borderColor:     'rgba(255,255,255,0.07)',
    overflow:        'hidden',
  },

  expandDivider: {
    height:          0.5,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginVertical:  spacing.lg,
  },

  // Controls row
  controls: {
    flexDirection:  'row',
    alignItems:     'flex-start',
    justifyContent: 'center',
    gap:            48,
  },
  controlGroup: { alignItems: 'center', gap: spacing.xs },
  controlLabel: {
    fontSize:   fontSize.xs,
    color:      colors.textMuted,
    fontWeight: fontWeight.medium,
  },

  stopBtn: {
    backgroundColor: colors.danger,
    width:           64,
    height:          64,
    borderRadius:    32,
    alignItems:      'center',
    justifyContent:  'center',
    shadowColor:     colors.danger,
    shadowOffset:    { width: 0, height: 4 },
    shadowOpacity:   0.45,
    shadowRadius:    10,
    elevation:       10,
  },
  pauseBtn: {
    width:           76,
    height:          76,
    borderRadius:    38,
    borderWidth:     2.5,
    alignItems:      'center',
    justifyContent:  'center',
    backgroundColor: 'transparent',
  },
  auxBtn: {
    width:           64,
    height:          64,
    borderRadius:    32,
    alignItems:      'center',
    justifyContent:  'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth:     0.5,
    borderColor:     'rgba(255,255,255,0.1)',
  },
})
