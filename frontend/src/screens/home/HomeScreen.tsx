import React, { useMemo } from 'react'
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../../store/auth.store'
import { routesApi } from '../../api/routes'
import { usersApi } from '../../api/users'
import { useUserActivities } from '../../hooks/useActivities'
import { useFormatters } from '../../hooks/useUnits'
import { ActivityCard } from '../../components/activity/ActivityCard'
import { RouteCard } from '../../components/route/RouteCard'
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/ScreenState'
import { colors, fontSize, fontWeight, radius, spacing } from '../../theme'
import { userMessageFromError } from '../../utils/errors'
import type { AppTabParamList } from '../../types/navigation'

type Nav = BottomTabNavigationProp<AppTabParamList>

export function HomeScreen() {
  const navigation = useNavigation<Nav>()
  const { user } = useAuthStore()
  const { distance, elevation, duration } = useFormatters()
  const userId = user?.id ?? ''

  const {
    data: stats,
    isLoading: statsLoading,
    isError: statsError,
    error: statsErr,
    refetch: refetchStats,
  } = useQuery({
    queryKey: ['users', userId, 'stats'],
    queryFn: () => usersApi.getStats(userId),
    enabled: !!userId,
  })

  const {
    data: routes,
    isLoading: routesLoading,
    isError: routesError,
    error: routesErr,
    refetch: refetchRoutes,
  } = useQuery({
    queryKey: ['routes', 'byUser', userId],
    queryFn: () => routesApi.listByUser(userId),
    enabled: !!userId,
    staleTime: 60_000,
  })

  const { data: activities, isLoading: activitiesLoading } = useUserActivities(userId)
  const lastActivity = activities?.[0]

  const weeklyDistance = useMemo(() => {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
    return (activities ?? [])
      .filter(activity => new Date(activity.started_at).getTime() >= weekAgo)
      .reduce((sum, activity) => sum + (activity.actual_distance_m ?? 0), 0)
  }, [activities])

  const hasLoading = statsLoading || routesLoading || activitiesLoading

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View>
            <Text style={styles.brand}>Dromos</Text>
            <Text style={styles.greeting}>Plan better routes. Read your body. Move with confidence.</Text>
          </View>
          <TouchableOpacity style={styles.iconButton} onPress={() => navigation.navigate('Notifications')}>
            <Ionicons name="notifications-outline" size={21} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.primaryPanel} activeOpacity={0.86} onPress={() => navigation.navigate('Plan')}>
          <View style={styles.primaryIcon}>
            <Ionicons name="navigate" size={28} color={colors.textInverse} />
          </View>
          <View style={styles.primaryCopy}>
            <Text style={styles.primaryTitle}>Generate a route</Text>
            <Text style={styles.primaryText}>Pick distance, surface, and destination style. Dromos builds the route.</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color={colors.textSecondary} />
        </TouchableOpacity>

        {hasLoading ? (
          <LoadingState title="Building your dashboard" subtitle="Routes, reports, and recent activity are loading." icon="analytics-outline" />
        ) : statsError || routesError ? (
          <ErrorState
            title="Dashboard needs a refresh"
            message={userMessageFromError(statsErr ?? routesErr, 'Dromos could not load your dashboard.')}
            onRetry={() => {
              refetchStats()
              refetchRoutes()
            }}
          />
        ) : (
          <>
            <View style={styles.reportGrid}>
              <Metric label="Total distance" value={stats ? distance(stats.total_distance_m) : distance(user?.total_distance_m ?? 0)} icon="trail-sign-outline" />
              <Metric label="Activities" value={String(stats?.total_activities ?? user?.total_activities ?? 0)} icon="pulse-outline" />
              <Metric label="This week" value={distance(weeklyDistance)} icon="calendar-outline" />
              <Metric label="Elevation" value={stats ? elevation(stats.total_elevation_m) : elevation(0)} icon="trending-up-outline" />
            </View>

            <SectionTitle title="Latest report" action="View routes" onPress={() => navigation.navigate('Discover')} />
            {lastActivity ? (
              <ActivityCard activity={lastActivity} />
            ) : (
              <EmptyState
                title="No activity reports yet"
                subtitle="Start a generated route to collect distance, pace, elevation, and recovery-ready history."
                icon="fitness-outline"
                actionLabel="Plan first route"
                onAction={() => navigation.navigate('Plan')}
              />
            )}

            <SectionTitle title="Your saved routes" action="Generate" onPress={() => navigation.navigate('Plan')} />
            {(routes ?? []).slice(0, 2).map(route => <RouteCard key={route.id} route={route} />)}
            {(routes ?? []).length === 0 ? (
              <EmptyState
                title="No saved routes"
                subtitle="Generated routes you save will appear here for repeat runs, rides, and hikes."
                icon="map-outline"
              />
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

function Metric({ label, value, icon }: { label: string; value: string; icon: React.ComponentProps<typeof Ionicons>['name'] }) {
  return (
    <View style={styles.metric}>
      <Ionicons name={icon} size={18} color={colors.primary} />
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  )
}

function SectionTitle({ title, action, onPress }: { title: string; action: string; onPress: () => void }) {
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <TouchableOpacity onPress={onPress} style={styles.sectionAction}>
        <Text style={styles.sectionActionText}>{action}</Text>
        <Ionicons name="arrow-forward" size={14} color={colors.primary} />
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.xl, gap: spacing.lg },
  hero: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.lg,
  },
  brand: { fontSize: 34, fontWeight: fontWeight.bold, color: colors.textPrimary },
  greeting: { maxWidth: 270, marginTop: spacing.xs, fontSize: fontSize.md, lineHeight: 22, color: colors.textSecondary },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  primaryPanel: {
    minHeight: 116,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  primaryIcon: {
    width: 58,
    height: 58,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryCopy: { flex: 1, gap: 4 },
  primaryTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.textPrimary },
  primaryText: { fontSize: fontSize.sm, lineHeight: 19, color: colors.textSecondary },
  reportGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  metric: {
    width: '47.8%',
    minHeight: 104,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  metricValue: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.textPrimary },
  metricLabel: { fontSize: fontSize.xs, color: colors.textSecondary },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.textPrimary },
  sectionAction: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  sectionActionText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.primary },
})
