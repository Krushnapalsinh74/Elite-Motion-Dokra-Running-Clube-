import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useMemo } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useActivity } from "@/contexts/ActivityContext";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

const ACHIEVEMENTS = [
  { icon: "award" as const, label: "First Run", desc: "Complete your first activity", color: "#E85D04" },
  { icon: "star" as const, label: "5K Club", desc: "Run 5km in a session", color: "#F59E0B" },
  { icon: "trending-up" as const, label: "Streak", desc: "3-day active streak", color: "#10B981" },
  { icon: "zap" as const, label: "Speed Demon", desc: "Avg pace under 5:00 /km", color: "#3B82F6" },
];

const SETTINGS = [
  { icon: "bell" as const, label: "Notifications" },
  { icon: "map-pin" as const, label: "GPS Accuracy" },
  { icon: "moon" as const, label: "Theme" },
  { icon: "shield" as const, label: "Privacy" },
  { icon: "help-circle" as const, label: "Help & Support" },
];

function fmtDuration(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const { savedActivities } = useActivity();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const paddingTop = isWeb ? insets.top + 67 : insets.top + 16;

  const totalDistance = useMemo(() => savedActivities.reduce((s, a) => s + a.distance, 0), [savedActivities]);
  const totalTime = useMemo(() => savedActivities.reduce((s, a) => s + a.duration, 0), [savedActivities]);
  const totalCalories = useMemo(() => savedActivities.reduce((s, a) => s + a.calories, 0), [savedActivities]);

  const firstName = user?.name?.split(" ")[0] ?? "Runner";
  const initials = user?.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "R";

  const joinDate = user?.joinedAt
    ? new Date(user.joinedAt).toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : "";

  async function handleLogout() {
    if (Platform.OS === "web") {
      await logout();
      router.replace("/(auth)/login");
      return;
    }
    Alert.alert("Sign out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          await logout();
          router.replace("/(auth)/login");
        },
      },
    ]);
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{ paddingTop, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>Profile</Text>
        </View>

        <View style={styles.profileSection}>
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
            <Text style={[styles.avatarText, { fontFamily: "Inter_700Bold" }]}>{initials}</Text>
          </View>
          <Text style={[styles.name, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            {user?.name ?? "Runner"}
          </Text>
          <Text style={[styles.email, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            {user?.email}
          </Text>
          {joinDate ? (
            <Text style={[styles.joined, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              Member since {joinDate}
            </Text>
          ) : null}
        </View>

        <View style={styles.statsRow}>
          {[
            { label: "KM", value: (totalDistance / 1000).toFixed(1) },
            { label: "Sessions", value: String(savedActivities.length) },
            { label: "Active", value: fmtDuration(totalTime) },
            { label: "Calories", value: String(totalCalories) },
          ].map((s) => (
            <View key={s.label} style={[styles.statBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.statVal, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
                {s.value}
              </Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                {s.label}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
            Achievements
          </Text>
          <View style={styles.achievementsGrid}>
            {ACHIEVEMENTS.map((a) => {
              const unlocked =
                (a.label === "First Run" && savedActivities.length > 0) ||
                (a.label === "5K Club" && savedActivities.some((act) => act.distance >= 5000)) ||
                false;
              return (
                <View
                  key={a.label}
                  style={[
                    styles.achievement,
                    {
                      backgroundColor: colors.card,
                      borderColor: unlocked ? a.color : colors.border,
                      opacity: unlocked ? 1 : 0.5,
                    },
                  ]}
                >
                  <View style={[styles.achIcon, { backgroundColor: a.color + "22" }]}>
                    <Feather name={a.icon} size={20} color={unlocked ? a.color : colors.mutedForeground} />
                  </View>
                  <Text style={[styles.achLabel, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                    {a.label}
                  </Text>
                  <Text style={[styles.achDesc, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                    {a.desc}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
            Settings
          </Text>
          {SETTINGS.map((s) => (
            <Pressable
              key={s.label}
              style={({ pressed }) => [
                styles.settingRow,
                { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <View style={styles.settingLeft}>
                <View style={[styles.settingIcon, { backgroundColor: colors.primary + "22" }]}>
                  <Feather name={s.icon} size={16} color={colors.primary} />
                </View>
                <Text style={[styles.settingLabel, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
                  {s.label}
                </Text>
              </View>
              <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
            </Pressable>
          ))}
        </View>

        <View style={{ paddingHorizontal: 24, marginTop: 8, marginBottom: 16 }}>
          <Pressable
            onPress={handleLogout}
            style={({ pressed }) => [
              styles.logoutBtn,
              { borderColor: colors.destructive, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Feather name="log-out" size={18} color={colors.destructive} />
            <Text style={[styles.logoutText, { color: colors.destructive, fontFamily: "Inter_600SemiBold" }]}>
              Sign Out
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 24, marginBottom: 20 },
  title: { fontSize: 28 },
  profileSection: { alignItems: "center", gap: 6, paddingHorizontal: 24, marginBottom: 24 },
  avatar: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontSize: 32 },
  name: { fontSize: 22, marginTop: 4 },
  email: { fontSize: 14 },
  joined: { fontSize: 12 },
  statsRow: { flexDirection: "row", paddingHorizontal: 24, gap: 8, marginBottom: 28 },
  statBox: { flex: 1, borderRadius: 14, borderWidth: 1, padding: 12, alignItems: "center", gap: 2 },
  statVal: { fontSize: 16 },
  statLabel: { fontSize: 10 },
  section: { paddingHorizontal: 24, marginBottom: 28, gap: 12 },
  sectionTitle: { fontSize: 16 },
  achievementsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  achievement: {
    width: "47%",
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 6,
  },
  achIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  achLabel: { fontSize: 14 },
  achDesc: { fontSize: 11, lineHeight: 15 },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  settingLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  settingIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  settingLabel: { fontSize: 15 },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  logoutText: { fontSize: 15 },
});
