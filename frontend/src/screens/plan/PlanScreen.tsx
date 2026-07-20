import React, { useMemo, useState, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Alert, Switch,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import MapView, { Marker, MapPressEvent } from 'react-native-maps'
import { Ionicons } from '@expo/vector-icons'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useGenerateRoute }   from '../../hooks/useRoutes'
import { useCurrentLocation } from '../../hooks/useLocation'
import { useFormatters }      from '../../hooks/useUnits'
import { Button }             from '../../components/ui/Button'
import { colors, fontSize, fontWeight, spacing, radius } from '../../theme'
import type { ActivityType, SurfaceType, GenerateRouteRequest } from '../../types/api'
import type { PlanStackParamList } from '../../types/navigation'
import { userMessageFromError } from '../../utils/errors'
import { destinationPoint } from '../../utils/destinationCalculator'

type Props = NativeStackScreenProps<PlanStackParamList, 'PlanForm'>

// ── Static config ─────────────────────────────────────────────────────────────

const ACTIVITY_OPTIONS: { type: ActivityType; icon: React.ComponentProps<typeof Ionicons>['name']; label: string }[] = [
  { type: 'running', icon: 'walk-outline', label: 'Run' },
  { type: 'cycling', icon: 'bicycle-outline', label: 'Ride' },
  { type: 'hiking',  icon: 'trail-sign-outline', label: 'Hike' },
]

const SURFACE_OPTIONS: { type: SurfaceType; label: string }[] = [
  { type: 'road',  label: 'Road' },
  { type: 'mixed', label: 'Mixed' },
  { type: 'trail', label: 'Trail' },
]

const DISTANCE_PRESETS_KM = [2, 5, 10, 15, 21, 30, 42]

// A-to-B can be "pick a distance" or "drop a pin on the map"
type AtoB_Mode = 'distance' | 'pin'

// ── Component ─────────────────────────────────────────────────────────────────

