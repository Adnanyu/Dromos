// ── Primitives ────────────────────────────────────────────────────────────────

export type ActivityType  = 'running' | 'cycling' | 'hiking'
export type SurfaceType   = 'road' | 'trail' | 'mixed'
export type Difficulty    = 'easy' | 'moderate' | 'hard' | 'extreme'
export type Units         = 'metric' | 'imperial'
export type Visibility    = 'public' | 'private'
export type ActivityStatus = 'in_progress' | 'paused' | 'completed' | 'cancelled'

export interface GeoJSONLineString {
  type: 'LineString'
  coordinates: [number, number][]
}
export interface LatLng { lat: number; lng: number }

// ── Auth ──────────────────────────────────────────────────────────────────────

export interface RegisterRequest  { email: string; username: string; password: string }
export interface LoginRequest     { email: string; password: string }
export interface RefreshRequest   { refresh_token: string }
export interface AuthResponse {
  access_token: string; refresh_token: string; expires_in: number; user: PublicUser
}

// ── Users ─────────────────────────────────────────────────────────────────────

export interface PublicUser {
  /** Auth user ID — used by all API route lookups (/users/:id etc.).
   *  The store normalises this to always be the auth ID regardless of
   *  which service returned the object.                              */
  id: string
  /** Profile table PK returned by the User Service. Present on
   *  GET /users/me and PATCH /users/me responses. Normalised away in
   *  the auth store so callers never need to distinguish the two.   */
  user_id?: string
  username: string
  first_name: string | null
  last_name: string | null
  avatar_url: string | null
  bio: string | null
  location: string | null
  preferred_activities: ActivityType[]
  units: Units
  visibility: Visibility
  total_distance_m: number
  total_activities: number
  created_at: number | string
  updated_at?: number | string
}
export interface UserStats {
  user_id: string; total_distance_m: number; total_activities: number
  total_elevation_m: number; longest_run_m: number; fastest_pace_s_km: number | null
}
export interface UpdateProfileRequest {
  first_name?: string; last_name?: string; avatar_url?: string
  preferred_activities?: ActivityType[]; units?: Units
  visibility?: Visibility; location?: string
}

// ── Routes ────────────────────────────────────────────────────────────────────

export interface Waypoint {
  sequence_order: number; type: 'start' | 'end' | 'via' | 'poi'
  label: string; lat: number; lng: number
}
export interface ElevationPoint { distance_m: number; elevation_m: number }
export interface GeneratedRoute {
  activity_type: ActivityType; distance_m: number; elevation_gain_m: number
  difficulty: Difficulty; is_loop: boolean; surface_type: SurfaceType
  geometry: GeoJSONLineString; start_point: LatLng; end_point: LatLng
  waypoints: Waypoint[]; elevation_profile: ElevationPoint[]
  estimated_duration_s: number; routing_engine: string
}
export interface SavedRoute extends GeneratedRoute {
  id: string; creator_id: string; name: string; is_public: boolean
  created_at: number; updated_at: number
  is_bookmarked?: boolean
}
export interface GenerateRouteRequest {
  activity_type?: ActivityType; distance_m: number; lat: number; lng: number
  is_loop?: boolean; surface_pref?: SurfaceType; end_lat?: number; end_lng?: number; seed?: number
}
export interface SaveRouteRequest {
  // Route params — always sent so the backend can regenerate if needed
  activity_type: ActivityType
  distance_m:    number
  lat:           number
  lng:           number
  is_loop:       boolean
  surface_pref?: SurfaceType
  // Optional metadata
  name?:         string
  is_public?:    boolean
  // Pre-generated route — backend uses this directly if its Pydantic model
  // declares the field; otherwise it falls back to regenerating from params above
  generated_route?: GeneratedRoute
}
export interface UpdateRouteRequest { name?: string; is_public?: boolean }
export interface NearbyRoutesParams { lat: number; lng: number; radius_m?: number }

// ── Activities ────────────────────────────────────────────────────────────────

export interface StartActivityRequest {
  activity_type: ActivityType; route_id?: string; planned_distance_m?: number
}
export interface UpdateActivityRequest { status: ActivityStatus }
export interface Activity {
  id: string; user_id: string; route_id: string | null
  activity_type: ActivityType; status: ActivityStatus
  started_at: number; ended_at: number | null; planned_distance_m: number | null
  actual_distance_m: number; duration_s: number; avg_pace_s_per_km: number
  avg_speed_kmh: number; elevation_gain_m: number; calories: number
  track_geometry: GeoJSONLineString | null
}

// ── WebSocket ─────────────────────────────────────────────────────────────────

export interface GpsPoint { lat: number; lng: number; elevation_m?: number; accuracy_m?: number; speed_kmh?: number; ts?: number; timestamp?: number;}
export interface GpsBatchMessage { type: 'gps_batch'; points: GpsPoint[] }
export interface LiveStatsMessage {
  type: 'stats'; 
  distance_m: number; 
  pace_s_per_km: number
  elapsed_s: number; 
  elevation_gain_m: number; 
  current_position: LatLng; 
  off_route?: boolean;
  timestamp?: number;
}

// ── Route sharing ─────────────────────────────────────────────────────────────

export interface RouteShareRequest   { shared_to?: string; expires_at?: string }
export interface RouteShare {
  id: string; route_id: string; share_token: string
  shared_by: string; shared_to: string | null; expires_at: string | null
  created_at: number; route?: SavedRoute
}

// ── Notifications ─────────────────────────────────────────────────────────────

export type NotificationType = 'route_share' | 'activity_completed' | 'achievement' | 'welcome'
export interface Notification {
  id: string; user_id: string; type: NotificationType; is_read: boolean
  actor?: PublicUser; route_id?: string; activity_id?: string
  title?: string; message: string; created_at: number | string
}
export interface NotificationSettings {
  push_enabled: boolean; email_enabled: boolean; in_app_enabled: boolean
  weekly_digest: boolean
}

// ── API Envelope ──────────────────────────────────────────────────────────────

export interface ApiError { error: { code: string; message: string; fields?: Record<string, string[]> } }
export interface PaginatedResponse<T> { data: T[]; meta: { cursor?: string; has_more: boolean; total?: number } }
