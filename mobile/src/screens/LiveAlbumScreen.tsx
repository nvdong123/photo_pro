import { useState, useEffect } from 'react';
import {
  View, Text, FlatList, Image, StyleSheet,
  TouchableOpacity, ActivityIndicator,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { subscribeLocationStream, type PhotoEvent } from '../services/sseService';
import LiveBadge from '../components/LiveBadge';

type Props = NativeStackScreenProps<RootStackParamList, 'LiveAlbum'>;

export default function LiveAlbumScreen({ route }: Props) {
  const { locationId, locationName } = route.params;
  const [photos, setPhotos] = useState<PhotoEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    setIsConnected(true);
    const cleanup = subscribeLocationStream(
      locationId,
      (event) => {
        setPhotos((prev) => [event, ...prev]);
      },
      () => setIsConnected(false),
    );
    return () => {
      cleanup();
      setIsConnected(false);
    };
  }, [locationId]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{locationName}</Text>
        <LiveBadge active={isConnected} />
      </View>

      {photos.length === 0 ? (
        <View style={styles.empty}>
          <ActivityIndicator color="#1a6b4e" />
          <Text style={styles.emptyText}>Đang chờ ảnh mới...</Text>
        </View>
      ) : (
        <FlatList
          data={photos}
          keyExtractor={(item) => item.media_id}
          numColumns={2}
          renderItem={({ item }) => (
            <View style={styles.photoCard}>
              {item.thumb_url ? (
                <Image source={{ uri: item.thumb_url }} style={styles.thumbImg} />
              ) : (
                <View style={[styles.thumbImg, styles.thumbPlaceholder]} />
              )}
            </View>
          )}
          contentContainerStyle={{ padding: 8 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, backgroundColor: '#1a1a1a', borderBottomWidth: 1, borderBottomColor: '#2a2a2a',
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#fff', flex: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { color: '#6b7280', fontSize: 14 },
  photoCard: { flex: 1, margin: 4 },
  thumbImg: { width: '100%', aspectRatio: 1, borderRadius: 8, backgroundColor: '#2a2a2a' },
  thumbPlaceholder: { backgroundColor: '#1a1a1a' },
});
