import React from 'react'
import { createBottomTabNavigator }   from '@react-navigation/bottom-tabs'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { Ionicons } from '@expo/vector-icons'

import { HomeScreen }             from '../screens/home/HomeScreen'
import { DiscoverScreen }         from '../screens/discover/DiscoverScreen'
import { PlanScreen }             from '../screens/plan/PlanScreen'
import { RoutePreviewScreen }     from '../screens/plan/RoutePreviewScreen'
import { ActiveActivityScreen }   from '../screens/activity/ActiveActivityScreen'
import { ActivitySummaryScreen }  from '../screens/activity/ActivitySummaryScreen'
import { ProfileScreen }          from '../screens/profile/ProfileScreen'
import { EditProfileScreen }      from '../screens/profile/EditProfileScreen'
import { NotificationsScreen }    from '../screens/notifications/NotificationsScreen'
import { useUnreadCount }         from '../hooks/useNotifications'
import { colors }                 from '../theme'
import type {
  AppTabParamList,
  PlanStackParamList,
  ProfileStackParamList,
  DiscoverStackParamList,
  RootStackParamList,
} from '../types/navigation'

// ── Plan stack (Generate → Preview → Active → Summary) ──────────────────────

const PlanStack = createNativeStackNavigator<PlanStackParamList>()

function PlanNavigator() {
  return (
    <PlanStack.Navigator screenOptions={{ headerShown: false }}>
      <PlanStack.Screen name="PlanForm"     component={PlanScreen} />
      <PlanStack.Screen name="RoutePreview" component={RoutePreviewScreen} />
      {/*
        ActiveActivity + ActivitySummary also live here so the Plan flow
        works without a root-stack redirect.  They are *also* registered on
        the root stack below so any other tab can launch them.
      */}
      <PlanStack.Screen
        name="ActiveActivity"
        component={ActiveActivityScreen}
        options={{ gestureEnabled: false }}
      />
      <PlanStack.Screen name="ActivitySummary" component={ActivitySummaryScreen} />
    </PlanStack.Navigator>
  )
}

// ── Discover stack (List → Preview → Active → Summary) ───────────────────────

const DiscoverStack = createNativeStackNavigator<DiscoverStackParamList>()

function DiscoverNavigator() {
  return (
    <DiscoverStack.Navigator screenOptions={{ headerShown: false }}>
      <DiscoverStack.Screen name="DiscoverFeed" component={DiscoverScreen} />
      <DiscoverStack.Screen name="RoutePreview"  component={RoutePreviewScreen} />
      <DiscoverStack.Screen
        name="ActiveActivity"
        component={ActiveActivityScreen}
        options={{ gestureEnabled: false }}
      />
      <DiscoverStack.Screen name="ActivitySummary" component={ActivitySummaryScreen} />
    </DiscoverStack.Navigator>
  )
}

// ── Profile stack ─────────────────────────────────────────────────────────────

const ProfileStack = createNativeStackNavigator<ProfileStackParamList>()

function ProfileNavigator() {
  return (
    <ProfileStack.Navigator screenOptions={{ headerShown: false }}>
      <ProfileStack.Screen name="Profile"     component={ProfileScreen} />
      <ProfileStack.Screen name="EditProfile" component={EditProfileScreen} />
    </ProfileStack.Navigator>
  )
}

// ── Bottom tabs ───────────────────────────────────────────────────────────────

const Tab = createBottomTabNavigator<AppTabParamList>()

function TabNavigator() {
  const unread = useUnreadCount()

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor:  colors.surface,
          borderTopColor:   colors.border,
          borderTopWidth:   0.5,
          paddingBottom:    8,
          paddingTop:       6,
          height:           60,
        },
        tabBarActiveTintColor:   colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500', marginTop: 2 },
        tabBarIcon: ({ color, focused, size }) => {
          const icons: Record<string, [string, string]> = {
            Home:          ['home',           'home-outline'],
            Discover:      ['compass',        'compass-outline'],
            Plan:          ['add-circle',     'add-circle-outline'],
            ProfileTab:    ['person',         'person-outline'],
            Notifications: ['notifications',  'notifications-outline'],
          }
          const [filledIcon, outlineIcon] = icons[route.name] ?? ['help', 'help-outline']
          return (
            <Ionicons
              name={(focused ? filledIcon : outlineIcon) as any}
              size={route.name === 'Plan' ? size + 4 : size}
              color={color}
            />
          )
        },
      })}
    >
      <Tab.Screen name="Home"          component={HomeScreen}         options={{ title: 'Feed' }} />
      <Tab.Screen name="Discover"      component={DiscoverNavigator} />
      <Tab.Screen name="Plan"          component={PlanNavigator}      options={{ title: 'Plan' }} />
      <Tab.Screen name="ProfileTab"    component={ProfileNavigator}   options={{ title: 'Profile' }} />
      <Tab.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{
          title: 'Alerts',
          tabBarBadge: unread > 0 ? unread : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.danger, fontSize: 10 },
        }}
      />
    </Tab.Navigator>
  )
}

// ── Root stack — wraps tabs so ActiveActivity hides the tab bar ──────────────

const RootStack = createNativeStackNavigator<RootStackParamList>()

export function AppNavigator() {
  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      <RootStack.Screen name="Tabs" component={TabNavigator} />
    </RootStack.Navigator>
  )
}
