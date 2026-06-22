import React from 'react'
import { View, Text, ScrollView, TouchableOpacity, Share, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Ionicons } from '@expo/vector-icons'
import { useActivity }      from '../../hooks/useActivities'
import { useActivityStore } from '../../store/activity.store'
import { useFormatters }    from '../../hooks/useUnits'
import { RouteMap }         from '../../components/route/RouteMap'
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
        `in ${durationWords(activity.duration_s)} with STRIDE! 🏃`,
    })
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
})
