/**
 * CameraPhotoGrid — 3-column grid of MTP photos from the connected camera.
 * Thumbnails are loaded lazily via mtpService.getThumbnail.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { mtpService, type MtpPhoto } from '../services/mtpService';

export type PhotoUploadStatus = 'pending' | 'queued' | 'uploading' | 'done' | 'failed';

export interface PhotoGridItem extends MtpPhoto {
  status: PhotoUploadStatus;
  progress?: number; // 0-100
}

interface Props {
  photos: PhotoGridItem[];
  selectedHandles: Set<number>;
  onToggleSelect: (handle: number) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  multiSelectMode: boolean;
  onEnterMultiSelect: () => void;
}

const COLUMN = 3;
const THUMB_SIZE = 102;

const STATUS_COLOR: Record<PhotoUploadStatus, string> = {
  pending: 'transparent',
  queued: '#f59e0b',
  uploading: '#2563eb',
  done: '#16a34a',
  failed: '#dc2626',
};

const STATUS_ICON: Record<PhotoUploadStatus, string> = {
  pending: '',
  queued: 'clock-outline',
  uploading: 'upload',
  done: 'check-circle',
  failed: 'alert-circle',
};

interface ThumbCellProps {
  item: PhotoGridItem;
  selected: boolean;
  multiSelectMode: boolean;
  onPress: () => void;
  onLongPress: () => void;
}

function ThumbCell({ item, selected, multiSelectMode, onPress, onLongPress }: ThumbCellProps) {
  const [thumb, setThumb] = useState<string | undefined>(item.thumbnail);
  const [loadingThumb, setLoadingThumb] = useState(!item.thumbnail);

  useEffect(() => {
    if (item.thumbnail) {
      setThumb(item.thumbnail);
      setLoadingThumb(false);
      return;
    }
    let cancelled = false;
    setLoadingThumb(true);
    mtpService.getThumbnail(item.handle)
      .then((uri) => { if (!cancelled) { setThumb(uri); setLoadingThumb(false); } })
      .catch(() => { if (!cancelled) setLoadingThumb(false); });
    return () => { cancelled = true; };
  }, [item.handle, item.thumbnail]);

  const iconName = STATUS_ICON[item.status] || '';
  const iconColor = STATUS_COLOR[item.status];
  const showOverlay = selected || item.status !== 'pending';

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={onPress}
      onLongPress={onLongPress}
      style={styles.cell}
    >
      {thumb ? (
        <Image source={{ uri: thumb }} style={styles.thumb} resizeMode="cover" />
      ) : (
        <View style={[styles.thumb, styles.thumbPlaceholder]}>
          {loadingThumb
            ? <ActivityIndicator size="small" color="#94a3b8" />
            : <MaterialCommunityIcons name="image-off-outline" size={24} color="#94a3b8" />}
        </View>
      )}

      {/* Status badge */}
      {iconName !== '' && item.status !== 'pending' && (
        <View style={[styles.badge, { backgroundColor: iconColor }]}>
          <MaterialCommunityIcons name={iconName as any} size={11} color="#fff" />
          {item.status === 'uploading' && item.progress != null && (
            <Text style={styles.badgeText}>{item.progress}%</Text>
          )}
        </View>
      )}

      {/* Multi-select overlay */}
      {multiSelectMode && (
        <View style={[styles.checkOverlay, selected && styles.checkOverlaySelected]}>
          {selected && <MaterialCommunityIcons name="check" size={16} color="#fff" />}
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function CameraPhotoGrid({
  photos,
  selectedHandles,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  multiSelectMode,
  onEnterMultiSelect,
}: Props) {
  const keyExtractor = useCallback((item: PhotoGridItem) => String(item.handle), []);

  const renderItem = useCallback(({ item }: { item: PhotoGridItem }) => (
    <ThumbCell
      item={item}
      selected={selectedHandles.has(item.handle)}
      multiSelectMode={multiSelectMode}
      onPress={() => {
        if (multiSelectMode) {
          onToggleSelect(item.handle);
        } else {
          onEnterMultiSelect();
          onToggleSelect(item.handle);
        }
      }}
      onLongPress={() => {
        if (!multiSelectMode) onEnterMultiSelect();
        onToggleSelect(item.handle);
      }}
    />
  ), [selectedHandles, multiSelectMode, onToggleSelect, onEnterMultiSelect]);

  if (photos.length === 0) {
    return (
      <View style={styles.empty}>
        <MaterialCommunityIcons name="camera-off" size={40} color="#94a3b8" />
        <Text style={styles.emptyText}>Chua co anh nao tren may anh</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {multiSelectMode && (
        <View style={styles.selectionBar}>
          <Text style={styles.selectionCount}>
            {selectedHandles.size > 0 ? `Da chon ${selectedHandles.size} anh` : 'Cham anh de chon'}
          </Text>
          <TouchableOpacity onPress={onSelectAll} style={styles.selBtn}>
            <Text style={styles.selBtnText}>Chon tat ca</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClearSelection} style={styles.selBtn}>
            <Text style={styles.selBtnText}>Bo chon</Text>
          </TouchableOpacity>
        </View>
      )}
      <FlatList
        data={photos}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        numColumns={COLUMN}
        contentContainerStyle={styles.list}
        initialNumToRender={18}
        maxToRenderPerBatch={12}
        windowSize={5}
        removeClippedSubviews
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: 2 },
  cell: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    margin: 2,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: '#e2e8f0',
  },
  thumb: { width: '100%', height: '100%' },
  thumbPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e2e8f0',
  },
  badge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 2,
    gap: 2,
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  checkOverlay: {
    position: 'absolute',
    top: 4,
    left: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOverlaySelected: { backgroundColor: '#1c5c46', borderColor: '#1c5c46' },
  selectionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    gap: 8,
  },
  selectionCount: { flex: 1, fontSize: 13, color: '#334155', fontWeight: '600' },
  selBtn: { paddingHorizontal: 10, paddingVertical: 4 },
  selBtnText: { fontSize: 13, color: '#1c5c46', fontWeight: '600' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  emptyText: { color: '#64748b', fontSize: 14, textAlign: 'center' },
});
