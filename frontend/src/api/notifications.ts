import { api } from './client'
import type { Notification, NotificationSettings, NotificationType } from '../types/api'

// The notification service stores raw MongoDB documents: `_id`, `title` +
// `body`, `read_at`, and dot-separated event types ("user.registered").
// The app works with the normalized `Notification` shape (`id`, `message`,
// `is_read`, snake_case types) — this mapping is what makes the list render;
// passing raw documents through left every row with an undefined id/message.
const TYPE_ALIASES: Record<string, NotificationType> = {
  'user.registered':    'welcome',
  'activity.completed': 'activity_completed',
  'route.shared':       'route_share',
}

function normalizeNotification(raw: any): Notification {
  return {
    id:          String(raw._id ?? raw.id ?? ''),
    user_id:     raw.user_id,
    type:        TYPE_ALIASES[raw.type] ?? (raw.type as NotificationType),
    is_read:     raw.read_at != null || raw.is_read === true,
    route_id:    raw.route_id ?? undefined,
    activity_id: raw.activity_id ?? undefined,
    title:       raw.title ?? undefined,
    message:     raw.body ?? raw.message ?? raw.title ?? '',
    created_at:  raw.created_at,
  }
}

export const notificationsApi = {
  list: (limit = 50) =>
    api.get<unknown[]>('/notifications', { params: { limit } })
      .then(r => (r.data ?? []).map(normalizeNotification)),

  markRead: (notificationId: string) =>
    api.patch<unknown>(`/notifications/${notificationId}/read`)
      .then(r => normalizeNotification(r.data)),

  markAllRead: () =>
    api.patch<{ modified_count: number }>('/notifications/read-all').then(r => r.data),

  getSettings: () =>
    api.get<NotificationSettings>('/notifications/settings').then(r => r.data),

  updateSettings: (body: Partial<NotificationSettings>) =>
    api.patch<NotificationSettings>('/notifications/settings', body).then(r => r.data),
}
