import React, { useRef, useEffect, useState, forwardRef } from 'react'
import { StyleSheet, View } from 'react-native'
import MapView, { Polyline, Marker, type Region } from 'react-native-maps'
import type { GeoJSONLineString, LatLng } from '../../types/api'
import { colors } from '../../theme'

interface RouteMapProps {
  geometry:        GeoJSONLineString
  startPoint:      LatLng
  endPoint:        LatLng
  livePosition?:   LatLng | null
  /** Degrees clockwise from true north (0–360). Arrow rotates to match. */
  heading?:        number
  style?:          object
  followPosition?: boolean
}

function coordsToRegion(geometry: GeoJSONLineString): Region {
  const lats = geometry.coordinates.map(c => c[1])
  const lngs = geometry.coordinates.map(c => c[0])
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
  return {
    latitude:       (minLat + maxLat) / 2,
    longitude:      (minLng + maxLng) / 2,
    latitudeDelta:  (maxLat - minLat) * 1.35 || 0.01,
    longitudeDelta: (maxLng - minLng) * 1.35 || 0.01,
  }
}

const D = 32  // arrow circle diameter

// How often (ms) the smoothing loop is allowed to push a React state update.
// requestAnimationFrame runs every ~16ms, but committing state that often
// re-bakes the marker's native bitmap (see `tracksViewChanges` note below)
// far more than needed for something rotating a few degrees per tick.
// ~12fps is visually smooth for a slow-moving dot and much cheaper.
const SMOOTH_COMMIT_MS = 80

// Find the index of the route vertex closest to `point`. Used to split the
// planned route into an "already covered" segment and a "still ahead"
// segment, so the dimmed portion is literally part of the generated route
// line — not a separately-drawn trail of raw GPS fixes (which zig-zags off
// the route line due to GPS jitter).
//
// Equirectangular approximation (not full Haversine) — plenty accurate at
// route scale and cheap enough to run on every position update.
function nearestRouteIndex(routeCoords: { latitude: number; longitude: number }[], point: LatLng): number {
  if (routeCoords.length === 0) return -1
  const cosLat = Math.cos((point.lat * Math.PI) / 180)
  let bestIdx = 0
  let bestDistSq = Infinity
  for (let i = 0; i < routeCoords.length; i++) {
    const dLat = routeCoords[i].latitude - point.lat
    const dLng = (routeCoords[i].longitude - point.lng) * cosLat
    const distSq = dLat * dLat + dLng * dLng
    if (distSq < bestDistSq) { bestDistSq = distSq; bestIdx = i }
  }
  return bestIdx
}

// Shortest signed delta (degrees) from `from` to `to`, in [-180, 180].
// Plain subtraction breaks at the compass wraparound — e.g. 350° → 10°
// is a 20° turn, not a -340° one — which is what made heading changes
// near north look like the arrow "snapping" or freezing.
function shortestAngleDelta(from: number, to: number): number {
  let d = (to - from) % 360
  if (d > 180) d -= 360
  if (d < -180) d += 360
  return d
}

