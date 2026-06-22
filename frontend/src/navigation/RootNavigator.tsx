import React, { useEffect } from 'react'
import { View, ActivityIndicator } from 'react-native'
import { NavigationContainer }     from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { AuthNavigator }   from './AuthNavigator'
import { AppNavigator }    from './AppNavigator'
import { useAuthStore }    from '../store/auth.store'
import { useBootstrapSession } from '../hooks/useAuth'
import { colors }          from '../theme'
import type { RootStackParamList } from '../types/navigation'

const Root = createNativeStackNavigator<RootStackParamList>()

export function RootNavigator() {
  const { isAuthenticated, isLoading } = useAuthStore()
  const bootstrap = useBootstrapSession()

  useEffect(() => { bootstrap() }, [])

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    )
  }

  return (
    // <NavigationContainer>
      <Root.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
        {isAuthenticated ? (
          <Root.Screen name="App"  component={AppNavigator} />
        ) : (
          <Root.Screen name="Auth" component={AuthNavigator} />
        )}
      </Root.Navigator>
    // </NavigationContainer>
  )
}
