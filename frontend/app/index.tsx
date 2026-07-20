import 'react-native-gesture-handler'
// Background task definitions must be registered at module load, before the
// app component tree mounts — imported for its side effect only.
import '../src/tasks/backgroundLocation'
import React from 'react'
import { StatusBar } from 'expo-status-bar'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RootNavigator } from '../src/navigation/RootNavigator'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry:            2,
      staleTime:        60_000,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
})

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        {/* Light theme → dark status-bar icons; "light" rendered white-on-white. */}
        <StatusBar style="dark" backgroundColor="transparent" translucent />
        <RootNavigator />
      </QueryClientProvider>
    </GestureHandlerRootView>
  )
}
