import React from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Image,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation, type NavigationProp } from '@react-navigation/native'

import {
  useNotifications,
  useMarkRead,
  useMarkAllRead,
} from '../../hooks/useNotifications'
import { routesApi } from '../../api/routes'
import type { AppTabParamList } from '../../types/navigation'

import {
  colors,
  fontSize,
  fontWeight,
  spacing,
  radius,
} from '../../theme'

import { formatRelativeTime } from '../../utils/format'
import { LoadingState, ErrorState } from '../../components/ui/ScreenState'
import { userMessageFromError } from '../../utils/errors'

import type {
  Notification,
  NotificationType,
} from '../../types/api'

const TYPE_META: Record<
  NotificationType,
  { icon: keyof typeof Ionicons.glyphMap; color: string }
> = {
  route_share: {
    icon: 'share-social',
    color: colors.accent,
  },
  activity_completed: {
    icon: 'fitness',
    color: colors.primary,
  },
  achievement: {
    icon: 'ribbon',
    color: colors.warning,
  },
  welcome: {
    icon: 'hand-left',
    color: colors.info,
  },
}

export function NotificationsScreen() {
  const navigation = useNavigation<NavigationProp<AppTabParamList>>()

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
  } = useNotifications()

  const {
    mutate: markRead,
  } = useMarkRead()

  const {
    mutate: markAllRead,
    isPending: clearingAll,
  } = useMarkAllRead()

  const notifications = data ?? []

  const unreadCount = notifications.filter(
    n => !n.is_read
  ).length

  async function handlePress(item: Notification) {
    if (!item.is_read) {
      markRead(item.id)
    }

    // Route/activity screens live inside the Discover tab's stack, so a
    // notification tap hops tabs with nested params. Welcome/achievement
    // notifications have no destination — tapping just marks them read.
    switch (item.type) {
      case 'route_share':
        if (item.route_id) {
          try {
            // RoutePreview needs the full route object, not just an id.
            const savedRoute = await routesApi.getById(item.route_id)
            navigation.navigate('Discover', {
              screen: 'RoutePreview',
              params: {
                generatedRoute: savedRoute,
                savedRouteId:   savedRoute.id,
                isOwner:        false,
                params:         undefined,
              },
            })
          } catch {
            // Route was deleted or is unreachable — leave the user on the list.
          }
        }
        break

      case 'activity_completed':
        if (item.activity_id) {
          navigation.navigate('Discover', {
            screen: 'ActivitySummary',
            params: { activityId: item.activity_id },
          })
        }
        break
    }
  }

  function renderItem({
    item,
  }: {
    item: Notification
  }) {
    const meta =
      TYPE_META[item.type] ?? {
        icon: 'notifications',
        color: colors.textMuted,
      }

    const unread = !item.is_read

    return (
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => handlePress(item)}
        style={[
          styles.item,
          unread && styles.itemUnread,
        ]}
      >
        {item.actor?.avatar_url ? (
          <Image
            source={{
              uri: item.actor.avatar_url,
            }}
            style={styles.avatar}
          />
        ) : (
          <View
            style={[
              styles.iconWrap,
              {
                backgroundColor:
                  meta.color + '20',
              },
            ]}
          >
            <Ionicons
              name={meta.icon}
              size={18}
              color={meta.color}
            />
          </View>
        )}

        <View style={styles.body}>
          <Text
            style={styles.message}
            numberOfLines={2}
          >
            {item.title && (
              <Text style={styles.actor}>
                {item.title}{'  '}
              </Text>
            )}
            {item.message}
          </Text>

          <Text style={styles.time}>
            {formatRelativeTime(
              item.created_at
            )}
          </Text>
        </View>

        {unread && (
          <View style={styles.dot} />
        )}
      </TouchableOpacity>
    )
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <LoadingState
            title="Loading notifications…"
            icon="notifications-outline"
          />
        </View>
      </SafeAreaView>
    )
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ErrorState
            title="Could not load notifications"
            message={userMessageFromError(error)}
            onRetry={refetch}
          />
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>
            Notifications
          </Text>

          {unreadCount > 0 && (
            <View style={styles.badge}>
              <Text
                style={styles.badgeText}
              >
                {unreadCount} unread
              </Text>
            </View>
          )}
        </View>

        {unreadCount > 0 && (
          <TouchableOpacity
            disabled={clearingAll}
            onPress={() =>
              markAllRead()
            }
            style={styles.clearBtn}
          >
            {clearingAll ? (
              <ActivityIndicator
                size="small"
                color={colors.primary}
              />
            ) : (
              <Text
                style={styles.clearText}
              >
                Mark all read
              </Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={notifications}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={
          notifications.length === 0
            ? styles.emptyContainer
            : styles.list
        }
        ItemSeparatorComponent={() => (
          <View style={styles.sep} />
        )}
        refreshControl={
          <RefreshControl
            refreshing={
              isRefetching
            }
            onRefresh={refetch}
            tintColor={
              colors.primary
            }
          />
        }
        ListEmptyComponent={
          <View style={styles.center}>
            <View
              style={
                styles.emptyIcon
              }
            >
              <Ionicons
                name="notifications-outline"
                size={50}
                color={
                  colors.primary
                }
              />
            </View>

            <Text
              style={
                styles.emptyTitle
              }
            >
              No notifications yet
            </Text>

            <Text
              style={
                styles.emptySubtitle
              }
            >
              Activity updates and
              achievements will
              appear here.
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor:
      colors.background,
  },

  header: {
    flexDirection: 'row',
    justifyContent:
      'space-between',
    alignItems: 'flex-start',
    paddingHorizontal:
      spacing.xl,
    paddingVertical:
      spacing.lg,
    borderBottomWidth: 0.5,
    borderBottomColor:
      colors.border,
  },

  title: {
    fontSize:
      fontSize['2xl'],
    fontWeight:
      fontWeight.bold,
    color:
      colors.textPrimary,
  },

  badge: {
    alignSelf: 'flex-start',
    marginTop: 8,
    backgroundColor:
      colors.primary + '15',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },

  badgeText: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight:
      fontWeight.semibold,
  },

  clearBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },

  clearText: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight:
      fontWeight.medium,
  },

  list: {
    paddingVertical:
      spacing.sm,
  },

  emptyContainer: {
    flexGrow: 1,
  },

  center: {
    flex: 1,
    justifyContent:
      'center',
    alignItems: 'center',
    paddingHorizontal:
      spacing.xl,
    gap: spacing.md,
  },

  emptyIcon: {
    width: 90,
    height: 90,
    borderRadius: 45,
    justifyContent:
      'center',
    alignItems: 'center',
    backgroundColor:
      colors.primary + '12',
  },

  emptyTitle: {
    fontSize:
      fontSize.lg,
    fontWeight:
      fontWeight.semibold,
    color:
      colors.textPrimary,
  },

  emptySubtitle: {
    fontSize:
      fontSize.sm,
    color:
      colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },

  item: {
    flexDirection: 'row',
    alignItems:
      'flex-start',
    gap: spacing.md,
    paddingHorizontal:
      spacing.xl,
    paddingVertical:
      spacing.lg,
  },

  itemUnread: {
    backgroundColor:
      colors.primary + '08',
    borderLeftWidth: 3,
    borderLeftColor:
      colors.primary,
  },

  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent:
      'center',
    flexShrink: 0,
  },

  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },

  body: {
    flex: 1,
  },

  actor: {
    color:
      colors.textPrimary,
    fontWeight:
      fontWeight.semibold,
  },

  message: {
    color:
      colors.textSecondary,
    fontSize:
      fontSize.sm,
    lineHeight: 21,
  },

  time: {
    marginTop: 6,
    color:
      colors.textMuted,
    fontSize:
      fontSize.xs,
  },

  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor:
      colors.primary,
    marginTop: 6,
  },

  sep: {
    height: 0.5,
    marginLeft: 72,
    backgroundColor:
      colors.border,
  },

  retryButton: {
    marginTop: spacing.md,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius:
      radius.md,
    backgroundColor:
      colors.primary,
  },

  retryText: {
    color: '#fff',
    fontWeight:
      fontWeight.medium,
  },
})