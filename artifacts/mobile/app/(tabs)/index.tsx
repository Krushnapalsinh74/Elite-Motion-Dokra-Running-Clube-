import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useMemo } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ActivityTypeCard } from "@/components/ActivityTypeCard";
import { HistoryCard } from "@/components/HistoryCard";
import { StatRing } from "@/components/StatRing";
import { useActivity } from "@/contexts/ActivityContext";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function HomeScreen() {
  const { user } = useAuth();
  const { savedActivities, startActivity } = useActivity();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const todayDistanceM = useMemo(() => {
    const today = new Date().toDateString();
    return savedActivities
      .filter((a) => new Date(a.startTime).toDateString() === today)
      .reduce((sum, a) => sum + a.distance, 0);
  }, [savedActivities]);

  const todayDistanceKm = todayDistanceM / 1000;
  const goalKm = 5;
  const progress = Math.min(todayDistanceKm / goalKm, 1);

  const todayCalories = useMemo(() => {
    const today = new Date().toDateString();
    return savedActivities
      .filter((a) => new Date(a.startTime).toDateString() === today)
      .reduce((sum, a) => sum + a.calories, 0);
  }, [savedActivities]);

  const todayTime = useMemo(() => {
    const today = new Date().toDateString();
    const secs = savedActivities
      .filter((a) => new Date(a.startTime).toDateString() === today)
      .reduce((sum, a) => sum + a.duration, 0);
    const m = Math.floor(secs / 60);
    return `${m}m`;
  }, [savedActivities]);

  const recent = savedActivities.slice(0, 5);
  const firstName = user?.name?.split(" ")[0] ?? "Runner";

  async function handleStart(type: "walking" | "running" | "cycling") {
    await startActivity(type);
    router.push("/tracking");
  }

  const paddingTop = isWeb ? insets.top + 67 : insets.top + 16;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop, paddingBottom: 100 }}
      >
        <View style={styles.header}>
          <View>
            <Text style={[styles.greeting, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              {getGreeting()},
            </Text>
            <Text style={[styles.name, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
              {firstName}
            </Text>
          </View>
          <Pressable
            onPress={() => router.push("/(tabs)/profile")}
            style={[styles.avatar, { backgroundColor: colors.primary }]}
          >
            <Text style={[styles.avatarText, { fontFamily: "Inter_700Bold" }]}>
              {firstName[0].toUpperCase()}
            </Text>
          </Pressable>
        </View>

        <View style={styles.ringSection}>
          <StatRing
            progress={progress}
            size={220}
            strokeWidth={12}
            value={todayDistanceKm.toFixed(2)}
            label="KM TODAY"
            sublabel={`Goal: ${goalKm} km`}
          />
          <View style={styles.quickStats}>
            <View style={[styles.quickStat, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="flame" size={16} color={colors.primary} />
              <Text style={[styles.quickStatVal, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
                {todayCalories}
              </Text>
              <Text style={[styles.quickStatLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                kcal
              </Text>
            </View>
            <View style={[styles.quickStat, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="clock" size={16} color={colors.primary} />
              <Text style={[styles.quickStatVal, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
                {todayTime}
              </Text>
              <Text style={[styles.quickStatLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                active
              </Text>
            </View>
            <View style={[styles.quickStat, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="activity" size={16} color={colors.primary} />
              <Text style={[styles.quickStatVal, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
                {savedActivities.filter((a) => new Date(a.startTime).toDateString() === new Date().toDateString()).length}
              </Text>
              <Text style={[styles.quickStatLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                sessions
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            Start Activity
          </Text>
          <View style={styles.activityRow}>
            {(["walking", "running", "cycling"] as const).map((type) => (
              <ActivityTypeCard key={type} type={type} onPress={() => handleStart(type)} compact />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
              Recent
            </Text>
            <Pressable onPress={() => router.push("/(tabs)/history")}>
              <Text style={[styles.seeAll, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
                See all
              </Text>
            </Pressable>
          </View>
          {recent.length === 0 ? (
            <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="map" size={28} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                No activities yet. Start your first run!
              </Text>
            </View>
          ) : (
            recent.map((a) => <HistoryCard key={a.id} activity={a} />)
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  greeting: { fontSize: 14 },
  name: { fontSize: 26 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#fff", fontSize: 18 },
  ringSection: { alignItems: "center", paddingHorizontal: 24, gap: 20, marginBottom: 8 },
  quickStats: { flexDirection: "row", gap: 10, width: "100%" },
  quickStat: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    padding: 12,
    gap: 3,
  },
  quickStatVal: { fontSize: 18 },
  quickStatLabel: { fontSize: 11 },
  section: { paddingHorizontal: 24, marginTop: 28, gap: 14 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sectionTitle: { fontSize: 18 },
  seeAll: { fontSize: 14 },
  activityRow: { flexDirection: "row", gap: 10 },
  empty: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 28,
    alignItems: "center",
    gap: 10,
  },
  emptyText: { fontSize: 14, textAlign: "center" },
});
