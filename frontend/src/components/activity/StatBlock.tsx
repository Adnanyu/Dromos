import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { colors, fontSize, fontWeight, spacing } from '../../theme'

interface StatBlockProps {
  label:    string
  value:    string
  unit?:    string
  large?:   boolean
  color?:   string
}

export function StatBlock({ label, value, unit, large = false, color = colors.textPrimary }: StatBlockProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label.toUpperCase()}</Text>
      <View style={styles.row}>
        <Text style={[styles.value, large && styles.valueLarge, { color }]}>{value}</Text>
        {unit && <Text style={[styles.unit, large && styles.unitLarge]}>{unit}</Text>}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: 2 },

  label: {
    fontSize:      fontSize.xs,
    color:         colors.textMuted,
    letterSpacing: 0.8,
    fontWeight:    fontWeight.medium,
  },

  row:       { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },

  value: {
    fontSize:   fontSize['2xl'],
    fontWeight: fontWeight.bold,
    color:      colors.textPrimary,
    lineHeight: fontSize['2xl'] * 1.1,
  },
  valueLarge: { fontSize: fontSize['4xl'], lineHeight: fontSize['4xl'] * 1.05 },

  unit: {
    fontSize:    fontSize.sm,
    color:       colors.textMuted,
    marginBottom: 3,
    fontWeight:  fontWeight.medium,
  },
  unitLarge: { fontSize: fontSize.md, marginBottom: 6 },
})
