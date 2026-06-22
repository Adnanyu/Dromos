import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { routesApi } from '../api/routes'
import type { GenerateRouteRequest, NearbyRoutesParams, SaveRouteRequest, UpdateRouteRequest } from '../types/api'

export const routeKeys = {
  all:    ()           => ['routes'] as const,
  detail: (id: string) => ['routes', id] as const,
  nearby: (p: NearbyRoutesParams) => ['routes', 'nearby', p] as const,
  byUser: (uid: string) => ['routes', 'user', uid] as const,
}

export function useGenerateRoute() {
  return useMutation({
    mutationFn: (body: GenerateRouteRequest) => routesApi.generate(body),
  })
}

export function useSaveRoute() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: SaveRouteRequest) => routesApi.save(body),
    onSuccess:  () => qc.invalidateQueries({ queryKey: routeKeys.all() }),
  })
}

export function useRoute(routeId: string) {
  return useQuery({
    queryKey: routeKeys.detail(routeId),
    queryFn:  () => routesApi.getById(routeId),
    enabled:  !!routeId,
  })
}

export function useUpdateRoute(routeId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: UpdateRouteRequest) => routesApi.update(routeId, body),
    onSuccess:  () => qc.invalidateQueries({ queryKey: routeKeys.detail(routeId) }),
  })
}

export function useNearbyRoutes(params: NearbyRoutesParams | null) {
  return useQuery({
    queryKey: routeKeys.nearby(params!),
    queryFn:  () => routesApi.nearby(params!),
    enabled:  !!params,
    staleTime: 2 * 60 * 1000,
  })
}

export function useUserRoutes(userId: string) {
  return useQuery({
    queryKey: routeKeys.byUser(userId),
    queryFn:  () => routesApi.listByUser(userId),
    enabled:  !!userId,
  })
}
