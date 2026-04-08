import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { apiJson, clearToken } from '../services/apiClient';

type Props = NativeStackScreenProps<RootStackParamList, 'LocationSelect'>;

type LocationOption = { id: string; name: string; can_upload: boolean };

const BRAND = '#1c5c46';
const INK = '#172033';
const SAND = '#f4f1ea';

export default function LocationSelectScreen({ navigation }: Props) {
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const selectedLocation = useMemo(
    () => locations.find((item) => item.id === selectedId) ?? null,
    [locations, selectedId],
  );

  const loadLocations = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await apiJson<LocationOption[]>('/api/v1/admin/auth/my-locations');
      const next = (Array.isArray(data) ? data : []).filter((item) => item.can_upload);
      setLocations(next);
      setSelectedId((prev) => (prev && next.some((item) => item.id === prev) ? prev : next[0]?.id ?? null));
    } catch (err) {
      Alert.alert('Không thể tải location', err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const handleLogout = useCallback(() => {
    Alert.alert('Đăng xuất', 'Bạn muốn quay lại màn hình đăng nhập?', [
      { text: 'Huỷ', style: 'cancel' },
      {
        text: 'Đăng xuất',
        style: 'destructive',
        onPress: async () => {
          await clearToken();
          navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
        },
      },
    ]);
  }, [navigation]);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={handleLogout} style={styles.headerButton}>
          <Text style={styles.headerButtonText}>Đăng xuất</Text>
        </TouchableOpacity>
      ),
    });
  }, [handleLogout, navigation]);

  useEffect(() => {
    void loadLocations();
  }, [loadLocations]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.heroCard}>
        <Text style={styles.eyebrow}>FIELD WORKFLOW</Text>
        <Text style={styles.title}>Select Location</Text>
        <Text style={styles.subtitle}>
          Chọn đúng location bạn đang tác nghiệp. Mọi ảnh trong phiên này sẽ gắn vào location đó.
        </Text>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Assigned Locations</Text>
        <TouchableOpacity onPress={() => void loadLocations()} disabled={refreshing}>
          <Text style={styles.refreshText}>{refreshing ? 'Đang tải...' : 'Tải lại'}</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingCard}>
          <ActivityIndicator color={BRAND} />
          <Text style={styles.loadingText}>Đang tải location được phân quyền...</Text>
        </View>
      ) : locations.length === 0 ? (
        <View style={styles.emptyCard}>
          <MaterialCommunityIcons name="map-marker-off-outline" size={28} color="#9a6b2f" />
          <Text style={styles.emptyTitle}>Chưa có location khả dụng</Text>
          <Text style={styles.emptyText}>Tài khoản này chưa được gán location có quyền upload.</Text>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => void loadLocations()}>
            <Text style={styles.secondaryButtonText}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.cardStack}>
          {locations.map((location) => {
            const active = location.id === selectedId;
            return (
              <TouchableOpacity
                key={location.id}
                style={[styles.locationCard, active && styles.locationCardActive]}
                onPress={() => setSelectedId(location.id)}
                activeOpacity={0.9}
              >
                <View style={[styles.locationIcon, active && styles.locationIconActive]}>
                  <MaterialCommunityIcons name="map-marker-radius-outline" size={22} color={active ? '#fff' : BRAND} />
                </View>
                <View style={styles.locationCopy}>
                  <Text style={styles.locationName}>{location.name}</Text>
                  <Text style={styles.locationHint}>Location đang được phân quyền upload</Text>
                </View>
                <View style={[styles.radioOuter, active && styles.radioOuterActive]}>
                  {active ? <View style={styles.radioInner} /> : null}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <TouchableOpacity
        style={[styles.primaryButton, !selectedLocation && styles.primaryButtonDisabled]}
        disabled={!selectedLocation}
        onPress={() => {
          if (!selectedLocation) return;
          navigation.navigate('ConnectionMode', {
            locationId: selectedLocation.id,
            locationName: selectedLocation.name,
          });
        }}
      >
        <Text style={styles.primaryButtonText}>Continue</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SAND },
  content: { padding: 20, paddingBottom: 36 },
  headerButton: { paddingHorizontal: 6, paddingVertical: 4 },
  headerButtonText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  heroCard: {
    backgroundColor: '#163d31',
    borderRadius: 28,
    padding: 24,
    marginBottom: 20,
  },
  eyebrow: { color: '#b6d7c8', fontSize: 12, fontWeight: '800', letterSpacing: 1.2 },
  title: { color: '#fff', fontSize: 30, fontWeight: '800', marginTop: 8 },
  subtitle: { color: '#dce8e2', fontSize: 15, lineHeight: 22, marginTop: 10 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { color: INK, fontSize: 17, fontWeight: '800' },
  refreshText: { color: BRAND, fontSize: 13, fontWeight: '700' },
  loadingCard: {
    backgroundColor: '#fff',
    borderRadius: 22,
    paddingVertical: 28,
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#e4dbcb',
  },
  loadingText: { color: '#5c6473', fontSize: 14 },
  emptyCard: {
    backgroundColor: '#fff8e8',
    borderRadius: 22,
    padding: 22,
    borderWidth: 1,
    borderColor: '#f0d8a8',
    alignItems: 'flex-start',
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#6f4d1d', marginTop: 10 },
  emptyText: { fontSize: 14, lineHeight: 21, color: '#8a6430', marginTop: 6, marginBottom: 14 },
  cardStack: { gap: 12 },
  locationCard: {
    backgroundColor: '#fff',
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: '#e4dbcb',
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationCardActive: {
    borderColor: BRAND,
    backgroundColor: '#eef7f2',
  },
  locationIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#edf3ef',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  locationIconActive: { backgroundColor: BRAND },
  locationCopy: { flex: 1 },
  locationName: { color: INK, fontSize: 17, fontWeight: '800' },
  locationHint: { color: '#677081', fontSize: 13, marginTop: 4 },
  radioOuter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#bbc3d1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterActive: { borderColor: BRAND },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: BRAND },
  primaryButton: {
    marginTop: 22,
    backgroundColor: BRAND,
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButtonDisabled: { backgroundColor: '#a8b6b0' },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  secondaryButton: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  secondaryButtonText: { color: '#6f4d1d', fontWeight: '800' },
});
