/**
 * CameraPhotoGrid — 3-column grid of MTP photos with Piufoto-style UI.
 * Groups photos by date + 30-min time bucket. Thumbnails load lazily.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  SectionList,
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

interface GridSection {
  title: string;
  data: PhotoGridItem[][];
}

interface Props {
  photos: PhotoGridItem[];
  selectedHandles: Set<number>;
  onToggleSelect: (handle: number) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  multiSelectMode: boolean;
  onEnterMultiSelect: () => void;
  scanProgress?: { loaded: number; total: number; scanning: boolean };
  onUploadOne: (handle: number) => void;
  onBatchUpload: () => void;
}

const COLUMN = 3;
const THUMB_SIZE = 102;
const BRAND = '#1c5c46';

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fileNumber(filename: string): string {
  const m = filename.match(/(\d{4})(?=\.[^.]+$)/);
  return m ? `...${m[1]}` : '';
}

function getSectionKey(captureTime: number): string {
  if (!captureTime || captureTime <= 0) return '0000-00-00__00:00';
  const d = new Date(captureTime);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  const bucket = Math.floor((d.getHours() * 60 + d.getMinutes()) / 30) * 30;
  const hh = String(Math.floor(bucket / 60)).padStart(2, '0');
  const mm = String(bucket % 60).padStart(2, '0');
  return `${y}-${mo}-${da}__${hh}:${mm}`;
}

function getSectionTitle(key: string, count: number, scanning: boolean): string {
  if (key === '0000-00-00__00:00')
    return scanning ? `Đang tải thông tin... ${count} ảnh` : `Không có ngày / ${count} ảnh`;
  const [datePart, timePart] = key.split('__');
  const parts = datePart.split('-');
  return `${parts[1]}-${parts[2]} / ${timePart} / ${count} ảnh`;
}

function chunkIntoRows(items: PhotoGridItem[], cols: number): PhotoGridItem[][] {
  const rows: PhotoGridItem[][] = [];
  for (let i = 0; i < items.length; i += cols) {
    rows.push(items.slice(i, i + cols));
  }
  return rows;
}

// ─── ThumbCell ────────────────────────────────────────────────────────────────

interface ThumbCellProps {
  item: PhotoGridItem;
  selected: boolean;
  multiSelectMode: boolean;
  onPress: () => void;
  onLongPress: () => void;
  onUpload: () => void;
}

function ThumbCell({ item, selected, multiSelectMode, onPress, onLongPress, onUpload }: ThumbCellProps) {
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

  const fileNum = fileNumber(item.filename);

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

      {/* File number — bottom left */}
      {fileNum !== '' && (
        <View style={styles.fileNumBadge}>
          <Text style={styles.fileNumText}>{fileNum}</Text>
        </View>
      )}

      {/* Status badge / upload button — bottom right */}
      {item.status === 'pending' && item.filename !== '' ? (
        <TouchableOpacity
          onPress={(e) => { e.stopPropagation(); onUpload(); }}
          style={styles.uploadBtn}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <MaterialCommunityIcons name="upload" size={12} color="#fff" />
        </TouchableOpacity>
      ) : item.status !== 'pending' ? (
        <View style={[styles.badge, { backgroundColor: STATUS_COLOR[item.status] }]}>
          {item.status === 'uploading' && item.progress != null ? (
            <Text style={styles.badgeText}>{item.progress}%</Text>
          ) : (
            <MaterialCommunityIcons name={STATUS_ICON[item.status] as any} size={11} color="#fff" />
          )}
        </View>
      ) : null /* stub: pending + no filename yet */}

      {/* Multi-select overlay */}
      {multiSelectMode && (
        <View style={[styles.checkOverlay, selected && styles.checkOverlaySelected]}>
          {selected && <MaterialCommunityIcons name="check" size={16} color="#fff" />}
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CameraPhotoGrid({
  photos,
  selectedHandles,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  multiSelectMode,
  onEnterMultiSelect,
  scanProgress,
  onUploadOne,
  onBatchUpload,
}: Props) {

  // Counter stats from current photo list
  const counts = useMemo(() => ({
    total: photos.length,
    pending: photos.filter((p) => p.status === 'pending').length,
    uploading: photos.filter((p) => p.status === 'uploading' || p.status === 'queued').length,
    done: photos.filter((p) => p.status === 'done').length,
    failed: photos.filter((p) => p.status === 'failed').length,
  }), [photos]);

  // Build sections: group photos by date + 30-min bucket, newest first
  const sections = useMemo((): GridSection[] => {
    const scanning = scanProgress?.scanning ?? false;
    const buckets = new Map<string, PhotoGridItem[]>();
    for (const item of photos) {
      const key = getSectionKey(item.captureTime);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(item);
    }
    return [...buckets.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, items]) => ({
        title: getSectionTitle(key, items.length, scanning),
        data: chunkIntoRows(items, COLUMN),
      }));
  }, [photos, scanProgress?.scanning]);

  const keyExtractor = useCallback((row: PhotoGridItem[]) =>
    row.length > 0 ? String(row[0].handle) : 'empty', []);

  const renderItem = useCallback(({ item: row }: { item: PhotoGridItem[] }) => (
    <View style={styles.row}>
      {row.map((item) => (
        <ThumbCell
          key={item.handle}
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
          onUpload={() => onUploadOne(item.handle)}
        />
      ))}
      {Array.from({ length: COLUMN - row.length }).map((_, i) => (
        <View key={`pad-${i}`} style={styles.cell} />
      ))}
    </View>
  ), [selectedHandles, multiSelectMode, onToggleSelect, onEnterMultiSelect, onUploadOne]);

  const renderSectionHeader = useCallback(({ section }: { section: GridSection }) => (
    <View style={styles.sectionHeader}>
      <MaterialCommunityIcons name="calendar-month" size={12} color="#64748b" />
      <Text style={styles.sectionHeaderText}>{section.title}</Text>
    </View>
  ), []);

  if (photos.length === 0 && !scanProgress?.scanning) {
    return (
      <View style={styles.empty}>
        <MaterialCommunityIcons name="camera-off" size={40} color="#94a3b8" />
        <Text style={styles.emptyText}>Chưa có ảnh nào trên máy ảnh</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Scan progress bar */}
      {scanProgress?.scanning && (
        <View style={styles.progressBar}>
          <ActivityIndicator size="small" color={BRAND} />
          <Text style={styles.progressText}>
            {scanProgress.total > 0 && scanProgress.loaded < scanProgress.total
              ? `Đang tải thông tin ảnh... ${scanProgress.loaded} / ${scanProgress.total}`
              : scanProgress.total > 0
              ? `Đã tìm ${scanProgress.total} ảnh, đang tải...`
              : 'Đang quét máy ảnh...'}
          </Text>
        </View>
      )}

      {/* Counter bar */}
      <View style={styles.counterBar}>
        {[
          { label: 'Tất cả', value: counts.total, color: '#172033' },
          { label: 'Chưa tải', value: counts.pending, color: '#475569' },
          { label: 'Đang tải', value: counts.uploading, color: '#2563eb' },
          { label: 'Đã tải', value: counts.done, color: BRAND },
          { label: 'Lỗi', value: counts.failed, color: '#dc2626' },
        ].map(({ label, value, color }) => (
          <View key={label} style={styles.counterCell}>
            <Text style={[styles.counterValue, { color }]}>{value}</Text>
            <Text style={styles.counterLabel}>{label}</Text>
          </View>
        ))}
      </View>

      {/* Selection info bar */}
      {multiSelectMode && (
        <View style={styles.selectionBar}>
          <Text style={styles.selectionCount}>
            {selectedHandles.size > 0 ? `Đã chọn ${selectedHandles.size} ảnh` : 'Chạm ảnh để chọn'}
          </Text>
          <TouchableOpacity onPress={onSelectAll} style={styles.selBtn}>
            <Text style={styles.selBtnText}>Chọn tất cả</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClearSelection} style={styles.selBtn}>
            <Text style={styles.selBtnText}>Bỏ chọn</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Photo grid */}
      <SectionList
        sections={sections}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        stickySectionHeadersEnabled
        style={styles.list}
        contentContainerStyle={styles.listContent}
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={5}
        removeClippedSubviews
      />

      {/* Floating action bar */}
      <View style={styles.floatingBar}>
        <TouchableOpacity
          style={styles.floatBtn}
          onPress={onEnterMultiSelect}
        >
          <MaterialCommunityIcons name="check-circle-outline" size={15} color={BRAND} />
          <Text style={styles.floatBtnText}>Chọn nhiều</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.floatBtnPrimary}
          onPress={onBatchUpload}
        >
          <MaterialCommunityIcons name="cloud-upload" size={15} color="#fff" />
          <Text style={styles.floatBtnPrimaryText}>Tải hàng loạt</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { flex: 1 },
  listContent: { padding: 2, paddingBottom: 70 },

  // Scan progress
  progressBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#f0fdf4',
    borderBottomWidth: 1,
    borderBottomColor: '#bbf7d0',
  },
  progressText: { fontSize: 12, color: BRAND, fontWeight: '600' },

  // Counter bar
  counterBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  counterCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    borderRightWidth: 1,
    borderRightColor: '#f1f5f9',
  },
  counterValue: { fontSize: 14, fontWeight: '700' },
  counterLabel: { fontSize: 9, color: '#64748b', marginTop: 1 },

  // Section header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: 'rgba(244,241,234,0.96)',
  },
  sectionHeaderText: { fontSize: 11, color: '#475569', fontWeight: '600' },

  // Grid row
  row: { flexDirection: 'row', padding: 2, gap: 0 },

  // Thumb cell
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

  // File number
  fileNumBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 4,
    paddingHorizontal: 3,
    paddingVertical: 1,
  },
  fileNumText: { color: '#fff', fontSize: 9, fontWeight: '600' },

  // Upload button (pending state)
  uploadBtn: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: BRAND,
    borderRadius: 10,
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Status badge (non-pending)
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

  // Multiselect
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
  checkOverlaySelected: { backgroundColor: BRAND, borderColor: BRAND },

  // Selection bar
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
  selBtnText: { fontSize: 13, color: BRAND, fontWeight: '600' },

  // Empty state
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  emptyText: { color: '#64748b', fontSize: 14, textAlign: 'center' },

  // Floating bar
  floatingBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  floatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BRAND,
    backgroundColor: '#fff',
  },
  floatBtnText: { fontSize: 13, color: BRAND, fontWeight: '600' },
  floatBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: BRAND,
  },
  floatBtnPrimaryText: { fontSize: 13, color: '#fff', fontWeight: '600' },
});
