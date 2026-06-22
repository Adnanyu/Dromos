import { api } from './client'
import type { Notification, NotificationSettings } from '../types/api'

export const notificationsApi = {
  list: (limit = 50) =>
    api.get<Notification[]>('/notifications', { params: { limit } }).then(r => r.data),

  markRead: (notificationId: string) =>
    api.patch<Notification>(`/notifications/${notificationId}/read`).then(r => r.data),

  markAllRead: () =>
    api.patch<{ updated: number }>('/notifications/read-all').then(r => r.data),

  getSettings: () =>
    api.get<NotificationSettings>('/notifications/settings').then(r => r.data),

  updateSettings: (body: Partial<NotificationSettings>) =>
    api.patch<NotificationSettings>('/notifications/settings', body).then(r => r.data),
}
