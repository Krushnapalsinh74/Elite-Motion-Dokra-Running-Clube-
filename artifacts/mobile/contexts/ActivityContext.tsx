import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

export type ActivityType = "walking" | "running" | "cycling";

export interface Coord {
  latitude: number;
  longitude: number;
  timestamp: number;
}

export interface Activity {
  id: string;
  type: ActivityType;
  startTime: string;
  endTime: string;
  duration: number;
  distance: number;
  avgSpeed: number;
  avgPace: number;
  calories: number;
  coords: Coord[];
  elevation?: number;
}

interface LiveActivity {
  type: ActivityType;
  startTime: number;
  pausedAt: number | null;
  totalPausedMs: number;
  coords: Coord[];
  distance: number;
  currentSpeed: number;
  calories: number;
  isPaused: boolean;
}

interface ActivityContextType {
  liveActivity: LiveActivity | null;
  savedActivities: Activity[];
  startActivity: (type: ActivityType) => Promise<void>;
  pauseActivity: () => void;
  resumeActivity: () => void;
  stopActivity: () => Activity | null;
  saveActivity: (activity: Activity) => Promise<void>;
  deleteActivity: (id: string) => Promise<void>;
  hasLocationPermission: boolean;
  requestLocationPermission: () => Promise<boolean>;
  elapsed: number;
}

const ActivityContext = createContext<ActivityContextType | undefined>(undefined);
const ACTIVITIES_KEY = "@dokra_activities";

function calcDistance(a: Coord, b: Coord): number {
  const R = 6371e3;
  const φ1 = (a.latitude * Math.PI) / 180;
  const φ2 = (b.latitude * Math.PI) / 180;
  const Δφ = ((b.latitude - a.latitude) * Math.PI) / 180;
  const Δλ = ((b.longitude - a.longitude) * Math.PI) / 180;
  const s =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  return R * c;
}

function calcCalories(type: ActivityType, distanceM: number, durationS: number): number {
  const MET = type === "cycling" ? 7.5 : type === "running" ? 9.8 : 3.5;
  const weightKg = 70;
  const hours = durationS / 3600;
  return Math.round(MET * weightKg * hours);
}

