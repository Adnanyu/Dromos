import React from 'react'
import {
  View, Text, FlatList, RefreshControl, StyleSheet, TouchableOpacity,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useFeed }        from '../../hooks/useSocial'
import { useAuthStore }   from '../../store/auth.store'
import { RouteCard }      from '../../components/route/RouteCard'
import { ActivityCard }   from '../../components/activity/ActivityCard'
import { colors, fontSize, fontWeight, spacing, radius } from '../../theme'
import { formatRelativeTime } from '../../utils/format'
import type { FeedItem } from '../../types/api'

export function HomeScreen() {
  const { user }    = useAuthStore()
  const { data, isLoading, refetch, isRefetching } = useFeed()

  function renderItem({ item }: { item: FeedItem }) {
    return (
      <View style={styles.feedItem}>
        {/* Actor row */}
        <View style={styles.actorRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(item.user.username[0] ?? '?').toUpperCase()}
            </Text>
          </View>
          <View style={styles.actorInfo}>
            <Text style={styles.actorName}>{item.user.username}</Text>
            <Text style={styles.actorAction}>
              {item.type === 'route_created' ? 'created a route' : 'completed an activity'}
              {'  ·  '}{formatRelativeTime(item.created_at)}
            </Text>
          </View>
        </View>

        {/* Content card */}
        {item.type === 'route_created' && item.route && (
          <RouteCard route={item.route} />
        )}
        {item.type === 'activity_completed' && item.activity && (
          <ActivityCard activity={item.activity} />
        )}
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.logo}>STRIDE</Text>
        <Text style={styles.greeting}>
          Hey, {user?.username ?? 'runner'} 👋
        </Text>
      </View>

      <FlatList
        data={data ?? []}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          isLoading ? null : (
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={48} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>Your feed is empty</Text>
              <Text style={styles.emptySubtitle}>
                Follow other runners and cyclists to see their activity here.
              </Text>
            </View>
          )
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },

  header: {
    paddingHorizontal: spacing.xl,
    paddingVertical:   spacing.lg,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
    flexDirection:     'row',
    justifyContent:    'space-between',
    alignItems:        'center',
  },
  logo:     { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.primary, letterSpacing: 3 },
  greeting: { fontSize: fontSize.sm, color: colors.textMuted },

  list: { padding: spacing.xl, gap: spacing.xl },

  feedItem:   { gap: spacing.md },
  actorRow:   { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar:     {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: colors.primary + '22',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.primary },
  actorInfo:  { flex: 1, gap: 2 },
  actorName:  { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  actorAction: { fontSize: fontSize.xs, color: colors.textMuted },

  separator: { height: 0.5, backgroundColor: colors.border },

  empty: {
    alignItems: 'center', gap: spacing.md,
    paddingTop: spacing['3xl'], paddingHorizontal: spacing['2xl'],
  },
  emptyTitle:    { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  emptySubtitle: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
})
