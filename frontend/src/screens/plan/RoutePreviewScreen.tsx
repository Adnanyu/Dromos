import React, { useState, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Alert, useWindowDimensions, TextInput,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Ionicons } from '@expo/vector-icons'
import { useGenerateRoute, useSaveRoute } from '../../hooks/useRoutes'
import { useStartActivity }              from '../../hooks/useActivities'
import { useFormatters }                 from '../../hooks/useUnits'
import { RouteMap }                      from '../../components/route/RouteMap'
import { ElevationChart }                from '../../components/route/ElevationChart'
import { Button }                        from '../../components/ui/Button'
import { DifficultyBadge, ActivityBadge } from '../../components/ui/Badge'
import { StatBlock }                     from '../../components/activity/StatBlock'
import { colors, fontSize, fontWeight, spacing, radius } from '../../theme'
import type { GenerateRouteRequest, SaveRouteRequest }          from '../../types/api'
import type { PlanStackParamList }        from '../../types/navigation'
import { destinationPoint } from '@/utils/destinationCalculator'

type Props = NativeStackScreenProps<PlanStackParamList, 'RoutePreview'>

export function RoutePreviewScreen({ navigation, route }: Props) {
  const { generatedRoute, params, isOwner = false, savedRouteId, generationMeta } = route.params
  const [current,   setCurrent]   = useState(generatedRoute)
  const [routeName, setRouteName] = useState('')
  const [seedOffset, setSeedOffset] = useState(0)
  const { width } = useWindowDimensions()

  // When viewing a saved route from Discover/Profile there is no "params"
  // for regeneration — hide the regenerate button in that case.
  const canRegenerate = !!params

  const { mutate: regenerate, isPending: regenerating } = useGenerateRoute()
  const { mutate: saveRoute,  isPending: saving }       = useSaveRoute()
  const { mutate: startAct,   isPending: starting }     = useStartActivity()
  const { distance, durationWords, elevation }          = useFormatters()

  const activityColor = {
    running: colors.running,
    cycling: colors.cycling,
    hiking:  colors.hiking,
  }[current.activity_type] ?? colors.primary

  // ── Helpers ────────────────────────────────────────────────────────────────

  function buildSavePayload(isPublic = true): SaveRouteRequest {
    return {
      activity_type: current.activity_type,
      distance_m:    current.distance_m,
      lat:           current.start_point.lat,
      lng:           current.start_point.lng,
      is_loop:       current.is_loop,
      surface_pref:  current.surface_type,
      is_public:     isPublic,
      name: routeName.trim() || undefined,
      generated_route: current,
    }
  }

  // ── Regenerate ─────────────────────────────────────────────────────────────

  const handleRegenerate = useCallback(() => {
  if (!params) return

  const nextSeed = seedOffset + 1
  setSeedOffset(nextSeed)

  let updatedParams: GenerateRouteRequest = {
    ...params,
    seed: (params.seed ?? 0) + nextSeed,
  }

  // Only regenerate endpoint for A→B distance mode
  if (
    !params.is_loop &&
    generationMeta?.atobMode === 'distance'
  ) {
    const nextBearing = Math.random() * 360

        const generatedEnd = destinationPoint(
          params.lat,
          params.lng,
          params.distance_m,
          nextBearing
        )

        updatedParams = {
          ...updatedParams,
          end_lat: generatedEnd.lat,
          end_lng: generatedEnd.lng,
        }
      }

      // Pin mode keeps original end point

      regenerate(updatedParams, {
        onSuccess: setCurrent,
        onError: () =>
          Alert.alert(
            'Error',
            'Could not generate a different route. Try again.'
          ),
      })
    }, [
      params,
      seedOffset,
      regenerate,
      generationMeta,
    ])

  // ── Start (without re-saving when already saved) ───────────────────────────

  const handleStart = useCallback((routeId: string) => {
    startAct(
      {
        activity_type:       current.activity_type,
        route_id:            routeId,
        planned_distance_m:  current.distance_m,
      },
      {
        onSuccess: (activity) =>
          navigation.navigate('ActiveActivity', {
            activityId:      activity.id,
            generatedRoute:  current,
            plannedDistance: current.distance_m,
            activityType:    current.activity_type,
          }),
        onError: (err: any) => {
          const msg = err?.response?.data?.error?.message ?? 'Could not start activity.'
          Alert.alert('Error', msg)
        },
      }
    )
  }, [current, navigation])

  // ── Save + Start ───────────────────────────────────────────────────────────

  const handleSaveAndStart = useCallback(() => {
    // If we already have a savedRouteId (owner viewing their own route, or
    // route loaded from Discover that was already saved), skip re-saving.
    if (savedRouteId) {
      handleStart(savedRouteId)
      return
    }

    saveRoute(
      buildSavePayload(true),
      {
        onSuccess: (saved) => handleStart(saved.id),
        onError: (err: any) => {
          const msg = err?.response?.data?.error?.message ?? 'Could not save route.'
          Alert.alert('Error', msg)
        },
      }
    )
  }, [current, routeName, savedRouteId, saveRoute, handleStart, seedOffset])

  // ── Save only ──────────────────────────────────────────────────────────────

  const handleSaveOnly = useCallback(() => {
    saveRoute(
      buildSavePayload(true),
      {
        onSuccess: () =>
          Alert.alert('Saved!', 'Route saved to your library.', [
            { text: 'OK', onPress: () => navigation.popToTop() },
          ]),
        onError: (err: any) => {
          const msg = err?.response?.data?.error?.message ?? 'Could not save route.'
          Alert.alert('Error', msg)
        },
      }
    )
  }, [current, routeName, saveRoute, navigation, seedOffset])

  // ── Render ─────────────────────────────────────────────────────────────────

  const mapHeight = Math.round(width * 0.62)
  const isBusy    = saving || starting || regenerating

  return (
    <SafeAreaView style={styles.safe}>

      {/* Map */}
      <View style={{ height: mapHeight }}>
        <RouteMap
          geometry={current.geometry}
          startPoint={current.start_point}
          endPoint={current.end_point}
          style={styles.map}
        />

        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
        </TouchableOpacity>

        {canRegenerate && (
          <TouchableOpacity
            style={[styles.regenBtn, regenerating && { opacity: 0.6 }]}
            onPress={handleRegenerate}
            disabled={regenerating}
          >
            <Ionicons name="refresh" size={18} color={colors.textPrimary} />
            <Text style={styles.regenText}>
              {regenerating ? 'Generating…' : 'Different route'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Detail panel */}
      <ScrollView
        style={styles.panel}
        contentContainerStyle={styles.panelContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Badges */}
        <View style={styles.badgeRow}>
          <ActivityBadge type={current.activity_type} />
          <DifficultyBadge difficulty={current.difficulty} />
          {current.is_loop && (
            <View style={styles.loopBadge}>
              <Ionicons name="refresh-circle-outline" size={13} color={colors.textMuted} />
              <Text style={styles.loopText}>Loop</Text>
            </View>
          )}
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <StatBlock label="Distance"  value={distance(current.distance_m)} />
          <Divider />
          <StatBlock label="Est. time" value={durationWords(current.estimated_duration_s)} />
          <Divider />
          <StatBlock label="Elev. gain" value={elevation(current.elevation_gain_m)} />
        </View>

        {/* Elevation chart */}
        {current.elevation_profile.length > 1 && (
          <ElevationChart
            profile={current.elevation_profile}
            width={width - spacing.xl * 2}
            height={100}
          />
        )}

        {/* Surface + engine info */}
        <View style={styles.infoRow}>
          <Ionicons name="map-outline" size={14} color={colors.textMuted} />
          <Text style={styles.infoText}>
            Surface:{' '}
            <Text style={{ color: activityColor }}>{current.surface_type}</Text>
            {'  ·  '}
            Engine:{' '}
            <Text style={{ color: colors.textMuted }}>{current.routing_engine}</Text>
          </Text>
        </View>

        {/* Route name input — only shown when the user can save */}
        {!isOwner && (
          <View style={styles.nameRow}>
            <Ionicons name="bookmark-outline" size={16} color={colors.textMuted} />
            <TextInput
              style={styles.nameInput}
              value={routeName}
              onChangeText={setRouteName}
              placeholder={`e.g. Morning ${current.activity_type} loop`}
              placeholderTextColor={colors.textMuted}
              maxLength={100}
              returnKeyType="done"
            />
          </View>
        )}

        {/* Action buttons */}
        <View style={styles.actions}>
          <Button
            label={starting ? 'Starting…' : '▶  Start activity'}
            onPress={handleSaveAndStart}
            loading={saving || starting}
            disabled={isBusy}
            fullWidth
            size="lg"
            style={{ backgroundColor: activityColor }}
          />

          {/* Only non-owners see the "Save route only" option */}
          {!isOwner && (
            <Button
              label={saving ? 'Saving…' : 'Save route only'}
              onPress={handleSaveOnly}
              loading={saving}
              disabled={isBusy}
              variant="secondary"
              fullWidth
            />
          )}
        </View>

      </ScrollView>
    </SafeAreaView>
  )
}

function Divider() {
  return <View style={{ width: 0.5, height: 36, backgroundColor: colors.border }} />
}

const styles = StyleSheet.create({
  safe:  { flex: 1, backgroundColor: colors.background },
  map:   { flex: 1 },

  backBtn: {
    position: 'absolute', top: spacing.md, left: spacing.md,
    backgroundColor: colors.overlay,
    padding: spacing.sm, borderRadius: radius.full,
  },
  regenBtn: {
    position: 'absolute', top: spacing.md, right: spacing.md,
    backgroundColor: colors.overlay,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  regenText: { color: colors.textPrimary, fontSize: fontSize.sm, fontWeight: fontWeight.medium },

  panel:        { flex: 1, backgroundColor: colors.background },
  panelContent: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing['3xl'] },

  badgeRow:  { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  loopBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  loopText:  { fontSize: fontSize.xs, color: colors.textMuted },

  statsRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.lg,
    borderWidth: 0.5, borderColor: colors.border,
  },

  infoRow:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  infoText: { fontSize: fontSize.xs, color: colors.textMuted },

  nameRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.card, borderRadius: radius.md, paddingHorizontal: spacing.md,
    borderWidth: 0.5, borderColor: colors.border,
  },
  nameInput: {
    flex: 1, paddingVertical: spacing.md,
    color: colors.textPrimary, fontSize: fontSize.sm,
  },

  actions: { gap: spacing.md, marginTop: spacing.xs },
})
