import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from './theme';

export type Destination = 'coach' | 'record';

const destinations = [
  { id: 'coach', label: 'Coach', icon: 'chat-bubble-outline' },
  { id: 'record', label: 'Record', icon: 'folder-open' }
] satisfies { id: Destination; label: string; icon: ComponentProps<typeof MaterialIcons>['name'] }[];

export function BottomNavigation({
  current,
  onNavigate
}: {
  current: Destination;
  onNavigate: (destination: Destination) => void;
}) {
  return (
    <View accessibilityRole="tablist" style={styles.bar}>
      {destinations.map((destination) => {
        const selected = destination.id === current;
        const color = selected ? colors.ink : colors.secondary;
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            key={destination.id}
            onPress={() => onNavigate(destination.id)}
            style={styles.item}
          >
            <MaterialIcons color={color} name={destination.icon} size={22} />
            <Text style={[styles.label, { color, fontFamily: selected ? fonts.bold : fonts.regular }]}>
              {destination.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.surface,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingBottom: 16,
    paddingHorizontal: 24,
    paddingTop: 12
  },
  item: { alignItems: 'center', gap: 4, minWidth: 74 },
  label: { fontSize: 11 }
});