export const RouteMap = forwardRef<MapView, RouteMapProps>(function RouteMap({
  geometry,
  startPoint,
  endPoint,
  livePosition,
  heading = 0,
  style,
  followPosition,
}, forwardedRef) {
  const mapRef = useRef<MapView>(null)

  // Merge our own internal ref (used below for animateCamera) with whatever
  // ref the parent passed in (used e.g. by ActivitySummaryScreen to call
  // fitToCoordinates()/takeSnapshot() for the share-card export — those are
  // native MapView methods with no equivalent as a RouteMap prop, so the
  // parent needs the real instance, not just this wrapper component).
  function setRefs(instance: MapView | null) {
    mapRef.current = instance
    if (typeof forwardedRef === 'function') forwardedRef(instance)
    else if (forwardedRef) forwardedRef.current = instance
  }

  // ── Smooth interpolation between raw GPS fixes ────────────────────────────
  // Real GPS fixes arrive in discrete steps (every ~500ms–1s even in ideal
  // conditions — that's a hardware/OS limit, not something we can poll our
  // way around). Plotting each raw fix directly, like the previous version
  // did, makes the dot and arrow visibly jump/snap once per fix instead of
  // gliding — which reads as "glitchy" and "a couple seconds behind."
  //
  // Google/Apple Maps-style smoothness comes from tweening the displayed
  // position and heading between the last two fixes over the interval
  // between them, on every animation frame. That's what this does: each
  // time a new (livePosition, heading) prop pair arrives, we start a short
  // animation from the last displayed value to the new one, and run it via
  // requestAnimationFrame regardless of how often real fixes show up.
  const [smoothPos,     setSmoothPos]     = useState<LatLng | null>(livePosition ?? null)
  const [smoothHeading, setSmoothHeading] = useState(heading)

  const animFromRef  = useRef<{ pos: LatLng; heading: number } | null>(null)
  const animToRef    = useRef<{ pos: LatLng; heading: number } | null>(null)
  const animStartRef = useRef(0)
  const animDurRef   = useRef(400)
  const rafRef        = useRef<number | null>(null)
  const lastFixAtRef  = useRef<number | null>(null)
  const lastCommitRef = useRef(0)

  useEffect(() => {
    if (!livePosition) return

    const now = Date.now()
    // Duration = time since the previous fix, so the tween finishes right
    // as the next one is expected — clamped so a stalled or unusually fast
    // GPS cadence can't produce a too-slow or too-jumpy animation.
    const dur = lastFixAtRef.current
      ? Math.min(1200, Math.max(200, now - lastFixAtRef.current))
      : 300
    lastFixAtRef.current = now

    animFromRef.current = animToRef.current ?? {
      pos:     smoothPos ?? livePosition,
      heading: smoothHeading,
    }
    animToRef.current   = { pos: livePosition, heading }
    animStartRef.current = now
    animDurRef.current    = dur

    if (rafRef.current == null) {
      const tick = () => {
        const from = animFromRef.current
        const to   = animToRef.current
        if (!from || !to) { rafRef.current = null; return }

        const t = Math.min(1, (Date.now() - animStartRef.current) / animDurRef.current)
        const lat = from.pos.lat + (to.pos.lat - from.pos.lat) * t
        const lng = from.pos.lng + (to.pos.lng - from.pos.lng) * t
        const hd  = (from.heading + shortestAngleDelta(from.heading, to.heading) * t + 360) % 360

        const nowMs = Date.now()
        if (t >= 1 || nowMs - lastCommitRef.current >= SMOOTH_COMMIT_MS) {
          lastCommitRef.current = nowMs
          setSmoothPos({ lat, lng })
          setSmoothHeading(hd)
        }

        rafRef.current = t < 1 ? requestAnimationFrame(tick) : null
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livePosition?.lat, livePosition?.lng, heading])

  useEffect(() => () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
  }, [])

  // Smoothly pan to each raw fix. Intentionally keyed off the raw
  // `livePosition` prop (not the 12fps `smoothPos` above) — recentring the
  // camera at animation-loop frequency would fire animateCamera dozens of
  // times a second and fight itself. Duration is kept shorter than the GPS
  // update cadence (~500ms, see ActiveActivityScreen) so each camera move
  // finishes before the next fix arrives, instead of perpetually chasing it.
  //
  // We intentionally do NOT pass heading to animateCamera — rotating the
  // whole map on every compass update causes the jarring "whole screen
  // pops" effect the user reported previously. The arrow marker handles
  // direction independently.
  useEffect(() => {
    if (!followPosition || !livePosition) return
    mapRef.current?.animateCamera(
      {
        center:   { latitude: livePosition.lat, longitude: livePosition.lng },
        zoom:     17,
        altitude: 500,   // iOS equivalent of zoom 17
        pitch:    0,
      },
      { duration: 300 },
    )
  }, [livePosition, followPosition])

  const routeCoords = geometry.coordinates.map(([lng, lat]) => ({ latitude: lat, longitude: lng }))

  // Split the route itself at the point closest to the runner's *displayed*
  // (smoothed) position, so the dimmed/bright split animates in lockstep
  // with the dot instead of jumping once per raw fix.
  const progressIdx = smoothPos ? nearestRouteIndex(routeCoords, smoothPos) : -1
  const liveCoord    = smoothPos ? { latitude: smoothPos.lat, longitude: smoothPos.lng } : null

  const coveredCoords =
    progressIdx > 0 && liveCoord
      ? [...routeCoords.slice(0, progressIdx + 1), liveCoord]
      : []

  const aheadCoords =
    progressIdx >= 0 && liveCoord
      ? [liveCoord, ...routeCoords.slice(progressIdx + 1)]
      : routeCoords

  return (
    <MapView
      ref={setRefs}
      style={[styles.map, style]}
      initialRegion={coordsToRegion(geometry)}
      mapType="standard"
      userInterfaceStyle="dark"
      showsUserLocation={false}
      showsCompass={false}
      showsScale={false}
      pitchEnabled={false}
      rotateEnabled={false}
    >
      {/* Planned route — the portion still ahead, full brightness */}
      <Polyline
        coordinates={aheadCoords}
        strokeColor={colors.primary}
        strokeWidth={4}
      />

      {/* Covered portion — same route line, same width, just dimmed.
          This is a slice of `routeCoords` itself (see nearestRouteIndex),
          not a trail of raw GPS fixes, so it can't drift off the route
          polyline the way a separately-accumulated trace would. */}
      {coveredCoords.length > 1 && (
        <Polyline
          coordinates={coveredCoords}
          strokeColor={colors.primary + '50'}
          strokeWidth={4}
        />
      )}

      {/* Start pin */}
      <Marker
        coordinate={{ latitude: startPoint.lat, longitude: startPoint.lng }}
        pinColor={colors.primary}
        title="Start"
      />

      {/* Finish pin — only for A-to-B routes */}
      {(startPoint.lat !== endPoint.lat || startPoint.lng !== endPoint.lng) && (
        <Marker
          coordinate={{ latitude: endPoint.lat, longitude: endPoint.lng }}
          pinColor={colors.accent}
          title="Finish"
        />
      )}

      {/* ── Navigation arrow ─────────────────────────────────────────────────
          We previously relied on the Marker's native `rotation` prop. That
          prop is inconsistently applied to CUSTOM (children-based) markers
          across react-native-maps/platform versions — which is exactly why
          the arrow was reported stuck facing one direction even after adding
          `flat`. Rather than keep chasing platform-specific native-prop
          behaviour, we rotate the arrow ourselves with a plain RN style
          transform on NavArrow — that's just a View style, so it is
          guaranteed to apply on both platforms every time `smoothHeading`
          changes, with no dependency on the map library's native bridging.

          Trade-off: this requires `tracksViewChanges={true}`, since the
          marker's bitmap now has to be re-baked whenever the rotation style
          changes (unlike the old rotation-prop approach, which could update
          natively without a JS re-render). For a single marker updating at
          the throttled ~12fps set by SMOOTH_COMMIT_MS above, this is a
          reasonable trade for an arrow that actually turns. If this becomes
          a measured perf issue on low-end Android devices, the fix is to
          lower SMOOTH_COMMIT_MS's rate further before reaching for the
          native rotation prop again. ─────────────────────────────────── */}
      {smoothPos && (
        <Marker
          coordinate={{ latitude: smoothPos.lat, longitude: smoothPos.lng }}
          anchor={{ x: 0.5, y: 0.5 }}
          tracksViewChanges
        >
          <NavArrow heading={smoothHeading} />
        </Marker>
      )}
    </MapView>
  )
})
RouteMap.displayName = 'RouteMap'

// ── Apple-Maps-style navigation arrow ──────────────────────────────────────
// Shape: blue filled circle, white border ring, subtle blue glow.
// Inside: a solid white ↑ arrow (triangle head + rectangular shaft).
// Rotation is applied to the outer circle via a plain style transform —
// see the rotation comment above the Marker for why this replaced the
// native `rotation` prop.
function NavArrow({ heading }: { heading: number }) {
  return (
    <View style={[arr.glow, { transform: [{ rotate: `${heading}deg` }] }]}>
      <View style={arr.ring}>
        <View style={arr.body}>
          {/* Arrow head — triangle pointing up */}
          <View style={arr.head} />
          {/* Arrow shaft */}
          <View style={arr.shaft} />
        </View>
      </View>
    </View>
  )
}

const arr = StyleSheet.create({
  glow: {
    width:        D + 16,
    height:       D + 16,
    borderRadius: (D + 16) / 2,
    backgroundColor: 'rgba(0,122,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    width:        D + 6,
    height:       D + 6,
    borderRadius: (D + 6) / 2,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 6,
  },
  body: {
    width:        D,
    height:       D,
    borderRadius: D / 2,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Triangle arrowhead pointing up (border trick)
  head: {
    width: 0,
    height: 0,
    borderLeftWidth:   5,
    borderRightWidth:  5,
    borderBottomWidth: 8,
    borderLeftColor:   'transparent',
    borderRightColor:  'transparent',
    borderBottomColor: '#ffffff',
    marginBottom: -1,
  },
  // Rectangular shaft below the head
  shaft: {
    width:        4,
    height:       6,
    borderRadius: 2,
    backgroundColor: '#ffffff',
  },
})

const styles = StyleSheet.create({
  map: { flex: 1 },
})