import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { activitiesApi } from '../api/activities'
import { useActivityStore } from '../store/activity.store'
import type { StartActivityRequest, UpdateActivityRequest } from '../types/api'

export const activityKeys = {
  detail:  (id: string)  => ['activities', id] as const,
  byUser:  (uid: string) => ['activities', 'user', uid] as const,
}

export function useStartActivity() {
  const { start } = useActivityStore()
  return useMutation({
    mutationFn: (body: StartActivityRequest) => activitiesApi.start(body),
    onSuccess: (activity) => start(activity.id, activity.activity_type),
  })
}

export function useUpdateActivity(activityId: string) {
  const qc       = useQueryClient()
  const setStatus = useActivityStore(s => s.setStatus)

  return useMutation({
    mutationFn: (body: UpdateActivityRequest) => activitiesApi.update(activityId, body),
    onSuccess: (activity) => {
      setStatus(activity.status)
      qc.setQueryData(activityKeys.detail(activityId), activity)
      qc.invalidateQueries({ queryKey: ['activities', 'user'] })
      qc.invalidateQueries({ queryKey: ['users', activity.user_id] })
    },
  })
}

export function useActivity(activityId: string) {
  return useQuery({
    queryKey: activityKeys.detail(activityId),
    queryFn:  () => activitiesApi.getById(activityId),
    enabled:  !!activityId,
  })
}

export function useUserActivities(userId: string) {
  return useQuery({
    queryKey: activityKeys.byUser(userId),
    queryFn:  () => activitiesApi.listByUser(userId),
    enabled:  !!userId,
  })
}
