import React, { useState } from 'react'
import {
  View, Text, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, StyleSheet,
} from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useRegister }  from '../../hooks/useAuth'
import { Button }       from '../../components/ui/Button'
import { Input }        from '../../components/ui/Input'
import { colors, fontSize, fontWeight, spacing, radius } from '../../theme'
import type { AuthStackParamList } from '../../types/navigation'

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>

type FieldErrors = { email?: string; username?: string; password?: string; general?: string }

export function RegisterScreen({ navigation }: Props) {
  const [email,    setEmail]    = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [errors,   setErrors]   = useState<FieldErrors>({})

  const { mutate: register, isPending } = useRegister()

  function validate(): boolean {
    const e: FieldErrors = {}
    if (!email.trim())                       e.email    = 'Email is required'
    else if (!/\S+@\S+\.\S+/.test(email))   e.email    = 'Enter a valid email'
    if (!username.trim())                    e.username = 'Username is required'
    else if (username.length < 3)            e.username = 'At least 3 characters'
    else if (!/^[a-zA-Z0-9_]+$/.test(username)) e.username = 'Letters, numbers and _ only'
    if (!password)                           e.password = 'Password is required'
    else if (password.length < 8)            e.password = 'At least 8 characters'
    else if (!/[A-Z]/.test(password))        e.password = 'Include one uppercase letter'
    else if (!/[0-9]/.test(password))        e.password = 'Include one number'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function handleRegister() {
    if (!validate()) return
    register(
      { email: email.trim().toLowerCase(), username: username.trim().toLowerCase(), password },
      {
        onError: (err: any) => {
          const serverErrors: Record<string, string[]> = err?.response?.data?.error?.fields ?? {}
          const e: FieldErrors = {}
          if (serverErrors.email)    e.email    = serverErrors.email[0]
          if (serverErrors.username) e.username = serverErrors.username[0]
          if (serverErrors.password) e.password = serverErrors.password[0]
          if (Object.keys(e).length === 0) {
            e.general = err?.response?.data?.error?.message ?? 'Registration failed'
          }
          setErrors(e)
        },
      }
    )
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.logo}>STRIDE</Text>
          <Text style={styles.tagline}>Join the run</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.title}>Create account</Text>

          {errors.general && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>{errors.general}</Text>
            </View>
          )}

          <Input
            label="Email"
            value={email}
            onChangeText={t => { setEmail(t); setErrors(e => ({ ...e, email: undefined })) }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            leftIcon="mail-outline"
            error={errors.email}
            placeholder="you@example.com"
          />

          <Input
            label="Username"
            value={username}
            onChangeText={t => { setUsername(t); setErrors(e => ({ ...e, username: undefined })) }}
            autoCapitalize="none"
            autoCorrect={false}
            leftIcon="at-outline"
            error={errors.username}
            placeholder="yourusername"
          />

          <Input
            label="Password"
            value={password}
            onChangeText={t => { setPassword(t); setErrors(e => ({ ...e, password: undefined })) }}
            secureTextEntry
            autoComplete="new-password"
            leftIcon="lock-closed-outline"
            error={errors.password}
            placeholder="Min. 8 chars, 1 uppercase, 1 number"
          />

          <Button
            label="Create account"
            onPress={handleRegister}
            loading={isPending}
            fullWidth
            size="lg"
            style={styles.submitBtn}
          />
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account?</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Login')}>
            <Text style={styles.footerLink}>Sign in</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  flex:   { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1, padding: spacing['2xl'], justifyContent: 'center', gap: spacing['2xl'] },

  header:  { alignItems: 'center', gap: spacing.sm },
  logo:    { fontSize: 40, fontWeight: fontWeight.bold, color: colors.primary, letterSpacing: 6 },
  tagline: { fontSize: fontSize.md, color: colors.textMuted },

  form:  { gap: spacing.lg },
  title: { fontSize: fontSize['2xl'], fontWeight: fontWeight.bold, color: colors.textPrimary, marginBottom: spacing.sm },

  errorBanner:     { backgroundColor: colors.danger + '22', borderWidth: 0.5, borderColor: colors.danger, borderRadius: radius.md, padding: spacing.md },
  errorBannerText: { color: colors.danger, fontSize: fontSize.sm },

  submitBtn: { marginTop: spacing.sm },

  footer:     { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  footerText: { color: colors.textMuted, fontSize: fontSize.sm },
  footerLink: { color: colors.primary, fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
})
