import React, { useEffect, useRef, useCallback, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { liveSocket }          from '../../api/websocket'
import { tokenStorage }        from '../../api/client'
import { useUpdateActivity }   from '../../hooks/useActivities'
import { useWatchPosition, requestBackgroundPermission } from '../../hooks/useLocation'
import { useFormatters }       from '../../hooks/useUnits'
import { useActivityStore }    from '../../store/activity.store'
import { RouteMap }            from '../../components/route/RouteMap'
import { StatBlock }           from '../../components/activity/StatBlock'
import { colors, fontSize, fontWeight, spacing, radius } from '../../theme'
import { formatDuration } from '../../utils/format'
import type { PlanStackParamList } from '../../types/navigation'
import type { GpsPoint, LatLng } from '../../types/api'

type Props = NativeStackScreenProps<PlanStackParamList, 'ActiveActivity'>

export function ActiveActivityScreen({ navigation, route }: Props) {
  const { activityId, generatedRoute, activityType } = route.params
  const { stats, status, updateStats, setStatus } = useActivityStore()
  const { mutate: updateActivity } = useUpdateActivity(activityId)

  const [isPaused,   setIsPaused]  = useState(false)
  const [elapsedSec, setElapsed]   = useState(0)
  const elapsedRef  = useRef(0)
  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null)

  // Pre-bound to user's unit preference
  const { distance, pace, elevation } = useFormatters()

  const activityColor = {
    running: colors.running,
    cycling: colors.cycling,
    hiking:  colors.hiking,
  }[activityType] ?? colors.primary

  // ── WebSocket ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true

    async function connect() {
      await requestBackgroundPermission()
      const token = await tokenStorage.getAccess()
      if (!token || !mounted) return

      liveSocket.connect(activityId, token, {
        onConnected: () => { if (mounted) startTimer() },
        onStats: (msg) => {
          if (!mounted) return
          updateStats({
            distance_m:       msg.distance_m,
            pace_s_per_km:    msg.pace_s_per_km,
            elapsed_s:        msg.elapsed_s,
            elevation_gain_m: msg.elevation_gain_m,
            current_position: msg.current_position,
            off_route:        msg.off_route ?? false,
          })
        },
        onDisconnected: (code) => {
          if (code !== 1000 && mounted) setTimeout(connect, 3000)
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

  // ── Elapsed timer ──────────────────────────────────────────────────────────
  function startTimer() {
    timerRef.current = setInterval(() => {
      elapsedRef.current += 1
      setElapsed(elapsedRef.current)
    }, 1000)
  }
  function stopTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }

  // ── GPS tracking ──────────────────────────────────────────────────────────
  const handlePosition = useCallback((coords: LatLng, altitude: number | null, speed: number | null) => {
    const point: GpsPoint = {
      lat: coords.lat, lng: coords.lng,
      elevation_m: altitude ?? undefined,
      speed_kmh:   speed    ?? undefined,
      ts: Date.now(),
    }
    liveSocket.pushPoint(point)
    updateStats({ current_position: coords })
  }, [updateStats])

  useWatchPosition(!isPaused, handlePosition)

  // ── Controls ───────────────────────────────────────────────────────────────
  function handlePause() {
    setIsPaused(true); stopTimer()
    liveSocket.flushNow()
    updateActivity({ status: 'paused' })
    setStatus('paused')
  }

  function handleResume() {
    setIsPaused(false); startTimer()
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
      }
    )
  }

  // Format using user's preferred unit
  const paceStr = stats.pace_s_per_km > 0 ? pace(stats.pace_s_per_km) : '--:--'

  return (
    <View style={styles.container}>
      {generatedRoute ? (
        <RouteMap
          geometry={generatedRoute.geometry}
          startPoint={generatedRoute.start_point}
          endPoint={generatedRoute.end_point}
          livePosition={stats.current_position}
          followPosition
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.mapFallback]} />
      )}

      <SafeAreaView style={styles.overlay} pointerEvents="box-none">

        {stats.off_route && (
          <View style={styles.offRouteBanner}>
            <Ionicons name="warning-outline" size={16} color={colors.warning} />
            <Text style={styles.offRouteText}>Off route — recalculating…</Text>
          </View>
        )}

        {/* HUD */}
        <View style={styles.hud}>

          {/* Primary stat — distance in user's unit */}
          <View style={styles.primaryStat}>
            <Text style={styles.primaryLabel}>DISTANCE</Text>
            <Text style={[styles.primaryValue, { color: activityColor }]}>
              {distance(stats.distance_m)}
            </Text>
          </View>

          {/* Secondary stats */}
          <View style={styles.secondaryStats}>
            <StatBlock label="Pace"  value={paceStr} />
            <StatDivider />
            <StatBlock label="Time"  value={formatDuration(elapsedSec)} />
            <StatDivider />
            <StatBlock label="Elev." value={elevation(stats.elevation_gain_m)} />
          </View>

          {/* Controls */}
          <View style={styles.controls}>
            <TouchableOpacity style={styles.stopBtn} onPress={handleStop}>
              <Ionicons name="stop" size={22} color={colors.white} />
              <Text style={styles.stopText}>Stop</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.pauseBtn, { borderColor: activityColor }]}
              onPress={isPaused ? handleResume : handlePause}
            >
              <Ionicons
                name={isPaused ? 'play' : 'pause'}
                size={28}
                color={activityColor}
              />
            </TouchableOpacity>
          </View>

          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: isPaused ? colors.warning : colors.success }]} />
            <Text style={styles.statusText}>
              {isPaused ? 'Paused — tap ▶ to resume' : 'Tracking…'}
            </Text>
          </View>
        </View>
      </SafeAreaView>
    </View>
  )
}

function StatDivider() {
  return <View style={{ width: 0.5, height: 28, backgroundColor: colors.border }} />
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: colors.background },
  mapFallback: { backgroundColor: colors.surface },
  overlay:     { flex: 1, justifyContent: 'space-between' },

  offRouteBanner: {
    margin: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.warning + '22', borderWidth: 0.5, borderColor: colors.warning,
    borderRadius: radius.md, padding: spacing.md, alignSelf: 'center',
  },
  offRouteText: { color: colors.warning, fontSize: fontSize.sm, fontWeight: fontWeight.medium },

  hud: {
    backgroundColor: 'rgba(7,17,31,0.92)',
    borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    padding: spacing.xl, gap: spacing.lg,
  },

  primaryStat:  { alignItems: 'center', gap: 4 },
  primaryLabel: { fontSize: fontSize.xs, color: colors.textMuted, letterSpacing: 1, fontWeight: fontWeight.semibold },
  primaryValue: { fontSize: 52, fontWeight: fontWeight.bold, lineHeight: 56 },

  secondaryStats: {
    flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center',
    backgroundColor: colors.surface + '99', borderRadius: radius.lg, padding: spacing.lg,
  },

  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing['2xl'] },

  stopBtn: {
    backgroundColor: colors.danger, width: 64, height: 64, borderRadius: radius.full,
    alignItems: 'center', justifyContent: 'center', gap: 2,
  },
  stopText:  { fontSize: 10, color: colors.white, fontWeight: fontWeight.bold },
  pauseBtn:  {
    width: 72, height: 72, borderRadius: radius.full, borderWidth: 2.5,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent',
  },

  statusRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  statusDot:  { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: fontSize.xs, color: colors.textMuted },
})