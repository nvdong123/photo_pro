import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useUpload } from '../hooks/useUpload';
import { useOTG } from '../hooks/useOTG';
import { pickFilesFromDevice, pickFromGallery } from '../services/otgService';
import { apiJson, clearToken } from '../services/apiClient';
import { useStaffStream } from '../hooks/useSSE';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import type { UploadItem } from '../hooks/useUpload';
import PhotoGrid, { type PhotoCard } from '../components/PhotoGrid';

type Props = NativeStackScreenProps<RootStackParamList, 'Upload'>;

type Method = 'otg' | 'ftp' | 'gallery' | 'card' | null;
type FtpStatus = 'idle' | 'connecting' | 'connected' | 'error';
type FilterTab = 'all' | 'unupload' | 'uploading' | 'uploaded' | 'failed';

type LocationOption = { id: string; name: string; can_upload: boolean };

const PRIMARY = '#3f73f1';
const DARK = '#171717';
const STORAGE_PREFIX = 'photopro_mobile_upload_';

const methodList = [
  { key: 'otg' as Method, title: Platform.OS === 'android' ? 'Camera Wired Connection (OTG)' : 'USB Camera (Android Only)', subtitle: Platform.OS === 'android' ? 'May anh DSLR/Mirrorless - Cap OTG' : 'Chi ho tro Android', icon: 'usb', color: '#22c55e', disabled: Platform.OS !== 'android' },
  { key: 'ftp' as Method, title: 'Camera Wireless Connection (FTP WiFi)', subtitle: 'May anh co chuc nang FTP', icon: 'wifi', color: '#3b82f6', disabled: false },
  { key: 'gallery' as Method, title: 'Smartphone Gallery', subtitle: 'Chon anh tu thu vien dien thoai', icon: 'image-multiple', color: '#8b5cf6', disabled: false },
  { key: 'card' as Method, title: Platform.OS === 'android' ? 'Card Reader / USB Drive' : 'SD Card Reader', subtitle: Platform.OS === 'android' ? 'The nho qua OTG adapter' : 'Doc the nho qua Lightning', icon: 'memory', color: '#0ea5e9', disabled: false },
];

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

