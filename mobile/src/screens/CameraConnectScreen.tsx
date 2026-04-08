import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { useOTG } from '../hooks/useOTG';
import { apiJson } from '../services/apiClient';

type Props = NativeStackScreenProps<RootStackParamList, 'CameraConnect'>;

type FtpStatus = 'idle' | 'connecting' | 'connected' | 'error';

interface FtpCredentials {
  host: string;
  port: number;
  username: string;
  password: string | null;
  folder: string;
  password_note?: string;
}

interface FtpInfo {
  connected: boolean;
  client_ip: string;
  last_file: string;
}

const BRAND = '#1c5c46';
const WIRED = '#1c5c46';
const WIRELESS = '#2563eb';
const INK = '#172033';

export default function CameraConnectScreen({ navigation, route }: Props) {
  const { connectionMode, locationId, locationName } = route.params;
  const otg = useOTG();

  const [creds, setCreds] = useState<FtpCredentials | null>(null);
  const [ftpInfo, setFtpInfo] = useState<FtpInfo | null>(null);
  const [ftpStatus, setFtpStatus] = useState<FtpStatus>('idle');
  const [loading, setLoading] = useState(connectionMode === 'wireless');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const refreshWirelessStatus = useCallback(async () => {
    try {
      setFtpStatus('connecting');
      const data = await apiJson<FtpInfo>('/api/v1/staff/ftp/status');
      setFtpInfo(data);
      setFtpStatus(data.connected ? 'connected' : 'idle');
    } catch (_err) {
      setFtpStatus('error');
    }
  }, []);

  const loadCredentials = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiJson<FtpCredentials>('/api/v1/admin/staff/me/ftp-credentials');
      setCreds(data);
      await refreshWirelessStatus();
    } catch (err) {
      Alert.alert('Không thể tải cấu hình FTP', err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [refreshWirelessStatus]);

  useEffect(() => {
    if (connectionMode !== 'wired') {
      return undefined;
    }
    otg.startAutoScan();
    return () => {
      otg.stopAutoScan();
    };
  }, [connectionMode, otg]);

  useEffect(() => {
    if (connectionMode !== 'wireless') {
      return undefined;
    }

    void loadCredentials();
    const timer = setInterval(() => {
      void refreshWirelessStatus();
    }, 5000);
    return () => clearInterval(timer);
  }, [connectionMode, loadCredentials, refreshWirelessStatus]);

  const setupState = useMemo(() => {
    if (connectionMode === 'wired') {
      if (Platform.OS !== 'android') {
        return {
          icon: 'alert-octagon-outline' as const,
          tone: '#b45309',
          label: 'Unsupported',
          detail: 'Wired mode hiện chỉ hỗ trợ Android cho OTG/USB camera.',
          ready: false,
        };
      }
      if (otg.errorMessage) {
        return {
          icon: 'alert-circle-outline' as const,
          tone: '#dc2626',
          label: 'Error',
          detail: otg.errorMessage,
          ready: false,
        };
      }
      if (otg.permissionRequired) {
        return {
          icon: 'shield-key-outline' as const,
          tone: '#c2410c',
          label: 'Requesting Permission',
          detail: 'Cần cấp quyền USB để đọc ảnh từ camera.',
          ready: false,
        };
      }
      if (otg.deviceName || otg.files.length > 0) {
        return {
          icon: 'usb-port' as const,
          tone: WIRED,
          label: 'Connected',
          detail: otg.deviceName || `${otg.files.length} ảnh đã được phát hiện từ camera.`,
          ready: true,
        };
      }
      if (otg.scanning) {
        return {
          icon: 'progress-clock' as const,
          tone: '#475569',
          label: 'Preparing',
          detail: 'Đang quét camera hoặc thiết bị USB qua OTG.',
          ready: false,
        };
      }
      return {
        icon: 'usb-port' as const,
        tone: '#475569',
        label: 'Disconnected',
        detail: 'Cắm camera vào điện thoại bằng cáp OTG để bắt đầu.',
        ready: false,
      };
    }

    if (loading) {
      return {
        icon: 'wifi-refresh' as const,
        tone: '#475569',
        label: 'Preparing',
        detail: 'Đang tải thông tin FTP và trạng thái kết nối.',
        ready: false,
      };
    }
    if (ftpStatus === 'connected') {
      return {
        icon: 'wifi-check' as const,
        tone: WIRELESS,
        label: 'Connected',
        detail: ftpInfo?.client_ip ? `Camera đang kết nối từ ${ftpInfo.client_ip}.` : 'Camera đã sẵn sàng gửi ảnh không dây.',
        ready: true,
      };
    }
    if (ftpStatus === 'error') {
      return {
        icon: 'wifi-alert' as const,
        tone: '#dc2626',
        label: 'Connection Issue',
        detail: 'Chưa kiểm tra được trạng thái FTP. Hãy kiểm tra lại cấu hình mạng và camera.',
        ready: !!creds,
      };
    }
    if (creds) {
      return {
        icon: 'wifi' as const,
        tone: '#475569',
        label: 'Waiting for Photos',
        detail: 'Nhập cấu hình FTP vào camera rồi bắt đầu gửi ảnh không dây.',
        ready: true,
      };
    }
    return {
      icon: 'wifi-off' as const,
      tone: '#475569',
      label: 'Setup Required',
      detail: 'Cần tải cấu hình FTP trước khi bắt đầu phiên.',
      ready: false,
    };
  }, [connectionMode, creds, ftpInfo?.client_ip, ftpStatus, loading, otg.deviceName, otg.errorMessage, otg.files.length, otg.permissionRequired, otg.scanning]);

  const primaryTone = connectionMode === 'wired' ? WIRED : WIRELESS;
  const modeTitle = connectionMode === 'wired' ? 'Wired' : 'Wireless';
  const modeSubtitle = connectionMode === 'wired' ? 'Connect camera via cable' : 'Receive photos wirelessly';

  const ftpRows = creds
    ? [
        { label: 'Host', value: creds.host },
        { label: 'Port', value: String(creds.port) },
        { label: 'Username', value: creds.username },
        { label: 'Password', value: creds.password ?? '(ẩn, dùng mật khẩu mới nhất đã cấp)' },
        { label: 'Folder', value: creds.folder },
      ]
    : [];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={[styles.heroCard, { backgroundColor: connectionMode === 'wired' ? '#163d31' : '#18356d' }]}>
        <Text style={styles.eyebrow}>SETUP SESSION</Text>
        <Text style={styles.heroTitle}>{locationName}</Text>
        <Text style={styles.heroSubtitle}>{modeTitle} · {modeSubtitle}</Text>
      </View>

      <View style={styles.statusCard}>
        <View style={[styles.statusIconWrap, { backgroundColor: `${setupState.tone}20` }]}>
          <MaterialCommunityIcons name={setupState.icon} size={24} color={setupState.tone} />
        </View>
        <View style={styles.statusCopy}>
          <Text style={styles.statusLabel}>{setupState.label}</Text>
          <Text style={styles.statusDetail}>{setupState.detail}</Text>
        </View>
      </View>

      {connectionMode === 'wired' ? (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>Wired Setup</Text>
          <View style={styles.stepList}>
            <Text style={styles.stepItem}>1. Cắm cáp OTG vào điện thoại Android.</Text>
            <Text style={styles.stepItem}>2. Kết nối đầu còn lại với máy ảnh hoặc card reader.</Text>
            <Text style={styles.stepItem}>3. Cấp quyền USB nếu hệ thống yêu cầu.</Text>
            <Text style={styles.stepItem}>4. Khi trạng thái chuyển sang Connected, bấm Start Session.</Text>
          </View>
          <View style={styles.rowActions}>
            {otg.permissionRequired ? (
              <TouchableOpacity style={[styles.secondaryButton, { borderColor: primaryTone }]} onPress={() => otg.startAutoScan()}>
                <Text style={[styles.secondaryButtonText, { color: primaryTone }]}>Cấp quyền USB</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={[styles.secondaryButton, { borderColor: primaryTone }]} onPress={() => otg.startAutoScan()}>
              <Text style={[styles.secondaryButtonText, { color: primaryTone }]}>{otg.scanning ? 'Đang quét...' : 'Quét lại'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>Wireless Setup</Text>
          {loading ? (
            <View style={styles.loadingInline}>
              <ActivityIndicator color={primaryTone} />
              <Text style={styles.loadingInlineText}>Đang tải cấu hình FTP...</Text>
            </View>
          ) : (
            <>
              <Text style={styles.blockCopy}>Nhập các thông số này vào cấu hình FTP/WiFi trên máy ảnh. Sau đó bắt đầu gửi ảnh vào location hiện tại.</Text>
              {ftpRows.map((row) => (
                <View key={row.label} style={styles.ftpRow}>
                  <Text style={styles.ftpLabel}>{row.label}</Text>
                  <Text style={styles.ftpValue} selectable>{row.value}</Text>
                </View>
              ))}
              {creds?.password_note ? <Text style={styles.ftpNote}>{creds.password_note}</Text> : null}
              <TouchableOpacity style={[styles.secondaryButton, { borderColor: primaryTone }]} onPress={() => void loadCredentials()}>
                <Text style={[styles.secondaryButtonText, { color: primaryTone }]}>Làm mới trạng thái</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      <TouchableOpacity style={styles.ghostToggle} onPress={() => setShowAdvanced((prev) => !prev)}>
        <Text style={styles.ghostToggleText}>{showAdvanced ? 'Ẩn chẩn đoán' : 'Mở chẩn đoán'}</Text>
      </TouchableOpacity>

      {showAdvanced ? (
        <View style={styles.diagnosticsCard}>
          <Text style={styles.blockTitle}>Diagnostics</Text>
          <Text style={styles.diagLine}>Location ID: {locationId}</Text>
          <Text style={styles.diagLine}>Connection mode: {connectionMode}</Text>
          {connectionMode === 'wired' ? (
            <>
              <Text style={styles.diagLine}>USB device: {otg.deviceName || 'Unknown'}</Text>
              <Text style={styles.diagLine}>Detected files: {otg.files.length}</Text>
              <Text style={styles.diagLine}>Scanning: {otg.scanning ? 'Yes' : 'No'}</Text>
            </>
          ) : (
            <>
              <Text style={styles.diagLine}>FTP status: {ftpStatus}</Text>
              <Text style={styles.diagLine}>Client IP: {ftpInfo?.client_ip || '-'}</Text>
              <Text style={styles.diagLine}>Last file: {ftpInfo?.last_file || '-'}</Text>
            </>
          )}
        </View>
      ) : null}

      <TouchableOpacity
        style={[styles.primaryButton, !setupState.ready && styles.primaryButtonDisabled]}
        disabled={!setupState.ready}
        onPress={() => navigation.replace('Upload', route.params)}
      >
        <Text style={styles.primaryButtonText}>Start Session</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f1ea' },
  content: { padding: 20, paddingBottom: 36 },
  heroCard: {
    borderRadius: 28,
    padding: 22,
    marginBottom: 18,
  },
  eyebrow: { color: '#d6e7de', fontSize: 12, fontWeight: '800', letterSpacing: 1.2 },
  heroTitle: { color: '#fff', fontSize: 28, fontWeight: '800', marginTop: 8 },
  heroSubtitle: { color: '#e5edf4', fontSize: 15, lineHeight: 22, marginTop: 10 },
  statusCard: {
    backgroundColor: '#fff',
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: '#e4dbcb',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
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
  statusDetail: { color: '#5d6677', fontSize: 14, lineHeight: 21, marginTop: 4 },
  block: {
    backgroundColor: '#fff',
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: '#e4dbcb',
    marginBottom: 14,
  },
  blockTitle: { color: INK, fontSize: 17, fontWeight: '800', marginBottom: 10 },
  blockCopy: { color: '#5d6677', fontSize: 14, lineHeight: 21, marginBottom: 14 },
  stepList: { gap: 8 },
  stepItem: { color: '#435064', fontSize: 14, lineHeight: 21 },
  rowActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 },
  secondaryButton: {
    borderWidth: 1.5,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    alignSelf: 'flex-start',
  },
  secondaryButtonText: { fontWeight: '800', fontSize: 14 },
  ftpRow: {
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee7da',
  },
  ftpLabel: { color: '#667085', fontSize: 12, fontWeight: '700', marginBottom: 4 },
  ftpValue: { color: INK, fontSize: 15, fontWeight: '700' },
  ftpNote: { color: '#7c5e28', fontSize: 13, lineHeight: 19, marginTop: 12 },
  loadingInline: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  loadingInlineText: { color: '#5d6677', fontSize: 14 },
  ghostToggle: { alignSelf: 'flex-start', marginBottom: 10, paddingVertical: 6 },
  ghostToggleText: { color: '#485365', fontWeight: '700', fontSize: 13 },
  diagnosticsCard: {
    backgroundColor: '#f9f6ef',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e4dbcb',
    marginBottom: 14,
  },
  diagLine: { color: '#4f5c70', fontSize: 13, lineHeight: 20, marginTop: 4 },
  primaryButton: {
    marginTop: 6,
    backgroundColor: BRAND,
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButtonDisabled: { backgroundColor: '#a8b6b0' },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
