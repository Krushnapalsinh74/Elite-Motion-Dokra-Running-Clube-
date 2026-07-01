import { Feather } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Activity } from "@/contexts/ActivityContext";
import { useColors } from "@/hooks/useColors";

const ICONS = {
  walking: "wind" as const,
  running: "zap" as const,
  cycling: "activity" as const,
};

const LABELS = {
  walking: "Walking",
  running: "Running",
  cycling: "Cycling",
};

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface HistoryCardProps {
  activity: Activity;
  onPress?: () => void;
}

export function HistoryCard({ activity, onPress }: HistoryCardProps) {
  const colors = useColors();
  const distKm = (activity.distance / 1000).toFixed(2);
  const pace = activity.avgPace > 0 ? `${Math.floor(activity.avgPace)}:${String(Math.round((activity.avgPace % 1) * 60)).padStart(2, "0")} /km` : "—";

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      <View style={styles.left}>
        <View style={[styles.iconWrap, { backgroundColor: colors.primary + "22" }]}>
          <Feather name={ICONS[activity.type]} size={20} color={colors.primary} />
        </View>
        <View style={styles.info}>
          <Text style={[styles.type, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
            {LABELS[activity.type]}
          </Text>
          <Text style={[styles.date, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            {formatDate(activity.startTime)}
          </Text>
        </View>
      </View>
      <View style={styles.right}>
        <Text style={[styles.distance, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          {distKm} km
        </Text>
        <View style={styles.meta}>
          <Text style={[styles.metaText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            {formatDuration(activity.duration)}
          </Text>
          <Text style={[styles.dot, { color: colors.border }]}>·</Text>
          <Text style={[styles.metaText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            {pace}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 10,
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  info: {
    gap: 2,
  },
  type: {
    fontSize: 15,
  },
  date: {
    fontSize: 12,
  },
  right: {
    alignItems: "flex-end",
    gap: 2,
  },
  distance: {
    fontSize: 18,
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    fontSize: 12,
  },
  dot: {
    fontSize: 12,
  },
});
