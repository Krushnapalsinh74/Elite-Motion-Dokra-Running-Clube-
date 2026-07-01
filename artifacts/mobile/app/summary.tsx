import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Activity, useActivity } from "@/contexts/ActivityContext";
import { useColors } from "@/hooks/useColors";

function fmt(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

const LABELS = { walking: "Walking", running: "Running", cycling: "Cycling" };
const ICONS = { walking: "wind" as const, running: "zap" as const, cycling: "activity" as const };

export default function SummaryScreen() {
  const params = useLocalSearchParams();
  const { saveActivity, deleteActivity } = useActivity();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [saved, setSaved] = useState(false);
  const isWeb = Platform.OS === "web";

  const activity: Activity | null = params.activityJson
    ? JSON.parse(params.activityJson as string)
    : null;

  if (!activity) {
    router.replace("/(tabs)/");
    return null;
  }

  const distKm = (activity.distance / 1000).toFixed(2);
  const avgSpeed = activity.avgSpeed.toFixed(1);
  const avgPace =
    activity.avgPace > 0
      ? `${Math.floor(activity.avgPace)}:${String(Math.round((activity.avgPace % 1) * 60)).padStart(2, "0")}`
      : "--:--";

  async function handleSave() {
    if (saved) return;
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await saveActivity(activity!);
    setSaved(true);
  }

  async function handleShare() {
    const msg = `Just completed a ${LABELS[activity!.type]}!\n${distKm} km in ${fmt(activity!.duration)}\nTracked with Dokra Running Club`;
    if (Platform.OS === "web") {
      alert(msg);
      return;
    }
    try {
      await Share.share({ message: msg, title: "Dokra Activity" });
    } catch {}
  }

  function handleDiscard() {
    if (Platform.OS === "web") {
      router.replace("/(tabs)/");
      return;
    }
    Alert.alert("Discard activity", "This activity will not be saved.", [
      { text: "Cancel", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: () => router.replace("/(tabs)/") },
    ]);
  }

  function handleDone() {
    router.replace("/(tabs)/");
  }

  const paddingTop = isWeb ? insets.top + 67 : insets.top;

  const STATS = [
    { label: "Distance", value: `${distKm} km`, icon: "map-pin" as const },
    { label: "Duration", value: fmt(activity.duration), icon: "clock" as const },
    { label: "Avg Pace", value: `${avgPace} /km`, icon: "trending-up" as const },
    { label: "Avg Speed", value: `${avgSpeed} km/h`, icon: "zap" as const },
    { label: "Calories", value: `${activity.calories} kcal`, icon: "flame" as const },
    { label: "Date", value: new Date(activity.startTime).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }), icon: "calendar" as const },
  ];

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{ paddingTop, paddingBottom: insets.bottom + (isWeb ? 34 : 20) + 20 }}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={[colors.primary + "33", colors.background]}
          style={styles.heroBg}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
        >
          <View style={[styles.heroIcon, { backgroundColor: colors.primary + "22" }]}>
            <Feather name={ICONS[activity.type]} size={40} color={colors.primary} />
          </View>
          <Text style={[styles.heroType, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            {LABELS[activity.type]} Complete
          </Text>
          <Text style={[styles.heroDistance, { color: colors.primary, fontFamily: "Inter_700Bold" }]}>
            {distKm} km
          </Text>
          {saved && (
            <View style={[styles.savedBadge, { backgroundColor: "#10B98122", borderColor: "#10B98155" }]}>
              <Feather name="check-circle" size={14} color="#10B981" />
              <Text style={[styles.savedText, { color: "#10B981", fontFamily: "Inter_600SemiBold" }]}>
                Saved to history
              </Text>
            </View>
          )}
        </LinearGradient>

        <View style={styles.statsGrid}>
          {STATS.map((s) => (
            <View key={s.label} style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.statIcon, { backgroundColor: colors.primary + "22" }]}>
                <Feather name={s.icon} size={16} color={colors.primary} />
              </View>
              <Text style={[styles.statVal, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
                {s.value}
              </Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                {s.label}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.actions}>
          {!saved ? (
            <Pressable
              onPress={handleSave}
              style={({ pressed }) => [styles.btnPrimary, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
            >
              <Feather name="save" size={18} color="#fff" />
              <Text style={[styles.btnPrimaryText, { fontFamily: "Inter_700Bold" }]}>Save Activity</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={handleDone}
              style={({ pressed }) => [styles.btnPrimary, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
            >
              <Feather name="home" size={18} color="#fff" />
              <Text style={[styles.btnPrimaryText, { fontFamily: "Inter_700Bold" }]}>Back to Home</Text>
            </Pressable>
          )}

          <View style={styles.secondaryBtns}>
            <Pressable
              onPress={handleShare}
              style={({ pressed }) => [
                styles.btnSecondary,
                { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Feather name="share-2" size={18} color={colors.foreground} />
              <Text style={[styles.btnSecondaryText, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                Share
              </Text>
            </Pressable>

            {!saved && (
              <Pressable
                onPress={handleDiscard}
                style={({ pressed }) => [
                  styles.btnSecondary,
                  { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Feather name="trash-2" size={18} color={colors.destructive} />
                <Text style={[styles.btnSecondaryText, { color: colors.destructive, fontFamily: "Inter_600SemiBold" }]}>
                  Discard
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  heroBg: { alignItems: "center", paddingVertical: 40, paddingHorizontal: 24, gap: 10 },
  heroIcon: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center" },
  heroType: { fontSize: 20 },
  heroDistance: { fontSize: 56, letterSpacing: -2 },
  savedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginTop: 4,
  },
  savedText: { fontSize: 13 },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 24,
    gap: 10,
    marginTop: 8,
  },
  statCard: {
    width: "47%",
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 6,
  },
  statIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  statVal: { fontSize: 16 },
  statLabel: { fontSize: 12 },
  actions: { paddingHorizontal: 24, marginTop: 24, gap: 12 },
  btnPrimary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 16,
    borderRadius: 16,
  },
  btnPrimaryText: { color: "#fff", fontSize: 16 },
  secondaryBtns: { flexDirection: "row", gap: 10 },
  btnSecondary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  btnSecondaryText: { fontSize: 15 },
});
