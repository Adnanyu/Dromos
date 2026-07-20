import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors, radius, fontSize, fontWeight } from '../../theme'
import type { Difficulty, ActivityType } from '../../types/api'

interface BadgeProps {
  label:    string
  color?:   string
  bg?:      string
  size?:    'sm' | 'md'
}

export function Badge({ label, color = colors.textSecondary, bg = colors.card, size = 'md' }: BadgeProps) {
  return (
    <View style={[styles.base, { backgroundColor: bg }, size === 'sm' && styles.small]}>
      <Text style={[styles.text, { color }, size === 'sm' && styles.textSmall]}>{label}</Text>
    </View>
  )
}

export function DifficultyBadge({ difficulty }: { difficulty: Difficulty }) {
  const colorMap: Record<Difficulty, string> = {
    easy:     colors.easy,
    moderate: colors.moderate,
    hard:     colors.hard,
    extreme:  colors.extreme,
  }
  const c = colorMap[difficulty]
  return <Badge label={difficulty} color={c} bg={c + '22'} />
}

export function ActivityBadge({ type }: { type: ActivityType }) {
  const colorMap: Record<ActivityType, string> = {
    running: colors.running,
    cycling: colors.cycling,
    hiking:  colors.hiking,
  }
  const iconMap: Record<ActivityType, React.ComponentProps<typeof Ionicons>['name']> = {
    running: 'walk-outline',
    cycling: 'bicycle-outline',
    hiking:  'trail-sign-outline',
  }
  const c = colorMap[type]
  return (
    <View style={[styles.base, styles.iconBadge, { backgroundColor: c + '22' }]}>
      <Ionicons name={iconMap[type]} size={14} color={c} />
      <Text style={[styles.text, { color: c }]}>{type}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: 10,
    paddingVertical:   4,
    borderRadius:      radius.full,
    alignSelf:         'flex-start',
  },
  iconBadge: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  small: { paddingHorizontal: 7, paddingVertical: 2 },

  text: {
    fontSize:   fontSize.sm,
    fontWeight: fontWeight.semibold,
    textTransform: 'capitalize',
  },
  textSmall: { fontSize: fontSize.xs },
})
