import React, { useState, useCallback, useEffect } from 'react';
import { View, Image, TouchableOpacity, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getAndroidUsbCameraThumbnail } from '../services/androidUsbCamera';

export interface ThumbnailPhoto {
  id: string;
  cacheKey: string;
  name: string;
  size?: number;
  capturedAt?: number;
  selected?: boolean;
  isNew?: boolean;
}

interface ThumbnailItemProps {
  photo: ThumbnailPhoto;
  isSelected: boolean;
  onPress: () => void;
  onLayout?: () => void;
}

const ITEM_SIZE = 80;

export default function ThumbnailItem({ photo, isSelected, onPress, onLayout }: ThumbnailItemProps) {
  const [thumbUri, setThumbUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadThumbnail = useCallback(async () => {
    if (thumbUri || loading) return;
    setLoading(true);
    try {
      const path = await getAndroidUsbCameraThumbnail(photo.cacheKey);
      if (path) {
        setThumbUri(`file://${path}`);
      }
    } catch (e) {
      console.warn(`Failed to load thumbnail for ${photo.name}:`, e);
    } finally {
      setLoading(false);
    }
  }, [photo.cacheKey, photo.name, thumbUri, loading]);

  useEffect(() => {
    if (onLayout) {
      // Load immediately if onLayout is provided (visible)
      loadThumbnail();
    }
  }, [onLayout, loadThumbnail]);

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      onLayout={onLayout}
      activeOpacity={0.8}
    >
      {thumbUri ? (
        <Image source={{ uri: thumbUri }} style={styles.thumbnail} />
      ) : (
        <View style={styles.placeholder}>
          {loading && <ActivityIndicator size="small" color="#1a6b3c" />}
          {!loading && (
            <Text style={styles.placeholderText}>{photo.name.slice(-4)}</Text>
          )}
        </View>
      )}

      {photo.isNew && (
        <View style={styles.newBadge}>
          <Text style={styles.newBadgeText}>MỚI</Text>
        </View>
      )}

      {isSelected && (
        <View style={styles.selectedOverlay}>
          <MaterialCommunityIcons name="check" size={20} color="white" />
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    margin: 2,
    position: 'relative',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
    borderRadius: 4,
  },
  placeholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#2a2a2a',
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: '#666',
    fontSize: 10,
    fontWeight: '500',
  },
  newBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#ef4444',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 8,
  },
  newBadgeText: {
    color: 'white',
    fontSize: 8,
    fontWeight: 'bold',
  },
  selectedOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(26, 107, 60, 0.8)',
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
});