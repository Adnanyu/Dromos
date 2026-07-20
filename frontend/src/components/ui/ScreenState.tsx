import React from 'react'
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors, fontSize, fontWeight, radius, spacing } from '../../theme'

type IconName = React.ComponentProps<typeof Ionicons>['name']

export function LoadingState({
  title,
  subtitle,
  icon = 'navigate-circle-outline',
}: { title: string; subtitle?: string; icon?: IconName }) {
  return (
    <View style={styles.wrap}>
      <View style={styles.iconPlate}>
        <Ionicons name={icon} size={30} color={colors.primary} />
      </View>
      <ActivityIndicator color={colors.primary} />
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  )
}

export function EmptyState({
  title,
  subtitle,
  icon = 'map-outline',
  actionLabel,
  onAction,
}: { title: string; subtitle?: string; icon?: IconName; actionLabel?: string; onAction?: () => void }) {
  return (
    <View style={styles.wrap}>
      <View style={styles.iconPlate}>
        <Ionicons name={icon} size={30} color={colors.textSecondary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {actionLabel && onAction ? (
        <TouchableOpacity style={styles.action} onPress={onAction} activeOpacity={0.8}>
          <Text style={styles.actionText}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  )
}

export function ErrorState({
  title = 'Could not load this screen',
  message,
  onRetry,
}: { title?: string; message: string; onRetry?: () => void }) {
  return (
    <View style={styles.wrap}>
      <View style={[styles.iconPlate, styles.errorPlate]}>
        <Ionicons name="alert-circle-outline" size={30} color={colors.danger} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{message}</Text>
      {onRetry ? (
        <TouchableOpacity style={styles.action} onPress={onRetry} activeOpacity={0.8}>
          <Ionicons name="refresh" size={16} color={colors.textInverse} />
          <Text style={styles.actionText}>Try again</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing['3xl'],
  },
  iconPlate: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryDim,
    borderWidth: 1,
    borderColor: colors.border,
  },
  errorPlate: {
    backgroundColor: colors.danger + '14',
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    lineHeight: 20,
    textAlign: 'center',
  },
  action: {
    minHeight: 42,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionText: {
    color: colors.textInverse,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
})
