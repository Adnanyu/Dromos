import { create } from 'zustand'
import { tokenStorage } from '../api/client'
import type { PublicUser } from '../types/api'

interface AuthState {
  user:            PublicUser | null
  isAuthenticated: boolean
  isLoading:       boolean

  setUser:    (user: PublicUser)             => void
  updateUser: (partial: Partial<PublicUser>) => void
  setLoading: (v: boolean)                  => void
  signOut:    ()                             => Promise<void>
}

/**
 * The User Service returns profiles where:
 *   • `id`      = profile table PK  (e.g. "e44fbf82-...")
 *   • `user_id` = auth user ID      (e.g. "bcb2e4d4-...")
 *
 * All API route lookups (/users/:id, /users/:id/stats, etc.) expect
 * the auth user ID. This helper normalises the object so that
 * `user.id` is always the auth ID, regardless of which service
 * returned the object (Auth Service, User Service, or profile edit).
 */
function normalise(raw: PublicUser): PublicUser {
  if (raw.user_id && raw.user_id !== raw.id) {
    // user_id is the stable auth ID — promote it to id
    const { user_id, ...rest } = raw
    return { ...rest, id: user_id, user_id }
  }
  return raw
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user:            null,
  isAuthenticated: false,
  isLoading:       true,

  setUser: (raw) =>
    set({ user: normalise(raw), isAuthenticated: true, isLoading: false }),

  /** Optimistic partial update — used for instant UI feedback (e.g. units toggle).
   *  Runs normalise so a partial payload with user_id still resolves correctly. */
  updateUser: (partial) =>
    set(s => {
      if (!s.user) return s
      const merged = { ...s.user, ...partial }
      return { user: normalise(merged) }
    }),

  setLoading: (isLoading) => set({ isLoading }),

  signOut: async () => {
    await tokenStorage.clearAll()
    set({ user: null, isAuthenticated: false, isLoading: false })
  },
}))
