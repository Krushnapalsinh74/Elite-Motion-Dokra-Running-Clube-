/**
 * Activity Summary Screen
 *
 * Features:
 * - Full stat breakdown
 * - Stylish social share card (dark/gradient design)
 * - User can add their own photo as the card background
 * - Capture card as PNG → save to Camera Roll or share to any social platform
 */

import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";
import { router, useLocalSearchParams } from "expo-router";
import * as Sharing from "expo-sharing";
import React, { useRef, useState } from "react";
import {
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { captureRef } from "react-native-view-shot";

import { Activity, useActivity } from "@/contexts/ActivityContext";
import { useColors } from "@/hooks/useColors";

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
  return `${m}:${String(s).padStart(2, "0")}`;
}

function confLabel(c: number) {
  if (c >= 0.85) return { text: "Excellent", color: "#10B981" };
  if (c >= 0.7) return { text: "Good", color: "#22C55E" };
  if (c >= 0.5) return { text: "Fair", color: "#F59E0B" };
  return { text: "Low", color: "#EF4444" };
}

const ICON: Record<string, "wind" | "zap" | "activity"> = {
  walking: "wind", running: "zap", cycling: "activity",
};
const LABEL: Record<string, string> = {
  walking: "Walking", running: "Running", cycling: "Cycling",
};
const ACCENT = "#FF6B2C";

// ─── Share Card component (the visual captured as image) ──────────────────────

interface ShareCardProps {
  cardRef: React.RefObject<View>;
  activity: Activity;
  userPhoto: string | null;
}

function ShareCard({ cardRef, activity, userPhoto }: ShareCardProps) {
  const distKm = (activity.distance / 1000).toFixed(2);
  const dateStr = new Date(activity.startTime).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", year: "numeric",
  });

  return (
    <View
      ref={cardRef}
      collapsable={false}
      style={card.root}
    >
      {/* Background: user photo or dark slate */}
      {userPhoto ? (
        <Image
          source={{ uri: userPhoto }}
          style={StyleSheet.absoluteFillObject}
          resizeMode="cover"
        />
      ) : (
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: "#0D1117" }]} />
      )}

      {/* Gradient-like dark overlay — always on top of photo */}
      <View style={[StyleSheet.absoluteFillObject, card.overlay]} />

      {/* Top branding bar */}
      <View style={card.topBar}>
        <View style={card.logoChip}>
          <Text style={card.logoText}>DOKRA</Text>
        </View>
        <View style={card.activityPill}>
          <Feather name={ICON[activity.type]} size={12} color={ACCENT} />
          <Text style={card.activityPillText}>{LABEL[activity.type].toUpperCase()}</Text>
        </View>
      </View>

      {/* Hero distance */}
      <View style={card.heroSection}>
        <Text style={card.distValue}>{distKm}</Text>
        <Text style={card.distUnit}>KILOMETERS</Text>
      </View>

      {/* Stats strip */}
      <View style={card.statsStrip}>
        <View style={card.statItem}>
          <Text style={card.statVal}>{fmtDuration(activity.duration)}</Text>
          <Text style={card.statLbl}>TIME</Text>
        </View>
        <View style={card.divider} />
        <View style={card.statItem}>
          <Text style={card.statVal}>{fmtPace(activity.avgPace)}</Text>
          <Text style={card.statLbl}>PACE /KM</Text>
        </View>
        <View style={card.divider} />
        <View style={card.statItem}>
          <Text style={card.statVal}>{activity.calories}</Text>
          <Text style={card.statLbl}>KCAL</Text>
        </View>
        {activity.steps > 0 && (
          <>
            <View style={card.divider} />
            <View style={card.statItem}>
              <Text style={card.statVal}>{activity.steps.toLocaleString()}</Text>
              <Text style={card.statLbl}>STEPS</Text>
            </View>
          </>
        )}
      </View>

      {/* Bottom: date + tagline */}
      <View style={card.footer}>
        <Text style={card.footerDate}>{dateStr}</Text>
        <Text style={card.footerTag}>dokra.app</Text>
      </View>

      {/* Orange accent bar at very bottom */}
      <View style={card.accentBar} />
    </View>
  );
}

