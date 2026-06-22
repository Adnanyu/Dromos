import React from 'react'
import {
  TouchableOpacity, Text, ActivityIndicator, StyleSheet, type ViewStyle, type TextStyle,
} from 'react-native'
import { colors, radius, fontSize, fontWeight, spacing } from '../../theme'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size    = 'sm' | 'md' | 'lg'

interface ButtonProps {
  label:      string
  onPress:    () => void
  variant?:   Variant
  size?:      Size
  loading?:   boolean
  disabled?:  boolean
  style?:     ViewStyle
  fullWidth?: boolean
}

export function Button({
  label, onPress, variant = 'primary', size = 'md',
  loading = false, disabled = false, style, fullWidth = false,
}: ButtonProps) {
  const isDisabled = disabled || loading

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.75}
      style={[
        styles.base,
        styles[variant],
        styles[`size_${size}`],
        fullWidth && { width: '100%' },
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.textInverse : colors.primary} size="small" />
      ) : (
        <Text style={[styles.label, styles[`label_${variant}`], styles[`labelSize_${size}`]]}>
          {label}
        </Text>
      )}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  base: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    borderRadius:    radius.md,
  },

  // ── Variants ────────────────────────────────────────────────────────────────
  primary:   { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.card, borderWidth: 0.5, borderColor: colors.border },
  ghost:     { backgroundColor: colors.transparent },
  danger:    { backgroundColor: colors.danger },

  // ── Sizes ───────────────────────────────────────────────────────────────────
  size_sm:  { paddingVertical: spacing.xs,   paddingHorizontal: spacing.md },
  size_md:  { paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.lg },
  size_lg:  { paddingVertical: spacing.md,   paddingHorizontal: spacing.xl },

  disabled: { opacity: 0.45 },

  // ── Labels ──────────────────────────────────────────────────────────────────
  label:        { fontWeight: fontWeight.semibold },
  label_primary:   { color: colors.textInverse },
  label_secondary: { color: colors.textPrimary },
  label_ghost:     { color: colors.primary },
  label_danger:    { color: colors.white },

  labelSize_sm:  { fontSize: fontSize.sm },
  labelSize_md:  { fontSize: fontSize.md },
  labelSize_lg:  { fontSize: fontSize.lg },
})
