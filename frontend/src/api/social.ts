import { api } from './client'
import type { FeedItem, RouteComment, RouteCommentRequest, RouteShare, RouteShareRequest } from '../types/api'

export const socialApi = {
  getFeed: (limit = 50) =>
    api.get<FeedItem[]>('/feed', { params: { limit } }).then(r => r.data),

  follow:   (userId: string) => api.post<void>(`/follows/${userId}`).then(r => r.data),
  unfollow: (userId: string) => api.delete<void>(`/follows/${userId}`).then(r => r.data),

  likeRoute:   (routeId: string) => api.post<void>(`/routes/${routeId}/like`).then(r => r.data),
  unlikeRoute: (routeId: string) => api.delete<void>(`/routes/${routeId}/like`).then(r => r.data),

  commentRoute: (routeId: string, body: RouteCommentRequest) =>
    api.post<RouteComment>(`/routes/${routeId}/comment`, body).then(r => r.data),

  getRouteComments: (routeId: string) =>
    api.get<RouteComment[]>(`/routes/${routeId}/comments`).then(r => r.data),

  shareRoute: (routeId: string, body?: RouteShareRequest) =>
    api.post<RouteShare>(`/routes/${routeId}/share`, body ?? {}).then(r => r.data),

  resolveShare: (token: string) =>
    api.get<RouteShare>(`/shares/${token}`).then(r => r.data),

  giveKudos: (activityId: string) =>
    api.post<void>(`/activities/${activityId}/kudos`).then(r => r.data),
}