export default function UploadScreen({ navigation }: Props) {
  const { files, addFiles, uploading, completed, total, currentFile, startUpload, cancelUpload, toggleSelectFile, setAllSelected, markMediaUploaded } = useUpload();
  const otg = useOTG();
  const { events: photoEvents } = useStaffStream();

  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [locLoading, setLocLoading] = useState(false);
  const [selectedLoc, setSelectedLoc] = useState<{ id: string; name: string } | null>(null);
  const [shootDate] = useState(new Date().toISOString().slice(0, 10));

  const [methodModalVisible, setMethodModalVisible] = useState(false);
  const [locationModalVisible, setLocationModalVisible] = useState(false);
  const [method, setMethod] = useState<Method>(null);
  const [ftpStatus, setFtpStatus] = useState<FtpStatus>('idle');
  const [ftpInfo, setFtpInfo] = useState<{ connected: boolean; client_ip: string; last_file: string } | null>(null);
  const [cameraModel, setCameraModel] = useState('Unknown');
  const [errorMessage, setErrorMessage] = useState('');

  const [format, setFormat] = useState<'JPG_HD' | 'JPG' | 'RAW_PNG' | 'RAW_JPG'>('JPG_HD');
  const [mode, setMode] = useState<'manual' | 'auto' | 'burst'>('manual');
  const [slot, setSlot] = useState<'SD' | 'CF' | 'XQD'>('SD');

  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [selectionMode, setSelectionMode] = useState(true);

  useEffect(() => {
    const load = async () => {
      const m = (await AsyncStorage.getItem(`${STORAGE_PREFIX}method`)) as Method | null;
      const f = (await AsyncStorage.getItem(`${STORAGE_PREFIX}format`)) as 'JPG_HD' | 'JPG' | 'RAW_PNG' | 'RAW_JPG' | null;
      const md = (await AsyncStorage.getItem(`${STORAGE_PREFIX}mode`)) as 'manual' | 'auto' | 'burst' | null;
      const sl = (await AsyncStorage.getItem(`${STORAGE_PREFIX}slot`)) as 'SD' | 'CF' | 'XQD' | null;
      if (m) setMethod(m);
      else if (Platform.OS === 'android') setMethod('otg');
      if (f) setFormat(f);
      if (md) setMode(md);
      if (sl) setSlot(sl);
    };
    void load();
  }, []);

  useEffect(() => {
    if (method !== 'ftp') return;
    let active = true;

    const fetchStatus = async () => {
      try {
        setFtpStatus('connecting');
        const data = await apiJson<{ connected: boolean; client_ip: string; last_file: string }>('/api/v1/staff/ftp/status');
        if (!active) return;
        if (data.connected) {
          setFtpStatus('connected');
          setFtpInfo(data);
        } else {
          setFtpStatus('idle');
          setFtpInfo(data);
        }
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
  }, [method]);

  useEffect(() => {
    if (method === 'otg') {
      otg.startAutoScan();
      setSelectionMode(true);
      return () => {
        otg.stopAutoScan();
      };
    }
    return undefined;
  }, [method, otg.startAutoScan, otg.stopAutoScan]);

  useEffect(() => {
    if (method !== 'otg') {
      return;
    }

    if (otg.files.length) {
      addFiles(otg.files);
      if (cameraModel === 'Unknown') {
        const fn = otg.files[0].name.toLowerCase();
        if (fn.includes('canon')) setCameraModel('Canon');
        else if (fn.includes('nikon')) setCameraModel('Nikon');
        else if (fn.includes('sony')) setCameraModel('Sony');
      }
    }
  }, [method, otg.files, addFiles, cameraModel]);

  useEffect(() => {
    photoEvents.forEach((event) => {
      markMediaUploaded(event.media_id);
    });
  }, [photoEvents, markMediaUploaded]);

  const loadLocations = useCallback(async () => {
    setLocLoading(true);
    try {
      const data = await apiJson<LocationOption[]>('/api/v1/admin/auth/my-locations');
      const nextLocations = (Array.isArray(data) ? data : []).filter((item) => item.can_upload);
      setLocations(nextLocations);
      setSelectedLoc((prev) => {
        if (prev && nextLocations.some((item) => item.id === prev.id)) {
          return prev;
        }
        if (nextLocations[0]) {
          return { id: nextLocations[0].id, name: nextLocations[0].name };
        }
        return null;
      });
    } catch (err) {
      Alert.alert('Lỗi', 'Không thể tải danh sách folder upload: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLocLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLocations();
  }, [loadLocations]);

  const handleLogout = useCallback(() => {
    Alert.alert('Đăng xuất', 'Bạn có chắc muốn đăng xuất?', [
      { text: 'Huỷ', style: 'cancel' },
      {
        text: 'Đăng xuất',
        style: 'destructive',
        onPress: async () => {
          await clearToken();
          navigation.replace('Login');
        },
      },
    ]);
  }, [navigation]);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={handleLogout} style={{ marginRight: 4, padding: 6 }}>
          <Text style={{ color: '#fff', fontSize: 14 }}>Đăng xuất</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, handleLogout]);

  const savePreference = async (key: string, value: string) => {
    await AsyncStorage.setItem(`${STORAGE_PREFIX}${key}`, value);
  };

  const handleMethodConfirm = async () => {
    if (!method) return;

    setMethodModalVisible(false);
    await AsyncStorage.setItem(`${STORAGE_PREFIX}method`, method);

    try {
      if (method === 'otg') {
        otg.startAutoScan();
      } else if (method === 'gallery') {
        const selected = await pickFromGallery();
        if (!selected.length) return;
        addFiles(selected);
      } else if (method === 'card') {
        const selected = await pickFilesFromDevice();
        if (!selected.length) return;
        addFiles(selected);
      } else if (method === 'ftp') {
        navigation.navigate('CameraConnect');
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  };

  const filteredFiles = useMemo(() => {
    return files.filter((item) => {
      switch (filterTab) {
        case 'unupload': return item.status === 'UNUPLOAD';
        case 'uploading': return item.status === 'UPLOADING';
        case 'uploaded': return item.status === 'UPLOADED';
        case 'failed': return item.status === 'FAILED';
        default: return true;
      }
    });
  }, [files, filterTab]);

  const grouped = useMemo(() => groupByBucket(filteredFiles), [filteredFiles]);

  const statusCounts = useMemo(() => {
    const counts = { all: files.length, unupload: 0, uploading: 0, uploaded: 0, failed: 0 };
    files.forEach((item) => {
      if (item.status === 'UNUPLOAD') counts.unupload += 1;
      else if (item.status === 'UPLOADING') counts.uploading += 1;
      else if (item.status === 'UPLOADED') counts.uploaded += 1;
      else if (item.status === 'FAILED') counts.failed += 1;
    });
    return counts;
  }, [files]);

  const onUploadSelected = async () => {
    if (!selectedLoc) {
      Alert.alert('Chọn folder', 'Vui lòng chọn folder upload trước khi upload.');
      return;
    }
    const selectedIds = files.filter((file) => file.selected).map((file) => file.id);
    if (!selectedIds.length) {
      Alert.alert('Chọn ảnh', 'Chưa có ảnh được chọn.');
      return;
    }

    await startUpload({
      location_id: selectedLoc.id,
      shoot_date: shootDate,
      camera_format: format,
      camera_mode: mode,
      camera_slot: slot,
    }, selectedIds);
  };

const onUploadSingle = async (itemId: string) => {
    if (!selectedLoc) {
      Alert.alert('Chọn folder', 'Vui lòng chọn folder upload trước khi upload.');
      return;
    }
    await startUpload({
      location_id: selectedLoc.id,
      shoot_date: shootDate,
      camera_format: format,
      camera_mode: mode,
      camera_slot: slot,
    }, [itemId]);
  };

  const handleViewDetail = (photo: PhotoCard) => {
    navigation.navigate('ImageDetail', {
      uri: photo.uri,
      name: photo.name,
      size: photo.size,
      status: photo.status,
      capturedAt: photo.capturedAt,
      addedAt: photo.addedAt,
    });
  };

  const onRunUpload = async () => {
    if (!selectedLoc) {
      Alert.alert('Chọn folder', 'Vui lòng chọn folder upload trước khi upload.');
      return;
    }
    await startUpload({
      location_id: selectedLoc.id,
      shoot_date: shootDate,
      camera_format: format,
      camera_mode: mode,
      camera_slot: slot,
    });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.topRow}>
        <TouchableOpacity style={styles.folderPicker} onPress={() => setLocationModalVisible(true)}>
          <MaterialCommunityIcons name="folder-outline" size={22} color={PRIMARY} />
          <View style={styles.folderCopy}>
            <Text style={styles.folderLabel}>Folder upload</Text>
            <Text style={styles.folderValue}>{selectedLoc?.name ?? (locLoading ? 'Đang tải folder...' : 'Chọn folder upload')}</Text>
          </View>
          {locLoading ? <ActivityIndicator size="small" color={PRIMARY} /> : <MaterialCommunityIcons name="chevron-down" size={20} color="#475569" />}
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.methodButton} onPress={() => setMethodModalVisible(true)}>
        <Text style={styles.methodButtonText}>{method ? `Phương thức: ${method.toUpperCase()}` : 'Chọn phương thức upload'}</Text>
      </TouchableOpacity>

      <View style={styles.heroCard}>
        <View style={styles.heroBadges}>
          <View style={[styles.heroBadge, method === 'otg' && otg.files.length > 0 ? styles.heroBadgeActive : styles.heroBadgeIdle]}>
            <Text style={styles.heroBadgeTitle}>Connect USB</Text>
            <Text style={styles.heroBadgeSub}>{method === 'otg' ? 'USB' : 'Idle'}</Text>
          </View>
          <View style={[styles.heroBadge, method === 'otg' && otg.files.length > 0 ? styles.heroBadgeActive : styles.heroBadgeIdle]}>
            <Text style={styles.heroBadgeTitle}>{method === 'otg' ? 'Camera: Active' : 'Camera: Idle'}</Text>
            <Text style={styles.heroBadgeSub}>{otg.deviceName || cameraModel}</Text>
          </View>
        </View>

        <Text style={styles.connectionLine}>
          {method === 'otg'
            ? otg.permissionRequired
              ? 'Cần cấp quyền USB để đọc ảnh từ camera'
              : otg.errorMessage
              ? otg.errorMessage
              : otg.scanning
              ? 'Đang scan USB camera...'
              : otg.files.length > 0
              ? 'Connected, waiting for photos transfer'
              : 'Uploader Idle'
            : method === 'ftp'
            ? ftpStatus === 'connected'
              ? `Connected, waiting for photos transfer - ${ftpInfo?.client_ip ?? ''}`
              : ftpStatus === 'connecting'
              ? 'Đang kết nối...'
              : ftpStatus === 'error'
              ? 'Kết nối thất bại - thử lại'
              : 'Uploader Idle'
            : 'Chưa chọn phương thức'}
        </Text>

        {selectedLoc ? <Text style={styles.subStatusText}>Folder: {selectedLoc.name}</Text> : null}
        {otg.files.length > 0 ? <Text style={styles.subStatusText}>Ảnh tìm được: {otg.files.length}</Text> : null}

        <View style={styles.statusActions}>
          {otg.permissionRequired ? (
            <TouchableOpacity style={styles.permissionBtn} onPress={() => otg.startAutoScan()}>
              <Text style={styles.permissionBtnText}>Cấp quyền USB</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => method === 'otg' ? otg.startAutoScan() : setMethodModalVisible(true)}>
            <Text style={styles.secondaryBtnText}>{method === 'otg' ? (otg.scanning ? 'Đang scan...' : 'Quét lại OTG') : 'Đổi phương thức'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {uploading ? (
        <View style={styles.uploadSummary}>
          <Text style={styles.uploadSummaryTitle}>Upload Progress</Text>
          <Text style={styles.uploadSummaryText}>{completed}/{total} completed</Text>
          <Text style={styles.uploadSummaryText}>{currentFile ? `Current: ${currentFile}` : 'Đang chuẩn bị...'}</Text>
        </View>
      ) : null}

      {method && (method === 'otg' || method === 'ftp') && (
        <View style={styles.pills}>
          {['JPG_HD', 'JPG', 'RAW_PNG', 'RAW_JPG'].map((value) => (
            <TouchableOpacity
              key={value}
              onPress={() => { setFormat(value as 'JPG_HD' | 'JPG' | 'RAW_PNG' | 'RAW_JPG'); void savePreference('format', value); }}
              style={[styles.pill, format === value && styles.pillActive]}
            >
              <Text style={[styles.pillText, format === value && styles.pillTextActive]}>{value}</Text>
            </TouchableOpacity>
          ))}
          {['manual', 'auto', 'burst'].map((value) => (
            <TouchableOpacity
              key={value}
              onPress={() => { setMode(value as 'manual' | 'auto' | 'burst'); void savePreference('mode', value); }}
              style={[styles.pill, mode === value && styles.pillActive]}
            >
              <Text style={[styles.pillText, mode === value && styles.pillTextActive]}>{value}</Text>
            </TouchableOpacity>
          ))}
          {['SD', 'CF', 'XQD'].map((value) => (
            <TouchableOpacity
              key={value}
              onPress={() => { setSlot(value as 'SD' | 'CF' | 'XQD'); void savePreference('slot', value); }}
              style={[styles.pill, slot === value && styles.pillActive]}
            >
              <Text style={[styles.pillText, slot === value && styles.pillTextActive]}>{value}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.counterBar}>
        {[['all', 'All'], ['unupload', 'Un-Upload'], ['uploading', 'Uploading'], ['uploaded', 'Uploaded'], ['failed', 'Failed']].map(([key, label]) => (
          <TouchableOpacity key={key} style={[styles.counterChip, filterTab === key && styles.counterChipActive]} onPress={() => setFilterTab(key as FilterTab)}>
            <Text style={[styles.counterText, filterTab === key && styles.counterTextActive]}>{statusCounts[key as keyof typeof statusCounts]}</Text>
            <Text style={[styles.counterCaption, filterTab === key && styles.counterTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.actionBar}>
        <TouchableOpacity style={styles.actionBtn} onPress={() => setSelectionMode((prev) => !prev)}>
          <Text style={styles.actionBtnText}>{selectionMode ? 'HỦY CHỌN' : 'MULTI-SELECT'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtnPrimary} onPress={onRunUpload} disabled={!files.length || uploading}>
          <Text style={styles.actionBtnPrimaryText}>{uploading ? 'Đang upload...' : 'Batch upload'}</Text>
        </TouchableOpacity>
      </View>

      {files.length > 0 ? (
        <View style={styles.selectionActions}>
          <TouchableOpacity style={styles.smallChip} onPress={() => setAllSelected(true)}>
            <Text style={styles.smallChipText}>Chọn tất cả</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.smallChip, styles.smallChipAlt]} onPress={() => setAllSelected(false)}>
            <Text style={[styles.smallChipText, styles.smallChipAltText]}>Bỏ chọn</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {selectionMode ? (
        <Text style={styles.selectionCounter}>{files.filter((file) => file.selected).length} ảnh đã chọn</Text>
      ) : null}

      {!selectedLoc ? (
        <TouchableOpacity style={styles.warningCard} onPress={() => setLocationModalVisible(true)}>
          <MaterialCommunityIcons name="alert-circle-outline" size={18} color="#b45309" />
          <Text style={styles.warningText}>Chưa chọn folder upload. Chạm để chọn.</Text>
        </TouchableOpacity>
      ) : null}

      {grouped.length === 0 ? (
        <View style={styles.emptyBoard}><Text style={styles.emptyText}>Chưa có ảnh</Text></View>
      ) : (
        <View style={styles.timelineBoard}>
          {grouped.map((group) => {
            const info = splitBucketKey(group.key);
            return (
              <View key={group.key} style={styles.timelineRow}>
                <View style={styles.timelineRail}>
                  <Text style={styles.timelineDate}>{info.date}</Text>
                  <Text style={styles.timelineTime}>{info.time}</Text>
                  <Text style={styles.timelineCount}>{group.items.length} pic</Text>
                </View>
                <View style={styles.gridWrap}>
                  <PhotoGrid
                    photos={group.items.map((item) => ({
                      id: item.id,
                      uri: item.uri,
                      name: item.name,
                      status: item.status,
                      selected: item.selected,
                      progress: item.progress,
                      size: item.size,
                      capturedAt: item.capturedAt,
                      addedAt: item.addedAt,
                      source: item.source,
                    }))}
                    selectionMode={selectionMode}
                    onToggleSelect={toggleSelectFile}
                    onUploadItem={onUploadSingle}
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

      {selectionMode && files.some((file) => file.selected) ? (
        <TouchableOpacity style={styles.primaryBtn} onPress={onUploadSelected}>
          <Text style={styles.primaryBtnText}>Upload {files.filter((file) => file.selected).length} ảnh đã chọn</Text>
        </TouchableOpacity>
      ) : null}

      <View style={styles.bottomTools}>
        <TouchableOpacity style={styles.btnOutline} onPress={() => setLocationModalVisible(true)}>
          <Text style={styles.btnOutlineText}>Folder Upload</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnOutline} onPress={() => navigation.navigate('CameraConnect')}>
          <Text style={styles.btnOutlineText}>Kết nối FTP / WiFi</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.btn} onPress={() => cancelUpload()}>
        <Text style={styles.btnText}>Huỷ Upload</Text>
      </TouchableOpacity>

      {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

      {locationModalVisible ? (
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Chọn folder upload</Text>
            {locLoading ? (
              <ActivityIndicator color={PRIMARY} />
            ) : locations.length === 0 ? (
              <View style={styles.emptyModalState}>
                <Text style={styles.methodSub}>Không có folder upload nào khả dụng.</Text>
                <TouchableOpacity style={styles.confirmBtn} onPress={() => void loadLocations()}>
                  <Text style={styles.confirmBtnText}>Tải lại</Text>
                </TouchableOpacity>
              </View>
            ) : locations.map((location) => (
              <TouchableOpacity
                key={location.id}
                style={[styles.methodCard, selectedLoc?.id === location.id && styles.methodCardActive]}
                onPress={() => {
                  setSelectedLoc({ id: location.id, name: location.name });
                  setLocationModalVisible(false);
                }}
              >
                <View style={[styles.methodIcon, { backgroundColor: PRIMARY }]}>
                  <MaterialCommunityIcons name="folder-outline" size={20} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.methodTitle}>{location.name}</Text>
                  <Text style={styles.methodSub}>Folder dùng để upload ảnh</Text>
                </View>
                {selectedLoc?.id === location.id ? <Text style={styles.methodSelected}>✓</Text> : null}
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.confirmBtnAlt} onPress={() => setLocationModalVisible(false)}>
              <Text style={styles.confirmBtnText}>Đóng</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {methodModalVisible ? (
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Chọn phương thức</Text>
            {methodList.map((option) => (
              <TouchableOpacity
                key={option.key}
                style={[styles.methodCard, method === option.key && styles.methodCardActive, option.disabled && styles.methodCardDisabled]}
                onPress={() => !option.disabled && setMethod(option.key)}
                disabled={option.disabled}
              >
                <View style={[styles.methodIcon, { backgroundColor: option.disabled ? '#9ca3af' : option.color }]}>
                  <MaterialCommunityIcons name={option.icon as never} size={20} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.methodTitle, option.disabled && styles.methodTitleDisabled]}>{option.title}</Text>
                  <Text style={styles.methodSub}>{option.subtitle}</Text>
                </View>
                {method === option.key ? <Text style={styles.methodSelected}>✓</Text> : null}
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.confirmBtn} onPress={handleMethodConfirm}>
              <Text style={styles.confirmBtnText}>Xác nhận</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmBtnAlt} onPress={() => setMethodModalVisible(false)}>
              <Text style={styles.confirmBtnText}>Huỷ</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#eef3ff' },
  content: { padding: 14, paddingBottom: 32 },
  topRow: { marginBottom: 10 },
  folderPicker: {
    backgroundColor: '#fff',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#dbe4ff',
  },
  folderCopy: { flex: 1, marginLeft: 10 },
  folderLabel: { fontSize: 12, color: '#64748b', fontWeight: '700' },
  folderValue: { fontSize: 15, color: '#0f172a', fontWeight: '700', marginTop: 1 },
  methodButton: { backgroundColor: PRIMARY, borderRadius: 18, paddingVertical: 14, alignItems: 'center', marginBottom: 12 },
  methodButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  heroCard: { backgroundColor: '#fff', borderRadius: 18, padding: 14, borderWidth: 1, borderColor: '#dbe4ff', marginBottom: 12 },
  heroBadges: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  heroBadge: { flex: 1, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 12 },
  heroBadgeActive: { backgroundColor: '#22c55e' },
  heroBadgeIdle: { backgroundColor: '#e2e8f0' },
  heroBadgeTitle: { color: '#fff', fontSize: 12, fontWeight: '700' },
  heroBadgeSub: { color: '#fff', fontSize: 15, fontWeight: '800', marginTop: 2 },
  connectionLine: { fontSize: 15, color: '#5370d1', fontWeight: '600' },
  subStatusText: { fontSize: 12, color: '#475569', marginTop: 3 },
  statusActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  permissionBtn: { backgroundColor: PRIMARY, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 },
  permissionBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  secondaryBtn: { backgroundColor: '#e8eefc', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 },
  secondaryBtnText: { color: '#1e3a8a', fontWeight: '700', fontSize: 12 },
  uploadSummary: { backgroundColor: '#fff', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#dbe4ff', marginBottom: 12 },
  uploadSummaryTitle: { fontSize: 13, fontWeight: '700', color: '#0f172a', marginBottom: 4 },
  uploadSummaryText: { fontSize: 12, color: '#475569' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 },
  pill: { borderWidth: 1, borderColor: '#d7ddeb', borderRadius: 20, paddingVertical: 7, paddingHorizontal: 11, marginRight: 6, marginBottom: 6, backgroundColor: '#fff' },
  pillActive: { backgroundColor: PRIMARY, borderColor: PRIMARY },
  pillText: { fontSize: 12, color: '#334155', fontWeight: '600' },
  pillTextActive: { color: '#fff' },
  counterBar: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  counterChip: { minWidth: 68, backgroundColor: '#fff', borderRadius: 14, paddingVertical: 8, paddingHorizontal: 10, borderWidth: 1, borderColor: '#d7ddeb', alignItems: 'center' },
  counterChipActive: { backgroundColor: PRIMARY, borderColor: PRIMARY },
  counterText: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  counterCaption: { fontSize: 11, color: '#475569', marginTop: 2 },
  counterTextActive: { color: '#fff' },
  actionBar: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  actionBtn: { flex: 1, backgroundColor: PRIMARY, borderRadius: 22, paddingVertical: 14, alignItems: 'center' },
  actionBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  actionBtnPrimary: { flex: 1, backgroundColor: PRIMARY, borderRadius: 22, paddingVertical: 14, alignItems: 'center' },
  actionBtnPrimaryText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  warningCard: { backgroundColor: '#fff7ed', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#fed7aa', flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  warningText: { color: '#9a3412', fontSize: 12, fontWeight: '600' },
  timelineBoard: { gap: 10 },
  timelineRow: { flexDirection: 'row', alignItems: 'flex-start' },
  timelineRail: { width: 78, paddingTop: 8, paddingRight: 8 },
  timelineDate: { fontSize: 12, color: '#64748b', fontWeight: '700' },
  timelineTime: { fontSize: 22, color: '#0f172a', fontWeight: '800', marginTop: 4 },
  timelineCount: { fontSize: 12, color: PRIMARY, fontWeight: '700', marginTop: 2 },
  gridWrap: { flex: 1, backgroundColor: DARK, borderRadius: 10, paddingHorizontal: 4, paddingVertical: 4 },
  emptyBoard: { backgroundColor: '#fff', borderRadius: 18, paddingVertical: 28, alignItems: 'center', borderWidth: 1, borderColor: '#dbe4ff' },
  emptyText: { color: '#64748b', fontSize: 14 },
  primaryBtn: { backgroundColor: PRIMARY, borderRadius: 18, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  selectionActions: { flexDirection: 'row', gap: 10, marginBottom: 10, flexWrap: 'wrap' },
  smallChip: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 18, backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1' },
  smallChipAlt: { backgroundColor: '#e2e8f0' },
  smallChipText: { color: '#0f172a', fontWeight: '700' },
  smallChipAltText: { color: '#334155' },
  selectionCounter: { color: '#334155', fontSize: 12, marginBottom: 10 },
  bottomTools: { gap: 10, marginTop: 12 },
  btnOutline: { borderWidth: 1.5, borderColor: PRIMARY, borderRadius: 16, paddingVertical: 14, alignItems: 'center', backgroundColor: '#fff' },
  btnOutlineText: { color: PRIMARY, fontWeight: '700', fontSize: 15 },
  btn: { backgroundColor: '#111827', borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginTop: 10 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  error: { color: '#dc2626', marginTop: 10 },
  modalOverlay: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  modalCard: { width: '100%', backgroundColor: '#fff', borderRadius: 18, padding: 16, maxHeight: '84%' },
  modalTitle: { fontSize: 17, fontWeight: '800', marginBottom: 12, color: '#0f172a' },
  methodCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb', padding: 12, marginBottom: 8 },
  methodCardActive: { borderColor: PRIMARY, backgroundColor: '#edf3ff' },
  methodCardDisabled: { opacity: 0.6, backgroundColor: '#f8fafc' },
  methodIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  methodTitle: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  methodTitleDisabled: { color: '#94a3b8' },
  methodSub: { fontSize: 12, color: '#64748b', marginTop: 2 },
  methodSelected: { color: PRIMARY, fontWeight: '800', fontSize: 18 },
  confirmBtn: { backgroundColor: PRIMARY, borderRadius: 14, padding: 12, alignItems: 'center', marginTop: 10 },
  confirmBtnAlt: { backgroundColor: '#94a3b8', borderRadius: 14, padding: 12, alignItems: 'center', marginTop: 8 },
  confirmBtnText: { color: '#fff', fontWeight: '800' },
  emptyModalState: { paddingVertical: 8 },
});
