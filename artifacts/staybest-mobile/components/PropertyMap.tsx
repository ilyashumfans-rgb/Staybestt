import React, { useState } from 'react';
import { StyleSheet, View, Image, Pressable, Linking } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { ThemedText } from '@/components/ThemedText';
import { useColors } from '@/hooks/useColors';

const TILE_SIZE = 256;
const ZOOM = 14;
const MAP_HEIGHT = 220;

interface PropertyMapProps {
  latitude: number;
  longitude: number;
  name: string;
}

/**
 * Renders an OpenStreetMap view by stitching raster tiles around the
 * property's coordinates. Works on native and web without native map
 * dependencies.
 */
export function PropertyMap({ latitude, longitude, name }: PropertyMapProps) {
  const colors = useColors();
  const [mapWidth, setMapWidth] = useState(0);

  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;

  // Fractional tile coordinates of the property at the given zoom
  const n = Math.pow(2, ZOOM);
  const xTile = ((longitude + 180) / 360) * n;
  const latRad = (latitude * Math.PI) / 180;
  const yTile = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;

  // Pixel position of the property in the global tile grid
  const centerPx = xTile * TILE_SIZE;
  const centerPy = yTile * TILE_SIZE;

  // Which tiles are needed to cover the viewport, keeping the property centered
  const tiles: { x: number; y: number; left: number; top: number }[] = [];
  if (mapWidth > 0) {
    const originPx = centerPx - mapWidth / 2;
    const originPy = centerPy - MAP_HEIGHT / 2;
    const firstX = Math.floor(originPx / TILE_SIZE);
    const lastX = Math.floor((originPx + mapWidth) / TILE_SIZE);
    const firstY = Math.floor(originPy / TILE_SIZE);
    const lastY = Math.floor((originPy + MAP_HEIGHT) / TILE_SIZE);
    for (let x = firstX; x <= lastX; x++) {
      for (let y = firstY; y <= lastY; y++) {
        if (y < 0 || y >= n) continue;
        tiles.push({
          x: ((x % n) + n) % n, // wrap longitude
          y,
          left: x * TILE_SIZE - originPx,
          top: y * TILE_SIZE - originPy,
        });
      }
    }
  }

  return (
    <View>
      <View style={styles.headerRow}>
        <ThemedText type="subtitle" weight="bold">Location</ThemedText>
        <Pressable
          style={[styles.directionsBtn, { borderColor: colors.border }]}
          onPress={() => Linking.openURL(directionsUrl)}
          accessibilityRole="button"
          accessibilityLabel={`Get directions to ${name}`}
        >
          <Feather name="navigation" size={14} color={colors.primary} />
          <ThemedText type="caption" weight="semibold" color={colors.primary}>
            Get directions
          </ThemedText>
        </Pressable>
      </View>

      <Pressable
        style={[styles.mapContainer, { borderColor: colors.border }]}
        onLayout={(e) => setMapWidth(e.nativeEvent.layout.width)}
        onPress={() => Linking.openURL(directionsUrl)}
        accessibilityRole="imagebutton"
        accessibilityLabel={`Map showing location of ${name}. Tap to open directions.`}
      >
        {tiles.map((t) => (
          <Image
            key={`${t.x}-${t.y}`}
            source={{ uri: `https://tile.openstreetmap.org/${ZOOM}/${t.x}/${t.y}.png` }}
            style={[styles.tile, { left: t.left, top: t.top }]}
          />
        ))}

        {/* Marker pinned at the center (the property's location) */}
        {mapWidth > 0 && (
          <View style={[styles.markerWrap, { left: mapWidth / 2 - 16 }]} pointerEvents="none">
            <Feather name="map-pin" size={32} color="#d33" />
          </View>
        )}

        {/* OSM attribution */}
        <View style={styles.attribution} pointerEvents="none">
          <ThemedText style={styles.attributionText}>© OpenStreetMap</ThemedText>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  directionsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  mapContainer: {
    height: MAP_HEIGHT,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: '#e8ecef',
  },
  tile: {
    position: 'absolute',
    width: TILE_SIZE,
    height: TILE_SIZE,
  },
  markerWrap: {
    position: 'absolute',
    top: MAP_HEIGHT / 2 - 30,
    width: 32,
    alignItems: 'center',
  },
  attribution: {
    position: 'absolute',
    right: 6,
    bottom: 4,
    backgroundColor: 'rgba(255,255,255,0.75)',
    borderRadius: 4,
    paddingHorizontal: 4,
  },
  attributionText: {
    fontSize: 10,
    color: '#333',
  },
});
