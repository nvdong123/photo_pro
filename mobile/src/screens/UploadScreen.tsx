import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import PhotoGrid, { type PhotoCard } from '../components/PhotoGrid';
import { useOTG } from '../hooks/useOTG';
import { useStaffStream } from '../hooks/useSSE';
import { useUpload, type UploadItem } from '../hooks/useUpload';
import { pickFilesFromDevice } from '../services/otgService';
import { apiJson } from '../services/apiClient';

type Props = NativeStackScreenProps<RootStackParamList, 'Upload'>;

interface LocationTag {
  id: string;
  name: string;
  shoot_date: string | null;
}

interface ActiveLocation {
  tag_id: string | null;
  tag_name: string | null;
  shoot_date: string | null;
}

type FtpStatus = 'idle' | 'connecting' | 'connected' | 'error';
type FilterTab = 'all' | 'queued' | 'uploading' | 'uploaded' | 'failed';

type SessionPhase = 'preparing' | 'ready' | 'active' | 'paused' | 'failed';

interface FtpInfo {
  connected: boolean;
  client_ip: string;
  last_file: string;
}

const BRAND = '#1c5c46';
const WIRED = '#1c5c46';
const WIRELESS = '#2563eb';
const INK = '#172033';
const STORAGE_PREFIX = 'photopro_mobile_upload_';

