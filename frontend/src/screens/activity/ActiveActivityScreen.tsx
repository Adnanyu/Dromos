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
import { RouteMap }            from '../../components/route/RouteMap'
import { colors, fontSize, fontWeight, spacing, radius } from '../../theme'
import { formatDuration } from '../../utils/format'
import type { PlanStackParamList } from '../../types/navigation'
import type { GpsPoint, LatLng } from '../../types/api'

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

// ── GPS quality gates ────────────────────────────────────────────────────
// See the filtering logic in the location watcher below for why these
// exist: raw fixes were being trusted unconditionally, which is what made
// tracking look imprecise and caused occasional direction/position glitches.
const MIN_ACCURACY_M        = 25   // reject fixes reporting worse than this (metres, 1σ)
const MAX_PLAUSIBLE_SPEED_MS = 12  // ~43 km/h — generous ceiling to catch GPS jumps

// ── Haversine distance (metres) between two lat/lng points ─────────────────
function haversineM(a: LatLng, b: LatLng): number {
  const R  = 6_371_000
  const φ1 = (a.lat * Math.PI) / 180
  const φ2 = (b.lat * Math.PI) / 180
  const Δφ = ((b.lat - a.lat) * Math.PI) / 180
  const Δλ = ((b.lng - a.lng) * Math.PI) / 180
  const s  = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s))
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
  const { stats, updateStats, setStatus } = useActivityStore()
  const { mutate: updateActivity } = useUpdateActivity(activityId)
  const insets = useSafeAreaInsets()

  const [isPaused,    setIsPaused]   = useState(false)
  const [elapsedSec,  setElapsed]    = useState(0)
  const elapsedRef   = useRef(0)
  const timerRef     = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── On-device tracking state (phone computes distance & pace) ────────────
  const [deviceDistM,  setDeviceDistM]  = useState(0)   // metres accumulated
  const [devicePaceS,  setDevicePaceS]  = useState(0)   // s/km from current speed
  const [heading,      setHeading]      = useState(0)
  const lastPosRef   = useRef<LatLng | null>(null)
  const lastFixAtRef = useRef<number | null>(null)
  const totalDistRef = useRef(0)
  const gpsMovingRef = useRef(false)  // true when GPS speed > 0.5 m/s

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
        onConnected: () => { if (mounted) startTimer() },
        onStats: (msg) => {
          if (!mounted) return
          // We still accept elevation_gain_m and off_route from the server
          // (those need the full route context), but ignore server-side
          // distance/pace in favour of phone values computed below.
          updateStats({
            elevation_gain_m: msg.elevation_gain_m,
            off_route:        msg.off_route ?? false,
          })
        },
        onDisconnected: (code) => {
          if (code !== 1000 && mounted) setTimeout(connect, 3_000)
        },
      })
    }

    connect()
    return () => {
      mounted = false
      stopTimer()
      liveSocket.flushNow()
      liveSocket.disconnect()
    }
  }, [activityId])

  // ─────────────────────────────────────────────────────────────────────────
  // Elapsed timer
  // ─────────────────────────────────────────────────────────────────────────
  function startTimer() {
    timerRef.current = setInterval(() => {
      elapsedRef.current += 1
      setElapsed(elapsedRef.current)
    }, 1_000)
  }
  function stopTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }

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

      // Request background permission for lock-screen tracking
      await Location.requestBackgroundPermissionsAsync().catch(() => null)

      sub = await Location.watchPositionAsync(
        {
          accuracy:          Location.Accuracy.BestForNavigation,
          distanceInterval:  1,     // minimum 1 m moved before callback
          timeInterval:      500,   // or 500 ms, whichever comes first
        },
        (loc) => {
          if (!active || isPaused) return

          const pos: LatLng = { lat: loc.coords.latitude, lng: loc.coords.longitude }
          const acc = loc.coords.accuracy   // horizontal accuracy, metres (1σ), or null

          // ── Reject low-quality fixes ────────────────────────────────────
          // BestForNavigation still occasionally returns degraded fixes —
          // cold start, urban canyon, indoors near a window. Previously
          // every fix, however noisy, got plotted directly: that's what was
          // showing up as "not precise" and as the dot/arrow jumping or
          // snapping to a wrong spot. We always accept the very first fix
          // (need somewhere to start); after that, fixes worse than 25m are
          // dropped rather than displayed.
          if (acc != null && acc > MIN_ACCURACY_M && lastPosRef.current) {
            return
          }

          // ── Reject GPS jumps ─────────────────────────────────────────────
          // A single bad fix (multipath reflection, satellite reacquisition)
          // can imply an impossible speed relative to the last good fix.
          // Treat those as outliers instead of snapping the dot — and the
          // heading derived from it — to a bogus point.
          if (lastPosRef.current && lastFixAtRef.current) {
            const dtS = (Date.now() - lastFixAtRef.current) / 1_000
            if (dtS > 0) {
              const impliedSpeed = haversineM(lastPosRef.current, pos) / dtS
              if (impliedSpeed > MAX_PLAUSIBLE_SPEED_MS) return
            }
          }
          lastFixAtRef.current = Date.now()

          // ── Distance accumulation ──────────────────────────────────────
          if (lastPosRef.current) {
            const delta = haversineM(lastPosRef.current, pos)
            // Ignore GPS jitter: only accumulate if moved > 1 m
            if (delta > 1) {
              totalDistRef.current += delta
              setDeviceDistM(totalDistRef.current)
            }
          }
          lastPosRef.current = pos

          // ── Pace from GPS speed (m/s → s/km) ──────────────────────────
          // coords.speed is the instantaneous speed from the GPS chip.
          // On iOS it's very smooth; on Android it can be noisy — a 3-point
          // rolling average would help but a single value is fine here.
          if (loc.coords.speed != null && loc.coords.speed > 0.5) {
            setDevicePaceS(1_000 / loc.coords.speed)   // s/km
          }

          // ── Compass heading from GPS ───────────────────────────────────
          // coords.heading is the direction of travel — accurate above ~0.5 m/s.
          // Per platform docs, heading is -1 when the course is invalid/
          // unavailable (e.g. chip hasn't resolved a course yet even though
          // speed ticked above the threshold) — `!= null` doesn't catch that,
          // so without the >= 0 check a stray -1 gets applied as the arrow's
          // rotation and it appears to "stick" until the next valid fix.
          // We set gpsMovingRef so watchHeadingAsync (below) yields to us.
          // Below that speed, or on an invalid course, we clear the flag so
          // the compass takes over.
          const spd = loc.coords.speed ?? 0
          if (loc.coords.heading != null && loc.coords.heading >= 0 && spd > 0.5) {
            gpsMovingRef.current = true
            setHeading(loc.coords.heading)
          } else {
            gpsMovingRef.current = false
            // compass effect will update heading on its own cadence
          }

          // ── Forward raw point to server ────────────────────────────────
          const point: GpsPoint = {
            lat:          pos.lat,
            lng:          pos.lng,
            elevation_m:  loc.coords.altitude    ?? undefined,
            speed_kmh:    loc.coords.speed != null ? loc.coords.speed * 3.6 : undefined,
            ts:           Date.now(),
          }
          liveSocket.pushPoint(point)
          updateStats({ current_position: pos })
        },
      )
    }

    startWatching()
    return () => {
      active = false
      sub?.remove()
    }
  }, [isPaused, updateStats])

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

        // Low-pass filter to smooth jitter (90% old / 10% new when moving fast
        // — GPS heading already dominates there; more responsive at rest).
        if (!gpsMovingRef.current) {
          setHeading(h => h * 0.75 + deg * 0.25)
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
    liveSocket.flushNow()
    updateActivity({ status: 'paused' })
    setStatus('paused')
  }

  function handleResume() {
    setIsPaused(false)
    startTimer()
    updateActivity({ status: 'in_progress' })
    setStatus('in_progress')
  }

  function handleStop() {
    Alert.alert('End activity?', 'This will save your workout.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'End',    style: 'destructive', onPress: confirmStop },
    ])
  }

  function confirmStop() {
    stopTimer()
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
        <RouteMap
          geometry={generatedRoute.geometry}
          startPoint={generatedRoute.start_point}
          endPoint={generatedRoute.end_point}
          livePosition={stats.current_position}
          heading={heading}
          followPosition
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.mapFallback]} />
      )}

      {/* ── Off-route banner ────────────────────────────────────────────── */}
      {stats.off_route && (
        <SafeAreaView style={styles.bannerWrap} pointerEvents="none">
          <View style={styles.offRouteBanner}>
            <Ionicons name="warning-outline" size={14} color={colors.warning} />
            <Text style={styles.offRouteText}>Off route — recalculating…</Text>
          </View>
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
            <StatCell label="Elevation" value={`+${Math.round(stats.elevation_gain_m ?? 0)} m`} />
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
              <TouchableOpacity style={styles.auxBtn} activeOpacity={0.8}>
                <Ionicons name="lock-closed-outline" size={22} color={colors.textMuted} />
              </TouchableOpacity>
              <Text style={styles.controlLabel}>Lock</Text>
            </View>
          </View>

          {/* Bottom safe-area padding */}
          <View style={{ height: insets.bottom + spacing.sm }} />
        </Animated.View>
      </Animated.View>
    </View>
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