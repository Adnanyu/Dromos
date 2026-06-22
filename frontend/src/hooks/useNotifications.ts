import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { notificationsApi } from '../api/notifications'
import type { NotificationSettings } from '../types/api'

const KEYS = {
  list:     () => ['notifications'] as const,
  settings: () => ['notifications', 'settings'] as const,
}

export function useNotifications(limit = 50) {
  return useQuery({
    queryKey: KEYS.list(),
    queryFn:  () => notificationsApi.list(limit),
    staleTime: 30_000,
  })
}

export function useMarkRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (notificationId: string) => notificationsApi.markRead(notificationId),
    onSuccess:  () => qc.invalidateQueries({ queryKey: KEYS.list() }),
  })
}

export function useMarkAllRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: notificationsApi.markAllRead,
    onSuccess:  () => qc.invalidateQueries({ queryKey: KEYS.list() }),
  })
}

export function useNotificationSettings() {
  return useQuery({
    queryKey: KEYS.settings(),
    queryFn:  notificationsApi.getSettings,
    staleTime: 5 * 60_000,
  })
}

export function useUpdateNotificationSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<NotificationSettings>) => notificationsApi.updateSettings(body),
    onSuccess:  (data) => qc.setQueryData(KEYS.settings(), data),
  })
}

/** Returns count of unread notifications. */
export function useUnreadCount(): number {
  const { data } = useNotifications()
  return data?.filter(n => !n.is_read).length ?? 0
}
