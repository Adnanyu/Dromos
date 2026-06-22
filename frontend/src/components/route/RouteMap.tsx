import React, { useRef, useEffect } from 'react'
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
  /** Already-travelled coordinates — rendered as a dimmed polyline. */
  coveredPath?:    LatLng[]
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

export function RouteMap({
  geometry,
  startPoint,
  endPoint,
  livePosition,
  heading = 0,
  coveredPath,
  style,
  followPosition,
}: RouteMapProps) {
  const mapRef = useRef<MapView>(null)

  // Smoothly pan to the live position. We intentionally do NOT pass heading
  // to animateCamera — rotating the whole map on every compass update causes
  // the jarring "whole screen pops" effect the user reported. The arrow
  // marker handles direction independently via its rotation prop.
  useEffect(() => {
    if (!followPosition || !livePosition) return
    mapRef.current?.animateCamera(
      {
        center:   { latitude: livePosition.lat, longitude: livePosition.lng },
        zoom:     17,
        altitude: 500,   // iOS equivalent of zoom 17
        pitch:    0,
      },
      { duration: 700 },
    )
  }, [livePosition, followPosition])

  const routeCoords  = geometry.coordinates.map(([lng, lat]) => ({ latitude: lat, longitude: lng }))
  const coveredCoords = (coveredPath ?? []).map(p => ({ latitude: p.lat, longitude: p.lng }))

  return (
    <MapView
      ref={mapRef}
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
      {/* Planned route */}
      <Polyline
        coordinates={routeCoords}
        strokeColor={colors.primary}
        strokeWidth={4}
      />

      {/* Covered portion — same width, dimmed so ahead looks brighter */}
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
          No `flat` prop — without it `rotation` is applied in SCREEN space
          (degrees clockwise from "up on screen"), which is exactly what we
          want on a north-up map: heading 90° → arrow points right (east). ✓

          With `flat={true}` the rotation is applied in MAP space and the
          value gets composed with the camera heading, making it doubly wrong
          whenever the map is also being panned/rotated.

          `tracksViewChanges={false}` is critical: the marker's visual never
          changes (only `rotation` does, which the native SDK handles without
          a JS-side re-render). Without this flag the map re-renders the
          marker on every position update — a significant perf hit. ─────── */}
      {livePosition && (
        <Marker
          coordinate={{ latitude: livePosition.lat, longitude: livePosition.lng }}
          anchor={{ x: 0.5, y: 0.5 }}
          rotation={heading}
          tracksViewChanges={false}
        >
          <NavArrow />
        </Marker>
      )}
    </MapView>
  )
}

// ── Apple-Maps-style navigation arrow ──────────────────────────────────────
// Rendered as a static view (heading is applied via the Marker's rotation
// prop at the native layer, so this component never re-renders at runtime).
//
// Shape: blue filled circle, white border ring, subtle blue glow.
// Inside: a solid white ↑ arrow (triangle head + rectangular shaft) that
// always points toward the top of the marker — i.e. the direction of travel
// after the Marker rotation is applied.
function NavArrow() {
  return (
    <View style={arr.glow}>
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