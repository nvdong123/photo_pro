import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { pickFilesFromDevice } from '../services/otgService';
import { uploadFile } from '../services/uploadService';
import { apiJson, clearToken } from '../services/apiClient';
import UploadProgress from '../components/UploadProgress';

type Props = NativeStackScreenProps<RootStackParamList, 'Upload'>;

const PRIMARY = '#1a6b4e';

interface Location {
  id: string;
  name: string;
  can_upload: boolean;
}

type UploadStep = 'idle' | 'picking' | 'uploading' | 'done';

export default function UploadScreen({ navigation }: Props) {
  const [locations, setLocations] = useState<Location[]>([]);
  const [locLoading, setLocLoading] = useState(false);
  const [selectedLoc, setSelectedLoc] = useState<Location | null>(null);
  const [shootDate] = useState(new Date().toISOString().slice(0, 10));
  const [step, setStep] = useState<UploadStep>('idle');
  const [progress, setProgress] = useState({ completed: 0, total: 0, current: '' });

  const loadLocations = useCallback(async () => {
    setLocLoading(true);
    try {
      const data = await apiJson<Location[]>('/api/v1/admin/auth/my-locations');
      setLocations((Array.isArray(data) ? data : []).filter((l) => l.can_upload));
    } catch (err) {
      Alert.alert('Lỗi', 'Không thể tải danh sách địa điểm: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLocLoading(false);
    }
  }, []);

  useEffect(() => { loadLocations(); }, [loadLocations]);

  const handleLogout = useCallback(() => {
    Alert.alert('Đăng xuất', 'Bạn có chắc muốn đăng xuất?', [
      { text: 'Huỷ', style: 'cancel' },
      {
        text: 'Đăng xuất', style: 'destructive',
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

  const handleUpload = async () => {
    if (!selectedLoc) {
      Alert.alert('Chọn địa điểm', 'Vui lòng chọn địa điểm trước khi upload.');
      return;
    }

    setStep('picking');
    let files;
    try {
      files = await pickFilesFromDevice();
    } catch {
      setStep('idle');
      Alert.alert('Lỗi', 'Không thể chọn file. Kiểm tra quyền truy cập storage.');
      return;
    }

    if (!files.length) {
      setStep('idle');
      return;
    }

    setStep('uploading');
    setProgress({ completed: 0, total: files.length, current: '' });

    const metadata = {
      location_id: selectedLoc.id,
      shoot_date: shootDate,
    };

    let ok = 0;
    let fail = 0;
    for (const f of files) {
      setProgress((p) => ({ ...p, current: f.name }));
      const result = await uploadFile(f.uri, f.name, f.mimeType, metadata);
      if (result.status === 'success') ok++;
      else fail++;
      setProgress((p) => ({ ...p, completed: p.completed + 1 }));
    }

    setStep('done');
    Alert.alert(
      'Hoàn thành',
      `${ok} ảnh upload thành công${fail > 0 ? `, ${fail} lỗi` : ''}.`,
      [{ text: 'OK', onPress: () => setStep('idle') }],
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Địa điểm chụp</Text>

      {locLoading ? (
        <ActivityIndicator color={PRIMARY} />
      ) : locations.length === 0 ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <Text style={{ color: '#9ca3af', fontSize: 13 }}>Chưa có địa điểm nào.</Text>
          <TouchableOpacity onPress={loadLocations}>
            <Text style={{ color: PRIMARY, fontSize: 13 }}>Tải lại</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
          {locations.map((loc) => (
            <TouchableOpacity
              key={loc.id}
              style={[styles.locChip, selectedLoc?.id === loc.id && styles.locChipSelected]}
              onPress={() => setSelectedLoc(loc)}
            >
              <Text style={[styles.locChipText, selectedLoc?.id === loc.id && styles.locChipTextSelected]}>
                {loc.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {step === 'uploading' && (
        <UploadProgress
          completed={progress.completed}
          total={progress.total}
          currentFile={progress.current}
        />
      )}

      <TouchableOpacity
        style={[styles.btn, (!selectedLoc || step === 'uploading') && styles.btnDisabled]}
        onPress={handleUpload}
        disabled={!selectedLoc || step === 'uploading' || step === 'picking'}
      >
        {step === 'uploading' || step === 'picking' ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.btnText}>Chọn Ảnh & Upload</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.btnOutline, { marginTop: 12 }]}
        onPress={() => navigation.navigate('CameraConnect')}
      >
        <Text style={styles.btnOutlineText}>Kết Nối FTP / WiFi</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7fa' },
  content: { padding: 20 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#374151', marginBottom: 10 },
  locChip: {
    paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20,
    borderWidth: 1.5, borderColor: '#e2e5ea', marginRight: 8, backgroundColor: '#fff',
  },
  locChipSelected: { borderColor: PRIMARY, backgroundColor: '#e8f5ef' },
  locChipText: { fontSize: 14, color: '#6b7280' },
  locChipTextSelected: { color: PRIMARY, fontWeight: '700' },
  btn: {
    backgroundColor: PRIMARY, borderRadius: 10,
    padding: 16, alignItems: 'center', marginTop: 20,
  },
  btnDisabled: { backgroundColor: '#9ca3af' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  btnOutline: {
    borderWidth: 1.5, borderColor: PRIMARY, borderRadius: 10,
    padding: 14, alignItems: 'center',
  },
  btnOutlineText: { color: PRIMARY, fontWeight: '600', fontSize: 15 },
});
