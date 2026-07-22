import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

export default function TabBar({ tabs, activeTab, onTabPress, scrollable = false }) {
  const { colors } = useTheme();

  const content = tabs.map((tab) => {
    const active = tab.key === activeTab;
    return (
      <TouchableOpacity
        key={tab.key}
        onPress={() => onTabPress(tab.key)}
        style={[
          styles.tab,
          active
            ? { backgroundColor: colors.primary, borderColor: colors.primary }
            : { backgroundColor: colors.bgHover, borderColor: colors.border },
        ]}
        activeOpacity={0.7}
      >
        <Text
          numberOfLines={1}
          style={[styles.tabText, { color: active ? '#ffffff' : colors.textPrimary }]}
        >
          {tab.label}
        </Text>
      </TouchableOpacity>
    );
  });

  if (scrollable) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {content}
      </ScrollView>
    );
  }

  return <View style={styles.container}>{content}</View>;
}

const styles = StyleSheet.create({
  // Non-scrollable: wrap chips so they always render (no horizontal-scroll
  // measurement glitch on Android).
  container: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, paddingVertical: 8 },
  scrollContent: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  // marginRight instead of container `gap` — `gap` inside a horizontal ScrollView
  // contentContainer is unreliable on some Android versions.
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
    marginBottom: 8,
  },
  tabText: { fontSize: 13, fontWeight: '600' },
});
