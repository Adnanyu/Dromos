import { api } from './client'
import type { Activity, StartActivityRequest, UpdateActivityRequest } from '../types/api'

export const activitiesApi = {
  start: (body: StartActivityRequest) =>
    api.post<Activity>('/activities', body).then(r => r.data),

  getById: (activityId: string) =>
    api.get<Activity>(`/activities/${activityId}`).then(r => r.data),

  update: (activityId: string, body: UpdateActivityRequest) =>
    api.patch<Activity>(`/activities/${activityId}`, body).then(r => r.data),

  listByUser: (userId: string, limit = 50) =>
    api.get<Activity[]>(`/users/${userId}/activities`, { params: { limit } }).then(r => r.data),
}
