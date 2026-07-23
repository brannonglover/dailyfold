import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { View } from 'react-native';

import Colors from '@/constants/Colors';
import { TAB_BAR_HEIGHT, TAB_BAR_PADDING_BOTTOM, TAB_BAR_PADDING_TOP } from '@/constants/Layout';
import { TOUR_DE_FRANCE_TAB_ENABLED } from '@/constants/tourDeFrance';
import { WORLD_CUP_TAB_ENABLED } from '@/constants/worldCup';
export default function TabLayout() {
  const colors = Colors.dark;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        freezeOnBlur: true,
        // Keep all tabs mounted so switching tabs never remounts heavy feed trees.
        lazy: false,
        tabBarActiveTintColor: colors.tabIconSelected,
        tabBarInactiveTintColor: colors.tabIconDefault,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          height: TAB_BAR_HEIGHT,
          paddingBottom: TAB_BAR_PADDING_BOTTOM,
          paddingTop: TAB_BAR_PADDING_TOP,
        },
        tabBarLabelStyle: {
          fontFamily: 'InterMedium',
          fontSize: 11,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Latest',
          lazy: false,
          tabBarIcon: ({ color }) => <Ionicons name="newspaper-outline" size={24} color={color} />,
        }}
      />
      {TOUR_DE_FRANCE_TAB_ENABLED ? (
        <Tabs.Screen
          name="tour-de-france"
          options={{
            title: 'Tour',
            lazy: false,
            tabBarIcon: ({ color, focused }) =>
              focused ? (
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    backgroundColor: colors.accent,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  <Ionicons name="bicycle" size={14} color="#FFFFFF" />
                </View>
              ) : (
                <Ionicons name="bicycle-outline" size={24} color={color} />
              ),
          }}
        />
      ) : (
        <Tabs.Screen name="tour-de-france" options={{ href: null }} />
      )}
      {WORLD_CUP_TAB_ENABLED ? (
        <Tabs.Screen
          name="world-cup"
          options={{
            title: 'World Cup',
            tabBarIcon: ({ color }) => <Ionicons name="trophy-outline" size={24} color={color} />,
          }}
        />
      ) : (
        <Tabs.Screen name="world-cup" options={{ href: null }} />
      )}
      <Tabs.Screen
        name="for-you"
        options={{
          title: 'For You',
          lazy: false,
          tabBarIcon: ({ color }) => <Ionicons name="sparkles-outline" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="saved"
        options={{
          title: 'Liked',
          lazy: false,
          tabBarIcon: ({ color }) => <Ionicons name="heart-outline" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          lazy: false,
          tabBarIcon: ({ color }) => (
            <Ionicons name="person-circle-outline" size={24} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
