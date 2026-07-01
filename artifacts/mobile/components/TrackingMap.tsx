import React from "react";
import { StyleSheet } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from "react-native-maps";

interface Coord {
  latitude: number;
  longitude: number;
}

interface TrackingMapProps {
  // any ref so callers don't need to import MapView
  mapRef?: React.RefObject<any>;
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

export default function TrackingMap({
  mapRef,
  initialRegion,
  polylineCoords,
  isPaused,
  primaryColor,
}: TrackingMapProps) {
  const startCoord = polylineCoords.length > 0 ? polylineCoords[0] : null;
  const lastCoord = polylineCoords.length > 1 ? polylineCoords[polylineCoords.length - 1] : null;

  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFill}
      provider={PROVIDER_DEFAULT}
      initialRegion={initialRegion}
      showsUserLocation
      followsUserLocation={!isPaused}
      mapType="standard"
      showsMyLocationButton={false}
      showsCompass
    >
      {startCoord && (
        <Marker coordinate={startCoord} pinColor="green" title="Start" />
      )}
      {lastCoord && (
        <Marker coordinate={lastCoord} pinColor={primaryColor} title="Current" />
      )}
      {polylineCoords.length > 1 && (
        <Polyline
          coordinates={polylineCoords}
          strokeColor={isPaused ? "#9E9E9E" : primaryColor}
          strokeWidth={5}
          lineCap="round"
          lineJoin="round"
        />
      )}
    </MapView>
  );
}
