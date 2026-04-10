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
import * as Clipboard from 'expo-clipboard';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { useOTG } from '../hooks/useOTG';
import { apiJson } from '../services/apiClient';

type Props = NativeStackScreenProps<RootStackParamList, 'CameraConnect'>;

type FtpStatus = 'idle' | 'connecting' | 'connected' | 'error';
type BrandId = 'canon' | 'sony' | 'nikon' | 'fujifilm';

interface FtpCredentials {
  host: string;
  port: number;
  username: string;
  password: string | null;
  passive_mode?: boolean;
  upload_path?: string;
  folder?: string;
  password_note?: string;
}

interface FtpInfo {
  connected: boolean;
  client_ip: string;
  last_file: string;
  last_upload_at?: string;
}

interface BrandGuide {
  id: BrandId;
  name: string;
  steps: (host: string, username: string) => string[];
}

const BRAND_GUIDES: BrandGuide[] = [
  {
    id: 'canon',
    name: 'Canon',
    steps: (host, username) => [
      'Vào Menu → Network Settings → FTP Transfer',
      'Chọn Add Server / Configure FTP Server',
      `Nhập địa chỉ FTP: ${host}`,
      'Port: 21 — PASV Mode: BẬT (Enable)',
      `Tên đăng nhập: ${username}`,
      'Nhập mật khẩu như hiển thị bên trên',
      'Folder đích: / (để trống hoặc nhập /)',
      'OK → bật FTP Transfer → bắt đầu gửi ảnh',
    ],
  },
  {
    id: 'sony',
    name: 'Sony',
    steps: (host, username) => [
      'Menu → Network / Remote → FTP Transfer Function',
      'Server Settings → Server 1',
      `Địa chỉ: ${host}   Port: 21`,
      'PASV Mode: BẬT (ON)',
      `User: ${username}`,
      'Nhập mật khẩu như hiển thị bên trên',
      'Destination Folder: /',
      'OK → FTP Transfer → bật ON',
    ],
  },
  {
    id: 'nikon',
    name: 'Nikon',
    steps: (host, username) => [
      'Menu → Connect to FTP server',
      'Network → Select network → Server',
      `Server Address: ${host}   Port: 21`,
      'PASV Mode: Enable',
      `User ID: ${username}`,
      'Nhập mật khẩu như hiển thị bên trên',
      'Destination Folder: /',
      'OK → bắt đầu upload',
    ],
  },
  {
    id: 'fujifilm',
    name: 'Fujifilm',
    steps: (host, username) => [
      'CONNECTION SETTING → PC AutoSave Settings',
      'Server Type: FTP',
      `FTP Server: ${host}   Port: 21`,
      `User Name: ${username}`,
      'Nhập mật khẩu như hiển thị bên trên',
      'FTP passive mode: ON',
      'Folder: / (để trống)',
      'Save Setting → OK → bắt đầu truyền',
    ],
  },
];

const BRAND_COLOR = '#1c5c46';
const WIRED = '#1c5c46';
const WIRELESS = '#2563eb';
const INK = '#172033';

/** Returns true when the password string is a backend placeholder (not real). */
function isPasswordPlaceholder(pwd: string | null): boolean {
  return !pwd || pwd.startsWith('[***');
}

