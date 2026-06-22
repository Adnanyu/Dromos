import { api } from './client'
import type {
  GeneratedRoute, SavedRoute, GenerateRouteRequest, SaveRouteRequest,
  UpdateRouteRequest, NearbyRoutesParams,
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
}