export function ActivityProvider({ children }: { children: React.ReactNode }) {
  const [liveActivity, setLiveActivity] = useState<LiveActivity | null>(null);
  const [savedActivities, setSavedActivities] = useState<Activity[]>([]);
  const [hasLocationPermission, setHasLocationPermission] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const locationSub = useRef<Location.LocationSubscription | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const liveRef = useRef<LiveActivity | null>(null);

  liveRef.current = liveActivity;

  useEffect(() => {
    loadActivities();
    checkPermission();
    return () => {
      locationSub.current?.remove();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  async function loadActivities() {
    try {
      const raw = await AsyncStorage.getItem(ACTIVITIES_KEY);
      if (raw) setSavedActivities(JSON.parse(raw));
    } catch {}
  }

  async function checkPermission() {
    if (Platform.OS === "web") {
      setHasLocationPermission(true);
      return;
    }
    const { status } = await Location.getForegroundPermissionsAsync();
    setHasLocationPermission(status === "granted");
  }

  async function requestLocationPermission(): Promise<boolean> {
    if (Platform.OS === "web") {
      setHasLocationPermission(true);
      return true;
    }
    const { status } = await Location.requestForegroundPermissionsAsync();
    const granted = status === "granted";
    setHasLocationPermission(granted);
    return granted;
  }

  async function startActivity(type: ActivityType) {
    const granted = hasLocationPermission || (await requestLocationPermission());
    const now = Date.now();
    const live: LiveActivity = {
      type,
      startTime: now,
      pausedAt: null,
      totalPausedMs: 0,
      coords: [],
      distance: 0,
      currentSpeed: 0,
      calories: 0,
      isPaused: false,
    };
    setLiveActivity(live);
    setElapsed(0);

    timerRef.current = setInterval(() => {
      const current = liveRef.current;
      if (!current || current.isPaused) return;
      const totalMs = Date.now() - current.startTime - current.totalPausedMs;
      setElapsed(Math.floor(totalMs / 1000));
    }, 1000);

    if (granted && Platform.OS !== "web") {
      locationSub.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 2000,
          distanceInterval: 3,
        },
        (loc) => {
          const current = liveRef.current;
          if (!current || current.isPaused) return;
          const newCoord: Coord = {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            timestamp: loc.timestamp,
          };
          setLiveActivity((prev) => {
            if (!prev) return prev;
            const coords = [...prev.coords, newCoord];
            let dist = prev.distance;
            if (coords.length > 1) {
              const d = calcDistance(coords[coords.length - 2], newCoord);
              if (d < 100 && d > 0.5) dist += d;
            }
            const durationS = (Date.now() - prev.startTime - prev.totalPausedMs) / 1000;
            const cal = calcCalories(prev.type, dist, durationS);
            const speed = loc.coords.speed && loc.coords.speed > 0 ? loc.coords.speed * 3.6 : 0;
            return { ...prev, coords, distance: dist, currentSpeed: speed, calories: cal };
          });
        }
      );
    } else {
      simulateMovement();
    }
  }

  function simulateMovement() {
    const baseLat = 28.6139;
    const baseLon = 77.209;
    let step = 0;
    const sim = setInterval(() => {
      const current = liveRef.current;
      if (!current) { clearInterval(sim); return; }
      if (current.isPaused) return;
      step++;
      const newCoord: Coord = {
        latitude: baseLat + step * 0.0001,
        longitude: baseLon + step * 0.00008,
        timestamp: Date.now(),
      };
      setLiveActivity((prev) => {
        if (!prev) return prev;
        const coords = [...prev.coords, newCoord];
        let dist = prev.distance;
        if (coords.length > 1) {
          const d = calcDistance(coords[coords.length - 2], newCoord);
          dist += d;
        }
        const durationS = (Date.now() - prev.startTime - prev.totalPausedMs) / 1000;
        const cal = calcCalories(prev.type, dist, durationS);
        return { ...prev, coords, distance: dist, currentSpeed: prev.type === "cycling" ? 18 : prev.type === "running" ? 10 : 5, calories: cal };
      });
    }, 3000);
  }

  function pauseActivity() {
    setLiveActivity((prev) => {
      if (!prev || prev.isPaused) return prev;
      return { ...prev, isPaused: true, pausedAt: Date.now() };
    });
  }

  function resumeActivity() {
    setLiveActivity((prev) => {
      if (!prev || !prev.isPaused || !prev.pausedAt) return prev;
      const addedPause = Date.now() - prev.pausedAt;
      return { ...prev, isPaused: false, pausedAt: null, totalPausedMs: prev.totalPausedMs + addedPause };
    });
  }

  function stopActivity(): Activity | null {
    const live = liveRef.current;
    if (!live) return null;
    locationSub.current?.remove();
    if (timerRef.current) clearInterval(timerRef.current);
    const now = Date.now();
    let pausedExtra = live.totalPausedMs;
    if (live.isPaused && live.pausedAt) pausedExtra += now - live.pausedAt;
    const durationMs = now - live.startTime - pausedExtra;
    const durationS = durationMs / 1000;
    const distanceKm = live.distance / 1000;
    const avgSpeed = durationS > 0 ? distanceKm / (durationS / 3600) : 0;
    const avgPace = avgSpeed > 0 ? 60 / avgSpeed : 0;
    const activity: Activity = {
      id: Date.now().toString(),
      type: live.type,
      startTime: new Date(live.startTime).toISOString(),
      endTime: new Date(now).toISOString(),
      duration: durationS,
      distance: live.distance,
      avgSpeed,
      avgPace,
      calories: live.calories,
      coords: live.coords,
    };
    setLiveActivity(null);
    setElapsed(0);
    return activity;
  }

  async function saveActivity(activity: Activity) {
    const updated = [activity, ...savedActivities];
    setSavedActivities(updated);
    await AsyncStorage.setItem(ACTIVITIES_KEY, JSON.stringify(updated));
  }

  async function deleteActivity(id: string) {
    const updated = savedActivities.filter((a) => a.id !== id);
    setSavedActivities(updated);
    await AsyncStorage.setItem(ACTIVITIES_KEY, JSON.stringify(updated));
  }

  return (
    <ActivityContext.Provider
      value={{
        liveActivity,
        savedActivities,
        startActivity,
        pauseActivity,
        resumeActivity,
        stopActivity,
        saveActivity,
        deleteActivity,
        hasLocationPermission,
        requestLocationPermission,
        elapsed,
      }}
    >
      {children}
    </ActivityContext.Provider>
  );
}

export function useActivity() {
  const ctx = useContext(ActivityContext);
  if (!ctx) throw new Error("useActivity must be used within ActivityProvider");
  return ctx;
}
