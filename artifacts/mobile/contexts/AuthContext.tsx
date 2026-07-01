/**
 * AuthContext
 *
 * Auth methods:
 *   - Email / password (local AsyncStorage — swap for real backend when ready)
 *   - Google Sign-In via expo-auth-session (OAuth 2.0)
 *     Set EXPO_PUBLIC_GOOGLE_CLIENT_ID to a Google Cloud web-client ID to enable.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import React, { createContext, useContext, useEffect, useState } from "react";
import { Platform } from "react-native";

WebBrowser.maybeCompleteAuthSession();

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  joinedAt: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  googleAvailable: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const STORAGE_KEY = "@dokra_user";

const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? "";

// expo-auth-session requires clientId to be a non-empty string.
// When not configured we pass a placeholder — we gate actual OAuth calls below.
const CLIENT_ID_PARAM = GOOGLE_CLIENT_ID || "not-configured";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [, response, promptAsync] = Google.useAuthRequest({
    clientId: CLIENT_ID_PARAM,
    webClientId: CLIENT_ID_PARAM,
    redirectUri: Platform.select({
      web: typeof window !== "undefined" ? window.location.origin : "https://auth.expo.io",
      default: "https://auth.expo.io/@dokra/mobile",
    }),
  });

  const googleAvailable = Boolean(GOOGLE_CLIENT_ID);

  useEffect(() => {
    if (response?.type === "success" && response.authentication?.accessToken) {
      fetchGoogleProfile(response.authentication.accessToken).catch(console.error);
    }
  }, [response]);

  useEffect(() => {
    loadUser();
  }, []);

  async function loadUser() {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) setUser(JSON.parse(raw));
    } catch {
    } finally {
      setIsLoading(false);
    }
  }

  async function persistUser(u: User) {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(u));
    setUser(u);
  }

  async function fetchGoogleProfile(accessToken: string) {
    const res = await fetch("https://www.googleapis.com/userinfo/v2/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error("Failed to fetch Google profile.");
    const data = await res.json();
    await persistUser({
      id: data.id ?? Date.now().toString(),
      name: data.name ?? "Google User",
      email: data.email ?? "",
      avatar: data.picture,
      joinedAt: new Date().toISOString(),
    });
  }

  async function login(email: string, _password: string) {
    if (!email.trim()) throw new Error("Email is required.");
    await persistUser({
      id: Date.now().toString(),
      name: email.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      email: email.trim(),
      joinedAt: new Date().toISOString(),
    });
  }

  async function loginWithGoogle() {
    if (!GOOGLE_CLIENT_ID) {
      throw new Error(
        "Google Sign-In is not configured yet. Add your EXPO_PUBLIC_GOOGLE_CLIENT_ID environment variable to enable it."
      );
    }
    const result = await promptAsync({ useProxy: Platform.OS !== "web" });
    if (result?.type === "cancel" || result?.type === "dismiss") {
      throw new Error("Google Sign-In was cancelled.");
    }
    if (result?.type === "error") {
      throw new Error(result.error?.message ?? "Google Sign-In failed. Please try again.");
    }
    // fetchGoogleProfile is called via useEffect on response change
  }

  async function register(name: string, email: string, _password: string) {
    if (!name.trim() || !email.trim()) throw new Error("Please fill in all fields.");
    await persistUser({
      id: Date.now().toString(),
      name: name.trim(),
      email: email.trim(),
      joinedAt: new Date().toISOString(),
    });
  }

  async function logout() {
    await AsyncStorage.removeItem(STORAGE_KEY);
    setUser(null);
  }

  return (
    <AuthContext.Provider
      value={{ user, isLoading, login, loginWithGoogle, register, logout, googleAvailable }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
