import React, { useEffect, useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, Alert, Switch,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import * as LocalAuthentication from 'expo-local-authentication'
import { authApi }      from '../../api/auth'
import { biometricPrefs } from '../../api/client'
import { useAuthStore } from '../../store/auth.store'
import { Input }        from '../../components/ui/Input'
import { Button }       from '../../components/ui/Button'
import { colors, fontSize, fontWeight, spacing, radius } from '../../theme'
import type { ProfileStackParamList } from '../../types/navigation'
import type { ActivityType, Units } from '../../types/api'

type Props = NativeStackScreenProps<ProfileStackParamList, 'EditProfile'>

const ACTIVITY_OPTIONS: { type: ActivityType; icon: React.ComponentProps<typeof Ionicons>['name']; label: string }[] = [
  { type: 'running', icon: 'walk-outline', label: 'Running' },
  { type: 'cycling', icon: 'bicycle-outline', label: 'Cycling' },
  { type: 'hiking',  icon: 'trail-sign-outline', label: 'Hiking'  },
]

export function EditProfileScreen({ navigation }: Props) {
  const { user, setUser, updateUser } = useAuthStore()
  const qc = useQueryClient()

  const [firstName,  setFirstName]  = useState(user?.first_name ?? '')
  const [lastName,   setLastName]   = useState(user?.last_name  ?? '')
  const [location,   setLocation]   = useState(user?.location   ?? '')
  const [units,      setUnitsLocal] = useState<Units>(user?.units ?? 'metric')
  const [activities, setActivities] = useState<ActivityType[]>(
    user?.preferred_activities ?? []
  )

  // ── Face ID unlock (opt-in) ────────────────────────────────────────────────
  // `null` = device has no usable biometrics → section hidden entirely.
  const [biometricsAvailable, setBiometricsAvailable] = useState<boolean | null>(null)
  const [biometricEnabled,    setBiometricEnabled]    = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [hasHardware, enrolled, enabled] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
        biometricPrefs.isEnabled(),
      ])
      if (cancelled) return
      setBiometricsAvailable(hasHardware && enrolled)
      setBiometricEnabled(enabled)
    })()
    return () => { cancelled = true }
  }, [])

  async function handleBiometricToggle(next: boolean) {
    if (!next) {
      await biometricPrefs.disable()
      setBiometricEnabled(false)
      return
    }
    // Confirm with an actual scan before enabling, so the user can't turn
    // on a lock their face/fingerprint can't open.
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Enable Face ID unlock',
    }).catch(() => null)
    if (result?.success) {
      await biometricPrefs.enable()
      setBiometricEnabled(true)
    } else {
      Alert.alert('Not enabled', 'Face ID could not be verified, so unlock stays off.')
    }
  }

  /** Change units locally AND in the store immediately so every screen
   *  using useFormatters() re-renders at once — no save needed. */
  function handleUnitsChange(value: Units) {
    setUnitsLocal(value)
    updateUser({ units: value })   // optimistic — instant UI feedback
  }

  function toggleActivity(type: ActivityType) {
    setActivities(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    )
  }

  const { mutate: save, isPending } = useMutation({
    mutationFn: () =>
      authApi.updateMe({
        first_name:           firstName.trim() || undefined,
        last_name:            lastName.trim()  || undefined,
        location:             location.trim()  || undefined,
        units,
        preferred_activities: activities,
      }),
    onSuccess: (updated) => {
      // `updated` comes from PATCH /users/me — the User Service returns a
      // profile object where `id` is the profile PK and `user_id` is the
      // auth user ID.  We preserve the current `user.id` (already the
      // auth ID after normalisation in the store) so it is never overwritten
      // by the profile PK.
      setUser({
        ...(user ?? {} as any),
        ...updated,
        id: user?.id ?? updated.user_id ?? updated.id,
      })
      qc.invalidateQueries({ queryKey: ['me'] })
      qc.invalidateQueries({ queryKey: ['users', user?.id] })
      Alert.alert('Saved', 'Profile updated.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ])
    },
    onError: () => {
      // Roll back optimistic units change
      if (user) updateUser({ units: user.units })
      Alert.alert('Error', 'Could not save profile. Please try again.')
    },
  })

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>Edit profile</Text>
          <TouchableOpacity onPress={() => save()} disabled={isPending}>
            <Text style={[styles.saveLink, isPending && styles.disabled]}>
              {isPending ? 'Saving...' : 'Save'}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >

          {/* ── Personal info ── */}
          <Section title="Personal info">
            <Input
              label="First name"
              value={firstName}
              onChangeText={setFirstName}
              autoCapitalize="words"
              placeholder="Your first name"
            />
            <Input
              label="Last name"
              value={lastName}
              onChangeText={setLastName}
              autoCapitalize="words"
              placeholder="Your last name"
            />
            <Input
              label="Location"
              value={location}
              onChangeText={setLocation}
              placeholder="City, Country"
              leftIcon="location-outline"
            />
          </Section>

          {/* ── Preferred activities ── */}
          <Section title="Preferred activities">
            <View style={styles.activityRow}>
              {ACTIVITY_OPTIONS.map(opt => {
                const on = activities.includes(opt.type)
                return (
                  <TouchableOpacity
                    key={opt.type}
                    onPress={() => toggleActivity(opt.type)}
                    style={[styles.actBtn, on && styles.actBtnOn]}
                  >
                    <Ionicons name={opt.icon} size={22} color={on ? colors.primary : colors.textMuted} />
                    <Text style={[styles.actLabel, on && { color: colors.primary }]}>
                      {opt.label}
                    </Text>
                    {on && (
                      <Ionicons name="checkmark-circle" size={14} color={colors.primary} />
                    )}
                  </TouchableOpacity>
                )
              })}
            </View>
          </Section>

          {/* ── Units ── */}
          <Section title="Display units">
            <Text style={styles.unitsHint}>
              Changes apply instantly across the whole app.
            </Text>
            <View style={styles.unitsRow}>
              {(['metric', 'imperial'] as Units[]).map(u => {
                const on = units === u
                return (
                  <TouchableOpacity
                    key={u}
                    onPress={() => handleUnitsChange(u)}
                    style={[styles.unitChip, on && styles.unitChipOn]}
                    activeOpacity={0.75}
                  >
                    <View style={[styles.unitRadio, on && styles.unitRadioOn]}>
                      {on && <View style={styles.unitRadioDot} />}
                    </View>
                    <View style={styles.unitTextWrap}>
                      <Text style={[styles.unitTitle, on && { color: colors.primary }]}>
                        {u === 'metric' ? 'Metric' : 'Imperial'}
                      </Text>
                      <Text style={styles.unitSub}>
                        {u === 'metric' ? 'km, m, min/km' : 'mi, ft, min/mi'}
                      </Text>
                    </View>
                    {on && (
                      <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
                    )}
                  </TouchableOpacity>
                )
              })}
            </View>
          </Section>

          {/* ── Security ── */}
          {biometricsAvailable && (
            <Section title="Security">
              <View style={styles.securityRow}>
                <View style={styles.securityIconWrap}>
                  <Ionicons name="scan-outline" size={20} color={colors.primary} />
                </View>
                <View style={styles.securityTextWrap}>
                  <Text style={styles.securityTitle}>Unlock with Face ID</Text>
                  <Text style={styles.securitySub}>
                    Skip the password — open Dromos with a glance.
                  </Text>
                </View>
                <Switch
                  value={biometricEnabled}
                  onValueChange={handleBiometricToggle}
                  trackColor={{ true: colors.primary }}
                />
              </View>
            </Section>
          )}

          <Button
            label={isPending ? 'Saving...' : 'Save changes'}
            onPress={() => save()}
            loading={isPending}
            fullWidth
            size="lg"
          />

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  safe:  { flex: 1, backgroundColor: colors.background },
  flex:  { flex: 1 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
    borderBottomWidth: 0.5, borderBottomColor: colors.border,
  },
  title:    { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  saveLink: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.primary },
  disabled: { opacity: 0.45 },

  scroll: { padding: spacing.xl, gap: spacing.xl, paddingBottom: spacing['3xl'] },

  section:      { gap: spacing.md },
  sectionTitle: {
    fontSize: fontSize.sm, fontWeight: fontWeight.semibold,
    color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8,
  },
  sectionBody: { gap: spacing.md },

  // Activity
  activityRow: { flexDirection: 'row', gap: spacing.md },
  actBtn: {
    flex: 1, alignItems: 'center', paddingVertical: spacing.lg, gap: 4,
    backgroundColor: colors.card, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
  },
  actBtnOn:  { borderColor: colors.primary, backgroundColor: colors.primary + '12' },
  actLabel:  { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: fontWeight.medium },

  // Units
  unitsHint: { fontSize: fontSize.xs, color: colors.textMuted, marginBottom: 2 },
  unitsRow:  { gap: spacing.md },
  unitChip: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    padding: spacing.lg, backgroundColor: colors.card,
    borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.border,
  },
  unitChipOn:    { borderColor: colors.primary, backgroundColor: colors.primary + '0d' },
  unitRadio:     {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: colors.textMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  unitRadioOn:   { borderColor: colors.primary },
  unitRadioDot:  { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  unitTextWrap:  { flex: 1 },
  unitTitle:     { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.textSecondary },
  unitSub:       { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },

  // Security
  securityRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    padding: spacing.lg, backgroundColor: colors.card,
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
  },
  securityIconWrap: {
    width: 38, height: 38, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.primary + '12',
  },
  securityTextWrap: { flex: 1 },
  securityTitle:    { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  securitySub:      { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
})
