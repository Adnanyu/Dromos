import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { authApi } from '../api/auth'
import { tokenStorage } from '../api/client'
import { useAuthStore } from '../store/auth.store'
import type { LoginRequest, RegisterRequest } from '../types/api'

export function useLogin() {
  const setUser = useAuthStore(s => s.setUser)

  return useMutation({
    mutationFn: (body: LoginRequest) => authApi.login(body),
    onSuccess: async (data) => {
      await Promise.all([
        tokenStorage.setAccess(data.access_token),
        tokenStorage.setRefresh(data.refresh_token),
      ])
      setUser(data.user)
    },
  })
}

export function useRegister() {
  const setUser = useAuthStore(s => s.setUser)

  return useMutation({
    mutationFn: (body: RegisterRequest) => authApi.register(body),
    onSuccess: async (data) => {
      await Promise.all([
        tokenStorage.setAccess(data.access_token),
        tokenStorage.setRefresh(data.refresh_token),
      ])
      setUser(data.user)
    },
  })
}

export function useLogout() {
  const qc      = useQueryClient()
  const signOut = useAuthStore(s => s.signOut)

  return useMutation({
    mutationFn: async () => {
      const refreshToken = await tokenStorage.getRefresh()
      if (refreshToken) await authApi.logout({ refresh_token: refreshToken }).catch(() => {})
    },
    onSettled: () => {
      qc.clear()
      signOut()
    },
  })
}

export function useCurrentUser() {
  const { isAuthenticated } = useAuthStore()
  return useQuery({
    queryKey: ['me'],
    queryFn:  authApi.getMe,
    enabled:  isAuthenticated,
    staleTime: 5 * 60 * 1000,
  })
}

/** Call once on app start to restore session from SecureStore.
 *  Uses GET /users/me which returns a User Service profile — the
 *  store's setUser normalises id/user_id automatically.           */
export function useBootstrapSession() {
  const { setUser, setLoading, signOut } = useAuthStore()

  return async () => {
    setLoading(true)
    try {
      const token = await tokenStorage.getAccess()
      if (!token) { setLoading(false); return }
      const user = await authApi.getMe()
      setUser(user)   // normalise() inside setUser handles id/user_id
    } catch {
      await signOut()
    }
  }
}
