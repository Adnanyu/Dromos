import React, { useEffect, useState } from 'react'
import { View, ActivityIndicator } from 'react-native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import * as LocalAuthentication from 'expo-local-authentication'
import { AuthNavigator }   from './AuthNavigator'
import { AppNavigator }    from './AppNavigator'
import { useAuthStore }    from '../store/auth.store'
import { useBootstrapSession } from '../hooks/useAuth'
import { biometricPrefs, tokenStorage } from '../api/client'
import { BiometricGateScreen } from '../screens/auth/BiometricGateScreen'
import { colors }          from '../theme'
import type { RootStackParamList } from '../types/navigation'

const Root = createNativeStackNavigator<RootStackParamList>()

// 'checking': deciding whether the Face ID gate applies (no UI yet)
// 'locked':   gate applies — session restore is held until unlock
// 'open':     no gate / unlocked — normal session bootstrap proceeds
type GateStatus = 'checking' | 'locked' | 'open'

export function RootNavigator() {
  const { isAuthenticated, isLoading } = useAuthStore()
  const bootstrap = useBootstrapSession()
  const [gate, setGate] = useState<GateStatus>('checking')

  useEffect(() => {
    let cancelled = false

    async function decideGate() {
      const [enabled, refreshToken] = await Promise.all([
        biometricPrefs.isEnabled(),
        tokenStorage.getRefresh(),
      ])

      // No stored session or Face ID not opted in → nothing to protect.
      if (!enabled || !refreshToken) {
        if (!cancelled) { setGate('open'); bootstrap() }
        return
      }

      const [hasHardware, enrolled] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
      ])

      // Biometrics were disabled/unenrolled since opting in — don't lock the
      // user out of their own session; restore normally and clear the flag.
      if (!hasHardware || !enrolled) {
        await biometricPrefs.disable().catch(() => {})
        if (!cancelled) { setGate('open'); bootstrap() }
        return
      }

      if (!cancelled) setGate('locked')
    }

    decideGate()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (gate === 'locked') {
    return (
      <BiometricGateScreen
        onUnlocked={() => { setGate('open'); bootstrap() }}
        onUsePassword={async () => {
          // Abandon the stored session; the auth stack takes over below.
          await useAuthStore.getState().signOut()
          setGate('open')
        }}
      />
    )
  }

  if (gate === 'checking' || isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    )
  }

  return (
    <Root.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
      {isAuthenticated ? (
        <Root.Screen name="App"  component={AppNavigator} />
      ) : (
        <Root.Screen name="Auth" component={AuthNavigator} />
      )}
    </Root.Navigator>
  )
}
