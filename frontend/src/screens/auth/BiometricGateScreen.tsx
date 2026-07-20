import React, { useCallback, useEffect, useRef, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, AppState } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import * as LocalAuthentication from 'expo-local-authentication'
import { colors, fontSize, fontWeight, spacing, radius } from '../../theme'

interface Props {
  /** Face ID (or device passcode fallback) succeeded — proceed to the app. */
  onUnlocked:    () => void
  /** User chose to abandon the stored session and sign in with a password. */
  onUsePassword: () => void
}

/**
 * Full-screen lock shown on launch when the user has enabled "Unlock with
 * Face ID". The session tokens are already on the device — this gate only
 * decides whether the app opens with them or falls back to a fresh login.
 */
export function BiometricGateScreen({ onUnlocked, onUsePassword }: Props) {
  const [failed, setFailed] = useState(false)
  const prompting = useRef(false)

  const prompt = useCallback(async () => {
    if (prompting.current) return
    prompting.current = true
    setFailed(false)
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage:         'Unlock Dromos',
        cancelLabel:           'Cancel',
        // Allow the OS passcode as fallback so a failed face scan
        // doesn't dead-end the user.
        disableDeviceFallback: false,
      })
      if (result.success) onUnlocked()
      else setFailed(true)
    } catch {
      setFailed(true)
    } finally {
      prompting.current = false
    }
  }, [onUnlocked])

  // Auto-prompt on mount, and again when the app returns to the foreground
  // (iOS cancels an in-flight Face ID prompt when the app is backgrounded).
  useEffect(() => {
    prompt()
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && !prompting.current) prompt()
    })
    return () => sub.remove()
  }, [prompt])

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.body}>
        <View style={styles.iconPlate}>
          <Ionicons name="lock-closed" size={34} color={colors.primary} />
        </View>
        <Text style={styles.title}>Dromos is locked</Text>
        <Text style={styles.subtitle}>
          {failed
            ? 'Face ID was cancelled or did not match.'
            : 'Unlock with Face ID to continue.'}
        </Text>

        <TouchableOpacity style={styles.unlockBtn} onPress={prompt} activeOpacity={0.85}>
          <Ionicons name="scan-outline" size={18} color={colors.textInverse} />
          <Text style={styles.unlockText}>Unlock</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={onUsePassword} activeOpacity={0.7}>
          <Text style={styles.passwordText}>Sign in with password instead</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  iconPlate: {
    width: 84,
    height: 84,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryDim,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  unlockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing['2xl'],
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  unlockText: {
    color: colors.textInverse,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
  passwordText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    marginTop: spacing.sm,
  },
})