function groupByBucket(items: UploadItem[]) {
  const groups = new Map<string, UploadItem[]>();
  items.forEach((item) => {
    const d = new Date(item.addedAt);
    const date = `${d.getDate().toString().padStart(2, '0')}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
    const hh = d.getHours().toString().padStart(2, '0');
    const bucket = Math.floor(d.getMinutes() / 30) * 30;
    const mm = bucket.toString().padStart(2, '0');
    const key = `${date} / ${hh}:${mm}`;
    const arr = groups.get(key) ?? [];
    arr.push(item);
    groups.set(key, arr);
  });
  return Array.from(groups.entries()).map(([key, groupedItems]) => ({ key, items: groupedItems }));
}

function splitBucketKey(key: string): { date: string; time: string } {
  const [date, time] = key.split(' / ');
  return { date: date ?? '', time: time ?? '' };
}

function toPhotoCard(item: UploadItem): PhotoCard {
  return {
    id: item.id,
    uri: item.uri,
    name: item.name,
    status: item.status,
    selected: item.selected,
    progress: item.progress,
    media_id: item.media_id,
    size: item.size,
    capturedAt: item.capturedAt,
    addedAt: item.addedAt,
    source: item.source,
  };
}

export default function UploadScreen({ navigation, route }: Props) {
  const { locationId, locationName, connectionMode } = route.params;
  const isWired = connectionMode === 'wired';
  const sourceTone = isWired ? WIRED : WIRELESS;
  const sourceLabel = isWired ? 'OTG (Kết nối trực tiếp)' : 'Không dây (FTP)';

  const {
    files,
    addFiles,
    clearFiles,
    uploading,
    completed,
    total,
    currentFile,
    startUpload,
    cancelUpload,
    toggleSelectFile,
    setAllSelected,
    markMediaUploaded,
  } = useUpload();
  const otg = useOTG();
  const { events: photoEvents } = useStaffStream();

  const [ftpStatus, setFtpStatus] = useState<FtpStatus>('idle');
  const [ftpInfo, setFtpInfo] = useState<FtpInfo | null>(null);
  const [activeLocation, setActiveLocation] = useState<ActiveLocation | null>(null);
  const [locationList, setLocationList] = useState<LocationTag[]>([]);
  const [untaggedCount, setUntaggedCount] = useState(0);
  const [locationPickerVisible, setLocationPickerVisible] = useState(false);
  const [sessionPaused, setSessionPaused] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [errorMessage, setErrorMessage] = useState('');
  const [format, setFormat] = useState<'JPG_HD' | 'JPG' | 'RAW_PNG' | 'RAW_JPG'>('JPG_HD');
  const [mode, setMode] = useState<'manual' | 'auto' | 'burst'>('manual');
  const [slot, setSlot] = useState<'SD' | 'CF' | 'XQD'>('SD');
  const shootDate = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const processedEventsRef = useRef(0);

  // ── Load active FTP location and location list on mount ─────────────────
  useEffect(() => {
    if (isWired) return;
    let active = true;
    const load = async () => {
      try {
        const [locData, locs] = await Promise.all([
          apiJson<ActiveLocation>('/api/v1/staff/active-location'),
          apiJson<LocationTag[]>('/api/v1/admin/tags?tag_type=LOCATION&limit=200'),
        ]);
        if (!active) return;
        setActiveLocation(locData);
        setLocationList(Array.isArray(locs) ? locs : []);
      } catch {
        // ignore — not critical
      }
    };
    void load();
    return () => { active = false; };
  }, [isWired]);

  // ── Poll untagged count every 30s ────────────────────────────────────────
  useEffect(() => {
    if (isWired) return undefined;
    let active = true;
    const fetchCount = async () => {
      try {
        const items = await apiJson<unknown[]>('/api/v1/staff/media/untagged?limit=1');
        if (!active) return;
        setUntaggedCount(Array.isArray(items) ? items.length : 0);
      } catch {
        // ignore
      }
    };
    void fetchCount();
    const timer = setInterval(fetchCount, 30_000);
    return () => { active = false; clearInterval(timer); };
  }, [isWired]);

  const handleSetActiveLocation = useCallback(async (tagId: string | null) => {
    try {
      const result = await apiJson<ActiveLocation>('/api/v1/staff/active-location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag_id: tagId }),
      });
      setActiveLocation(result);
    } catch {
      Alert.alert('Lỗi', 'Không lưu được địa điểm FTP. Thử lại sau.');
    }
    setLocationPickerVisible(false);
  }, []);

  useEffect(() => {
    const load = async () => {
      const f = (await AsyncStorage.getItem(`${STORAGE_PREFIX}format`)) as 'JPG_HD' | 'JPG' | 'RAW_PNG' | 'RAW_JPG' | null;
      const md = (await AsyncStorage.getItem(`${STORAGE_PREFIX}mode`)) as 'manual' | 'auto' | 'burst' | null;
      const sl = (await AsyncStorage.getItem(`${STORAGE_PREFIX}slot`)) as 'SD' | 'CF' | 'XQD' | null;
      if (f) setFormat(f);
      if (md) setMode(md);
      if (sl) setSlot(sl);
    };
    void load();
  }, []);

  const savePreference = useCallback(async (key: string, value: string) => {
    await AsyncStorage.setItem(`${STORAGE_PREFIX}${key}`, value);
  }, []);

  useEffect(() => {
    if (!isWired) {
      otg.stopAutoScan();
      return undefined;
    }

    if (sessionPaused) {
      otg.stopAutoScan();
      return undefined;
    }

    otg.startAutoScan();
    return () => {
      otg.stopAutoScan();
    };
  }, [isWired, otg.startAutoScan, otg.stopAutoScan, sessionPaused]);

  useEffect(() => {
    if (isWired || sessionPaused) {
      return undefined;
    }

    let active = true;
    const fetchStatus = async () => {
      try {
        setFtpStatus('connecting');
        const data = await apiJson<FtpInfo>('/api/v1/staff/ftp/status');
        if (!active) return;
        setFtpInfo(data);
        setFtpStatus(data.connected ? 'connected' : 'idle');
      } catch (_err) {
        if (!active) return;
        setFtpStatus('error');
      }
    };

    void fetchStatus();
    const timer = setInterval(fetchStatus, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [isWired, sessionPaused]);

  useEffect(() => {
    if (!isWired) {
      return;
    }
    if (otg.files.length) {
      addFiles(otg.files);
    }
  }, [addFiles, isWired, otg.files]);

  useEffect(() => {
    if (photoEvents.length === processedEventsRef.current) {
      return;
    }
    for (const event of photoEvents.slice(processedEventsRef.current)) {
      markMediaUploaded(event.media_id);
    }
    processedEventsRef.current = photoEvents.length;
  }, [markMediaUploaded, photoEvents]);

  const metadata = useMemo(() => ({
    location_id: locationId,
    shoot_date: shootDate,
    camera_format: format,
    camera_mode: mode,
    camera_slot: slot,
  }), [format, locationId, mode, shootDate, slot]);

  const statusCounts = useMemo(() => {
    const counts = { all: files.length, queued: 0, uploading: 0, uploaded: 0, failed: 0 };
    files.forEach((item) => {
      if (item.status === 'UNUPLOAD' || item.status === 'CACHED') counts.queued += 1;
      else if (item.status === 'UPLOADING') counts.uploading += 1;
      else if (item.status === 'UPLOADED') counts.uploaded += 1;
      else if (item.status === 'FAILED') counts.failed += 1;
    });
    return counts;
  }, [files]);

  const selectedCount = useMemo(
    () => files.filter((file) => file.selected).length,
    [files],
  );

  const filteredFiles = useMemo(() => {
    return files.filter((item) => {
      switch (filterTab) {
        case 'queued':
          return item.status === 'UNUPLOAD' || item.status === 'CACHED';
        case 'uploading':
          return item.status === 'UPLOADING';
        case 'uploaded':
          return item.status === 'UPLOADED';
        case 'failed':
          return item.status === 'FAILED';
        default:
          return true;
      }
    });
  }, [files, filterTab]);

  const grouped = useMemo(() => groupByBucket(filteredFiles), [filteredFiles]);

  const connectionState = useMemo(() => {
    if (sessionPaused) {
      return {
        label: 'Paused',
        detail: 'Tạm dừng nhận ảnh mới. Queue hiện tại vẫn được giữ nguyên.',
        tone: '#b45309',
        icon: 'pause-circle-outline' as const,
      };
    }

    if (isWired) {
      if (otg.errorMessage) {
        return {
          label: 'Connection Issue',
          detail: otg.errorMessage,
          tone: '#dc2626',
          icon: 'alert-circle-outline' as const,
        };
      }
      if (otg.permissionRequired) {
        return {
          label: 'USB Permission Required',
          detail: 'Cần cấp quyền USB để đọc ảnh trực tiếp từ camera.',
          tone: '#c2410c',
          icon: 'shield-key-outline' as const,
        };
      }
      if (otg.deviceName || otg.files.length > 0) {
        return {
          label: 'Connected',
          detail: otg.deviceName || `${otg.files.length} ảnh đã được nhận từ camera.`,
          tone: WIRED,
          icon: 'usb-port' as const,
        };
      }
      if (otg.scanning) {
        return {
          label: 'Preparing',
          detail: 'Đang quét camera hoặc thiết bị USB qua OTG.',
          tone: '#475569',
          icon: 'progress-clock' as const,
        };
      }
      return {
        label: 'Disconnected',
        detail: 'Cắm camera qua OTG để bắt đầu nhận ảnh.',
        tone: '#475569',
        icon: 'usb-port' as const,
      };
    }

    if (ftpStatus === 'connected') {
      return {
        label: 'Connected',
        detail: ftpInfo?.client_ip ? `Camera đang kết nối từ ${ftpInfo.client_ip}.` : 'Camera đã sẵn sàng gửi ảnh không dây.',
        tone: WIRELESS,
        icon: 'wifi-check' as const,
      };
    }
    if (ftpStatus === 'connecting') {
      return {
        label: 'Preparing',
        detail: 'Đang kiểm tra trạng thái FTP và chờ ảnh đi vào phiên.',
        tone: '#475569',
        icon: 'wifi-refresh' as const,
      };
    }
    if (ftpStatus === 'error') {
      return {
        label: 'Connection Issue',
        detail: 'Không kiểm tra được FTP status. Hãy kiểm tra lại camera và mạng.',
        tone: '#dc2626',
        icon: 'wifi-alert' as const,
      };
    }
    return {
      label: 'Waiting for Photos',
      detail: 'Phiên đang chờ camera gửi ảnh không dây.',
      tone: '#475569',
      icon: 'wifi' as const,
    };
  }, [ftpInfo?.client_ip, ftpStatus, isWired, otg.deviceName, otg.errorMessage, otg.files.length, otg.permissionRequired, otg.scanning, sessionPaused]);

  const sessionPhase = useMemo((): SessionPhase => {
    if (sessionPaused) return 'paused';
    if (connectionState.label === 'Connection Issue') return 'failed';
    if (uploading || statusCounts.uploaded > 0 || statusCounts.uploading > 0) return 'active';
    if (connectionState.label === 'Connected' || connectionState.label === 'Waiting for Photos') return 'ready';
    return 'preparing';
  }, [connectionState.label, sessionPaused, statusCounts.uploaded, statusCounts.uploading, uploading]);

  const phaseCopy = useMemo(() => {
    switch (sessionPhase) {
      case 'paused':
        return { label: 'Tạm dừng', tone: '#b45309' };
      case 'failed':
        return { label: 'Cần kiểm tra', tone: '#dc2626' };
      case 'active':
        return { label: 'Đang hoạt động', tone: sourceTone };
      case 'ready':
        return { label: 'Sẵn sàng', tone: sourceTone };
      default:
        return { label: 'Đang chuẩn bị', tone: '#475569' };
    }
  }, [sessionPhase, sourceTone]);

  const latestActivity = useMemo(() => {
    const lastEvent = photoEvents[photoEvents.length - 1];
    if (errorMessage) return errorMessage;
    if (currentFile) return `Đang upload ${currentFile}`;
    if (uploading) return `Đã hoàn thành ${completed}/${total} ảnh trong queue.`;
    if (lastEvent?.media_id) return `Ảnh ${lastEvent.media_id.slice(0, 8)} đã sẵn sàng trên backend.`;
    if (isWired && otg.newPhotoHandles.size > 0) return `Đã phát hiện ${otg.newPhotoHandles.size} ảnh mới từ camera.`;
    if (!isWired && ftpInfo?.last_file) return `Ảnh mới nhất từ FTP: ${ftpInfo.last_file}`;
    return isWired ? 'Phiên đang chờ ảnh mới từ camera.' : 'Phiên đang chờ ảnh mới từ kết nối wireless.';
  }, [completed, currentFile, errorMessage, ftpInfo?.last_file, isWired, otg.newPhotoHandles.size, photoEvents, total, uploading]);

  const handleViewDetail = useCallback((photo: PhotoCard) => {
    navigation.navigate('ImageDetail', {
      uri: photo.uri,
      name: photo.name,
      size: photo.size,
      status: photo.status,
      capturedAt: photo.capturedAt,
      addedAt: photo.addedAt,
    });
  }, [navigation]);

  const onUploadSingle = useCallback(async (itemId: string) => {
    await startUpload(metadata, [itemId]);
  }, [metadata, startUpload]);

  const onUploadSelected = useCallback(async () => {
    const selectedIds = files.filter((file) => file.selected).map((file) => file.id);
    if (!selectedIds.length) {
      Alert.alert('Chưa chọn ảnh', 'Bật chế độ chọn nhiều rồi chọn ảnh cần upload.');
      return;
    }
    await startUpload(metadata, selectedIds);
  }, [files, metadata, startUpload]);

  const onUploadQueued = useCallback(async () => {
    await startUpload(metadata);
  }, [metadata, startUpload]);

  const retryFailed = useCallback(async () => {
    const failedIds = files.filter((file) => file.status === 'FAILED').map((file) => file.id);
    if (!failedIds.length) {
      Alert.alert('Không có ảnh lỗi', 'Hiện không có ảnh nào cần retry.');
      return;
    }
    await startUpload(metadata, failedIds);
  }, [files, metadata, startUpload]);

  const importBackupFiles = useCallback(async () => {
    try {
      const picked = await pickFilesFromDevice();
      if (picked.length) {
        addFiles(picked);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  }, [addFiles]);

  const handleEndSession = useCallback(() => {
    const hasPending = statusCounts.queued > 0 || statusCounts.uploading > 0 || statusCounts.failed > 0;
    Alert.alert(
      'Kết thúc phiên',
      hasPending
        ? 'Phiên vẫn còn ảnh trong queue hoặc lỗi upload. Bạn vẫn muốn kết thúc?'
        : 'Bạn muốn kết thúc phiên hiện tại?',
      [
        { text: 'Huỷ', style: 'cancel' },
        {
          text: 'Kết thúc',
          style: 'destructive',
          onPress: () => {
            cancelUpload();
            clearFiles();
            otg.clearFiles();
            navigation.reset({
              index: 1,
              routes: [
                { name: 'LocationSelect' },
                { name: 'ConnectionMode', params: { locationId, locationName } },
              ],
            });
          },
        },
      ],
    );
  }, [cancelUpload, clearFiles, locationId, locationName, navigation, otg, statusCounts.failed, statusCounts.queued, statusCounts.uploading]);

  const togglePause = useCallback(() => {
    setSessionPaused((prev) => !prev);
  }, []);

  const counters = [
    { key: 'received', label: 'Nhận được', value: statusCounts.all, tone: '#1f2937', icon: 'image-multiple-outline' },
    { key: 'queued', label: 'Chờ upload', value: statusCounts.queued, tone: '#c2410c', icon: 'clock-outline' },
    { key: 'uploaded', label: 'Đã upload', value: statusCounts.uploaded, tone: sourceTone, icon: 'cloud-check-outline' },
    { key: 'failed', label: 'Lỗi', value: statusCounts.failed, tone: '#dc2626', icon: 'alert-circle-outline' },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={[styles.heroCard, { backgroundColor: isWired ? '#163d31' : '#18356d' }]}>
        <View style={styles.heroTopRow}>
          <View>
            <Text style={styles.heroEyebrow}>THEO DÕI PHIÊN</Text>
            <Text style={styles.heroTitle}>{locationName}</Text>
            <Text style={styles.heroSubtitle}>{sourceLabel} · {phaseCopy.label}</Text>
          </View>
          <View style={[styles.phaseBadge, { backgroundColor: `${phaseCopy.tone}22` }]}>
            <Text style={[styles.phaseBadgeText, { color: phaseCopy.tone }]}>{phaseCopy.label}</Text>
          </View>
        </View>

        <View style={styles.summaryGrid}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Địa điểm</Text>
            <Text style={styles.summaryValue}>{locationName}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Kết nối</Text>
            <Text style={styles.summaryValue}>{sourceLabel}</Text>
          </View>
        </View>
      </View>

      <View style={styles.statusCard}>
        <View style={[styles.statusIconWrap, { backgroundColor: `${connectionState.tone}20` }]}>
          <MaterialCommunityIcons name={connectionState.icon} size={24} color={connectionState.tone} />
        </View>
        <View style={styles.statusCopy}>
          <Text style={styles.statusLabel}>{connectionState.label}</Text>
          <Text style={styles.statusDetail}>{connectionState.detail}</Text>
        </View>
      </View>

      <View style={styles.activityCard}>
        <Text style={styles.activityTitle}>Hoạt động gần đây</Text>
        <Text style={styles.activityText}>{latestActivity}</Text>
        {uploading ? (
          <View style={styles.progressRow}>
            <ActivityIndicator color={sourceTone} size="small" />
            <Text style={styles.progressText}>{completed}/{total} hoàn thành{currentFile ? ` · ${currentFile}` : ''}</Text>
          </View>
        ) : null}
      </View>

      {/* ── FTP location selector (wireless only) ── */}
      {!isWired && (
        <TouchableOpacity
          style={styles.ftpLocationCard}
          onPress={() => setLocationPickerVisible(true)}
          activeOpacity={0.85}
        >
          <View style={styles.ftpLocationRow}>
            <MaterialCommunityIcons name="map-marker-outline" size={20} color="#1a6b4e" />
            <View style={styles.ftpLocationCopy}>
              <Text style={styles.ftpLocationLabel}>Địa điểm FTP</Text>
              <Text style={styles.ftpLocationValue}>
                {activeLocation?.tag_name ?? 'Chưa chọn — ảnh FTP sẽ không có tag'}
              </Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color="#9ca3af" />
          </View>
        </TouchableOpacity>
      )}

      {/* ── Untagged media banner (wireless only) ── */}
      {!isWired && untaggedCount > 0 && (
        <TouchableOpacity
          style={styles.untaggedBanner}
          onPress={() => navigation.navigate('Untagged')}
          activeOpacity={0.85}
        >
          <MaterialCommunityIcons name="tag-off-outline" size={18} color="#b45309" />
          <Text style={styles.untaggedBannerText}>
            {untaggedCount} ảnh chưa có tag địa điểm — Nhấn để gắn tag
          </Text>
          <MaterialCommunityIcons name="chevron-right" size={16} color="#b45309" />
        </TouchableOpacity>
      )}

      {/* ── Location picker modal ── */}
      <Modal
        visible={locationPickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setLocationPickerVisible(false)}
      >
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerSheet}>
            <Text style={styles.pickerTitle}>Chọn địa điểm FTP</Text>
            <Text style={styles.pickerSub}>Ảnh FTP sẽ được tự động gắn vào địa điểm này.</Text>
            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              <TouchableOpacity
                style={[styles.pickerItem, !activeLocation?.tag_id && styles.pickerItemActive]}
                onPress={() => void handleSetActiveLocation(null)}
              >
                <Text style={styles.pickerItemText}>Không chọn</Text>
              </TouchableOpacity>
              {locationList.map((loc) => (
                <TouchableOpacity
                  key={loc.id}
                  style={[styles.pickerItem, activeLocation?.tag_id === loc.id && styles.pickerItemActive]}
                  onPress={() => void handleSetActiveLocation(loc.id)}
                >
                  <Text style={styles.pickerItemText}>
                    {loc.name}{loc.shoot_date ? ` (${loc.shoot_date})` : ''}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.pickerCancel} onPress={() => setLocationPickerVisible(false)}>
              <Text style={styles.pickerCancelText}>Đóng</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <View style={styles.counterGrid}>
        {counters.map((counter) => (
          <View key={counter.key} style={styles.counterCard}>
            <MaterialCommunityIcons name={counter.icon as never} size={18} color={counter.tone} />
            <Text style={styles.counterValue}>{counter.value}</Text>
            <Text style={styles.counterLabel}>{counter.label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.actionRow}>
        <TouchableOpacity style={[styles.actionButton, { backgroundColor: '#fff' }]} onPress={togglePause}>
          <Text style={styles.actionButtonText}>{sessionPaused ? 'Tiếp tục phiên' : 'Tạm dừng phiên'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionButton, { backgroundColor: '#fff' }]} onPress={() => void retryFailed()}>
          <Text style={styles.actionButtonText}>Thử lại ảnh lỗi</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.actionRow}>
        <TouchableOpacity style={[styles.primaryButton, styles.actionStretch]} disabled={!statusCounts.queued || uploading} onPress={() => void onUploadQueued()}>
          <Text style={styles.primaryButtonText}>{uploading ? 'Đang upload...' : 'Upload ảnh trong hàng chờ'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.dangerButton, styles.actionStretch]} onPress={handleEndSession}>
          <Text style={styles.dangerButtonText}>Kết thúc phiên</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.filterRow}>
        {[
          ['all', 'Tất cả', statusCounts.all],
          ['queued', 'Chờ', statusCounts.queued],
          ['uploading', 'Đang', statusCounts.uploading],
          ['uploaded', 'Xong', statusCounts.uploaded],
          ['failed', 'Lỗi', statusCounts.failed],
        ].map(([key, label, count]) => (
          <TouchableOpacity
            key={key}
            style={[styles.filterChip, filterTab === key && styles.filterChipActive]}
            onPress={() => setFilterTab(key as FilterTab)}
          >
            <Text style={[styles.filterChipText, filterTab === key && styles.filterChipTextActive]}>{count}</Text>
            <Text style={[styles.filterChipLabel, filterTab === key && styles.filterChipTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.selectionRow}>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => setSelectionMode((prev) => !prev)}>
          <Text style={styles.secondaryButtonText}>{selectionMode ? 'Xong chọn' : 'Chọn ảnh'}</Text>
        </TouchableOpacity>
        {selectionMode ? (
          <>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => setAllSelected(true)}>
              <Text style={styles.secondaryButtonText}>Chọn tất cả</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => setAllSelected(false)}>
              <Text style={styles.secondaryButtonText}>Bỏ chọn</Text>
            </TouchableOpacity>
          </>
        ) : null}
      </View>

      {selectionMode && selectedCount > 0 ? (
        <TouchableOpacity style={styles.primaryButton} onPress={() => void onUploadSelected()}>
          <Text style={styles.primaryButtonText}>Upload {selectedCount} ảnh đã chọn</Text>
        </TouchableOpacity>
      ) : null}

      <TouchableOpacity style={styles.ghostToggle} onPress={() => setShowAdvanced((prev) => !prev)}>
        <Text style={styles.ghostToggleText}>{showAdvanced ? 'Ẩn advanced tools' : 'Mở advanced tools'}</Text>
      </TouchableOpacity>

      {showAdvanced ? (
        <View style={styles.advancedCard}>
          <Text style={styles.advancedTitle}>Tùy chọn nâng cao</Text>
          <View style={styles.pillsWrap}>
            {['JPG_HD', 'JPG', 'RAW_PNG', 'RAW_JPG'].map((value) => (
              <TouchableOpacity
                key={value}
                onPress={() => {
                  setFormat(value as 'JPG_HD' | 'JPG' | 'RAW_PNG' | 'RAW_JPG');
                  void savePreference('format', value);
                }}
                style={[styles.pill, format === value && styles.pillActive]}
              >
                <Text style={[styles.pillText, format === value && styles.pillTextActive]}>{value}</Text>
              </TouchableOpacity>
            ))}
            {['manual', 'auto', 'burst'].map((value) => (
              <TouchableOpacity
                key={value}
                onPress={() => {
                  setMode(value as 'manual' | 'auto' | 'burst');
                  void savePreference('mode', value);
                }}
                style={[styles.pill, mode === value && styles.pillActive]}
              >
                <Text style={[styles.pillText, mode === value && styles.pillTextActive]}>{value}</Text>
              </TouchableOpacity>
            ))}
            {['SD', 'CF', 'XQD'].map((value) => (
              <TouchableOpacity
                key={value}
                onPress={() => {
                  setSlot(value as 'SD' | 'CF' | 'XQD');
                  void savePreference('slot', value);
                }}
                style={[styles.pill, slot === value && styles.pillActive]}
              >
                <Text style={[styles.pillText, slot === value && styles.pillTextActive]}>{value}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.advancedActions}>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.navigate('LiveAlbum', { locationId, locationName })}>
              <Text style={styles.secondaryButtonText}>Xem album trực tiếp</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => void importBackupFiles()}>
              <Text style={styles.secondaryButtonText}>Nhập file backup</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.reset({ index: 1, routes: [{ name: 'LocationSelect' }, { name: 'ConnectionMode', params: { locationId, locationName } }] })}>
              <Text style={styles.secondaryButtonText}>Đổi kiểu kết nối</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {grouped.length === 0 ? (
        <View style={styles.emptyBoard}>
          <MaterialCommunityIcons name={isWired ? 'usb-port' : 'wifi'} size={28} color={sourceTone} />
          <Text style={styles.emptyTitle}>{isWired ? 'Chờ ảnh từ camera' : 'Chờ ảnh không dây'}</Text>
          <Text style={styles.emptyText}>
            {isWired
              ? 'Khi ảnh đi vào từ OTG, queue sẽ hiện ngay tại đây để bạn theo dõi và upload.'
              : 'Wireless mode đang theo dõi kết nối và trạng thái transfer. Queue cục bộ sẽ hiện khi có file được nhập vào app.'}
          </Text>
        </View>
      ) : (
        <View style={styles.timelineBoard}>
          {grouped.map((group) => {
            const info = splitBucketKey(group.key);
            return (
              <View key={group.key} style={styles.timelineRow}>
                <View style={styles.timelineRail}>
                  <Text style={styles.timelineDate}>{info.date}</Text>
                  <Text style={styles.timelineTime}>{info.time}</Text>
                  <Text style={styles.timelineCount}>{group.items.length} ảnh</Text>
                </View>
                <View style={styles.gridWrap}>
                  <PhotoGrid
                    photos={group.items.map(toPhotoCard)}
                    selectionMode={selectionMode}
                    onToggleSelect={toggleSelectFile}
                    onUploadItem={(id) => void onUploadSingle(id)}
                    onViewDetail={handleViewDetail}
                    numColumns={3}
                    scrollEnabled={false}
                    newPhotoHandles={otg.newPhotoHandles}
                  />
                </View>
              </View>
            );
          })}
        </View>
      )}

      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f1ea' },
  content: { padding: 18, paddingBottom: 36 },
  heroCard: {
    borderRadius: 28,
    padding: 22,
    marginBottom: 16,
  },
  heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  heroEyebrow: { color: '#d7e8df', fontSize: 12, fontWeight: '800', letterSpacing: 1.2 },
  heroTitle: { color: '#fff', fontSize: 29, fontWeight: '800', marginTop: 8 },
  heroSubtitle: { color: '#e4eef4', fontSize: 15, marginTop: 8 },
  phaseBadge: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  phaseBadgeText: { fontSize: 12, fontWeight: '800' },
  summaryGrid: { flexDirection: 'row', gap: 10, marginTop: 18 },
  summaryCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 18,
    padding: 14,
  },
  summaryLabel: { color: '#d8e4de', fontSize: 12, fontWeight: '700' },
  summaryValue: { color: '#fff', fontSize: 16, fontWeight: '800', marginTop: 6 },
  statusCard: {
    backgroundColor: '#fff',
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: '#e4dbcb',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  statusCopy: { flex: 1 },
  statusLabel: { color: INK, fontSize: 18, fontWeight: '800' },
  statusDetail: { color: '#5e6778', fontSize: 14, lineHeight: 21, marginTop: 4 },
  activityCard: {
    backgroundColor: '#fff',
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: '#e4dbcb',
    marginBottom: 12,
  },
  activityTitle: { color: INK, fontSize: 15, fontWeight: '800' },
  activityText: { color: '#526072', fontSize: 14, lineHeight: 21, marginTop: 8 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  progressText: { color: '#344154', fontSize: 13, fontWeight: '700' },
  counterGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  counterCard: {
    width: '47%',
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e4dbcb',
  },
  counterValue: { color: INK, fontSize: 24, fontWeight: '800', marginTop: 12 },
  counterLabel: { color: '#5e6778', fontSize: 13, fontWeight: '700', marginTop: 6 },
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  actionButton: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd3c5',
  },
  actionButtonText: { color: INK, fontWeight: '800', fontSize: 14 },
  actionStretch: { flex: 1 },
  primaryButton: {
    backgroundColor: BRAND,
    borderRadius: 18,
    paddingVertical: 15,
    alignItems: 'center',
  },
  primaryButtonText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  dangerButton: {
    backgroundColor: '#fff1f2',
    borderRadius: 18,
    paddingVertical: 15,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#fecdd3',
  },
  dangerButtonText: { color: '#be123c', fontSize: 15, fontWeight: '800' },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  filterChip: {
    minWidth: 68,
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#ddd3c5',
    alignItems: 'center',
  },
  filterChipActive: { backgroundColor: BRAND, borderColor: BRAND },
  filterChipText: { color: INK, fontSize: 16, fontWeight: '800' },
  filterChipLabel: { color: '#526072', fontSize: 11, marginTop: 2 },
  filterChipTextActive: { color: '#fff' },
  selectionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 },
  secondaryButton: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd3c5',
  },
  secondaryButtonText: { color: INK, fontWeight: '700', fontSize: 13 },
  ghostToggle: { alignSelf: 'flex-start', marginBottom: 10, paddingVertical: 6 },
  ghostToggleText: { color: '#485365', fontWeight: '700', fontSize: 13 },
  advancedCard: {
    backgroundColor: '#fff',
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: '#e4dbcb',
    marginBottom: 12,
  },
  advancedTitle: { color: INK, fontSize: 16, fontWeight: '800', marginBottom: 12 },
  pillsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    borderWidth: 1,
    borderColor: '#d8d1c5',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#faf8f2',
  },
  pillActive: { backgroundColor: BRAND, borderColor: BRAND },
  pillText: { color: '#334155', fontWeight: '700', fontSize: 12 },
  pillTextActive: { color: '#fff' },
  advancedActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 },
  emptyBoard: {
    backgroundColor: '#fff',
    borderRadius: 22,
    paddingVertical: 28,
    paddingHorizontal: 22,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e4dbcb',
  },
  emptyTitle: { color: INK, fontSize: 18, fontWeight: '800', marginTop: 12 },
  emptyText: { color: '#617083', fontSize: 14, lineHeight: 22, textAlign: 'center', marginTop: 8 },
  timelineBoard: { gap: 10 },
  timelineRow: { flexDirection: 'row', alignItems: 'flex-start' },
  timelineRail: { width: 88, paddingTop: 8, paddingRight: 8 },
  timelineDate: { fontSize: 12, color: '#64748b', fontWeight: '700' },
  timelineTime: { fontSize: 22, color: INK, fontWeight: '800', marginTop: 4 },
  timelineCount: { fontSize: 12, color: BRAND, fontWeight: '700', marginTop: 2 },
  gridWrap: { flex: 1, backgroundColor: '#111827', borderRadius: 12, paddingHorizontal: 4, paddingVertical: 4 },
  errorText: { color: '#dc2626', fontSize: 13, marginTop: 10 },
  ftpLocationCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e4dbcb',
    marginBottom: 10,
  },
  ftpLocationRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  ftpLocationCopy: { flex: 1 },
  ftpLocationLabel: { color: '#6b7280', fontSize: 12, fontWeight: '700' },
  ftpLocationValue: { color: INK, fontSize: 14, fontWeight: '700', marginTop: 2 },
  untaggedBanner: {
    backgroundColor: '#fef3c7',
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  untaggedBannerText: { flex: 1, color: '#92400e', fontSize: 13, fontWeight: '700' },
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
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 6,
    backgroundColor: '#f4f1ea',
  },
  pickerItemActive: { backgroundColor: '#d1fae5', borderWidth: 1, borderColor: BRAND },
  pickerItemText: { color: INK, fontSize: 15, fontWeight: '700' },
  pickerCancel: {
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
  },
  pickerCancelText: { color: '#374151', fontWeight: '800', fontSize: 15 },
});
