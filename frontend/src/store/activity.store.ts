import { create } from 'zustand'
import type { ActivityStatus, ActivityType, LatLng } from '../types/api'

export interface LiveStats {
  distance_m: number
  pace_s_per_km: number
  elapsed_s: number
  elevation_gain_m: number
  current_position: LatLng | null
  off_route: boolean
}

const DEFAULT_STATS: LiveStats = {
  distance_m:       0,
  pace_s_per_km:    0,
  elapsed_s:        0,
  elevation_gain_m: 0,
  current_position: null,
  off_route:        false,
}

interface ActivityState {
  activityId:   string | null
  activityType: ActivityType | null
  status:       ActivityStatus | null
  stats:        LiveStats

  start:        (id: string, type: ActivityType) => void
  updateStats:  (partial: Partial<LiveStats>)     => void
  setStatus:    (status: ActivityStatus)          => void
  reset:        ()                                => void
}

export const useActivityStore = create<ActivityState>((set) => ({
  activityId:   null,
  activityType: null,
  status:       null,
  stats:        { ...DEFAULT_STATS },

  start: (activityId, activityType) =>
    set({ activityId, activityType, status: 'in_progress', stats: { ...DEFAULT_STATS } }),

  updateStats: (partial) =>
    set((s) => ({ stats: { ...s.stats, ...partial } })),

  setStatus: (status) => set({ status }),

  reset: () =>
    set({ activityId: null, activityType: null, status: null, stats: { ...DEFAULT_STATS } }),
}))
