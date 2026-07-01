import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { ActivityType } from "@/contexts/ActivityContext";
import { useColors } from "@/hooks/useColors";

const ACTIVITY_CONFIG = {
  walking: {
    icon: "wind" as const,
    label: "Walking",
    desc: "5 – 7 km/h",
    colorFrom: "#1a1a1a",
  },
  running: {
    icon: "zap" as const,
    label: "Running",
    desc: "7 – 14 km/h",
    colorFrom: "#1a1a1a",
  },
  cycling: {
    icon: "activity" as const,
    label: "Cycling",
    desc: "15 – 30 km/h",
    colorFrom: "#1a1a1a",
  },
};

interface ActivityTypeCardProps {
  type: ActivityType;
  onPress: () => void;
  compact?: boolean;
}

export function ActivityTypeCard({ type, onPress, compact = false }: ActivityTypeCardProps) {
  const colors = useColors();
  const config = ACTIVITY_CONFIG[type];

  function handlePress() {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    onPress();
  }

  if (compact) {
    return (
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [
          styles.compact,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            opacity: pressed ? 0.7 : 1,
          },
        ]}
      >
        <View style={[styles.iconWrap, { backgroundColor: colors.primary + "22" }]}>
          <Feather name={config.icon} size={20} color={colors.primary} />
        </View>
        <Text style={[styles.compactLabel, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
          {config.label}
        </Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          opacity: pressed ? 0.75 : 1,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
      ]}
    >
      <View style={styles.cardTop}>
        <View style={[styles.iconWrapLarge, { backgroundColor: colors.primary + "22" }]}>
          <Feather name={config.icon} size={28} color={colors.primary} />
        </View>
        <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
      </View>
      <Text style={[styles.cardLabel, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
        {config.label}
      </Text>
      <Text style={[styles.cardDesc, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
        {config.desc}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 8,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  iconWrapLarge: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  cardLabel: {
    fontSize: 17,
    marginTop: 4,
  },
  cardDesc: {
    fontSize: 13,
  },
  compact: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    alignItems: "center",
    gap: 8,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  compactLabel: {
    fontSize: 13,
  },
});
