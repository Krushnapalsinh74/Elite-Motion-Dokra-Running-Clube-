/**
 * AuthContext
 *
 * Auth methods:
 *   - Email / password (local AsyncStorage)
 *   - Google Sign-In via expo-web-browser OAuth 2.0
 *     Set EXPO_PUBLIC_GOOGLE_CLIENT_ID to a Google Cloud web-client ID to enable.
 *
 * NOTE: We deliberately avoid expo-auth-session hooks here because
 * they run at component-mount time and can crash on Expo Go iOS when
 * the client ID is not configured.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as AuthSession from "expo-auth-session";
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => { loadUser(); }, []);

  async function loadUser() {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) setUser(JSON.parse(raw));
    } catch {
    } finally {
      setIsLoading(false);
    }
  }

  async function persist(u: User) {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(u));
    setUser(u);
  }

  async function fetchGoogleProfile(accessToken: string) {
    const res = await fetch("https://www.googleapis.com/userinfo/v2/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error("Failed to fetch Google profile.");
    const data = await res.json();
    await persist({
      id: data.id ?? Date.now().toString(),
      name: data.name ?? "Google User",
      email: data.email ?? "",
      avatar: data.picture,
      joinedAt: new Date().toISOString(),
    });
  }

  async function login(email: string, _password: string) {
    if (!email.trim()) throw new Error("Email is required.");
    await persist({
      id: Date.now().toString(),
      name: email.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      email: email.trim(),
      joinedAt: new Date().toISOString(),
    });
  }

  async function loginWithGoogle() {
    if (!GOOGLE_CLIENT_ID) {
      throw new Error(
        "Google Sign-In is not configured. Add EXPO_PUBLIC_GOOGLE_CLIENT_ID to your environment secrets."
      );
    }

    const redirectUri = AuthSession.makeRedirectUri({
      scheme: "mobile",
      path: "auth",
    });

    const state = Math.random().toString(36).slice(2);
    const scope = encodeURIComponent("openid email profile");
    const authUrl =
      `https://accounts.google.com/o/oauth2/v2/auth` +
      `?client_id=${encodeURIComponent(GOOGLE_CLIENT_ID)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=token` +
      `&scope=${scope}` +
      `&state=${state}`;

    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri, {
      showInRecents: true,
    });

    if (result.type === "success") {
      // Parse access_token from fragment or query string
      const fragment = result.url.split("#")[1] ?? result.url.split("?")[1] ?? "";
      const params = new URLSearchParams(fragment);
      const accessToken = params.get("access_token");
      if (accessToken) {
        await fetchGoogleProfile(accessToken);
      } else {
        throw new Error("No access token received from Google.");
      }
    } else if (result.type === "cancel" || result.type === "dismiss") {
      throw new Error("Google Sign-In was cancelled.");
    }
  }

  async function register(name: string, email: string, _password: string) {
    if (!name.trim() || !email.trim()) throw new Error("Please fill in all fields.");
    await persist({
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
      value={{ user, isLoading, login, loginWithGoogle, register, logout, googleAvailable: Boolean(GOOGLE_CLIENT_ID) }}
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
