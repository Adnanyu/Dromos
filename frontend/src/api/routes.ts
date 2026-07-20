import { api } from './client'
import type {
  GeneratedRoute, SavedRoute, GenerateRouteRequest, SaveRouteRequest,
  UpdateRouteRequest, NearbyRoutesParams,
  RouteShare, RouteShareRequest,
} from '../types/api'

export const routesApi = {
  generate: (body: GenerateRouteRequest) =>
    api.post<GeneratedRoute>('/routes/generate', body).then(r => r.data),

  save: (body: SaveRouteRequest) =>
    api.post<SavedRoute>('/routes', body).then(r => r.data),

  getById: (routeId: string) =>
    api.get<SavedRoute>(`/routes/${routeId}`).then(r => r.data),

  update: (routeId: string, body: UpdateRouteRequest) =>
    api.patch<SavedRoute>(`/routes/${routeId}`, body).then(r => r.data),

  nearby: (params: NearbyRoutesParams) =>
    api.get<SavedRoute[]>('/routes/nearby', { params }).then(r => r.data),

  listByUser: (userId: string) =>
    api.get<SavedRoute[]>(`/users/${userId}/routes`).then(r => r.data),

  share: (routeId: string, body?: RouteShareRequest) =>
    api.post<RouteShare>(`/routes/${routeId}/share`, body ?? {}).then(r => r.data),

  resolveShare: (token: string) =>
    api.get<RouteShare>(`/shares/${token}`).then(r => r.data),
}
