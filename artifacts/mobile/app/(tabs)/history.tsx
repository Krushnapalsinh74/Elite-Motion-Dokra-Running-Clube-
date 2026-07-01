import { Feather } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HistoryCard } from "@/components/HistoryCard";
import { Activity, useActivity } from "@/contexts/ActivityContext";
import { useColors } from "@/hooks/useColors";

type TimeFilter = "week" | "month" | "year" | "all";
type TypeFilter = "all" | "walking" | "running" | "cycling";

function filterByTime(activities: Activity[], filter: TimeFilter): Activity[] {
  const now = new Date();
  return activities.filter((a) => {
    const d = new Date(a.startTime);
    if (filter === "week") return d >= new Date(now.getTime() - 7 * 86400000);
    if (filter === "month")
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    if (filter === "year") return d.getFullYear() === now.getFullYear();
    return true;
  });
}

export default function HistoryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { savedActivities, deleteActivity } = useActivity();
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("week");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const isWeb = Platform.OS === "web";
  const paddingTop = isWeb ? insets.top + 67 : insets.top + 16;

  const filtered = useMemo(() => {
    let result = filterByTime(savedActivities, timeFilter);
    if (typeFilter !== "all") result = result.filter((a) => a.type === typeFilter);
    return result;
  }, [savedActivities, timeFilter, typeFilter]);

  const totalDistance = filtered.reduce((s, a) => s + a.distance, 0);
  const totalTime = filtered.reduce((s, a) => s + a.duration, 0);
  const totalCalories = filtered.reduce((s, a) => s + a.calories, 0);
  const totalSteps = filtered.reduce((s, a) => s + (a.steps ?? 0), 0);

  const TIME_FILTERS: { key: TimeFilter; label: string }[] = [
    { key: "week", label: "Week" },
    { key: "month", label: "Month" },
    { key: "year", label: "Year" },
    { key: "all", label: "All" },
  ];

  const TYPE_FILTERS: { key: TypeFilter; icon: "grid" | "wind" | "zap" | "activity" }[] = [
    { key: "all", icon: "grid" },
    { key: "walking", icon: "wind" },
    { key: "running", icon: "zap" },
    { key: "cycling", icon: "activity" },
  ];

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{ paddingTop, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header + time filters */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>History</Text>
          <View style={styles.filters}>
            {TIME_FILTERS.map((f) => (
              <Pressable
                key={f.key}
                onPress={() => setTimeFilter(f.key)}
                style={[
                  styles.filterBtn,
                  {
                    backgroundColor: timeFilter === f.key ? colors.primary : colors.card,
                    borderColor: timeFilter === f.key ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.filterText,
                    {
                      color: timeFilter === f.key ? "#fff" : colors.mutedForeground,
                      fontFamily: "Inter_500Medium",
                    },
                  ]}
                >
                  {f.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Summary stats */}
        <View style={styles.statsRow}>
          {[
            { val: (totalDistance / 1000).toFixed(1), label: "km" },
            { val: String(Math.floor(totalTime / 60)), label: "min" },
            { val: String(totalCalories), label: "kcal" },
            { val: String(totalSteps > 0 ? totalSteps : filtered.length), label: totalSteps > 0 ? "steps" : "sessions" },
          ].map((s) => (
            <View key={s.label} style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.statVal, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>{s.val}</Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Type filters */}
        <View style={styles.typeRow}>
          {TYPE_FILTERS.map((f) => (
            <Pressable
              key={f.key}
              onPress={() => setTypeFilter(f.key)}
              style={[
                styles.typeBtn,
                {
                  backgroundColor: typeFilter === f.key ? colors.primary + "22" : "transparent",
                  borderColor: typeFilter === f.key ? colors.primary : colors.border,
                },
              ]}
            >
              <Feather
                name={f.icon}
                size={16}
                color={typeFilter === f.key ? colors.primary : colors.mutedForeground}
              />
            </Pressable>
          ))}
        </View>

        {/* Activity list */}
        <View style={{ paddingHorizontal: 24, marginTop: 8 }}>
          {filtered.length === 0 ? (
            <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="calendar" size={28} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                No activities in this period
              </Text>
            </View>
          ) : (
            filtered.map((a) => <HistoryCard key={a.id} activity={a} />)
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 24, marginBottom: 20, gap: 16 },
  title: { fontSize: 28 },
  filters: { flexDirection: "row", gap: 8 },
  filterBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  filterText: { fontSize: 13 },
  statsRow: { flexDirection: "row", paddingHorizontal: 24, gap: 8, marginBottom: 16 },
  statCard: { flex: 1, borderRadius: 14, borderWidth: 1, padding: 12, alignItems: "center", gap: 2 },
  statVal: { fontSize: 18 },
  statLabel: { fontSize: 10 },
  typeRow: { flexDirection: "row", paddingHorizontal: 24, gap: 10, marginBottom: 16 },
  typeBtn: { flex: 1, borderRadius: 12, borderWidth: 1, padding: 12, alignItems: "center", justifyContent: "center" },
  empty: { borderRadius: 16, borderWidth: 1, padding: 28, alignItems: "center", gap: 10 },
  emptyText: { fontSize: 14, textAlign: "center" },
});