const card = StyleSheet.create({
  root: {
    width: 340,
    height: 460,
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: "#0D1117",
    alignSelf: "center",
  },
  overlay: {
    backgroundColor: "rgba(0,0,0,0.62)",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 22,
  },
  logoChip: {
    backgroundColor: ACCENT,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  logoText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    letterSpacing: 3,
  },
  activityPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  activityPillText: {
    color: "#fff",
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1.5,
  },
  heroSection: {
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    gap: 4,
  },
  distValue: {
    color: "#FFFFFF",
    fontSize: 80,
    fontFamily: "Inter_700Bold",
    letterSpacing: -4,
    lineHeight: 84,
  },
  distUnit: {
    color: ACCENT,
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 4,
  },
  statsStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
    marginHorizontal: 20,
    borderRadius: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  statItem: {
    flex: 1,
    alignItems: "center",
    gap: 3,
  },
  statVal: {
    color: "#FFFFFF",
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  statLbl: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 9,
    fontFamily: "Inter_500Medium",
    letterSpacing: 1,
  },
  divider: {
    width: 1,
    height: 28,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 14,
  },
  footerDate: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  footerTag: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  accentBar: {
    height: 4,
    backgroundColor: ACCENT,
  },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function SummaryScreen() {
  const params = useLocalSearchParams();
  const { saveActivity } = useActivity();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [userPhoto, setUserPhoto] = useState<string | null>(null);
  const shareCardRef = useRef<View>(null);
  const isWeb = Platform.OS === "web";

  const activity: Activity | null = params.activityJson
    ? JSON.parse(params.activityJson as string)
    : null;

  if (!activity) {
    router.replace("/(tabs)/");
    return null;
  }

  const distKm = (activity.distance / 1000).toFixed(2);
  const conf = confLabel(activity.confidence ?? 0);

  const STATS = [
    { icon: "map-pin" as const,      label: "Distance",    value: `${distKm} km` },
    { icon: "clock" as const,        label: "Duration",    value: fmtDuration(activity.duration) },
    { icon: "trending-up" as const,  label: "Avg Pace",    value: `${fmtPace(activity.avgPace)} /km` },
    { icon: "zap" as const,          label: "Avg Speed",   value: `${activity.avgSpeed.toFixed(1)} km/h` },
    { icon: "activity" as const,     label: "Calories",    value: `${activity.calories} kcal` },
    { icon: "users" as const,        label: "Steps",       value: activity.steps > 0 ? String(activity.steps) : "—" },
    { icon: "cpu" as const,          label: "GPS Quality", value: `${conf.text} (${Math.round((activity.confidence ?? 0) * 100)}%)`, valueColor: conf.color },
    { icon: "calendar" as const,     label: "Date",        value: new Date(activity.startTime).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) },
  ];

  // ── Handlers ────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (saved) return;
    await saveActivity(activity!);
    setSaved(true);
  }

  async function handlePickPhoto() {
    if (isWeb) { Alert.alert("Not available", "Photo picking works on your phone only."); return; }
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission needed", "Allow photo access to add your picture to the share card.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [3, 4],
        quality: 0.9,
      });
      if (!result.canceled && result.assets[0]) {
        setUserPhoto(result.assets[0].uri);
      }
    } catch {
      Alert.alert("Error", "Could not open photo library.");
    }
  }

  async function _captureCard(): Promise<string | null> {
    if (!shareCardRef.current) return null;
    return captureRef(shareCardRef, { format: "png", quality: 1, result: "tmpfile" });
  }

  async function handleSaveCard() {
    if (isWeb) { Alert.alert("Not available", "Save the share card on your phone."); return; }
    setBusy(true);
    try {
      const uri = await _captureCard();
      if (!uri) return;
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status === "granted") {
        await MediaLibrary.saveToLibraryAsync(uri);
        Alert.alert("Saved! 🎉", "Your activity card has been saved to Photos.");
      } else {
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) await Sharing.shareAsync(uri, { mimeType: "image/png" });
      }
    } catch {
      Alert.alert("Error", "Could not save the card.");
    } finally {
      setBusy(false);
    }
  }

  async function handleShareCard() {
    if (isWeb) {
      const msg = `🏃 ${LABEL[activity!.type]} — ${distKm} km in ${fmtDuration(activity!.duration)} | ${activity!.calories} kcal\nTracked with Dokra Running Club`;
      try { await Share.share({ message: msg }); } catch {}
      return;
    }
    setBusy(true);
    try {
      const uri = await _captureCard();
      if (!uri) return;
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: "image/png",
          dialogTitle: "Share your activity",
        });
      }
    } catch {
      Alert.alert("Error", "Could not share the card.");
    } finally {
      setBusy(false);
    }
  }

  function handleDiscard() {
    if (isWeb) { router.replace("/(tabs)/"); return; }
    Alert.alert("Discard Activity", "This will not be saved.", [
      { text: "Cancel", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: () => router.replace("/(tabs)/") },
    ]);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: isWeb ? insets.top + 67 : insets.top + 16,
          paddingBottom: insets.bottom + 40,
        }}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Section: Share Card ─────────────────────────────────────── */}
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>
          ACTIVITY CARD
        </Text>

        <ShareCard
          cardRef={shareCardRef as React.RefObject<View>}
          activity={activity}
          userPhoto={userPhoto}
        />

        {/* Card action row */}
        <View style={[styles.cardActions, { marginTop: 14 }]}>

          {/* Add / Change Photo */}
          {!isWeb && (
            <Pressable
              onPress={handlePickPhoto}
              style={({ pressed }) => [
                styles.cardBtn,
                { backgroundColor: userPhoto ? colors.primary + "22" : "#F3F4F6", borderColor: userPhoto ? colors.primary + "55" : "#E5E7EB", opacity: pressed ? 0.75 : 1 },
              ]}
            >
              <Feather name={userPhoto ? "check-circle" : "camera"} size={15} color={userPhoto ? colors.primary : "#555"} />
              <Text style={[styles.cardBtnText, { color: userPhoto ? colors.primary : "#555", fontFamily: "Inter_600SemiBold" }]}>
                {userPhoto ? "Photo Added ✓" : "Add Your Photo"}
              </Text>
            </Pressable>
          )}

          {/* Save card */}
          {!isWeb && (
            <Pressable
              onPress={handleSaveCard}
              disabled={busy}
              style={({ pressed }) => [
                styles.cardBtn,
                { backgroundColor: "#F3F4F6", borderColor: "#E5E7EB", opacity: pressed || busy ? 0.7 : 1 },
              ]}
            >
              <Feather name="download" size={15} color="#555" />
              <Text style={[styles.cardBtnText, { color: "#555", fontFamily: "Inter_600SemiBold" }]}>
                {busy ? "Saving..." : "Save"}
              </Text>
            </Pressable>
          )}

          {/* Share card */}
          <Pressable
            onPress={handleShareCard}
            disabled={busy}
            style={({ pressed }) => [
              styles.cardBtn,
              { backgroundColor: colors.primary, borderColor: colors.primary, flex: 1, opacity: pressed || busy ? 0.8 : 1 },
            ]}
          >
            <Feather name="share-2" size={15} color="#fff" />
            <Text style={[styles.cardBtnText, { color: "#fff", fontFamily: "Inter_700Bold" }]}>
              {busy ? "..." : "Share Card"}
            </Text>
          </Pressable>
        </View>

        {/* ── Section: Stat Grid ─────────────────────────────────────── */}
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold", marginTop: 24 }]}>
          FULL STATS
        </Text>
        <View style={styles.grid}>
          {STATS.map((s) => (
            <View key={s.label} style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.statIcon, { backgroundColor: colors.primary + "18" }]}>
                <Feather name={s.icon} size={15} color={colors.primary} />
              </View>
              <Text style={[styles.statVal, { color: (s as any).valueColor ?? colors.foreground, fontFamily: "Inter_700Bold" }]}>
                {s.value}
              </Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                {s.label}
              </Text>
            </View>
          ))}
        </View>

        {/* ── Action buttons ─────────────────────────────────────────── */}
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
              style={({ pressed }) => [styles.btnPrimary, { backgroundColor: "#10B981", opacity: pressed ? 0.85 : 1 }]}
            >
              <Feather name="check-circle" size={18} color="#fff" />
              <Text style={[styles.btnPrimaryText, { fontFamily: "Inter_700Bold" }]}>Saved — Back to Home</Text>
            </Pressable>
          )}

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
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  sectionTitle: {
    fontSize: 11,
    letterSpacing: 1.5,
    marginBottom: 12,
    paddingHorizontal: 20,
  },
  cardActions: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 20,
    flexWrap: "wrap",
  },
  cardBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
  },
  cardBtnText: { fontSize: 13 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 20,
    gap: 10,
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
  btnSecondary: {
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
