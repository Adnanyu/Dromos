import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import type { Activity } from '../../types/api'
import { colors, fontSize, fontWeight, spacing, radius } from '../../theme'
import { formatRelativeTime } from '../../utils/format'
import { useFormatters } from '../../hooks/useUnits'
import { ActivityBadge } from '../ui/Badge'

interface ActivityCardProps {
  activity: Activity
  onPress?: () => void
  style?:   object
}

export function ActivityCard({ activity, onPress, style }: ActivityCardProps) {
  const { distance, duration, pace, elevation } = useFormatters()

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={onPress ? 0.75 : 1}
      style={[styles.card, style]}
    >
      <View style={styles.header}>
        <ActivityBadge type={activity.activity_type} />
        <Text style={styles.time}>{formatRelativeTime(activity.started_at)}</Text>
      </View>

      <View style={styles.statsRow}>
        <Stat label="Distance" value={distance(activity.actual_distance_m)} />
        <Separator />
        <Stat label="Time"     value={duration(activity.duration_s)} />
        <Separator />
        <Stat label="Pace"     value={activity.avg_pace_s_per_km > 0 ? pace(activity.avg_pace_s_per_km) : '—'} />
        <Separator />
        <Stat label="Elev."    value={elevation(activity.elevation_gain_m)} />
      </View>

      <View style={styles.footer}>
        <Text style={styles.calories}>{activity.calories} kcal</Text>
        <View style={styles.reportTag}>
          <Ionicons name="analytics-outline" size={15} color={colors.primary} />
          <Text style={styles.reportTagText}>Report</Text>
        </View>
      </View>
    </TouchableOpacity>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}
function Separator() {
  return <View style={styles.sep} />
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card, borderRadius: radius.lg,
    borderWidth: 0.5, borderColor: colors.border, padding: spacing.lg, gap: spacing.md,
  },
  header:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  time:       { fontSize: fontSize.xs, color: colors.textMuted },
  statsRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stat:       { alignItems: 'center', flex: 1 },
  statValue:  { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  statLabel:  { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 1 },
  sep:        { width: 0.5, height: 28, backgroundColor: colors.border },
  footer:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  calories:   { fontSize: fontSize.xs, color: colors.textMuted },
  reportTag:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  reportTagText: { fontSize: fontSize.xs, color: colors.primary, fontWeight: fontWeight.semibold },
})
