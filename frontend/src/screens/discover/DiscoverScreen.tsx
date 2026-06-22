import React, { useState } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Pressable,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation }      from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useAuthStore }        from '../../store/auth.store'
import { useNearbyRoutes }    from '../../hooks/useRoutes'
import { useCurrentLocation } from '../../hooks/useLocation'
import { RouteCard }          from '../../components/route/RouteCard'
import { colors, fontSize, fontWeight, spacing, radius } from '../../theme'
import type { ActivityType, SavedRoute } from '../../types/api'
import type { DiscoverStackParamList }   from '../../types/navigation'

type DiscoverNav = NativeStackNavigationProp<DiscoverStackParamList>

const RADIUS_OPTIONS = [1000, 2000, 5000, 10_000]
const RADIUS_LABELS  = ['1 km', '2 km', '5 km', '10 km']

const ACTIVITY_FILTERS: { type: ActivityType | 'all'; label: string }[] = [
  { type: 'all',     label: 'All' },
  { type: 'running', label: 'Running' },
  { type: 'cycling', label: 'Cycling' },
  { type: 'hiking',  label: 'Hiking' },
]

export function DiscoverScreen() {
  const [radiusM,        setRadiusM]        = useState(5000)
  const [activityFilter, setActivityFilter] = useState<ActivityType | 'all'>('all')

  const navigation = useNavigation<DiscoverNav>()
  const { user: me } = useAuthStore()

  const { location, loading: locLoading } = useCurrentLocation()

  const { data: routes, isLoading } = useNearbyRoutes(
    location ? { lat: location.lat, lng: location.lng, radius_m: radiusM } : null
  )

  const filtered = activityFilter === 'all'
    ? routes
    : routes?.filter(r => r.activity_type === activityFilter)

  function handleRoutePress(route: SavedRoute) {
    console.log('handleRoutePress fired:', route.id)
    const isOwner = !!me && route.user_id === me.id
    navigation.navigate('RoutePreview', {
      generatedRoute: route as any,
      savedRouteId:   route.id,
      isOwner,
      params:         undefined,
    })
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Discover</Text>
        <Text style={styles.subtitle}>
          {location ? 'Routes near you' : locLoading ? 'Getting location…' : 'Location unavailable'}
        </Text>
      </View>

      {/* Radius chips */}
      <View style={styles.filterBar}>
        <View style={styles.chipRow}>
          {RADIUS_OPTIONS.map((r, i) => (
            <TouchableOpacity
              key={r}
              onPress={() => setRadiusM(r)}
              style={[styles.chip, radiusM === r && styles.chipActive]}
            >
              <Text style={[styles.chipText, radiusM === r && styles.chipTextActive]}>
                {RADIUS_LABELS[i]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Activity filter */}
      <View style={styles.filterBar}>
        <View style={styles.chipRow}>
          {ACTIVITY_FILTERS.map(f => (
            <TouchableOpacity
              key={f.type}
              onPress={() => setActivityFilter(f.type)}
              style={[styles.chip, activityFilter === f.type && styles.chipActive]}
            >
              <Text style={[styles.chipText, activityFilter === f.type && styles.chipTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Results */}
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.hint}>Finding nearby routes…</Text>
        </View>
      ) : (
        <FlatList
          data={filtered ?? []}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            // Wrap in a View with pointerEvents so the overlay sits on top
            // of any touchables inside RouteCard without nesting issues.
            <View style={styles.cardWrapper}>
              {/* RouteCard renders normally — purely visual */}
              <RouteCard route={item} />

              {/* Full-cover Pressable that intercepts the tap */}
              <Pressable
                style={StyleSheet.absoluteFill}
                onPress={() => handleRoutePress(item)}
                android_ripple={{ color: colors.primary + '22', borderless: false }}
              />
            </View>
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="map-outline" size={48} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>No routes found</Text>
              <Text style={styles.hint}>Try a larger radius or a different filter.</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },

  header: {
    paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.md,
    gap: 2,
  },
  title:    { fontSize: fontSize['2xl'], fontWeight: fontWeight.bold, color: colors.textPrimary },
  subtitle: { fontSize: fontSize.sm, color: colors.textMuted },

  filterBar: { paddingHorizontal: spacing.xl, paddingBottom: spacing.sm },
  chipRow:   { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: 6,
    backgroundColor: colors.card, borderRadius: radius.full,
    borderWidth: 0.5, borderColor: colors.border,
  },
  chipActive:     { borderColor: colors.primary, backgroundColor: colors.primary + '18' },
  chipText:       { fontSize: fontSize.sm, color: colors.textMuted, fontWeight: fontWeight.medium },
  chipTextActive: { color: colors.primary },

  list:       { padding: spacing.xl, gap: spacing.md },
  cardWrapper: { position: 'relative' },   // needed for absoluteFill to work

  center:     { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingTop: spacing['3xl'] },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  hint:       { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center' },
})
