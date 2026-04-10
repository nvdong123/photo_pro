/**
 * UntaggedScreen — Review and assign location tags to FTP-uploaded photos
 * that have no location tag yet.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { apiJson } from '../services/apiClient';

type Props = NativeStackScreenProps<RootStackParamList, 'Untagged'>;

interface UntaggedItem {
  media_id: string;
  thumb_url: string | null;
  shoot_date: string | null;
  album_code: string | null;
  created_at: string;
}

interface LocationTag {
  id: string;
  name: string;
  shoot_date: string | null;
}

const BRAND = '#1c5c46';
const INK = '#172033';
const COL = 3;

export default function UntaggedScreen({ navigation }: Props) {
  const [items, setItems] = useState<UntaggedItem[]>([]);
  const [locations, setLocations] = useState<LocationTag[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pickerVisible, setPickerVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [untagged, locs] = await Promise.all([
        apiJson<UntaggedItem[]>('/api/v1/staff/media/untagged?limit=200'),
        apiJson<LocationTag[]>('/api/v1/admin/tags?tag_type=LOCATION&limit=200'),
      ]);
      setItems(Array.isArray(untagged) ? untagged : []);
      setLocations(Array.isArray(locs) ? locs : []);
    } catch {
      Alert.alert('Lỗi', 'Không tải được danh sách ảnh chưa tag. Thử lại sau.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => setSelected(new Set(items.map((i) => i.media_id))), [items]);
  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const handleAssign = useCallback(async (tagId: string) => {
    setPickerVisible(false);
    if (!selected.size) { Alert.alert('Chưa chọn ảnh', 'Hãy chọn ít nhất một ảnh.'); return; }
    setAssigning(true);
    try {
      const result = await apiJson<{ assigned: number; skipped: number }>(
        '/api/v1/staff/media/assign-location',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ media_ids: [...selected], tag_id: tagId }),
        },
      );
      Alert.alert('Thành công', `Đã gắn tag cho ${result?.assigned ?? 0} ảnh.`);
      setSelected(new Set());
      await loadData();
    } catch {
      Alert.alert('Lỗi', 'Gắn tag thất bại. Thử lại sau.');
    } finally {
      setAssigning(false);
    }
  }, [loadData, selected]);

  const renderItem = useCallback(({ item }: { item: UntaggedItem }) => {
    const isSelected = selected.has(item.media_id);
    return (
      <TouchableOpacity
        style={[styles.thumb, isSelected && styles.thumbSelected]}
        onPress={() => toggleSelect(item.media_id)}
        activeOpacity={0.8}
      >
        {item.thumb_url ? (
          <Image source={{ uri: item.thumb_url }} style={styles.thumbImg} resizeMode="cover" />
        ) : (
          <View style={styles.thumbPlaceholder}>
            <MaterialCommunityIcons name="image-off-outline" size={22} color="#9ca3af" />
          </View>
        )}
        {isSelected && (
          <View style={styles.checkOverlay}>
            <MaterialCommunityIcons name="check-circle" size={20} color="#fff" />
          </View>
        )}
        <View style={styles.thumbFooter}>
          <Text style={styles.thumbDate} numberOfLines={1}>
            {item.shoot_date ?? item.album_code ?? '-'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }, [selected, toggleSelect]);

  return (
    <View style={styles.container}>
      {/* ── Header toolbar ── */}
      <View style={styles.toolbar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={INK} />
        </TouchableOpacity>
        <Text style={styles.toolbarTitle}>Ảnh chưa có tag ({items.length})</Text>
        <TouchableOpacity style={styles.reloadBtn} onPress={() => void loadData()}>
          <MaterialCommunityIcons name="refresh" size={22} color={INK} />
        </TouchableOpacity>
      </View>

      {/* ── Selection controls ── */}
      <View style={styles.controls}>
        <TouchableOpacity style={styles.controlBtn} onPress={selectAll} disabled={!items.length}>
          <Text style={styles.controlBtnText}>Chọn tất cả</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.controlBtn} onPress={clearSelection} disabled={!selected.size}>
          <Text style={styles.controlBtnText}>Bỏ chọn ({selected.size})</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.assignBtn, (!selected.size || assigning) && styles.assignBtnDisabled]}
          onPress={() => { if (selected.size) setPickerVisible(true); else Alert.alert('Chưa chọn ảnh', 'Hãy chọn ít nhất một ảnh.'); }}
          disabled={!selected.size || assigning}
        >
          {assigning
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.assignBtnText}>Gắn tag</Text>}
        </TouchableOpacity>
      </View>

      {/* ── Grid ── */}
      {loading ? (
        <ActivityIndicator size="large" color={BRAND} style={{ marginTop: 60 }} />
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <MaterialCommunityIcons name="tag-check-outline" size={48} color={BRAND} />
          <Text style={styles.emptyTitle}>Tất cả ảnh đã có tag!</Text>
          <Text style={styles.emptyText}>Không còn ảnh nào chưa được gắn địa điểm.</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.media_id}
          numColumns={COL}
          renderItem={renderItem}
          contentContainerStyle={styles.grid}
        />
      )}

      {/* ── Location picker modal ── */}
      <Modal
        visible={pickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setPickerVisible(false)}
      >
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerSheet}>
            <Text style={styles.pickerTitle}>Chọn địa điểm</Text>
            <Text style={styles.pickerSub}>
              Gắn {selected.size} ảnh vào địa điểm nào?
            </Text>
            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              {locations.map((loc) => (
                <TouchableOpacity
                  key={loc.id}
                  style={styles.pickerItem}
                  onPress={() => void handleAssign(loc.id)}
                >
                  <MaterialCommunityIcons name="map-marker-outline" size={18} color={BRAND} />
                  <Text style={styles.pickerItemText}>
                    {loc.name}{loc.shoot_date ? ` (${loc.shoot_date})` : ''}
                  </Text>
                </TouchableOpacity>
              ))}
              {locations.length === 0 && (
                <Text style={{ color: '#6b7280', padding: 16 }}>Chưa có địa điểm nào. Hãy tạo địa điểm trên web dashboard.</Text>
              )}
            </ScrollView>
            <TouchableOpacity style={styles.pickerCancel} onPress={() => setPickerVisible(false)}>
              <Text style={styles.pickerCancelText}>Đóng</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f1ea' },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e4dbcb',
    gap: 8,
  },
  backBtn: { padding: 4 },
  toolbarTitle: { flex: 1, color: INK, fontSize: 17, fontWeight: '800' },
  reloadBtn: { padding: 4 },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e4dbcb',
    flexWrap: 'wrap',
  },
  controlBtn: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  controlBtnText: { color: INK, fontWeight: '700', fontSize: 13 },
  assignBtn: {
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 9,
    backgroundColor: BRAND,
  },
  assignBtnDisabled: { opacity: 0.4 },
  assignBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  grid: { padding: 4 },
  thumb: {
    flex: 1,
    margin: 3,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#e5e7eb',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  thumbSelected: { borderColor: BRAND },
  thumbImg: { width: '100%', aspectRatio: 1 },
  thumbPlaceholder: {
    width: '100%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOverlay: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: BRAND,
    borderRadius: 999,
    padding: 1,
  },
  thumbFooter: { paddingHorizontal: 4, paddingVertical: 3, backgroundColor: '#fff' },
  thumbDate: { fontSize: 10, color: '#6b7280' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyTitle: { color: INK, fontSize: 20, fontWeight: '800', marginTop: 16 },
  emptyText: { color: '#6b7280', fontSize: 14, textAlign: 'center', marginTop: 8 },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 36,
  },
  pickerTitle: { color: INK, fontSize: 18, fontWeight: '800', marginBottom: 4 },
  pickerSub: { color: '#6b7280', fontSize: 13, marginBottom: 16 },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 6,
    backgroundColor: '#f4f1ea',
  },
  pickerItemText: { color: INK, fontSize: 15, fontWeight: '700', flex: 1 },
  pickerCancel: {
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
  },
  pickerCancelText: { color: '#374151', fontWeight: '800', fontSize: 15 },
});
