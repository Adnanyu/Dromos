import React, { useRef, useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, Share, StyleSheet, Modal, Alert, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type MapView from 'react-native-maps'
import { captureRef } from 'react-native-view-shot'
import * as Sharing from 'expo-sharing'
import { Ionicons } from '@expo/vector-icons'
import { useActivity }      from '../../hooks/useActivities'
import { useActivityStore } from '../../store/activity.store'
import { useFormatters }    from '../../hooks/useUnits'
import { RouteMap }         from '../../components/route/RouteMap'
import { ActivityShareCard, EXPORT_W, EXPORT_H } from './ActivityShareCard'
import { ActivityBadge }    from '../../components/ui/Badge'
import { Button }           from '../../components/ui/Button'
import { colors, fontSize, fontWeight, spacing, radius } from '../../theme'
import type { PlanStackParamList } from '../../types/navigation'

type Props = NativeStackScreenProps<PlanStackParamList, 'ActivitySummary'>

export function ActivitySummaryScreen({ navigation, route }: Props) {
  const { activityId }                = route.params
  const { data: activity, isLoading } = useActivity(activityId)
  const { reset }                     = useActivityStore()
  const { distance, duration, pace, speed, elevation, durationWords } = useFormatters()

  const mapRef  = useRef<MapView>(null)
  const cardRef = useRef<View>(null)

  const [shareModalVisible, setShareModalVisible] = useState(false)
  const [mapSnapshotUri,    setMapSnapshotUri]     = useState<string | null>(null)
  const [preparingShare,    setPreparingShare]     = useState(false)
  const [sendingShare,      setSendingShare]       = useState(false)

  if (isLoading || !activity) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Loading summary…</Text>
      </View>
    )
  }

  const activityColor = {
    running: colors.running,
    cycling: colors.cycling,
    hiking:  colors.hiking,
  }[activity.activity_type] ?? colors.primary

  const emoji = { running: '🏃', cycling: '🚴', hiking: '🥾' }[activity.activity_type]

  function handleDone() {
    reset()
    navigation.popToTop()
  }

  function handleShare() {
    Share.share({
      message:
        `Just completed a ${distance(activity.actual_distance_m)} ${activity.activity_type} ` +
        `in ${durationWords(activity.duration_s)} with DROMOS! 🏃`,
    })
  }

  // ── Share-card image export ────────────────────────────────────────────
  // Two steps, and they can't be collapsed into one:
  //
  // 1. Snapshot the MapView itself via its native `takeSnapshot()`. Generic
  //    screenshot libraries (react-native-view-shot included) capture the
  //    standard UIView/Android View hierarchy — a MapView renders through
  //    its own native surface (MTKView/SurfaceView) that generic view
  //    capture frequently misses, producing a blank or black rectangle
  //    where the map should be. This is a well-documented react-native-maps
  //    limitation, which is exactly why the library ships its own snapshot
  //    method instead of expecting people to screenshot it generically.
  //
  // 2. Composite that snapshot (now just a plain <Image>) together with the
  //    stat overlay in ActivityShareCard, and capture THAT with
  //    react-native-view-shot — safe now, since nothing in it is a native
  //    map surface anymore, just ordinary Views/Text/Image.
  async function handleShareImage() {
    if (!activity.track_geometry || activity.track_geometry.coordinates.length < 2) {
      Alert.alert('No route recorded', 'This activity has no GPS track to include in the image.')
      return
    }
    if (!mapRef.current) return

    setPreparingShare(true)
    try {
      const coords = activity.track_geometry.coordinates.map(([lng, lat]) => ({ latitude: lat, longitude: lng }))

      mapRef.current.fitToCoordinates(coords, {
        edgePadding: { top: 140, right: 100, bottom: 260, left: 100 },
        animated: false,
      })

      // fitToCoordinates()'s promise can resolve before the native camera
      // move has actually finished rendering a frame (seen more on
      // Android) — a short delay avoids snapshotting a mid-pan frame.
      await new Promise(resolve => setTimeout(resolve, 300))

      const uri = await mapRef.current.takeSnapshot({
        width:   EXPORT_W,
        height:  EXPORT_H,
        format:  'png',
        quality: 1,
        result:  'file',
      })

      setMapSnapshotUri(uri)
      setShareModalVisible(true)
    } catch {
      Alert.alert('Could not create image', 'Please try again.')
    } finally {
      setPreparingShare(false)
    }
  }

  async function handleConfirmShare() {
    if (!cardRef.current) return
    setSendingShare(true)
    try {
      const finalUri = await captureRef(cardRef, {
        format:  'png',
        quality: 1,
        width:   EXPORT_W,
        height:  EXPORT_H,
      })

      const canShareFiles = await Sharing.isAvailableAsync()
      if (canShareFiles) {
        await Sharing.shareAsync(finalUri, { mimeType: 'image/png', dialogTitle: 'Share your activity' })
      } else {
        // Fallback for the rare case expo-sharing isn't available on this
        // device — RN's Share can still hand off a local file URL.
        await Share.share({ url: finalUri })
      }
      setShareModalVisible(false)
    } catch {
      Alert.alert('Could not share image', 'Please try again.')
    } finally {
      setSendingShare(false)
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Hero */}
        <View style={[styles.hero, { borderColor: activityColor + '40' }]}>
          <Text style={styles.heroEmoji}>{emoji}</Text>
          <ActivityBadge type={activity.activity_type} />
          <Text style={[styles.heroLabel, { color: activityColor }]}>Activity complete</Text>
          <Text style={styles.heroDistance}>{distance(activity.actual_distance_m)}</Text>
          <Text style={styles.heroDuration}>{duration(activity.duration_s)}</Text>
        </View>

        {/* Map — show actual GPS track if available */}
        {activity.track_geometry && activity.track_geometry.coordinates.length > 1 && (
          <View style={styles.mapWrap}>
            <RouteMap
              ref={mapRef}
              geometry={activity.track_geometry}
              startPoint={{
                lat: activity.track_geometry.coordinates[0][1],
                lng: activity.track_geometry.coordinates[0][0],
              }}
              endPoint={{
                lat: activity.track_geometry.coordinates[activity.track_geometry.coordinates.length - 1][1],
                lng: activity.track_geometry.coordinates[activity.track_geometry.coordinates.length - 1][0],
              }}
              style={{ height: 200 }}
            />
          </View>
        )}

        {/* Stats grid — all formatted in user's preferred unit */}
        <View style={styles.grid}>
          <StatCard label="Avg pace"   value={pace(activity.avg_pace_s_per_km)} />
          <StatCard label="Avg speed"  value={speed(activity.avg_speed_kmh)} />
          <StatCard label="Elev. gain" value={elevation(activity.elevation_gain_m)} />
          <StatCard label="Calories"   value={`${activity.calories} kcal`} />
        </View>

        {/* Encouragement banner */}
        <View style={styles.banner}>
          <Ionicons name="trophy-outline" size={20} color={colors.warning} />
          <Text style={styles.bannerText}>
            Great effort! Check your profile for updated stats and personal records.
          </Text>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          {activity.track_geometry && activity.track_geometry.coordinates.length > 1 && (
            <Button
              label={preparingShare ? 'Preparing image…' : 'Share photo'}
              onPress={handleShareImage}
              variant="secondary"
              fullWidth
              disabled={preparingShare}
            />
          )}
          <Button label="Share workout" onPress={handleShare} variant="secondary" fullWidth />
          <Button
            label="Done"
            onPress={handleDone}
            fullWidth
            size="lg"
            style={{ backgroundColor: activityColor }}
          />
        </View>

      </ScrollView>

      {/* ── Share-card preview modal ─────────────────────────────────────── */}
      <Modal
        visible={shareModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setShareModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            {mapSnapshotUri && (
              <ActivityShareCard
                ref={cardRef}
                mapImageUri={mapSnapshotUri}
                activityType={activity.activity_type}
                activityColor={activityColor}
                // NOTE: assumes `activity.started_at` exists on your Activity type (an
                // ISO string or timestamp) — it isn't referenced anywhere else in this
                // file so I couldn't confirm it. Swap for whatever field actually holds
                // the activity's date if this doesn't match your schema.
                dateLabel={new Date(activity.started_at ?? Date.now()).toLocaleDateString(undefined, {
                  month: 'short', day: 'numeric', year: 'numeric',
                })}
                distanceLabel={distance(activity.actual_distance_m)}
                durationLabel={duration(activity.duration_s)}
                paceLabel={activity.activity_type === 'cycling' ? speed(activity.avg_speed_kmh) : pace(activity.avg_pace_s_per_km)}
                paceChipLabel={activity.activity_type === 'cycling' ? 'SPEED' : 'PACE'}
                elevationLabel={elevation(activity.elevation_gain_m)}
              />
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalSecondaryBtn}
                onPress={() => setShareModalVisible(false)}
                disabled={sendingShare}
              >
                <Text style={styles.modalSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalPrimaryBtn, { backgroundColor: activityColor }]}
                onPress={handleConfirmShare}
                disabled={sendingShare}
              >
                {sendingShare
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.modalPrimaryText}>Share</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: colors.background },
  loading:     { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  loadingText: { color: colors.textMuted, fontSize: fontSize.md },
  scroll:      { padding: spacing.xl, gap: spacing.xl },

  hero: {
    alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.card, borderRadius: radius.xl,
    padding: spacing['2xl'], borderWidth: 1,
  },
  heroEmoji:    { fontSize: 48 },
  heroLabel:    { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, textTransform: 'uppercase', letterSpacing: 1 },
  heroDistance: { fontSize: fontSize['4xl'], fontWeight: fontWeight.bold, color: colors.textPrimary, lineHeight: 48 },
  heroDuration: { fontSize: fontSize.xl, color: colors.textSecondary, fontWeight: fontWeight.medium },

  mapWrap: { borderRadius: radius.lg, overflow: 'hidden' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  statCard: {
    flex: 1, minWidth: '45%',
    backgroundColor: colors.card, borderRadius: radius.lg,
    borderWidth: 0.5, borderColor: colors.border,
    padding: spacing.lg, alignItems: 'center', gap: 4,
  },
  statValue: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.textPrimary },
  statLabel: { fontSize: fontSize.xs, color: colors.textMuted },

  banner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.warning + '10',
    borderWidth: 0.5, borderColor: colors.warning + '50',
    borderRadius: radius.lg, padding: spacing.lg,
  },
  bannerText: { flex: 1, fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20 },

  actions: { gap: spacing.md },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  modalCard: {
    alignItems: 'center',
    gap: spacing.lg,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.md,
    width: '100%',
  },
  modalSecondaryBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  modalSecondaryText: {
    color: colors.textSecondary,
    fontWeight: fontWeight.semibold,
    fontSize: fontSize.md,
  },
  modalPrimaryBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    alignItems: 'center',
  },
  modalPrimaryText: {
    color: '#fff',
    fontWeight: fontWeight.bold,
    fontSize: fontSize.md,
  },
})