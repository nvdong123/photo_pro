import { FlatList, Image, View, StyleSheet, Text, TouchableOpacity } from 'react-native';
import ThumbnailItem from './ThumbnailItem';
import type { UploadStatus } from '../services/uploadService';

export interface PhotoCard {
  id: string;
  uri: string;
  status: UploadStatus;
  name: string;
  selected?: boolean;
  progress: number;
  media_id?: string;
  size?: number;
  capturedAt?: number;
  addedAt?: string;
  source?: { type: 'android-usb-camera'; cacheKey: string };
}

interface Props {
  photos: PhotoCard[];
  selectionMode: boolean;
  onToggleSelect: (id: string) => void;
  onUploadItem: (id: string) => void;
  onViewDetail?: (photo: PhotoCard) => void;
  emptyMessage?: string;
  numColumns?: number;
  scrollEnabled?: boolean;
  newPhotoHandles?: Set<string>;
}

function statusColor(status: UploadStatus): string {
  switch (status) {
    case 'UNUPLOAD': return '#9ca3af';
    case 'CACHED': return '#10b981';
    case 'UPLOADING': return '#3b82f6';
    case 'FAILED': return '#ef4444';
    case 'UPLOADED': return '#6b7280';
    default: return '#9ca3af';
  }
}

function statusLabel(status: UploadStatus): string {
  switch (status) {
    case 'UNUPLOAD': return 'Unupload';
    case 'CACHED': return 'Cached';
    case 'UPLOADING': return 'Uploading';
    case 'FAILED': return 'Failed';
    case 'UPLOADED': return 'Uploaded';
    default: return 'Unupload';
  }
}

export default function PhotoGrid({
  photos,
  selectionMode,
  onToggleSelect,
  onUploadItem,
  onViewDetail,
  emptyMessage = 'Chưa có ảnh',
  numColumns = 4,
  scrollEnabled = true,
  newPhotoHandles,
}: Props) {
  if (!photos.length) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>{emptyMessage}</Text>
      </View>
    );
  }

  const cardWidth = `${100 / numColumns}%` as const;

  return (
    <FlatList
      data={photos}
      key={`${numColumns}-${scrollEnabled ? 'scroll' : 'static'}`}
      keyExtractor={(item) => item.id}
      numColumns={numColumns}
      scrollEnabled={scrollEnabled}
      windowSize={5}
      maxToRenderPerBatch={8}
      initialNumToRender={12}
      removeClippedSubviews
      renderItem={({ item }) => {
        const isOtgCamera = item.source?.type === 'android-usb-camera' && !!item.source.cacheKey;
        const isNewPhoto = isOtgCamera && newPhotoHandles?.has(item.source.cacheKey);

        return (
          <View style={[styles.card, { flexBasis: cardWidth, maxWidth: cardWidth }]}> 
            {isOtgCamera ? (
              <ThumbnailItem
                photo={{
                  id: item.id,
                  cacheKey: item.source!.cacheKey,
                  name: item.name,
                  size: item.size,
                  capturedAt: item.capturedAt,
                  isNew: isNewPhoto,
                }}
                isSelected={item.selected ?? false}
                onPress={selectionMode ? () => onToggleSelect(item.id) : (!selectionMode && onViewDetail ? () => onViewDetail(item) : undefined)}
              />
            ) : (
              <TouchableOpacity
                style={styles.touchableCard}
                onPress={selectionMode ? () => onToggleSelect(item.id) : (!selectionMode && onViewDetail ? () => onViewDetail(item) : undefined)}
                activeOpacity={selectionMode ? 0.8 : 1}
              >
                <Image source={{ uri: item.uri }} style={styles.img} />
              </TouchableOpacity>
            )}
          <View style={[styles.badge, { backgroundColor: statusColor(item.status) }]}>
            <Text style={styles.badgeText}>{statusLabel(item.status)}</Text>
          </View>
          {item.status === 'UPLOADING' && (
            <View style={styles.pctContainer}>
              <Text style={styles.pctText}>{item.progress}%</Text>
            </View>
          )}

          <View style={styles.metaRow}>
            <Text style={styles.fileNumber}>{item.name.slice(-4)}</Text>
            <TouchableOpacity style={styles.uploadButton} onPress={() => onUploadItem(item.id)}>
              <Text style={styles.uploadButtonText}>Upload</Text>
            </TouchableOpacity>
          </View>

          {selectionMode ? (
            <View style={styles.selectOverlay}>
              <View style={[styles.checkCircle, item.selected && styles.checkCircleActive]} />
            </View>
          ) : null}
          {item.selected && <View style={styles.selectedOverlay} />}
          </View>
        );
      }}
      contentContainerStyle={styles.listContent}
    />
  );
}

const styles = StyleSheet.create({
  card: { margin: 4, borderRadius: 8, overflow: 'hidden', position: 'relative', backgroundColor: '#000' },
  img: { width: '100%', aspectRatio: 1.05, backgroundColor: '#111827' },
  touchableCard: { overflow: 'hidden', borderRadius: 8 },
  badge: { position: 'absolute', top: 4, right: 4, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2, zIndex: 10 },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  pctContainer: { position: 'absolute', top: 24, right: 4, borderRadius: 12, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: 'rgba(0,0,0,0.6)' },
  pctText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  metaRow: { position: 'absolute', left: 4, right: 4, bottom: 4, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fileNumber: { color: '#fff', fontSize: 10, fontWeight: '700', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 5, borderRadius: 4 },
  uploadButton: { backgroundColor: '#111827', borderRadius: 4, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  uploadButtonText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  selectOverlay: { position: 'absolute', top: 4, left: 4, zIndex: 12, minWidth: 32, minHeight: 32, justifyContent: 'center', alignItems: 'center' },
  checkCircle: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#fff', backgroundColor: 'rgba(255,255,255,0.25)' },
  checkCircleActive: { backgroundColor: '#2563eb', borderColor: '#fff' },
  selectedOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(37,99,235,0.25)' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyText: { color: '#6b7280', fontSize: 14 },
  listContent: { paddingVertical: 4 },
});
