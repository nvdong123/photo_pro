import { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Clipboard, Alert,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { apiJson } from '../services/apiClient';

type Props = NativeStackScreenProps<RootStackParamList, 'CameraConnect'>;

interface FtpCredentials {
  host: string;
  port: number;
  username: string;
  password: string | null;
  folder: string;
  password_note?: string;
}

export default function CameraConnectScreen(_: Props) {
  const [creds, setCreds] = useState<FtpCredentials | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await apiJson<FtpCredentials>('/api/v1/admin/staff/me/ftp-credentials');
        setCreds(data);
      } catch (err) {
        Alert.alert('Lỗi', 'Không thể tải thông tin FTP: ' + (err instanceof Error ? err.message : String(err)));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const copyField = (value: string, label: string) => {
    Clipboard.setString(value);
    Alert.alert('Đã sao chép', `${label}: ${value}`);
  };

  if (loading) {
    return <View style={styles.center}><Text>Đang tải...</Text></View>;
  }

  if (!creds) {
    return <View style={styles.center}><Text>Không thể tải thông tin FTP.</Text></View>;
  }

  const rows: Array<{ label: string; value: string }> = [
    { label: 'Host', value: creds.host },
    { label: 'Port', value: String(creds.port) },
    { label: 'Username', value: creds.username },
    { label: 'Password', value: creds.password ?? '(ẩn — dùng nút Reset để xem mật khẩu mới)' },
    { label: 'Folder', value: creds.folder },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Thông tin FTP</Text>
      <Text style={styles.hint}>Nhập các thông số này vào hệ thống WiFi FTP của máy ảnh.</Text>

      {rows.map((r) => (
        <TouchableOpacity
          key={r.label}
          style={styles.row}
          onPress={() => copyField(r.value, r.label)}
          activeOpacity={0.7}
        >
          <Text style={styles.rowLabel}>{r.label}</Text>
          <Text style={styles.rowValue}>{r.value}</Text>
          <Text style={styles.copyHint}>Nhấn để sao chép</Text>
        </TouchableOpacity>
      ))}

      <Text style={[styles.sectionTitle, { marginTop: 24 }]}>OTG / USB (Android)</Text>
      <Text style={styles.hint}>
        1. Cắm cáp OTG vào điện thoại Android.{'\n'}
        2. Cắm đầu kia vào máy ảnh.{'\n'}
        3. Khi thiết bị được nhận → quay lại màn hình Upload và chọn ảnh.{'\n'}
        4. iOS không hỗ trợ OTG — dùng FTP WiFi thay thế.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7fa' },
  content: { padding: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#374151', marginBottom: 8 },
  hint: { fontSize: 13, color: '#6b7280', marginBottom: 14, lineHeight: 20 },
  row: {
    backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: '#e2e5ea',
  },
  rowLabel: { fontSize: 12, color: '#9ca3af', marginBottom: 2, fontWeight: '600' },
  rowValue: { fontSize: 16, color: '#111827', fontWeight: '600' },
  copyHint: { fontSize: 11, color: '#1a6b4e', marginTop: 4 },
});
