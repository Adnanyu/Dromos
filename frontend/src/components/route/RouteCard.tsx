import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import MapView, { Polyline, Marker } from 'react-native-maps'
import { Ionicons } from '@expo/vector-icons'
import type { SavedRoute } from '../../types/api'
import { colors, fontSize, fontWeight, spacing, radius } from '../../theme'
import { useFormatters } from '../../hooks/useUnits'
import { DifficultyBadge, ActivityBadge } from '../ui/Badge'
import { useLikeRoute } from '../../hooks/useSocial'

interface RouteCardProps {
  route:    SavedRoute
  onPress?: () => void
  style?:   object
}

function coordsToRegion(geometry: SavedRoute['geometry']) {
  const lats = geometry.coordinates.map((c: number[]) => c[1])
  const lngs = geometry.coordinates.map((c: number[]) => c[0])
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
  return {
    latitude:       (minLat + maxLat) / 2,
    longitude:      (minLng + maxLng) / 2,
    latitudeDelta:  (maxLat - minLat) * 1.5 || 0.01,
    longitudeDelta: (maxLng - minLng) * 1.5 || 0.01,
  }
}

export function RouteCard({ route, onPress, style }: RouteCardProps) {
  const { like, unlike } = useLikeRoute(route.id)
  const { distance, durationWords, elevation } = useFormatters()

  const activityColor = (
    { running: colors.running, cycling: colors.cycling, hiking: colors.hiking } as Record<string, string>
  )[route.activity_type] ?? colors.primary

  const polylineCoords = route.geometry?.coordinates?.map(
    ([lng, lat]: number[]) => ({ latitude: lat, longitude: lng })
  ) ?? []

  const hasGeometry = polylineCoords.length >= 2

  function toggleLike() {
    route.is_liked ? unlike.mutate() : like.mutate()
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={onPress ? 0.75 : 1}
      style={[styles.card, style]}
    >
      {/* ── Map preview ──────────────────────────────────────────────────── */}
      <View style={styles.mapContainer}>
        {hasGeometry ? (
          <>
            <MapView
              style={StyleSheet.absoluteFill}
              initialRegion={coordsToRegion(route.geometry)}
              mapType="standard"
              userInterfaceStyle="dark"
              scrollEnabled={false}
              zoomEnabled={false}
              rotateEnabled={false}
              pitchEnabled={false}
              showsUserLocation={false}
              showsCompass={false}
              showsScale={false}
              showsMyLocationButton={false}
              pointerEvents="none"
            >
              <Polyline
                coordinates={polylineCoords}
                strokeColor={activityColor}
                strokeWidth={3}
              />
              <Marker
                coordinate={{ latitude: route.start_point.lat, longitude: route.start_point.lng }}
                anchor={{ x: 0.5, y: 0.5 }}
                tracksViewChanges={false}
              >
                <View style={[styles.markerDot, { backgroundColor: activityColor }]} />
              </Marker>
              {(route.start_point.lat !== route.end_point.lat ||
                route.start_point.lng !== route.end_point.lng) && (
                <Marker
                  coordinate={{ latitude: route.end_point.lat, longitude: route.end_point.lng }}
                  anchor={{ x: 0.5, y: 0.5 }}
                  tracksViewChanges={false}
                >
                  <View style={styles.markerEnd} />
                </Marker>
              )}
            </MapView>

            {/* Bottom scrim */}
            <View style={styles.scrim} pointerEvents="none" />
            {/* Activity-colour left accent bar */}
            <View style={[styles.accentBar, { backgroundColor: activityColor }]} pointerEvents="none" />
            {/* Loop / one-way chip */}
            <View style={styles.loopChip} pointerEvents="none">
              <Ionicons
                name={route.is_loop ? 'refresh-circle-outline' : 'arrow-forward-circle-outline'}
                size={12}
                color={colors.white}
              />
              <Text style={styles.loopChipText}>
                {route.is_loop ? 'Loop' : 'One-way'}
              </Text>
            </View>
          </>
        ) : (
          <View style={styles.mapFallback}>
            <Ionicons name="map-outline" size={28} color={colors.textMuted} />
          </View>
        )}
      </View>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <View style={styles.body}>
        <View style={styles.headerRow}>
          <Text style={styles.name} numberOfLines={1}>{route.name}</Text>
          <TouchableOpacity
            onPress={toggleLike}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name={route.is_liked ? 'heart' : 'heart-outline'}
              size={18}
              color={route.is_liked ? colors.danger : colors.textMuted}
            />
          </TouchableOpacity>
        </View>

        <View style={styles.badgeRow}>
          <ActivityBadge type={route.activity_type} />
          <DifficultyBadge difficulty={route.difficulty} />
        </View>

        <View style={styles.statsRow}>
          <Pill icon="navigate-outline"   label={distance(route.distance_m)} />
          <Pill icon="time-outline"        label={durationWords(route.estimated_duration_s)} />
          <Pill icon="trending-up-outline" label={elevation(route.elevation_gain_m)} />
        </View>

        <View style={styles.footer}>
          <View style={styles.footerLeft}>
            <Ionicons name="heart" size={12} color={colors.textMuted} />
            <Text style={styles.footerCount}>{route.like_count}</Text>
            <Ionicons name="bookmark-outline" size={12} color={colors.textMuted} style={{ marginLeft: 8 }} />
            <Text style={styles.footerCount}>{route.save_count}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  )
}

function Pill({ icon, label }: { icon: string; label: string }) {
  return (
    <View style={styles.pill}>
      <Ionicons name={icon as any} size={12} color={colors.textMuted} />
      <Text style={styles.pillText}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius:    radius.lg,
    borderWidth:     0.5,
    borderColor:     colors.border,
    overflow:        'hidden',
  },

  mapContainer: {
    width:           '100%',
    height:          150,
    backgroundColor: colors.surface,
  },
  mapFallback: {
    flex:            1,
    alignItems:      'center',
    justifyContent:  'center',
  },
  scrim: {
    position:        'absolute',
    left: 0, right: 0, bottom: 0,
    height:          48,
    backgroundColor: 'rgba(7,17,31,0.45)',
  },
  accentBar: {
    position: 'absolute',
    left: 0, top: 0, bottom: 0,
    width: 3,
  },
  loopChip: {
    position:          'absolute',
    bottom:            spacing.sm,
    right:             spacing.sm,
    flexDirection:     'row',
    alignItems:        'center',
    gap:               3,
    backgroundColor:   'rgba(7,17,31,0.65)',
    borderRadius:      radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical:   3,
  },
  loopChipText: { fontSize: fontSize.xs, color: colors.white },

  markerDot: {
    width: 10, height: 10,
    borderRadius:  5,
    borderWidth:   1.5,
    borderColor:   colors.white,
  },
  markerEnd: {
    width: 10, height: 10,
    borderRadius:    5,
    backgroundColor: colors.accent ?? colors.textSecondary,
    borderWidth:     1.5,
    borderColor:     colors.white,
  },

  body:      { padding: spacing.lg, gap: spacing.sm },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  name: {
    flex:        1,
    fontSize:    fontSize.md,
    fontWeight:  fontWeight.semibold,
    color:       colors.textPrimary,
    marginRight: spacing.sm,
  },
  badgeRow: { flexDirection: 'row', gap: spacing.xs },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  pill: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               4,
    backgroundColor:   colors.surface,
    borderRadius:      radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical:   3,
  },
  pillText:    { fontSize: fontSize.xs, color: colors.textSecondary },
  footer:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 },
  footerLeft:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  footerCount: { fontSize: fontSize.xs, color: colors.textMuted },
})