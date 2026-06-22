import type { GeneratedRoute, GenerateRouteRequest, ActivityType } from './api'
type AtobMode = 'pin' | 'distance'

export type RouteGenerationMeta = {
  atobMode?: AtobMode
}

export type RoutePreviewParams = {
  generatedRoute: GeneratedRoute
  params?: GenerateRouteRequest
  isOwner?: boolean
  savedRouteId?: string

  // ADD THIS
  generationMeta?: RouteGenerationMeta
}

 
// ── 1. NEW: Discover stack ────────────────────────────────────────────────────
export type DiscoverStackParamList = {
  DiscoverFeed:    undefined
  RoutePreview:    RoutePreviewParams
  ActiveActivity:  {
    activityId:       string
    generatedRoute?:  GeneratedRoute
    plannedDistance?: number
    activityType:     string
  }
  ActivitySummary: { activityId: string }
  generationMeta?: RouteGenerationMeta
}
 

export type RootStackParamList = {
  Auth: undefined
  App:  undefined
}

export type AuthStackParamList = {
  Login:    undefined
  Register: undefined
}

export type AppTabParamList = {
  Home:          undefined
  Discover:      undefined
  Plan:          undefined
  ProfileTab:    undefined
  Notifications: undefined
}

export type PlanStackParamList = {
  PlanForm: undefined
  RoutePreview: RoutePreviewParams
  ActiveActivity: {
    activityId: string
    generatedRoute?: GeneratedRoute
    plannedDistance: number
    activityType: ActivityType
  }
  ActivitySummary: {
    activityId: string
  }
}

export type ProfileStackParamList = {
  Profile:     { userId?: string }
  EditProfile: undefined
  UserRoutes:  { userId: string; username: string }
}

