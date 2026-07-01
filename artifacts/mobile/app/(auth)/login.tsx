import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function LoginScreen() {
  const { login, loginWithGoogle, register, googleAvailable } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    setError("");
    if (!email.trim() || !password.trim()) {
      setError("Please fill in all fields.");
      return;
    }
    if (mode === "register" && !name.trim()) {
      setError("Please enter your name.");
      return;
    }
    setLoading(true);
    try {
      if (mode === "login") {
        await login(email.trim(), password);
      } else {
        await register(name.trim(), email.trim(), password);
      }
      router.replace("/(tabs)/");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setError("");
    setGoogleLoading(true);
    try {
      await loginWithGoogle();
      router.replace("/(tabs)/");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Google Sign-In failed.");
    } finally {
      setGoogleLoading(false);
    }
  }

  const isWeb = Platform.OS === "web";

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: insets.top + (isWeb ? 80 : 48), paddingBottom: insets.bottom + 32 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo */}
          <View style={styles.logoSection}>
            <Image source={require("@/assets/images/icon.png")} style={styles.logo} contentFit="contain" />
            <Text style={[styles.appName, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>DOKRA</Text>
            <Text style={[styles.tagline, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
              RUNNING CLUB
            </Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
              {mode === "login" ? "Welcome back" : "Create account"}
            </Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              {mode === "login" ? "Sign in to track your runs" : "Join the Dokra community"}
            </Text>

            {mode === "register" && (
              <View style={[styles.inputRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Feather name="user" size={18} color={colors.mutedForeground} />
                <TextInput
                  style={[styles.input, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}
                  placeholder="Full name"
                  placeholderTextColor={colors.mutedForeground}
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                />
              </View>
            )}

            <View style={[styles.inputRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="mail" size={18} color={colors.mutedForeground} />
              <TextInput
                style={[styles.input, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}
                placeholder="Email address"
                placeholderTextColor={colors.mutedForeground}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
              />
            </View>

            <View style={[styles.inputRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="lock" size={18} color={colors.mutedForeground} />
              <TextInput
                style={[styles.input, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}
                placeholder="Password"
                placeholderTextColor={colors.mutedForeground}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPass}
                autoComplete="password"
              />
              <Pressable onPress={() => setShowPass((v) => !v)} hitSlop={8}>
                <Feather name={showPass ? "eye-off" : "eye"} size={18} color={colors.mutedForeground} />
              </Pressable>
            </View>

            {error ? (
              <View style={[styles.errorBox, { backgroundColor: "#FEF2F2", borderColor: "#FCA5A5" }]}>
                <Feather name="alert-circle" size={14} color="#EF4444" />
                <Text style={[styles.errorText, { fontFamily: "Inter_400Regular" }]}>{error}</Text>
              </View>
            ) : null}

            <Pressable
              onPress={handleSubmit}
              disabled={loading}
              style={({ pressed }) => [
                styles.btnPrimary,
                { backgroundColor: colors.primary, opacity: pressed || loading ? 0.8 : 1 },
              ]}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={[styles.btnPrimaryText, { fontFamily: "Inter_700Bold" }]}>
                  {mode === "login" ? "Sign In" : "Create Account"}
                </Text>
              )}
            </Pressable>

            {/* Divider */}
            <View style={styles.divider}>
              <View style={[styles.divLine, { backgroundColor: colors.border }]} />
              <Text style={[styles.divText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>or</Text>
              <View style={[styles.divLine, { backgroundColor: colors.border }]} />
            </View>

            {/* Google */}
            <Pressable
              onPress={handleGoogle}
              disabled={googleLoading}
              style={({ pressed }) => [
                styles.btnGoogle,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  opacity: pressed || googleLoading ? 0.7 : 1,
                },
              ]}
            >
              {googleLoading ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <>
                  {/* Google G icon using text fallback */}
                  <View style={[styles.googleIcon, { backgroundColor: "#4285F4" }]}>
                    <Text style={styles.googleG}>G</Text>
                  </View>
                  <Text style={[styles.btnGoogleText, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                    Continue with Google
                  </Text>
                  {!googleAvailable && (
                    <Feather name="info" size={14} color={colors.mutedForeground} />
                  )}
                </>
              )}
            </Pressable>

            {!googleAvailable && (
              <Text style={[styles.googleNote, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                Set EXPO_PUBLIC_GOOGLE_CLIENT_ID to enable Google Sign-In
              </Text>
            )}

            {/* Switch mode */}
            <Pressable onPress={() => { setMode((m) => (m === "login" ? "register" : "login")); setError(""); }}>
              <Text style={[styles.switchText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                {mode === "login" ? "New to Dokra? " : "Already have an account? "}
                <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>
                  {mode === "login" ? "Create account" : "Sign in"}
                </Text>
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: 24 },
  logoSection: { alignItems: "center", marginBottom: 36, gap: 4 },
  logo: { width: 72, height: 72, marginBottom: 6 },
  appName: { fontSize: 26, letterSpacing: 6 },
  tagline: { fontSize: 11, letterSpacing: 4 },
  form: { gap: 14 },
  title: { fontSize: 26 },
  subtitle: { fontSize: 14, marginBottom: 4 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  input: { flex: 1, fontSize: 15 },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
  },
  errorText: { color: "#EF4444", fontSize: 13, flex: 1 },
  btnPrimary: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimaryText: { color: "#fff", fontSize: 16 },
  divider: { flexDirection: "row", alignItems: "center", gap: 12 },
  divLine: { flex: 1, height: 1 },
  divText: { fontSize: 13 },
  btnGoogle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    gap: 10,
  },
  googleIcon: {
    width: 24,
    height: 24,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  googleG: { color: "#fff", fontSize: 13, fontWeight: "700" },
  btnGoogleText: { fontSize: 15 },
  googleNote: { fontSize: 11, textAlign: "center", marginTop: -4 },
  switchText: { fontSize: 14, textAlign: "center" },
});
