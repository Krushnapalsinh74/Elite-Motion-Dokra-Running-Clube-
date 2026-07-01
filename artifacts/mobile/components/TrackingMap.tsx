import React from "react";
import { StyleSheet } from "react-native";
import MapView, { Polyline, PROVIDER_DEFAULT } from "react-native-maps";

interface Coord {
  latitude: number;
  longitude: number;
}

interface TrackingMapProps {
  mapRef: React.RefObject<MapView>;
  initialRegion: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  };
  polylineCoords: Coord[];
  isPaused: boolean;
  primaryColor: string;
}

export default function TrackingMap({ mapRef, initialRegion, polylineCoords, isPaused, primaryColor }: TrackingMapProps) {
  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFill}
      provider={PROVIDER_DEFAULT}
      initialRegion={initialRegion}
      showsUserLocation
      followsUserLocation={!isPaused}
      mapType="standard"
      customMapStyle={darkMapStyle}
      showsMyLocationButton={false}
      showsCompass={false}
    >
      {polylineCoords.length > 1 && (
        <Polyline
          coordinates={polylineCoords}
          strokeColor={primaryColor}
          strokeWidth={4}
          lineCap="round"
          lineJoin="round"
        />
      )}
    </MapView>
  );
}

const darkMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#1a1a1a" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#2c2c2c" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#3c3c3c" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0a0a0a" }] },
];
