import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { Badge } from './Badge';

export type NavTab = 'feed' | 'discover' | 'connections' | 'messages' | 'community' | 'profile';

export interface BottomNavProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  pendingConnectionsCount?: number;
  unreadMessagesCount?: number;
}

interface TabItem {
  id: NavTab;
  label: string;
  icon: string;
  badgeCount?: number;
}

export function BottomNav({
  currentTab,
  onSelectTab,
  pendingConnectionsCount = 0,
  unreadMessagesCount = 0,
}: BottomNavProps) {
  const { colors, space, touch, type } = useTheme();
  const insets = useSafeAreaInsets();

  const tabs: TabItem[] = [
    { id: 'feed', label: 'Explore', icon: '⌂' },
    { id: 'discover', label: 'Discover', icon: '✦' },
    { id: 'connections', label: 'Connections', icon: '⚯', badgeCount: pendingConnectionsCount },
    { id: 'messages', label: 'Messages', icon: '✉', badgeCount: unreadMessagesCount },
    { id: 'community', label: 'Plans', icon: '◈' },
    { id: 'profile', label: 'Profile', icon: '●' },
  ];

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: colors.surface,
          borderTopColor: colors.line,
          paddingBottom: Math.max(insets.bottom, space[2]),
        },
      ]}
    >
      {tabs.map((tab) => {
        const isActive = currentTab === tab.id;
        return (
          <Pressable
            key={tab.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={`${tab.label}${tab.badgeCount && tab.badgeCount > 0 ? `, ${tab.badgeCount} notifications` : ''}`}
            onPress={() => onSelectTab(tab.id)}
            style={({ pressed }) => [
              styles.tab,
              { minHeight: touch.min },
              pressed && { opacity: 0.7 },
            ]}
          >
            <View style={styles.iconWrap}>
              <View
                style={[
                  styles.activeIndicator,
                  {
                    backgroundColor: isActive ? colors.accentSoft : 'transparent',
                    borderColor: isActive ? colors.accentLine : 'transparent',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.icon,
                    {
                      color: isActive ? colors.accent : colors.textMuted,
                    },
                  ]}
                >
                  {tab.icon}
                </Text>
              </View>
              {tab.badgeCount && tab.badgeCount > 0 ? (
                <View style={styles.badgeWrap}>
                  <Badge count={tab.badgeCount} compact tone="accent" />
                </View>
              ) : null}
            </View>
            <Text
              style={[
                styles.label,
                {
                  color: isActive ? colors.accent : colors.textMuted,
                  fontSize: type.caption.size - 1,
                  fontWeight: isActive ? '700' : '500',
                },
              ]}
              numberOfLines={1}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingTop: 6,
    position: 'relative',
    zIndex: 10,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
  },
  iconWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 44,
  },
  activeIndicator: {
    paddingHorizontal: 12,
    paddingVertical: 3,
    borderRadius: 14,
    borderWidth: 1,
  },
  icon: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  badgeWrap: {
    position: 'absolute',
    top: -4,
    right: -6,
  },
  label: {
    marginTop: 2,
    letterSpacing: 0.2,
  },
});
