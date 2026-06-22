import React, { useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { authApi }      from '../../api/auth'
import { useAuthStore } from '../../store/auth.store'
import { Input }        from '../../components/ui/Input'
import { Button }       from '../../components/ui/Button'
import { colors, fontSize, fontWeight, spacing, radius } from '../../theme'
import type { ProfileStackParamList } from '../../types/navigation'
import type { ActivityType, Units } from '../../types/api'

type Props = NativeStackScreenProps<ProfileStackParamList, 'EditProfile'>

const ACTIVITY_OPTIONS: { type: ActivityType; icon: string; label: string }[] = [
  { type: 'running', icon: '🏃', label: 'Running' },
  { type: 'cycling', icon: '🚴', label: 'Cycling' },
  { type: 'hiking',  icon: '🥾', label: 'Hiking'  },
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
              {isPending ? 'Saving…' : 'Save'}
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
                    <Text style={styles.actIcon}>{opt.icon}</Text>
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

          <Button
            label={isPending ? 'Saving…' : 'Save changes'}
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
  actIcon:   { fontSize: 22 },
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
})
