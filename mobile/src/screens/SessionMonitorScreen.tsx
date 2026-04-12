/**
 * SessionMonitorScreen — MTP (wired OTG) session monitor for PhotoPro.
 * Shows camera connection state, upload stats, and a photo grid.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { useMtpCamera, type MtpConnectionState } from '../hooks/useMtpCamera';
import CameraPhotoGrid, { type PhotoGridItem, type PhotoUploadStatus } from '../components/CameraPhotoGrid';
import BatchUploadSheet from '../components/BatchUploadSheet';
import UploadQualitySheet from '../components/UploadQualitySheet';
import { uploadFile, type UploadMetadata } from '../services/uploadService';
import { mtpService, type MtpPhoto } from '../services/mtpService';

type Props = NativeStackScreenProps<RootStackParamList, 'SessionMonitor'>;
type FilterTab = 'all' | 'queued' | 'uploading' | 'done' | 'failed';
type CameraFormat = NonNullable<UploadMetadata['camera_format']>;

const BRAND = '#1c5c46';
const INK = '#172033';
const CONCURRENT_UPLOADS = 2;

function getTodayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function stateLabel(s: MtpConnectionState): string {
  switch (s) {
    case 'idle': return 'Chua ket noi';
    case 'detecting': return 'Dang tim may anh...';
    case 'connecting': return 'Dang ket noi...';
    case 'connected': return 'Da ket noi';
    case 'error': return 'Loi ket noi';
  }
}

function stateIcon(s: MtpConnectionState): string {
  switch (s) {
    case 'idle': return 'usb-port';
    case 'detecting': return 'progress-clock';
    case 'connecting': return 'progress-wrench';
    case 'connected': return 'usb';
    case 'error': return 'alert-circle-outline';
  }
}

function stateColor(s: MtpConnectionState): string {
  switch (s) {
    case 'idle': return '#64748b';
    case 'detecting': return '#475569';
    case 'connecting': return '#2563eb';
    case 'connected': return BRAND;
    case 'error': return '#dc2626';
  }
}

const TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'Tat ca' },
  { key: 'queued', label: 'Cho' },
  { key: 'uploading', label: 'Dang' },
  { key: 'done', label: 'Xong' },
  { key: 'failed', label: 'Loi' },
];

export default function SessionMonitorScreen({ navigation, route }: Props) {
  const { locationId, locationName } = route.params;

  const mtp = useMtpCamera();

  // Grid items (extends MtpPhoto with upload status).
  const [gridItems, setGridItems] = useState<PhotoGridItem[]>([]);

  // Selection state.
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedHandles, setSelectedHandles] = useState<Set<number>>(new Set());

  // Sheets.
  const [showBatchSheet, setShowBatchSheet] = useState(false);
  const [showQualitySheet, setShowQualitySheet] = useState(false);

  // Upload settings.
  const [cameraFormat, setCameraFormat] = useState<CameraFormat>('JPG_HD');
  const [paused, setPaused] = useState(false);

  // Active filter tab.
  const [activeTab, setActiveTab] = useState<FilterTab>('all');

  // Upload concurrency control.
  const uploadingCountRef = useRef(0);
  const cancelRef = useRef(false);
  const pausedRef = useRef(false);
  pausedRef.current = paused;

  // ─── Sync MTP photos into grid when mtp.photos changes ──────────────────
  useEffect(() => {
    setGridItems((prev) => {
      const existingHandles = new Map(prev.map((p) => [p.handle, p]));
      const merged: PhotoGridItem[] = mtp.photos.map((photo) => {
        const existing = existingHandles.get(photo.handle);
        return existing ?? { ...photo, status: 'pending' as PhotoUploadStatus };
      });
      // Preserve items that may have loaded thumbnails.
      return merged.map((item) => {
        const old = existingHandles.get(item.handle);
        return old ? { ...item, status: old.status, progress: old.progress, thumbnail: old.thumbnail } : item;
      });
    });
  }, [mtp.photos]);

  // ─── Stats ───────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total: gridItems.length,
    queued: gridItems.filter((p) => p.status === 'queued').length,
    uploading: gridItems.filter((p) => p.status === 'uploading').length,
    done: gridItems.filter((p) => p.status === 'done').length,
    failed: gridItems.filter((p) => p.status === 'failed').length,
    pending: gridItems.filter((p) => p.status === 'pending').length,
  }), [gridItems]);

  // ─── Filter tab items ────────────────────────────────────────────────────
  const filteredItems = useMemo(() => {
    if (activeTab === 'all') return gridItems;
    const map: Record<FilterTab, PhotoUploadStatus[]> = {
      all: [],
      queued: ['queued'],
      uploading: ['uploading'],
      done: ['done'],
      failed: ['failed'],
    };
    return gridItems.filter((p) => map[activeTab].includes(p.status));
  }, [gridItems, activeTab]);

  const updateStatus = useCallback((handle: number, status: PhotoUploadStatus, progress?: number) => {
    setGridItems((prev) =>
      prev.map((p) =>
        p.handle === handle ? { ...p, status, progress: progress ?? p.progress } : p,
      ),
    );
  }, []);

  // ─── Upload runner ───────────────────────────────────────────────────────
  const runUploadQueue = useCallback(async () => {
    if (pausedRef.current || cancelRef.current) return;

    setGridItems((prev) => {
      const pending = prev.filter((p) => p.status === 'queued');
      const slots = CONCURRENT_UPLOADS - uploadingCountRef.current;
      if (slots <= 0 || pending.length === 0) return prev;

      const toStart = pending.slice(0, slots);
      toStart.forEach(async (item) => {
        uploadingCountRef.current += 1;
        updateStatus(item.handle, 'uploading', 0);

        try {
          const localPath = await mtpService.downloadPhoto(item.handle, item.filename);
          if (cancelRef.current || pausedRef.current) {
            updateStatus(item.handle, 'queued', 0);
            return;
          }

          const contentType = item.filename.toLowerCase().endsWith('.cr3') ? 'image/x-canon-cr3'
            : item.filename.toLowerCase().endsWith('.cr2') ? 'image/x-canon-cr2'
            : item.filename.toLowerCase().endsWith('.nef') ? 'image/x-nikon-nef'
            : item.filename.toLowerCase().endsWith('.arw') ? 'image/x-sony-arw'
            : 'image/jpeg';

          const metadata: UploadMetadata = {
            location_id: locationId,
            shoot_date: getTodayIso(),
            camera_format: cameraFormat,
          };

          const result = await uploadFile(
            localPath,
            item.filename,
            contentType,
            metadata,
            (_step, percent) => updateStatus(item.handle, 'uploading', percent),
            cancelRef,
          );

          updateStatus(item.handle, result.status === 'success' ? 'done' : 'failed', 100);
        } catch (_err) {
          updateStatus(item.handle, 'failed');
        } finally {
          uploadingCountRef.current = Math.max(0, uploadingCountRef.current - 1);
          // Try picking up next queued item.
          setGridItems((cur) => {
            const nextQueued = cur.find((p) => p.status === 'queued');
            if (nextQueued && uploadingCountRef.current < CONCURRENT_UPLOADS && !pausedRef.current && !cancelRef.current) {
              void runUploadQueue();
            }
            return cur;
          });
        }
      });

      return prev; // actual updates via updateStatus
    });
  }, [locationId, cameraFormat, updateStatus]);

  // Kick off queue runner whenever queue or paused state changes.
  useEffect(() => {
    if (!paused && stats.queued > 0 && uploadingCountRef.current < CONCURRENT_UPLOADS) {
      void runUploadQueue();
    }
  }, [paused, stats.queued, runUploadQueue]);

  // ─── Queue helpers ───────────────────────────────────────────────────────
  const enqueueHandles = useCallback((handles: number[]) => {
    setGridItems((prev) =>
      prev.map((p) =>
        handles.includes(p.handle) && p.status === 'pending' ? { ...p, status: 'queued' } : p,
      ),
    );
    setSelectedHandles(new Set());
    setMultiSelectMode(false);
    setShowBatchSheet(false);
  }, []);

  const uploadOne = useCallback((handle: number) => {
    enqueueHandles([handle]);
  }, [enqueueHandles]);

  const enqueueAll = useCallback(() => {
    setGridItems((prev) =>
      prev.map((p) => (p.status === 'pending' ? { ...p, status: 'queued' } : p)),
    );
    setShowBatchSheet(false);
  }, []);

  const retryFailed = useCallback(() => {
    setGridItems((prev) =>
      prev.map((p) => (p.status === 'failed' ? { ...p, status: 'queued', progress: 0 } : p)),
    );
  }, []);

  // ─── Selection helpers ───────────────────────────────────────────────────
  const toggleSelect = useCallback((handle: number) => {
    setSelectedHandles((prev) => {
      const next = new Set(prev);
      if (next.has(handle)) next.delete(handle);
      else next.add(handle);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedHandles(new Set(filteredItems.map((p) => p.handle)));
  }, [filteredItems]);

  const clearSelection = useCallback(() => {
    setSelectedHandles(new Set());
    setMultiSelectMode(false);
  }, []);

  // ─── End session ─────────────────────────────────────────────────────────
  const handleEndSession = useCallback(() => {
    Alert.alert(
      'Ket thuc phien?',
      stats.queued + stats.uploading > 0
        ? `Con ${stats.queued + stats.uploading} anh chua xong. Tiep tuc?`
        : 'Ban co chac muon ket thuc phien chup nay?',
      [
        { text: 'O lai', style: 'cancel' },
        {
          text: 'Ket thuc',
          style: 'destructive',
          onPress: async () => {
            cancelRef.current = true;
            await mtp.disconnect();
            navigation.goBack();
          },
        },
      ],
    );
  }, [mtp, navigation, stats.queued, stats.uploading]);

  // ─── Auto-connect on mount ───────────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS === 'android' && mtp.connectionState === 'idle') {
      void mtp.detectAndConnect();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Rendered pending count for BatchSheet ───────────────────────────────
  const pendingCount = stats.pending + stats.queued;

  return (
    <View style={styles.root}>
      {/* ─── Header card ──────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerLocation} numberOfLines={1}>{locationName}</Text>
          <Text style={styles.headerSub}>Phien chup co day (MTP/OTG)</Text>
        </View>
        <TouchableOpacity onPress={() => setShowQualitySheet(true)} style={styles.qualityBtn}>
          <MaterialCommunityIcons name="tune" size={18} color="#fff" />
          <Text style={styles.qualityBtnText}>{cameraFormat}</Text>
        </TouchableOpacity>
      </View>

      {/* ─── Connection status card ───────────────────────────────────────── */}
      <View style={[styles.statusCard, { borderLeftColor: stateColor(mtp.connectionState) }]}>
        <MaterialCommunityIcons
          name={stateIcon(mtp.connectionState) as any}
          size={22}
          color={stateColor(mtp.connectionState)}
        />
        <View style={styles.statusText}>
          <Text style={[styles.statusLabel, { color: stateColor(mtp.connectionState) }]}>
            {stateLabel(mtp.connectionState)}
          </Text>
          {mtp.cameraInfo != null && (
            <Text style={styles.statusSub}>
              {mtp.cameraInfo.manufacturer} {mtp.cameraInfo.model}
            </Text>
          )}
          {mtp.errorMessage !== '' && (
            <Text style={styles.statusError}>{mtp.errorMessage}</Text>
          )}
        </View>
        {(mtp.connectionState === 'idle' || mtp.connectionState === 'error') && (
          <TouchableOpacity onPress={() => void mtp.detectAndConnect()} style={styles.retryConnBtn}>
            <Text style={styles.retryConnText}>Thu lai</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ─── Stats grid ───────────────────────────────────────────────────── */}
      <View style={styles.statsRow}>
        {[
          { label: 'Nhan duoc', value: stats.total, color: INK },
          { label: 'Cho/Dang', value: stats.queued + stats.uploading, color: '#f59e0b' },
          { label: 'Da upload', value: stats.done, color: BRAND },
          { label: 'Loi', value: stats.failed, color: '#dc2626' },
        ].map(({ label, value, color }) => (
          <View key={label} style={styles.statCell}>
            <Text style={[styles.statValue, { color }]}>{value}</Text>
            <Text style={styles.statLabel}>{label}</Text>
          </View>
        ))}
      </View>

      {/* ─── Action buttons ───────────────────────────────────────────────── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.actionsScroll} contentContainerStyle={styles.actionsContent}>
        <TouchableOpacity
          style={[styles.actionBtn, paused && styles.actionBtnActive]}
          onPress={() => setPaused((p) => !p)}
        >
          <MaterialCommunityIcons name={paused ? 'play' : 'pause'} size={16} color={paused ? '#fff' : INK} />
          <Text style={[styles.actionBtnText, paused && styles.actionBtnTextActive]}>
            {paused ? 'Tiep tuc' : 'Tam dung'}
          </Text>
        </TouchableOpacity>

        {stats.failed > 0 && (
          <TouchableOpacity style={styles.actionBtn} onPress={retryFailed}>
            <MaterialCommunityIcons name="refresh" size={16} color={INK} />
            <Text style={styles.actionBtnText}>Thu lai loi ({stats.failed})</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnPrimary]}
          onPress={() => setShowBatchSheet(true)}
          disabled={pendingCount === 0}
        >
          <MaterialCommunityIcons name="cloud-upload" size={16} color="#fff" />
          <Text style={[styles.actionBtnText, styles.actionBtnTextActive]}>Upload ({pendingCount})</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, { borderColor: '#dc2626' }]}
          onPress={handleEndSession}
        >
          <MaterialCommunityIcons name="stop-circle-outline" size={16} color="#dc2626" />
          <Text style={[styles.actionBtnText, { color: '#dc2626' }]}>Ket thuc phien</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* ─── Filter tabs ─────────────────────────────────────────────────── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll} contentContainerStyle={styles.tabsContent}>
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ─── Photo grid ──────────────────────────────────────────────────── */}
      {mtp.connectionState === 'connected' ? (
        <CameraPhotoGrid
          photos={filteredItems}
          selectedHandles={selectedHandles}
          onToggleSelect={toggleSelect}
          onSelectAll={selectAll}
          onClearSelection={clearSelection}
          multiSelectMode={multiSelectMode}
          onEnterMultiSelect={() => setMultiSelectMode(true)}
          scanProgress={mtp.scanProgress}
          onUploadOne={uploadOne}
          onBatchUpload={() => setShowBatchSheet(true)}
        />
      ) : (
        <View style={styles.noCamera}>
          {mtp.connectionState === 'detecting' || mtp.connectionState === 'connecting' ? (
            <>
              <ActivityIndicator size="large" color={BRAND} />
              <Text style={styles.noCameraText}>{stateLabel(mtp.connectionState)}</Text>
            </>
          ) : (
            <>
              <MaterialCommunityIcons name="usb-port" size={48} color="#94a3b8" />
              <Text style={styles.noCameraText}>Cam may anh qua cap OTG de bat dau</Text>
              <TouchableOpacity style={styles.connectBtn} onPress={() => void mtp.detectAndConnect()}>
                <Text style={styles.connectBtnText}>Ket noi may anh</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {/* ─── Upload action buttons (selected) ────────────────────────────── */}
      {multiSelectMode && selectedHandles.size > 0 && (
        <View style={styles.selectionFooter}>
          <Text style={styles.selectionFooterText}>{selectedHandles.size} anh duoc chon</Text>
          <TouchableOpacity
            style={styles.uploadSelectedBtn}
            onPress={() => enqueueHandles([...selectedHandles])}
          >
            <MaterialCommunityIcons name="upload" size={16} color="#fff" />
            <Text style={styles.uploadSelectedText}>Upload ngay</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelSelBtn} onPress={clearSelection}>
            <MaterialCommunityIcons name="close" size={18} color="#64748b" />
          </TouchableOpacity>
        </View>
      )}

      {/* ─── Sheets ──────────────────────────────────────────────────────── */}
      <BatchUploadSheet
        visible={showBatchSheet}
        selectedCount={selectedHandles.size}
        totalPending={pendingCount}
        onClose={() => setShowBatchSheet(false)}
        onUploadSelected={() => enqueueHandles([...selectedHandles])}
        onUploadAll={enqueueAll}
      />
      <UploadQualitySheet
        visible={showQualitySheet}
        current={cameraFormat}
        onChange={setCameraFormat}
        onClose={() => setShowQualitySheet(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f4f1ea' },

  // Header
  header: {
    backgroundColor: BRAND,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 12,
  },
  headerLeft: { flex: 1 },
  headerLocation: { color: '#fff', fontSize: 16, fontWeight: '700' },
  headerSub: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 },
  qualityBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 4,
  },
  qualityBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },

  // Status card
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginTop: 12,
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 4,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  statusText: { flex: 1 },
  statusLabel: { fontSize: 14, fontWeight: '700' },
  statusSub: { fontSize: 12, color: '#475569', marginTop: 2 },
  statusError: { fontSize: 12, color: '#dc2626', marginTop: 2 },
  retryConnBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BRAND,
  },
  retryConnText: { fontSize: 13, color: BRAND, fontWeight: '600' },

  // Stats
  statsRow: {
    flexDirection: 'row',
    marginHorizontal: 12,
    marginTop: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRightWidth: 1,
    borderRightColor: '#f1f5f9',
  },
  statValue: { fontSize: 22, fontWeight: '800' },
  statLabel: { fontSize: 11, color: '#64748b', marginTop: 2 },

  // Actions
  actionsScroll: { maxHeight: 52, marginTop: 12 },
  actionsContent: { paddingHorizontal: 12, gap: 8, alignItems: 'center' },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
    gap: 6,
  },
  actionBtnActive: { backgroundColor: '#475569', borderColor: '#475569' },
  actionBtnPrimary: { backgroundColor: BRAND, borderColor: BRAND },
  actionBtnText: { fontSize: 13, color: INK, fontWeight: '600' },
  actionBtnTextActive: { color: '#fff' },

  // Tabs
  tabsScroll: { maxHeight: 44, marginTop: 12 },
  tabsContent: { paddingHorizontal: 12, gap: 6, alignItems: 'center' },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#e2e8f0',
  },
  tabActive: { backgroundColor: BRAND },
  tabText: { fontSize: 13, color: '#475569', fontWeight: '600' },
  tabTextActive: { color: '#fff' },

  // No camera placeholder
  noCamera: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 32,
  },
  noCameraText: { fontSize: 15, color: '#64748b', textAlign: 'center' },
  connectBtn: {
    backgroundColor: BRAND,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  connectBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Selection footer
  selectionFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  selectionFooterText: { flex: 1, fontSize: 14, color: INK, fontWeight: '600' },
  uploadSelectedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BRAND,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  uploadSelectedText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  cancelSelBtn: { padding: 4 },
});
