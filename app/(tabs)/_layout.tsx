import { Ionicons } from '@expo/vector-icons';
import { NativeTabs, Icon, Label } from 'expo-router/unstable-native-tabs';
import { Tabs } from 'expo-router';
import { Platform, View } from 'react-native';

import Colors from '@/constants/Colors';
import { TAB_BAR_HEIGHT, TAB_BAR_PADDING_BOTTOM, TAB_BAR_PADDING_TOP } from '@/constants/Layout';
import { TOUR_DE_FRANCE_TAB_ENABLED } from '@/constants/tourDeFrance';
import { WORLD_CUP_TAB_ENABLED } from '@/constants/worldCup';

const colors = Colors.dark;

export default function TabLayout() {
  if (Platform.OS === 'ios') {
    return <IosNativeTabs />;
  }

  return <JsTabs />;
}

/**
 * System UITabBarController — Liquid Glass on iOS 26+ (Xcode 26), classic
 * translucent material on earlier iOS. JS tabs stay on Android/web.
 */
function IosNativeTabs() {
  return (
    <NativeTabs
      minimizeBehavior="never"
      disableTransparentOnScrollEdge
      backgroundColor={null}
      blurEffect="systemChromeMaterialDark"
      tintColor={colors.tabIconSelected}
      iconColor={{
        default: colors.tabIconDefault,
        selected: colors.tabIconSelected,
      }}
      labelStyle={{
        default: {
          fontFamily: 'InterMedium',
          fontSize: 11,
          color: colors.tabIconDefault,
        },
        selected: {
          fontFamily: 'InterMedium',
          fontSize: 11,
          color: colors.tabIconSelected,
        },
      }}>
      <NativeTabs.Trigger name="index">
        <Label>Latest</Label>
        <Icon sf={{ default: 'newspaper', selected: 'newspaper.fill' }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="tour-de-france" hidden={!TOUR_DE_FRANCE_TAB_ENABLED}>
        <Label>Tour</Label>
        <Icon sf={{ default: 'bicycle', selected: 'bicycle' }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="world-cup" hidden={!WORLD_CUP_TAB_ENABLED}>
        <Label>World Cup</Label>
        <Icon sf={{ default: 'trophy', selected: 'trophy.fill' }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="for-you">
        <Label>For You</Label>
        <Icon sf={{ default: 'sparkles', selected: 'sparkles' }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="saved">
        <Label>Liked</Label>
        <Icon sf={{ default: 'heart', selected: 'heart.fill' }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <Label>Profile</Label>
        <Icon sf={{ default: 'person.circle', selected: 'person.circle.fill' }} />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function JsTabs() {
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
