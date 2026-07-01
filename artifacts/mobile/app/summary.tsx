/**
 * Activity Summary Screen
 *
 * Shows the complete activity breakdown after finishing.
 * Shareable poster is built as a React Native view and shared
 * via the native Share API (text + stats). No native screenshot
 * library needed — works in Expo Go.
 */

import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
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

function fmtDuration(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function fmtPace(v: number): string {
  if (!v || v <= 0 || !isFinite(v) || v > 60) return "--:--";
  const m = Math.floor(v);
  const s = Math.round((v - m) * 60);
  return `${m}:${String(s).padStart(2, "0")} /km`;
}

function confLabel(c: number) {
  if (c >= 0.85) return { text: "Excellent", color: "#10B981" };
  if (c >= 0.7) return { text: "Good", color: "#22C55E" };
  if (c >= 0.5) return { text: "Fair", color: "#F59E0B" };
  return { text: "Low", color: "#EF4444" };
}

const ICON: Record<string, "wind" | "zap" | "activity"> = {
  walking: "wind",
  running: "zap",
  cycling: "activity",
};
const LABEL: Record<string, string> = {
  walking: "Walking",
  running: "Running",
  cycling: "Cycling",
};

export default function SummaryScreen() {
  const params = useLocalSearchParams();
  const { saveActivity } = useActivity();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [saved, setSaved] = useState(false);

  const activity: Activity | null = params.activityJson
    ? JSON.parse(params.activityJson as string)
    : null;

  if (!activity) {
    router.replace("/(tabs)/");
    return null;
  }

  const distKm = (activity.distance / 1000).toFixed(2);
  const conf = confLabel(activity.confidence ?? 0);
  const isWeb = Platform.OS === "web";

  const STATS = [
    { icon: "map-pin" as const, label: "Distance", value: `${distKm} km` },
    { icon: "clock" as const, label: "Duration", value: fmtDuration(activity.duration) },
    { icon: "trending-up" as const, label: "Avg Pace", value: fmtPace(activity.avgPace) },
    { icon: "zap" as const, label: "Avg Speed", value: `${activity.avgSpeed.toFixed(1)} km/h` },
    { icon: "activity" as const, label: "Calories", value: `${activity.calories} kcal` },
    { icon: "users" as const, label: "Steps", value: activity.steps > 0 ? String(activity.steps) : "—" },
    {
      icon: "cpu" as const,
      label: "GPS Accuracy",
      value: `${conf.text} (${Math.round((activity.confidence ?? 0) * 100)}%)`,
      valueColor: conf.color,
    },
    {
      icon: "calendar" as const,
      label: "Date",
      value: new Date(activity.startTime).toLocaleDateString("en-US", {
        month: "short", day: "numeric", year: "numeric",
      }),
    },
  ];

  async function handleSave() {
    if (saved) return;
    await saveActivity(activity!);
    setSaved(true);
  }

  async function handleShare() {
    const msg =
      `🏃 ${LABEL[activity!.type]} Complete!\n` +
      `📍 Distance: ${distKm} km\n` +
      `⏱ Duration: ${fmtDuration(activity!.duration)}\n` +
      `⚡ Pace: ${fmtPace(activity!.avgPace)}\n` +
      `🔥 Calories: ${activity!.calories} kcal\n` +
      (activity!.steps > 0 ? `👟 Steps: ${activity!.steps}\n` : "") +
      `\nTracked with Dokra Running Club`;

    if (isWeb) { alert(msg); return; }
    try {
      await Share.share({ message: msg, title: "Dokra Activity" });
    } catch {}
  }

  function handleDiscard() {
    if (isWeb) { router.replace("/(tabs)/"); return; }
    Alert.alert("Discard Activity", "This will not be saved.", [
      { text: "Cancel", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: () => router.replace("/(tabs)/") },
    ]);
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: isWeb ? insets.top + 67 : insets.top + 8,
          paddingBottom: insets.bottom + 40,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Poster card */}
        <View style={[styles.poster, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Orange header band */}
          <View style={[styles.posterHeader, { backgroundColor: colors.primary }]}>
            <Text style={[styles.posterBrand, { fontFamily: "Inter_700Bold" }]}>DOKRA</Text>
            <Text style={[styles.posterSub, { fontFamily: "Inter_400Regular" }]}>RUNNING CLUB</Text>
          </View>

          {/* Hero content */}
          <View style={styles.posterBody}>
            <View style={[styles.typeIcon, { backgroundColor: colors.primary + "20" }]}>
              <Feather name={ICON[activity.type]} size={32} color={colors.primary} />
            </View>
            <Text style={[styles.typeLabel, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
              {LABEL[activity.type]}
            </Text>
            <Text style={[styles.heroDist, { color: colors.primary, fontFamily: "Inter_700Bold" }]}>
              {distKm} km
            </Text>

            {/* Quick stat row */}
            <View style={styles.quickRow}>
              {[
                { label: "Time", value: fmtDuration(activity.duration) },
                { label: "Pace", value: fmtPace(activity.avgPace) },
                { label: "Cal", value: `${activity.calories}` },
              ].map((s) => (
                <View key={s.label} style={styles.quickStat}>
                  <Text style={[styles.quickVal, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
                    {s.value}
                  </Text>
                  <Text style={[styles.quickLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                    {s.label}
                  </Text>
                </View>
              ))}
            </View>

            {/* Accuracy badge */}
            <View style={[styles.confBadge, { backgroundColor: conf.color + "18", borderColor: conf.color + "55" }]}>
              <Feather name="cpu" size={12} color={conf.color} />
              <Text style={[styles.confText, { color: conf.color, fontFamily: "Inter_600SemiBold" }]}>
                {conf.text} GPS accuracy · {Math.round((activity.confidence ?? 0) * 100)}%
              </Text>
            </View>

            <Text style={[styles.dateStr, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              {new Date(activity.startTime).toLocaleDateString("en-US", {
                weekday: "long", month: "long", day: "numeric", year: "numeric",
              })}
            </Text>
          </View>
        </View>

        {/* Full stat grid */}
        <View style={styles.grid}>
          {STATS.map((s) => (
            <View key={s.label} style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.statIcon, { backgroundColor: colors.primary + "18" }]}>
                <Feather name={s.icon} size={15} color={colors.primary} />
              </View>
              <Text
                style={[
                  styles.statVal,
                  { color: (s as { valueColor?: string }).valueColor ?? colors.foreground, fontFamily: "Inter_700Bold" },
                ]}
              >
                {s.value}
              </Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                {s.label}
              </Text>
            </View>
          ))}
        </View>

        {/* Action buttons */}
        <View style={styles.actions}>
          {!saved ? (
            <Pressable
              onPress={handleSave}
              style={({ pressed }) => [styles.btnPrimary, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
            >
              <Feather name="save" size={18} color="#fff" />
              <Text style={[styles.btnPrimaryText, { fontFamily: "Inter_700Bold" }]}>Save Activity</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => router.replace("/(tabs)/")}
              style={({ pressed }) => [styles.btnPrimary, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
            >
              <Feather name="check-circle" size={18} color="#fff" />
              <Text style={[styles.btnPrimaryText, { fontFamily: "Inter_700Bold" }]}>Saved — Back to Home</Text>
            </Pressable>
          )}

          <View style={styles.row}>
            <Pressable
              onPress={handleShare}
              style={({ pressed }) => [
                styles.btnSecondary,
                { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Feather name="share-2" size={17} color={colors.foreground} />
              <Text style={[styles.btnSecText, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>Share</Text>
            </Pressable>

            {!saved && (
              <Pressable
                onPress={handleDiscard}
                style={({ pressed }) => [
                  styles.btnSecondary,
                  { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Feather name="trash-2" size={17} color={colors.destructive} />
                <Text style={[styles.btnSecText, { color: colors.destructive, fontFamily: "Inter_600SemiBold" }]}>Discard</Text>
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
  poster: { marginHorizontal: 20, borderRadius: 20, borderWidth: 1, overflow: "hidden" },
  posterHeader: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
  },
  posterBrand: { color: "#fff", fontSize: 18, letterSpacing: 4 },
  posterSub: { color: "rgba(255,255,255,0.8)", fontSize: 10, letterSpacing: 2 },
  posterBody: { padding: 20, alignItems: "center", gap: 10 },
  typeIcon: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  typeLabel: { fontSize: 16 },
  heroDist: { fontSize: 52, letterSpacing: -2 },
  quickRow: { flexDirection: "row", gap: 24 },
  quickStat: { alignItems: "center", gap: 2 },
  quickVal: { fontSize: 17 },
  quickLabel: { fontSize: 11 },
  confBadge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderRadius: 16, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 5,
  },
  confText: { fontSize: 11 },
  dateStr: { fontSize: 12 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 20,
    gap: 10,
    marginTop: 16,
  },
  statCard: {
    width: "47%",
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 5,
  },
  statIcon: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  statVal: { fontSize: 15 },
  statLabel: { fontSize: 11 },
  actions: { paddingHorizontal: 20, marginTop: 20, gap: 10 },
  btnPrimary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 16,
    borderRadius: 14,
  },
  btnPrimaryText: { color: "#fff", fontSize: 16 },
  row: { flexDirection: "row", gap: 10 },
  btnSecondary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  btnSecText: { fontSize: 14 },
});
