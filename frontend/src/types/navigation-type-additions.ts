// ─────────────────────────────────────────────────────────────────────────────
// ADD THESE TO YOUR EXISTING types/navigation.ts
// ─────────────────────────────────────────────────────────────────────────────
//
// 1. DiscoverStackParamList  — new stack wrapping DiscoverScreen
// 2. RootStackParamList      — thin root stack that wraps the tab navigator
// 3. ProfileStackParamList   — add RouteDetail screen
//
// The params shared by RoutePreview / RouteDetail are identical so both stacks
// can reuse the same shape.
//
// ─────────────────────────────────────────────────────────────────────────────

import type { GeneratedRoute, GenerateRouteRequest } from './api'

// Params accepted by any RoutePreview/RouteDetail screen
export type RoutePreviewParams = {
  generatedRoute: GeneratedRoute   // SavedRoute satisfies this shape
  params?:        GenerateRouteRequest | undefined  // undefined = no regenerate button
  isOwner?:       boolean          // true  → hide "Save route only"
  savedRouteId?:  string           // skip re-saving if route is already persisted
}

// ── Discover stack ────────────────────────────────────────────────────────────

export type DiscoverStackParamList = {
  DiscoverFeed:    undefined
  RoutePreview:    RoutePreviewParams
  ActiveActivity:  {
    activityId:      string
    generatedRoute?: GeneratedRoute
    plannedDistance?: number
    activityType:    string
  }
  ActivitySummary: { activityId: string }
}

// ── Root stack ────────────────────────────────────────────────────────────────
// Thin wrapper so screens launched from any tab can hide the tab bar.

export type RootStackParamList = {
  Tabs: undefined
}

// ── Updated Profile stack (add RouteDetail) ───────────────────────────────────

// If your existing ProfileStackParamList looks like this:
//
//   export type ProfileStackParamList = {
//     Profile:     { userId?: string } | undefined
//     EditProfile: undefined
//   }
//
// Add RouteDetail to it:
//
//   export type ProfileStackParamList = {
//     Profile:     { userId?: string } | undefined
//     EditProfile: undefined
//     RouteDetail: RoutePreviewParams   // ← add this
//   }
//
// Then register the screen in ProfileNavigator inside AppNavigator.tsx:
//
//   <ProfileStack.Screen name="RouteDetail" component={RoutePreviewScreen} />
//
// ─────────────────────────────────────────────────────────────────────────────