export function PlanScreen({ navigation }: Props) {
  const [activityType, setActivityType] = useState<ActivityType>('running')
  const [distanceKm,   setDistanceKm]   = useState(5)
  const [isLoop,       setIsLoop]       = useState(true)
  const [surfacePref,  setSurfacePref]  = useState<SurfaceType>('mixed')

  // A-to-B state
  const [atobMode,  setAtobMode]  = useState<AtoB_Mode>('distance')
  const [endPin,    setEndPin]    = useState<{ lat: number; lng: number } | null>(null)

  const { location, loading: locLoading, refresh: refreshLoc } = useCurrentLocation()
  const { mutate: generate, isPending } = useGenerateRoute()
  const { distanceShort } = useFormatters()

  const randomBearing = useMemo(() => Math.random() * 360, [location?.lat, location?.lng, distanceKm, activityType])
  const distanceMeters = distanceKm * 1000

  const activityColor = (
    { running: colors.running, cycling: colors.cycling, hiking: colors.hiking } as Record<string, string>
  )[activityType] ?? colors.primary

  function labelKm(km: number) {
    return distanceShort(km * 1000)
  }

  // ── Generate ────────────────────────────────────────────────────────────────

  const handleGenerate = useCallback(() => {
    if (!location) {
      Alert.alert('Location needed', 'Allow location access to generate a route.', [
        { text: 'Retry', onPress: refreshLoc },
      ])
      return
    }

    // Validate A-to-B pin mode
    if (!isLoop && atobMode === 'pin' && !endPin) {
      Alert.alert('Drop a pin', 'Tap anywhere on the map to set your destination.')
      return
    }

    const generatedEnd = destinationPoint(
      location.lat,
      location.lng,
      distanceMeters,
      randomBearing
    );

    const params: GenerateRouteRequest = {
      activity_type: activityType,
      distance_m:    distanceKm * 1000,
      lat:           location.lat,
      lng:           location.lng,
      is_loop:       isLoop,
      surface_pref:  surfacePref,
      // Only include end coords for A-to-B pin mode
      ...(!isLoop &&
      atobMode === "pin" &&
      endPin
        ? {
            end_lat: endPin.lat,
            end_lng: endPin.lng,
          }
        : {}),

      // A-to-B using generated distance destination
      ...(!isLoop &&
      atobMode === "distance" &&
      generatedEnd
        ? {
            end_lat: generatedEnd.lat,
            end_lng: generatedEnd.lng,
          }
        : {}),
    }

    generate(params, {
      onSuccess: (generatedRoute) =>
        navigation.navigate('RoutePreview', { generatedRoute, params, generationMeta: {
        atobMode,
      },  }),
      onError: (err: unknown) => Alert.alert('Route generation failed', userMessageFromError(err, 'Dromos could not generate that route.')),
    })
  }, [location, activityType, distanceKm, distanceMeters, randomBearing, isLoop, surfacePref, atobMode, endPin, generate, navigation, refreshLoc])

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.pageHeader}>
          <Text style={styles.pageTitle}>Plan a route</Text>
          <Text style={styles.pageSubtitle}>
            {location
              ? 'Using current location'
              : locLoading ? 'Getting location...' : 'Location unavailable'}
          </Text>
        </View>

        {/* Activity type */}
        <Section title="Activity">
          <View style={styles.activityRow}>
            {ACTIVITY_OPTIONS.map(opt => {
              const active = activityType === opt.type
              const c = active ? activityColor : colors.textMuted
              return (
                <TouchableOpacity
                  key={opt.type}
                  onPress={() => setActivityType(opt.type)}
                  activeOpacity={0.75}
                  style={[styles.activityBtn, active && { borderColor: c, backgroundColor: c + '18' }]}
                >
                  <Ionicons name={opt.icon} size={26} color={c} />
                  <Text style={[styles.activityLabel, { color: c }]}>{opt.label}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </Section>

        {/* Route type toggle */}
        <Section title="Route type">
          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <Ionicons
                name={isLoop ? 'refresh-circle-outline' : 'arrow-forward-circle-outline'}
                size={20}
                color={activityColor}
              />
              <View>
                <Text style={styles.toggleLabel}>{isLoop ? 'Loop route' : 'A-to-B route'}</Text>
                <Text style={styles.toggleDesc}>
                  {isLoop ? 'Returns to your start point' : 'Ends at a different location'}
                </Text>
              </View>
            </View>
            <Switch
              value={isLoop}
              onValueChange={(v) => {
                setIsLoop(v)
                // Reset pin when switching back to loop
                if (v) setEndPin(null)
              }}
              trackColor={{ false: colors.border, true: activityColor + '60' }}
              thumbColor={isLoop ? activityColor : colors.textMuted}
            />
          </View>
        </Section>

        {/* ── A-to-B options (only when not a loop) ──────────────────────── */}
        {!isLoop && (
          <Section title="Destination">
            {/* Mode switcher */}
            <View style={styles.modeSwitcher}>
              <TouchableOpacity
                style={[styles.modeBtn, atobMode === 'distance' && { borderColor: activityColor, backgroundColor: activityColor + '18' }]}
                onPress={() => setAtobMode('distance')}
                activeOpacity={0.75}
              >
                <Ionicons
                  name="speedometer-outline"
                  size={16}
                  color={atobMode === 'distance' ? activityColor : colors.textMuted}
                />
                <Text style={[styles.modeBtnText, atobMode === 'distance' && { color: activityColor }]}>
                  By distance
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modeBtn, atobMode === 'pin' && { borderColor: activityColor, backgroundColor: activityColor + '18' }]}
                onPress={() => setAtobMode('pin')}
                activeOpacity={0.75}
              >
                <Ionicons
                  name="location-outline"
                  size={16}
                  color={atobMode === 'pin' ? activityColor : colors.textMuted}
                />
                <Text style={[styles.modeBtnText, atobMode === 'pin' && { color: activityColor }]}>
                  Pick on map
                </Text>
              </TouchableOpacity>
            </View>

            {/* Pin map */}
            {atobMode === 'pin' && (
              <View style={styles.pinMapWrapper}>
                <Text style={styles.pinMapHint}>
                  {endPin ? 'Destination set. Tap to move it.' : 'Tap the map to drop your destination pin.'}
                </Text>

                {location ? (
                  <MapView
                    style={styles.pinMap}
                    initialRegion={{
                      latitude:       location.lat,
                      longitude:      location.lng,
                      latitudeDelta:  0.05,
                      longitudeDelta: 0.05,
                    }}
                    mapType="standard"
                    userInterfaceStyle="dark"
                    showsUserLocation
                    showsCompass={false}
                    onPress={(e: MapPressEvent) => {
                      const { latitude, longitude } = e.nativeEvent.coordinate
                      setEndPin({ lat: latitude, lng: longitude })
                    }}
                  >
                    {/* Start marker — current location */}
                    <Marker
                      coordinate={{ latitude: location.lat, longitude: location.lng }}
                      anchor={{ x: 0.5, y: 0.5 }}
                      tracksViewChanges={false}
                    >
                      <View style={[styles.startDot, { backgroundColor: activityColor }]} />
                    </Marker>

                    {/* End pin */}
                    {endPin && (
                      <Marker
                        coordinate={{ latitude: endPin.lat, longitude: endPin.lng }}
                        anchor={{ x: 0.5, y: 1 }}
                        tracksViewChanges={false}
                      >
                        <View style={styles.endPinWrapper}>
                          <View style={[styles.endPinHead, { backgroundColor: activityColor }]}>
                            <Ionicons name="flag" size={12} color={colors.white} />
                          </View>
                          <View style={[styles.endPinStem, { backgroundColor: activityColor }]} />
                        </View>
                      </Marker>
                    )}
                  </MapView>
                ) : (
                  <View style={styles.pinMapUnavailable}>
                    <Ionicons name="location-outline" size={28} color={colors.textMuted} />
                    <Text style={styles.pinMapUnavailableText}>Location unavailable</Text>
                  </View>
                )}

                {endPin && (
                  <TouchableOpacity
                    style={styles.clearPinBtn}
                    onPress={() => setEndPin(null)}
                  >
                    <Ionicons name="close-circle" size={14} color={colors.textMuted} />
                    <Text style={styles.clearPinText}>Clear pin</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </Section>
        )}

        {/* Distance — shown for loops and A-to-B "by distance" mode */}
        {(isLoop || atobMode === 'distance') && (
          <Section title={`Distance — ${labelKm(distanceKm)}`}>
            <View style={styles.distanceGrid}>
              {DISTANCE_PRESETS_KM.map(km => {
                const active = distanceKm === km
                return (
                  <TouchableOpacity
                    key={km}
                    onPress={() => setDistanceKm(km)}
                    activeOpacity={0.75}
                    style={[styles.distanceChip, active && { borderColor: activityColor, backgroundColor: activityColor + '18' }]}
                  >
                    <Text style={[styles.distanceChipText, active && { color: activityColor }]}>
                      {labelKm(km)}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </Section>
        )}

        {/* Surface preference */}
        <Section title="Surface">
          <View style={styles.surfaceRow}>
            {SURFACE_OPTIONS.map(opt => {
              const active = surfacePref === opt.type
              return (
                <TouchableOpacity
                  key={opt.type}
                  onPress={() => setSurfacePref(opt.type)}
                  activeOpacity={0.75}
                  style={[styles.surfaceChip, active && { borderColor: activityColor, backgroundColor: activityColor + '18' }]}
                >
                  <Text style={[styles.surfaceText, active && { color: activityColor }]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </Section>

        {/* Generate button */}
        <Button
          label={isPending ? 'Generating...' : 'Generate route'}
          onPress={handleGenerate}
          loading={isPending}
          disabled={locLoading || !location || (!isLoop && atobMode === 'pin' && !endPin)}
          fullWidth
          size="lg"
          style={[styles.generateBtn, { backgroundColor: activityColor }]}
        />

      </ScrollView>
    </SafeAreaView>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.xl, gap: spacing.xl, paddingBottom: spacing['3xl'] },

  pageHeader:   { gap: 4 },
  pageTitle:    { fontSize: fontSize['2xl'], fontWeight: fontWeight.bold, color: colors.textPrimary },
  pageSubtitle: { fontSize: fontSize.sm, color: colors.textMuted },

  section:      { gap: spacing.md },
  sectionTitle: {
    fontSize: fontSize.sm, fontWeight: fontWeight.semibold,
    color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8,
  },

  // Activity
  activityRow: { flexDirection: 'row', gap: spacing.md },
  activityBtn: {
    flex: 1, alignItems: 'center', paddingVertical: spacing.lg,
    backgroundColor: colors.card, borderRadius: radius.lg,
    borderWidth: 1.5, borderColor: colors.border, gap: spacing.xs,
  },
  activityLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },

  // Route type toggle
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.lg,
    borderWidth: 0.5, borderColor: colors.border,
  },
  toggleInfo:  { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 },
  toggleLabel: { fontSize: fontSize.md, fontWeight: fontWeight.medium, color: colors.textPrimary },
  toggleDesc:  { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },

  // A-to-B mode switcher
  modeSwitcher: { flexDirection: 'row', gap: spacing.md },
  modeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.xs, paddingVertical: spacing.md,
    backgroundColor: colors.card, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
  },
  modeBtnText: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textMuted },

  // Pin map
  pinMapWrapper: { gap: spacing.sm },
  pinMapHint: { fontSize: fontSize.xs, color: colors.textMuted, textAlign: 'center' },
  pinMap: {
    width: '100%', height: 240,
    borderRadius: radius.lg, overflow: 'hidden',
    borderWidth: 0.5, borderColor: colors.border,
  },
  pinMapUnavailable: {
    height: 240, alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 0.5, borderColor: colors.border,
  },
  pinMapUnavailableText: { fontSize: fontSize.sm, color: colors.textMuted },

  clearPinBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: spacing.xs,
  },
  clearPinText: { fontSize: fontSize.xs, color: colors.textMuted },

  // Start dot marker
  startDot: {
    width: 12, height: 12, borderRadius: 6,
    borderWidth: 2, borderColor: colors.white,
  },

  // Custom pin marker for end point
  endPinWrapper: { alignItems: 'center' },
  endPinHead: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: colors.white,
  },
  endPinStem: { width: 3, height: 10, borderRadius: 2 },

  // Distance
  distanceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  distanceChip: {
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    backgroundColor: colors.card, borderRadius: radius.full,
    borderWidth: 1, borderColor: colors.border,
  },
  distanceChipText: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textSecondary },

  // Surface
  surfaceRow: { flexDirection: 'row', gap: spacing.md },
  surfaceChip: {
    flex: 1, alignItems: 'center', paddingVertical: spacing.md,
    backgroundColor: colors.card, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
  },
  surfaceText: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textSecondary },

  generateBtn: { marginTop: spacing.md },
})
