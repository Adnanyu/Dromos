import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
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
  const iconMap: Record<ActivityType, string> = {
    running: '🏃',
    cycling: '🚴',
    hiking:  '🥾',
  }
  const c = colorMap[type]
  return <Badge label={`${iconMap[type]} ${type}`} color={c} bg={c + '22'} />
}

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: 10,
    paddingVertical:   4,
    borderRadius:      radius.full,
    alignSelf:         'flex-start',
  },
  small: { paddingHorizontal: 7, paddingVertical: 2 },

  text: {
    fontSize:   fontSize.sm,
    fontWeight: fontWeight.semibold,
    textTransform: 'capitalize',
  },
  textSmall: { fontSize: fontSize.xs },
})
