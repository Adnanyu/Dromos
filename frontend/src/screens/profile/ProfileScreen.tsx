import React, { useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, RefreshControl,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useQuery }           from '@tanstack/react-query'
import { usersApi }           from '../../api/users'
import { routesApi }          from '../../api/routes'
import { useAuthStore }       from '../../store/auth.store'
import { useUserActivities }  from '../../hooks/useActivities'
import { useLogout }          from '../../hooks/useAuth'
import { useFormatters }      from '../../hooks/useUnits'
import { RouteCard }          from '../../components/route/RouteCard'
import { ActivityCard }       from '../../components/activity/ActivityCard'
import { Button }             from '../../components/ui/Button'
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/ScreenState'
import { userMessageFromError } from '../../utils/errors'
import { colors, fontSize, fontWeight, spacing, radius } from '../../theme'
import type { SavedRoute }            from '../../types/api'
import type { ProfileStackParamList } from '../../types/navigation'

type Props = NativeStackScreenProps<ProfileStackParamList, 'Profile'>
type Tab   = 'routes' | 'activities'

export function ProfileScreen({ navigation, route }: Props) {
  const { user: me }   = useAuthStore()
  const targetId       = route.params?.userId ?? me?.id ?? ''
  const isOwnProfile   = targetId === me?.id
  const [tab, setTab]  = useState<Tab>('routes')

  const { distance, elevation } = useFormatters()

  // ── Profile + stats ────────────────────────────────────────────────────────

  const { data: profile, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['users', targetId],
    queryFn:  () => usersApi.getById(targetId),
    enabled:  !!targetId,
    retry:    1,
    staleTime: 2 * 60_000,
  })

  const { data: stats } = useQuery({
    queryKey: ['users', targetId, 'stats'],
    queryFn:  () => usersApi.getStats(targetId),
    enabled:  !!targetId,
  })

  // ── Routes created by this user ────────────────────────────────────────────
  // Fetched directly from the routes API using the user_id filter so this
  // works even if there is no dedicated /users/:id/routes endpoint.

  const {
    data: routes,
    isLoading: routesLoading,
  } = useQuery<SavedRoute[]>({
    queryKey: ['routes', 'byUser', targetId],
    queryFn:  () => routesApi.listByUser(targetId),
    enabled:  !!targetId,
    staleTime: 60_000,
  })

  // ── Activities ─────────────────────────────────────────────────────────────

  const { data: activities, isLoading: activitiesLoading } = useUserActivities(targetId)

  const { mutate: logout }   = useLogout()

  // Navigate to RoutePreview to view / start a saved route
  function handleRoutePress(r: SavedRoute) {
    const isOwner = !!me && r.creator_id === me.id
    navigation.navigate('RoutePreview', {
      generatedRoute: r,
      savedRouteId:   r.id,
      isOwner,
      params:         undefined,
    })
  }

  // ── Loading guard ──────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <LoadingState title="Loading profile…" icon="person-outline" />
        </View>
      </SafeAreaView>
    )
  }

  // ── Error guard ────────────────────────────────────────────────────────────

  if (isError || !profile) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => navigation.canGoBack() && navigation.goBack()}>
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.topBarTitle}>Profile</Text>
          <View style={{ width: 22 }} />
        </View>
        <View style={styles.center}>
          <ErrorState
            title="Could not load profile"
            message={userMessageFromError(error, 'Check your connection and try again.')}
            onRetry={refetch}
          />
        </View>
      </SafeAreaView>
    )
  }

  // ── Main render ────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.primary} />
        }
      >
        {/* Top bar */}
        <View style={styles.topBar}>
          {!isOwnProfile && (
            <TouchableOpacity onPress={() => navigation.canGoBack() && navigation.goBack()}>
              <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
          )}
          <Text style={styles.topBarTitle}>{isOwnProfile ? 'My profile' : profile.username}</Text>
          {isOwnProfile ? (
            <TouchableOpacity onPress={() => navigation.navigate('EditProfile')}>
              <Ionicons name="settings-outline" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 22 }} />
          )}
        </View>

        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(profile.username[0] ?? '?').toUpperCase()}</Text>
          </View>

          <Text style={styles.username}>@{profile.username}</Text>

          {(profile.first_name || profile.last_name) && (
            <Text style={styles.displayName}>
              {[profile.first_name, profile.last_name].filter(Boolean).join(' ')}
            </Text>
          )}

          {profile.bio && <Text style={styles.bio}>{profile.bio}</Text>}

          {profile.location && (
            <View style={styles.locationRow}>
              <Ionicons name="location-outline" size={13} color={colors.textMuted} />
              <Text style={styles.locationText}>{profile.location}</Text>
            </View>
          )}

          <View style={styles.unitBadge}>
            <Ionicons name="speedometer-outline" size={12} color={colors.textMuted} />
            <Text style={styles.unitBadgeText}>
              {profile.units === 'imperial' ? 'Imperial (mi)' : 'Metric (km)'}
            </Text>
          </View>

          {profile.preferred_activities.length > 0 && (
            <View style={styles.pillRow}>
              {profile.preferred_activities.map(t => (
                <View key={t} style={styles.pill}>
                  <Text style={styles.pillText}>
                    {({ running: 'Running', cycling: 'Cycling', hiking: 'Hiking' } as Record<string, string>)[t]}
                  </Text>
                </View>
              ))}
            </View>
          )}

          <View style={styles.ctaRow}>
            {isOwnProfile ? (
              <>
                <Button
                  label="Edit profile"
                  onPress={() => navigation.navigate('EditProfile')}
                  variant="secondary"
                  style={styles.ctaBtn}
                />
                <Button
                  label="Sign out"
                  onPress={() => logout()}
                  variant="ghost"
                  style={styles.ctaBtn}
                />
              </>
            ) : (
              <View style={styles.viewerNote}>
                <Ionicons name="share-social-outline" size={15} color={colors.primary} />
                <Text style={styles.viewerNoteText}>Public routes can be shared with a link.</Text>
              </View>
            )}
          </View>
        </View>

        {/* Stats bar */}
        <View style={styles.statsBar}>
          <Stat value={stats ? distance(stats.total_distance_m) : '—'} label="Distance" />
          <View style={styles.statDivider} />
          <Stat value={String(profile.total_activities)} label="Activities" />
          <View style={styles.statDivider} />
          <Stat value={stats ? elevation(stats.total_elevation_m) : '—'} label="Elevation" />
        </View>

        {/* Tabs */}
        <View style={styles.tabRow}>
          {(['routes', 'activities'] as Tab[]).map(t => (
            <TouchableOpacity
              key={t}
              onPress={() => setTab(t)}
              style={[styles.tab, tab === t && styles.tabOn]}
            >
              <Text style={[styles.tabText, tab === t && styles.tabTextOn]}>
                {t === 'routes' ? `Routes${routes ? ` (${routes.length})` : ''}` : 'Activities'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Tab content */}
        <View style={styles.content}>
          {tab === 'routes' && (
            routesLoading
              ? <ActivityIndicator color={colors.primary} style={styles.loader} />
              : (routes ?? []).length === 0
                ? <EmptyState icon="map-outline" title="No routes saved yet" subtitle="Generate a route and save it to see it here." />
                : (routes ?? []).map(r => (
                    <TouchableOpacity
                      key={r.id}
                      activeOpacity={0.75}
                      onPress={() => handleRoutePress(r)}
                    >
                      <RouteCard route={r} />
                    </TouchableOpacity>
                  ))
          )}

          {tab === 'activities' && (
            activitiesLoading
              ? <ActivityIndicator color={colors.primary} style={styles.loader} />
              : (activities ?? []).length === 0
                ? <EmptyState icon="fitness-outline" title="No activities yet" subtitle="Start a workout and it will show up here." />
                : (activities ?? []).map(a => <ActivityCard key={a.id} activity={a} />)
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.statItem}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
    borderBottomWidth: 0.5, borderBottomColor: colors.border,
  },
  topBarTitle: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.textPrimary },

  hero: { alignItems: 'center', padding: spacing.xl, gap: spacing.sm },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: colors.primary + '22',
    borderWidth: 2, borderColor: colors.primary + '40',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  avatarText:  { fontSize: 32, fontWeight: fontWeight.bold, color: colors.primary },
  username:    { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.textPrimary },
  displayName: { fontSize: fontSize.md, color: colors.textSecondary },
  bio:         { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  locationText:{ fontSize: fontSize.xs, color: colors.textMuted },

  unitBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.card, borderRadius: radius.full,
    paddingHorizontal: spacing.md, paddingVertical: 4,
    borderWidth: 0.5, borderColor: colors.border,
  },
  unitBadgeText: { fontSize: fontSize.xs, color: colors.textMuted },

  pillRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', justifyContent: 'center' },
  pill: {
    backgroundColor: colors.card, borderRadius: radius.full,
    paddingHorizontal: spacing.md, paddingVertical: 4,
    borderWidth: 0.5, borderColor: colors.border,
  },
  pillText: { fontSize: fontSize.xs, color: colors.textSecondary },

  ctaRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xs },
  ctaBtn: { minWidth: 120 },
  viewerNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.primaryDim,
  },
  viewerNoteText: { fontSize: fontSize.xs, color: colors.textSecondary },

  statsBar: {
    flexDirection: 'row', justifyContent: 'space-around',
    marginHorizontal: spacing.xl, marginBottom: spacing.lg,
    backgroundColor: colors.card, borderRadius: radius.lg,
    borderWidth: 0.5, borderColor: colors.border, paddingVertical: spacing.lg,
  },
  statItem:    { alignItems: 'center', gap: 2 },
  statValue:   { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.textPrimary },
  statLabel:   { fontSize: fontSize.xs, color: colors.textMuted },
  statDivider: { width: 0.5, alignSelf: 'stretch', backgroundColor: colors.border },

  tabRow: {
    flexDirection: 'row', marginHorizontal: spacing.xl,
    borderBottomWidth: 0.5, borderBottomColor: colors.border,
  },
  tab:       { flex: 1, paddingVertical: spacing.md, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabOn:     { borderBottomColor: colors.primary },
  tabText:   { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textMuted },
  tabTextOn: { color: colors.primary },

  content:   { padding: spacing.xl, gap: spacing.md },
  loader:    { margin: spacing.xl },
  empty:     { alignItems: 'center', gap: spacing.md, paddingVertical: spacing['3xl'] },
  emptyText: { fontSize: fontSize.sm, color: colors.textMuted },

  errorTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.textPrimary, marginTop: spacing.md },
  errorSub:   { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center', paddingHorizontal: spacing.xl, marginTop: spacing.xs },
  retryBtn:   { marginTop: spacing.lg, paddingVertical: spacing.sm, paddingHorizontal: spacing.xl, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 0.5, borderColor: colors.border },
  retryText:  { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.primary },
})
