import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useRef, useState } from "react";

import { ActivityTracker, TrackingUpdate } from "@/lib/tracking/ActivityTracker";

export type ActivityType = "walking" | "running" | "cycling";

export interface Coord {
  latitude: number;
  longitude: number;
  timestamp: number;
  altitude?: number | null;
  accuracy?: number;
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
  steps: number;
  confidence: number;
  isSimulated: boolean;
  coords: Coord[];
}

export interface LiveMetrics {
  type: ActivityType;
  distanceM: number;
  currentSpeedKmh: number;
  avgSpeedKmh: number;
  avgPaceMinPerKm: number;
  calories: number;
  steps: number;
  cadence: number;
  confidence: number;
  isMoving: boolean;
  isPaused: boolean;
  elapsedSeconds: number;
  gpsStatus: "acquiring" | "locked" | "poor" | "simulated";
  coords: Coord[];
}

interface ActivityContextType {
  liveMetrics: LiveMetrics | null;
  savedActivities: Activity[];
  startActivity: (type: ActivityType) => void;
  pauseActivity: () => void;
  resumeActivity: () => void;
  stopActivity: () => Activity | null;
  saveActivity: (activity: Activity) => Promise<void>;
  deleteActivity: (id: string) => Promise<void>;
  enableGps: () => Promise<boolean>;
}

const ActivityContext = createContext<ActivityContextType | undefined>(undefined);
const ACTIVITIES_KEY = "@dokra_activities_v2";

export function ActivityProvider({ children }: { children: React.ReactNode }) {
  const [liveMetrics, setLiveMetrics] = useState<LiveMetrics | null>(null);
  const [savedActivities, setSavedActivities] = useState<Activity[]>([]);
  const trackerRef = useRef<ActivityTracker | null>(null);
  const typeRef = useRef<ActivityType>("running");
  const isPausedRef = useRef(false);

  useEffect(() => {
    loadActivities();
    return () => { try { trackerRef.current?.stop(); } catch {} };
  }, []);

  async function loadActivities() {
    try {
      const raw = await AsyncStorage.getItem(ACTIVITIES_KEY);
      if (raw) setSavedActivities(JSON.parse(raw));
    } catch {}
  }

  function startActivity(type: ActivityType) {
    try { trackerRef.current?.stop(); } catch {}
    typeRef.current = type;
    isPausedRef.current = false;

    // Set metrics immediately so the tracking screen shows right away
    setLiveMetrics({
      type,
      distanceM: 0,
      currentSpeedKmh: 0,
      avgSpeedKmh: 0,
      avgPaceMinPerKm: 0,
      calories: 0,
      steps: 0,
      cadence: 0,
      confidence: 0,
      isMoving: false,
      isPaused: false,
      elapsedSeconds: 0,
      gpsStatus: "acquiring",
      coords: [],
    });

    const tracker = new ActivityTracker(type, (update: TrackingUpdate) => {
      setLiveMetrics({
        type,
        distanceM: update.distanceM,
        currentSpeedKmh: update.currentSpeedKmh,
        avgSpeedKmh: update.avgSpeedKmh,
        avgPaceMinPerKm: update.avgPaceMinPerKm,
        calories: update.calories,
        steps: update.steps,
        cadence: update.cadence,
        confidence: update.confidence,
        isMoving: update.isMoving,
        isPaused: isPausedRef.current,
        elapsedSeconds: update.elapsedSeconds,
        gpsStatus: update.gpsStatus,
        coords: update.coords.map((c) => ({
          latitude: c.latitude,
          longitude: c.longitude,
          timestamp: c.timestamp,
          altitude: c.altitude,
          accuracy: c.accuracy,
        })),
      });
    });

    trackerRef.current = tracker;

    // Start in background — permission dialogs appear over the tracking screen
    tracker.start().catch(() => {});
  }

  function pauseActivity() {
    trackerRef.current?.pause();
    isPausedRef.current = true;
    setLiveMetrics((prev) => prev ? { ...prev, isPaused: true } : prev);
  }

  function resumeActivity() {
    trackerRef.current?.resume();
    isPausedRef.current = false;
    setLiveMetrics((prev) => prev ? { ...prev, isPaused: false } : prev);
  }

  function stopActivity(): Activity | null {
    if (!trackerRef.current) return null;
    const result = trackerRef.current.stop();
    trackerRef.current = null;

    const now = new Date().toISOString();
    const startIso = new Date(Date.now() - result.durationS * 1000).toISOString();

    const activity: Activity = {
      id: Date.now().toString(),
      type: typeRef.current,
      startTime: startIso,
      endTime: now,
      duration: result.durationS,
      distance: result.distanceM,
      avgSpeed: result.avgSpeedKmh,
      avgPace: result.avgPaceMinPerKm,
      calories: result.calories,
      steps: result.steps,
      confidence: result.confidence,
      isSimulated: result.isSimulated,
      coords: result.coords.map((c) => ({
        latitude: c.latitude,
        longitude: c.longitude,
        timestamp: c.timestamp,
        altitude: c.altitude,
        accuracy: c.accuracy,
      })),
    };

    setLiveMetrics(null);
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

  async function enableGps(): Promise<boolean> {
    if (!trackerRef.current) return false;
    return trackerRef.current.enableGps();
  }

  return (
    <ActivityContext.Provider value={{ liveMetrics, savedActivities, startActivity, pauseActivity, resumeActivity, stopActivity, saveActivity, deleteActivity, enableGps }}>
      {children}
    </ActivityContext.Provider>
  );
}

export function useActivity() {
  const ctx = useContext(ActivityContext);
  if (!ctx) throw new Error("useActivity must be used within ActivityProvider");
  return ctx;
}
