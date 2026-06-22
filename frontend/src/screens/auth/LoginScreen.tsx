import React, { useState } from 'react'
import {
  View, Text, TouchableOpacity, ScrollView, KeyboardAvoidingView,
  Platform, StyleSheet,
} from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useLogin } from '../../hooks/useAuth'
import { Button }  from '../../components/ui/Button'
import { Input }   from '../../components/ui/Input'
import { colors, fontSize, fontWeight, spacing, radius } from '../../theme'
import type { AuthStackParamList } from '../../types/navigation'

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>

export function LoginScreen({ navigation }: Props) {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [errors,   setErrors]   = useState<{ email?: string; password?: string; general?: string }>({})

  const { mutate: login, isPending } = useLogin()

  function validate(): boolean {
    const e: typeof errors = {}
    if (!email.trim())    e.email    = 'Email is required'
    if (!password)        e.password = 'Password is required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function handleLogin() {
    if (!validate()) return
    login(
      { email: email.trim().toLowerCase(), password },
      {
        onError: (err: any) => {
          const msg = err?.response?.data?.error?.message ?? 'Invalid email or password'
          setErrors({ general: msg })
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
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.logo}>STRIDE</Text>
          <Text style={styles.tagline}>Your routes. Your pace.</Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <Text style={styles.title}>Welcome back</Text>

          {errors.general && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>{errors.general}</Text>
            </View>
          )}

          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            leftIcon="mail-outline"
            error={errors.email}
            placeholder="you@example.com"
          />

          <Input
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
            leftIcon="lock-closed-outline"
            error={errors.password}
            placeholder="••••••••"
          />

          <Button
            label="Sign in"
            onPress={handleLogin}
            loading={isPending}
            fullWidth
            size="lg"
            style={styles.submitBtn}
          />
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Don't have an account?</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Register')}>
            <Text style={styles.footerLink}>Create one</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  flex:   { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1, padding: spacing['2xl'], justifyContent: 'center', gap: spacing['2xl'] },

  header: { alignItems: 'center', gap: spacing.sm },
  logo: {
    fontSize:      40,
    fontWeight:    fontWeight.bold,
    color:         colors.primary,
    letterSpacing: 6,
  },
  tagline: { fontSize: fontSize.md, color: colors.textMuted },

  form: { gap: spacing.lg },

  title: {
    fontSize:   fontSize['2xl'],
    fontWeight: fontWeight.bold,
    color:      colors.textPrimary,
    marginBottom: spacing.sm,
  },

  errorBanner: {
    backgroundColor: colors.danger + '22',
    borderWidth:     0.5,
    borderColor:     colors.danger,
    borderRadius:    radius.md,
    padding:         spacing.md,
  },
  errorBannerText: { color: colors.danger, fontSize: fontSize.sm },

  submitBtn: { marginTop: spacing.sm },

  footer:     { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  footerText: { color: colors.textMuted, fontSize: fontSize.sm },
  footerLink: { color: colors.primary, fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
})
