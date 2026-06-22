import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { socialApi } from '../api/social'
import type { RouteCommentRequest, RouteShareRequest } from '../types/api'

export function useFeed(limit = 50) {
  return useQuery({
    queryKey: ['feed', limit],
    queryFn:  () => socialApi.getFeed(limit),
    staleTime: 60_000,
  })
}

export function useFollow(targetUserId: string) {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['users', targetUserId] })
  return {
    follow:   useMutation({ mutationFn: () => socialApi.follow(targetUserId),   onSuccess: invalidate }),
    unfollow: useMutation({ mutationFn: () => socialApi.unfollow(targetUserId), onSuccess: invalidate }),
  }
}

export function useLikeRoute(routeId: string) {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['routes', routeId] })
  return {
    like:   useMutation({ mutationFn: () => socialApi.likeRoute(routeId),   onSuccess: invalidate }),
    unlike: useMutation({ mutationFn: () => socialApi.unlikeRoute(routeId), onSuccess: invalidate }),
  }
}

export function useRouteComments(routeId: string) {
  return useQuery({
    queryKey: ['routes', routeId, 'comments'],
    queryFn:  () => socialApi.getRouteComments(routeId),
    enabled:  !!routeId,
  })
}

export function useCommentRoute(routeId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: RouteCommentRequest) => socialApi.commentRoute(routeId, body),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['routes', routeId, 'comments'] }),
  })
}

export function useShareRoute(routeId: string) {
  return useMutation({
    mutationFn: (body?: RouteShareRequest) => socialApi.shareRoute(routeId, body),
  })
}

export function useGiveKudos(activityId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => socialApi.giveKudos(activityId),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['activities', activityId] }),
  })
}
