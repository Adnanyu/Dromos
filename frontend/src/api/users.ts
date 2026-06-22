import { api } from './client'
import type { PublicUser, UserStats } from '../types/api'

export const usersApi = {
  getById: (userId: string) =>
    api.get<PublicUser>(`/users/${userId}`).then(r => r.data),

  getStats: (userId: string) =>
    api.get<UserStats>(`/users/${userId}/stats`).then(r => r.data),

  search: (q: string) =>
    api.get<PublicUser[]>('/users/search', { params: { q } }).then(r => r.data),
}