export default function CameraConnectScreen({ navigation, route }: Props) {
  const { connectionMode, locationId, locationName } = route.params;
  const otg = useOTG();

  const [creds, setCreds] = useState<FtpCredentials | null>(null);
  const [ftpInfo, setFtpInfo] = useState<FtpInfo | null>(null);
  const [ftpStatus, setFtpStatus] = useState<FtpStatus>('idle');
  const [loading, setLoading] = useState(connectionMode === 'wireless');
  const [showPassword, setShowPassword] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [expandedBrand, setExpandedBrand] = useState<BrandId | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copyToClipboard = useCallback(async (value: string, fieldKey: string) => {
    await Clipboard.setStringAsync(value);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    setCopiedField(fieldKey);
    copyTimerRef.current = setTimeout(() => setCopiedField(null), 2000);
  }, []);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const refreshWirelessStatus = useCallback(async () => {
    try {
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
      const data = await apiJson<FtpCredentials>('/api/v1/staff/ftp-credentials');
      setCreds(data);
      await refreshWirelessStatus();
    } catch (err) {
      Alert.alert('Không thể tải cấu hình FTP', err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [refreshWirelessStatus]);

  const handleResetPassword = useCallback(() => {
    Alert.alert(
      'Đổi mật khẩu FTP?',
      'Mật khẩu cũ sẽ bị vô hiệu hóa ngay lập tức. Bạn cần cập nhật lại cấu hình trên máy ảnh.',
      [
        { text: 'Huỷ', style: 'cancel' },
        {
          text: 'Xác nhận đổi',
          style: 'destructive',
          onPress: async () => {
            try {
              setResetting(true);
              const result = await apiJson<{ password: string }>(
                '/api/v1/staff/ftp-credentials/reset',
                { method: 'POST' },
              );
              setCreds((prev) => (prev ? { ...prev, password: result.password } : prev));
              Alert.alert(
                'Mật khẩu đã đặt lại',
                `Mật khẩu mới: ${result.password}\n\nHãy cập nhật lại trên máy ảnh.`,
              );
            } catch (err) {
              Alert.alert('Lỗi', err instanceof Error ? err.message : 'Không thể đặt lại mật khẩu');
            } finally {
              setResetting(false);
            }
          },
        },
      ],
    );
  }, []);

  useEffect(() => {
    if (connectionMode !== 'wired') return undefined;
    otg.startAutoScan();
    return () => otg.stopAutoScan();
  }, [connectionMode, otg.startAutoScan, otg.stopAutoScan]);

  useEffect(() => {
    if (connectionMode !== 'wireless') return undefined;
    void loadCredentials();
    const timer = setInterval(() => void refreshWirelessStatus(), 10000);
    return () => clearInterval(timer);
  }, [connectionMode, loadCredentials, refreshWirelessStatus]);

  const setupState = useMemo(() => {
    if (connectionMode === 'wired') {
      if (Platform.OS !== 'android') {
        return {
          icon: 'alert-octagon-outline' as const,
          tone: '#b45309',
          label: 'Không hỗ trợ',
          detail: 'Chế độ có dây hiện chỉ hỗ trợ Android (OTG/USB camera).',
          ready: false,
        };
      }
      if (otg.errorMessage) {
        return {
          icon: 'alert-circle-outline' as const,
          tone: '#dc2626',
          label: 'Lỗi kết nối',
          detail: otg.errorMessage,
          ready: false,
        };
      }
      if (otg.permissionRequired) {
        return {
          icon: 'shield-key-outline' as const,
          tone: '#c2410c',
          label: 'Cần cấp quyền',
          detail: 'Cần cấp quyền USB để đọc ảnh từ camera.',
          ready: false,
        };
      }
      if (otg.deviceName || otg.files.length > 0) {
        return {
          icon: 'usb-port' as const,
          tone: WIRED,
          label: 'Đã kết nối',
          detail: otg.deviceName || `Phát hiện ${otg.files.length} ảnh từ camera.`,
          ready: true,
        };
      }
      if (otg.scanning) {
        return {
          icon: 'progress-clock' as const,
          tone: '#475569',
          label: 'Đang quét...',
          detail: 'Đang tìm camera hoặc thiết bị USB qua OTG.',
          ready: false,
        };
      }
      return {
        icon: 'usb-port' as const,
        tone: '#475569',
        label: 'Chưa kết nối',
        detail: 'Cắm camera vào điện thoại bằng cáp OTG để bắt đầu.',
        ready: false,
      };
    }

    if (loading) {
      return {
        icon: 'wifi-refresh' as const,
        tone: '#475569',
        label: 'Đang tải...',
        detail: 'Đang tải cấu hình FTP và kiểm tra trạng thái kết nối.',
        ready: false,
      };
    }
    if (ftpStatus === 'connected') {
      return {
        icon: 'wifi-check' as const,
        tone: WIRELESS,
        label: 'Máy ảnh đã kết nối',
        detail: ftpInfo?.client_ip
          ? `IP: ${ftpInfo.client_ip}${ftpInfo.last_file ? ` · File cuối: ${ftpInfo.last_file}` : ''}`
          : 'Camera đang gửi ảnh không dây.',
        ready: true,
      };
    }
    if (ftpStatus === 'error') {
      return {
        icon: 'wifi-alert' as const,
        tone: '#dc2626',
        label: 'Lỗi kiểm tra trạng thái',
        detail: 'Không thể kiểm tra FTP server. Hãy kiểm tra mạng và thử lại.',
        ready: !!creds,
      };
    }
    if (creds) {
      return {
        icon: 'wifi' as const,
        tone: '#475569',
        label: 'Chờ kết nối từ máy ảnh',
        detail: 'Nhập cấu hình FTP bên dưới vào máy ảnh, sau đó bắt đầu gửi ảnh.',
        ready: true,
      };
    }
    return {
      icon: 'wifi-off' as const,
      tone: '#475569',
      label: 'Chưa cấu hình',
      detail: 'Đang tải thông tin FTP, vui lòng chờ.',
      ready: false,
    };
  }, [connectionMode, creds, ftpInfo, ftpStatus, loading, otg.deviceName, otg.errorMessage, otg.files.length, otg.permissionRequired, otg.scanning]);

  const primaryTone = connectionMode === 'wired' ? WIRED : WIRELESS;

  // ─── helper: one credential row with copy button ─────────────────────────
  const renderCredRow = (
    label: string,
    value: string,
    fieldKey: string,
    opts?: { isPassword?: boolean; noIcon?: boolean },
  ) => {
    const isCopied = copiedField === fieldKey;
    const displayValue = opts?.isPassword
      ? (showPassword ? value : '••••••••')
      : value;

    return (
      <View key={fieldKey} style={styles.credRow}>
        <View style={styles.credLeft}>
          <Text style={styles.credLabel}>{label}</Text>
          <Text style={styles.credValue} selectable={!opts?.isPassword}>
            {displayValue}
          </Text>
        </View>
        <View style={styles.credActions}>
          {opts?.isPassword ? (
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => setShowPassword((p) => !p)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialCommunityIcons
                name={showPassword ? 'eye-off' : 'eye'}
                size={18}
                color="#667085"
              />
            </TouchableOpacity>
          ) : null}
          {!opts?.noIcon ? (
            <TouchableOpacity
              style={[styles.iconBtn, isCopied && styles.iconBtnCopied]}
              onPress={() => void copyToClipboard(value, fieldKey)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {isCopied ? (
                <MaterialCommunityIcons name="check" size={16} color="#16a34a" />
              ) : (
                <MaterialCommunityIcons name="content-copy" size={16} color="#667085" />
              )}
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <View style={[styles.heroCard, { backgroundColor: connectionMode === 'wired' ? '#163d31' : '#18356d' }]}>
        <Text style={styles.eyebrow}>THIẾT LẬP PHIÊN CHỤP</Text>
        <Text style={styles.heroTitle}>{locationName}</Text>
        <Text style={styles.heroSubtitle}>
          {connectionMode === 'wired' ? 'Có dây · Kết nối qua OTG/USB' : 'Không dây · Nhận ảnh qua FTP/WiFi'}
        </Text>
      </View>

      {/* ── Status card ──────────────────────────────────────────────── */}
      <View style={styles.statusCard}>
        <View style={[styles.statusIconWrap, { backgroundColor: `${setupState.tone}20` }]}>
          <MaterialCommunityIcons name={setupState.icon} size={24} color={setupState.tone} />
        </View>
        <View style={styles.statusCopy}>
          <Text style={[styles.statusLabel, { color: setupState.tone }]}>{setupState.label}</Text>
          <Text style={styles.statusDetail}>{setupState.detail}</Text>
        </View>
      </View>

      {/* ── Wired mode ───────────────────────────────────────────────── */}
      {connectionMode === 'wired' ? (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>Kết nối có dây (OTG)</Text>
          <View style={styles.stepList}>
            <Text style={styles.stepItem}>1. Cắm cáp OTG vào cổng USB-C/Micro của điện thoại.</Text>
            <Text style={styles.stepItem}>2. Kết nối đầu còn lại vào máy ảnh hoặc card reader.</Text>
            <Text style={styles.stepItem}>3. Cấp quyền USB khi hệ thống yêu cầu.</Text>
            <Text style={styles.stepItem}>4. Khi trạng thái chuyển sang "Đã kết nối", bấm Bắt đầu.</Text>
          </View>
          <View style={styles.rowActions}>
            {otg.permissionRequired ? (
              <TouchableOpacity
                style={[styles.secondaryButton, { borderColor: primaryTone }]}
                onPress={() => otg.startAutoScan()}
              >
                <Text style={[styles.secondaryButtonText, { color: primaryTone }]}>Cấp quyền USB</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={[styles.secondaryButton, { borderColor: primaryTone }]}
              onPress={() => otg.startAutoScan()}
            >
              <Text style={[styles.secondaryButtonText, { color: primaryTone }]}>
                {otg.scanning ? 'Đang quét...' : 'Quét lại'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        /* ── Wireless mode ─────────────────────────────────────────────── */
        <>
          {/* Credentials card */}
          <View style={styles.block}>
            <Text style={styles.blockTitle}>Cấu hình FTP</Text>
            {loading ? (
              <View style={styles.loadingInline}>
                <ActivityIndicator color={primaryTone} />
                <Text style={styles.loadingInlineText}>Đang tải cấu hình...</Text>
              </View>
            ) : creds ? (
              <>
                {renderCredRow('Máy chủ (Server)', creds.host, 'host')}
                {renderCredRow('Cổng (Port)', String(creds.port), 'port')}
                {renderCredRow('Tên đăng nhập', creds.username, 'username')}
                {isPasswordPlaceholder(creds.password)
                  ? (
                    <View style={styles.credRow}>
                      <View style={styles.credLeft}>
                        <Text style={styles.credLabel}>Mật khẩu</Text>
                        <Text style={styles.credValueWarn}>Chưa biết — nhấn "Đổi mật khẩu" để lấy mật khẩu mới</Text>
                      </View>
                    </View>
                  )
                  : renderCredRow('Mật khẩu', creds.password ?? '', 'password', { isPassword: true })
                }
                {renderCredRow('Thư mục (Path)', creds.upload_path ?? creds.folder ?? '/', 'path')}
                <View style={styles.credRow}>
                  <View style={styles.credLeft}>
                    <Text style={styles.credLabel}>Chế độ thụ động</Text>
                    <Text style={styles.credValue}>BẬT (Passive / PASV)</Text>
                  </View>
                </View>

                {/* Reset password button */}
                <TouchableOpacity
                  style={[styles.resetBtn, resetting && styles.resetBtnDisabled]}
                  onPress={handleResetPassword}
                  disabled={resetting}
                >
                  {resetting ? (
                    <ActivityIndicator size="small" color={WIRELESS} style={{ marginRight: 8 }} />
                  ) : (
                    <MaterialCommunityIcons name="refresh" size={16} color={WIRELESS} style={{ marginRight: 6 }} />
                  )}
                  <Text style={styles.resetBtnText}>
                    {resetting ? 'Đang đặt lại...' : 'Đổi mật khẩu FTP'}
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                style={[styles.secondaryButton, { borderColor: primaryTone }]}
                onPress={() => void loadCredentials()}
              >
                <Text style={[styles.secondaryButtonText, { color: primaryTone }]}>Tải lại cấu hình</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Brand guides */}
          <View style={styles.block}>
            <Text style={styles.blockTitle}>Hướng dẫn cài đặt theo hãng</Text>
            <Text style={styles.blockCopy}>
              Chọn hãng máy ảnh để xem hướng dẫn chi tiết cách nhập cấu hình FTP.
            </Text>
            {BRAND_GUIDES.map((guide) => {
              const isOpen = expandedBrand === guide.id;
              const steps = creds
                ? guide.steps(creds.host, creds.username)
                : guide.steps('[host]', '[username]');

              return (
                <View key={guide.id}>
                  <TouchableOpacity
                    style={styles.brandHeader}
                    onPress={() => setExpandedBrand(isOpen ? null : guide.id)}
                    activeOpacity={0.7}
                  >
                    <MaterialCommunityIcons name="camera" size={18} color={INK} />
                    <Text style={styles.brandHeaderText}>{guide.name}</Text>
                    <MaterialCommunityIcons
                      name={isOpen ? 'chevron-up' : 'chevron-down'}
                      size={20}
                      color="#667085"
                    />
                  </TouchableOpacity>
                  {isOpen ? (
                    <View style={styles.brandSteps}>
                      {steps.map((step, i) => (
                        <View key={i} style={styles.brandStep}>
                          <Text style={styles.brandStepNum}>{i + 1}</Text>
                          <Text style={styles.brandStepText}>{step}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        </>
      )}

      {/* ── Diagnostics toggle ───────────────────────────────────────── */}
      <TouchableOpacity style={styles.ghostToggle} onPress={() => setShowAdvanced((prev) => !prev)}>
        <Text style={styles.ghostToggleText}>{showAdvanced ? 'Ẩn chẩn đoán' : 'Xem chẩn đoán'}</Text>
      </TouchableOpacity>

      {showAdvanced ? (
        <View style={styles.diagnosticsCard}>
          <Text style={styles.diagTitle}>Chẩn đoán</Text>
          <Text style={styles.diagLine}>Location ID: {locationId}</Text>
          <Text style={styles.diagLine}>Chế độ: {connectionMode}</Text>
          {connectionMode === 'wired' ? (
            <>
              <Text style={styles.diagLine}>Thiết bị USB: {otg.deviceName || 'Không xác định'}</Text>
              <Text style={styles.diagLine}>Số file phát hiện: {otg.files.length}</Text>
              <Text style={styles.diagLine}>Đang quét: {otg.scanning ? 'Có' : 'Không'}</Text>
            </>
          ) : (
            <>
              <Text style={styles.diagLine}>Trạng thái FTP: {ftpStatus}</Text>
              <Text style={styles.diagLine}>IP client: {ftpInfo?.client_ip || '-'}</Text>
              <Text style={styles.diagLine}>File cuối: {ftpInfo?.last_file || '-'}</Text>
              <Text style={styles.diagLine}>Thời gian: {ftpInfo?.last_upload_at || '-'}</Text>
            </>
          )}
        </View>
      ) : null}

      {/* ── Primary action ───────────────────────────────────────────── */}
      <TouchableOpacity
        style={[styles.primaryButton, !setupState.ready && styles.primaryButtonDisabled]}
        disabled={!setupState.ready}
        onPress={() => navigation.replace('Upload', route.params)}
      >
        <Text style={styles.primaryButtonText}>Bắt đầu phiên chụp</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f1ea' },
  content: { padding: 20, paddingBottom: 36 },

  // Hero
  heroCard: { borderRadius: 28, padding: 22, marginBottom: 18 },
  eyebrow: { color: '#d6e7de', fontSize: 12, fontWeight: '800', letterSpacing: 1.2 },
  heroTitle: { color: '#fff', fontSize: 26, fontWeight: '800', marginTop: 8 },
  heroSubtitle: { color: '#e5edf4', fontSize: 14, lineHeight: 21, marginTop: 8 },

  // Status
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
    flexShrink: 0,
  },
  statusCopy: { flex: 1 },
  statusLabel: { fontSize: 16, fontWeight: '800', color: INK },
  statusDetail: { color: '#5d6677', fontSize: 13, lineHeight: 19, marginTop: 3 },

  // Generic block
  block: {
    backgroundColor: '#fff',
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: '#e4dbcb',
    marginBottom: 14,
  },
  blockTitle: { color: INK, fontSize: 17, fontWeight: '800', marginBottom: 10 },
  blockCopy: { color: '#5d6677', fontSize: 13, lineHeight: 20, marginBottom: 12 },

  // Wired steps
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

  // Credential rows
  credRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee7da',
  },
  credLeft: { flex: 1, marginRight: 8 },
  credLabel: { color: '#667085', fontSize: 11, fontWeight: '700', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 },
  credValue: { color: INK, fontSize: 15, fontWeight: '700' },
  credValueWarn: { color: '#b45309', fontSize: 13, lineHeight: 19, fontWeight: '600' },
  credActions: { flexDirection: 'row', gap: 6, alignItems: 'center', flexShrink: 0 },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#f4f1ea',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnCopied: { backgroundColor: '#dcfce7' },

  // Reset button
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: WIRELESS,
  },
  resetBtnDisabled: { opacity: 0.5 },
  resetBtnText: { color: WIRELESS, fontWeight: '800', fontSize: 14 },

  // Brand guides
  brandHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee7da',
    gap: 8,
  },
  brandHeaderText: { flex: 1, color: INK, fontWeight: '700', fontSize: 15 },
  brandSteps: { paddingBottom: 8, paddingLeft: 4, gap: 6 },
  brandStep: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  brandStepNum: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: BRAND_COLOR,
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 20,
    flexShrink: 0,
    marginTop: 1,
  },
  brandStepText: { flex: 1, color: '#435064', fontSize: 13, lineHeight: 20 },

  // Loading
  loadingInline: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  loadingInlineText: { color: '#5d6677', fontSize: 14 },

  // Diagnostics
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
  diagTitle: { color: INK, fontSize: 15, fontWeight: '800', marginBottom: 6 },
  diagLine: { color: '#4f5c70', fontSize: 13, lineHeight: 20, marginTop: 3 },

  // CTA
  primaryButton: {
    marginTop: 6,
    backgroundColor: BRAND_COLOR,
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButtonDisabled: { backgroundColor: '#a8b6b0' },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
