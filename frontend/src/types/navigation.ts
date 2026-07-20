import type { NavigatorScreenParams } from '@react-navigation/native'
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

 
export type DiscoverStackParamList = {
  DiscoverFeed:    undefined
  RoutePreview:    RoutePreviewParams
  ActiveActivity:  {
    activityId:      string
    generatedRoute?: GeneratedRoute
    plannedDistance: number
    activityType:    ActivityType
  }
  ActivitySummary: { activityId: string }
}

export type RootStackParamList = {
  Auth: undefined
  App:  undefined
}

export type AppStackParamList = {
  Tabs: undefined
}

export type AuthStackParamList = {
  Login:    undefined
  Register: undefined
}

export type AppTabParamList = {
  Home:          undefined
  Discover:      NavigatorScreenParams<DiscoverStackParamList> | undefined
  Plan:          NavigatorScreenParams<PlanStackParamList> | undefined
  ProfileTab:    NavigatorScreenParams<ProfileStackParamList> | undefined
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
