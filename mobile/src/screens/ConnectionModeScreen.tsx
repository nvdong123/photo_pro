import { useMemo, useState } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ConnectionMode, RootStackParamList } from '../../App';

type Props = NativeStackScreenProps<RootStackParamList, 'ConnectionMode'>;

const BRAND = '#1c5c46';
const INK = '#172033';

const modeOptions: Array<{
  key: ConnectionMode;
  title: string;
  subtitle: string;
  detail: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  color: string;
  disabled?: boolean;
}> = [
  {
    key: 'wired',
    title: 'Wired',
    subtitle: 'Connect camera via cable',
    detail: 'Phù hợp khi cần kết nối ổn định bằng OTG và lấy ảnh trực tiếp từ máy ảnh.',
    icon: 'usb-port',
    color: '#1c5c46',
    disabled: Platform.OS !== 'android',
  },
  {
    key: 'wireless',
    title: 'Wireless',
    subtitle: 'Receive photos wirelessly',
    detail: 'Dùng FTP/WiFi để nhận ảnh không dây và theo dõi trạng thái ngay trong phiên chụp.',
    icon: 'wifi',
    color: '#2563eb',
  },
];

export default function ConnectionModeScreen({ navigation, route }: Props) {
  const { locationId, locationName } = route.params;
  const [selectedMode, setSelectedMode] = useState<ConnectionMode>('wired');

  const selectedOption = useMemo(
    () => modeOptions.find((option) => option.key === selectedMode) ?? modeOptions[0],
    [selectedMode],
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.locationCard}>
        <Text style={styles.locationLabel}>ACTIVE LOCATION</Text>
        <Text style={styles.locationName}>{locationName}</Text>
        <Text style={styles.locationHint}>Chọn connector mode trước khi bắt đầu phiên tác nghiệp.</Text>
      </View>

      <Text style={styles.sectionTitle}>Choose Connection</Text>
      <Text style={styles.sectionCopy}>
        Wired và Wireless chỉ khác phần setup. Sau khi vào phiên, cả hai sẽ dùng chung queue và upload monitor.
      </Text>

      <View style={styles.cardStack}>
        {modeOptions.map((option) => {
          const active = option.key === selectedMode;
          return (
            <TouchableOpacity
              key={option.key}
              style={[styles.modeCard, active && styles.modeCardActive, option.disabled && styles.modeCardDisabled]}
              onPress={() => !option.disabled && setSelectedMode(option.key)}
              disabled={option.disabled}
              activeOpacity={0.9}
            >
              <View style={[styles.modeIcon, { backgroundColor: option.disabled ? '#cbd5e1' : option.color }]}>
                <MaterialCommunityIcons name={option.icon} size={22} color="#fff" />
              </View>
              <View style={styles.modeCopy}>
                <Text style={styles.modeTitle}>{option.title}</Text>
                <Text style={styles.modeSubtitle}>{option.subtitle}</Text>
                <Text style={styles.modeDetail}>{option.disabled ? 'Wired hiện chỉ hỗ trợ Android.' : option.detail}</Text>
              </View>
              <View style={[styles.radioOuter, active && styles.radioOuterActive]}>
                {active ? <View style={styles.radioInner} /> : null}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.footerCard}>
        <Text style={styles.footerTitle}>{selectedOption.title}</Text>
        <Text style={styles.footerText}>{selectedOption.detail}</Text>
      </View>

      <TouchableOpacity
        style={[styles.primaryButton, selectedOption.disabled && styles.primaryButtonDisabled]}
        disabled={!!selectedOption.disabled}
        onPress={() => navigation.navigate('CameraConnect', {
          locationId,
          locationName,
          connectionMode: selectedMode,
        })}
      >
        <Text style={styles.primaryButtonText}>Continue</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.goBack()}>
        <Text style={styles.secondaryButtonText}>Đổi location</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f1ea' },
  content: { padding: 20, paddingBottom: 36 },
  locationCard: {
    backgroundColor: '#163d31',
    borderRadius: 28,
    padding: 22,
    marginBottom: 20,
  },
  locationLabel: { color: '#b6d7c8', fontSize: 12, fontWeight: '800', letterSpacing: 1.2 },
  locationName: { color: '#fff', fontSize: 28, fontWeight: '800', marginTop: 8 },
  locationHint: { color: '#dce8e2', fontSize: 14, lineHeight: 21, marginTop: 10 },
  sectionTitle: { color: INK, fontSize: 22, fontWeight: '800' },
  sectionCopy: { color: '#596274', fontSize: 14, lineHeight: 21, marginTop: 8, marginBottom: 16 },
  cardStack: { gap: 12 },
  modeCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: '#e4dbcb',
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  modeCardActive: { borderColor: BRAND, backgroundColor: '#eef7f2' },
  modeCardDisabled: { opacity: 0.7 },
  modeIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  modeCopy: { flex: 1 },
  modeTitle: { color: INK, fontSize: 18, fontWeight: '800' },
  modeSubtitle: { color: '#2f4458', fontSize: 14, fontWeight: '700', marginTop: 4 },
  modeDetail: { color: '#6a7282', fontSize: 13, lineHeight: 20, marginTop: 8 },
  radioOuter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#bbc3d1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterActive: { borderColor: BRAND },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: BRAND },
  footerCard: {
    marginTop: 18,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e4dbcb',
  },
  footerTitle: { color: INK, fontSize: 16, fontWeight: '800' },
  footerText: { color: '#5b6577', fontSize: 14, lineHeight: 21, marginTop: 6 },
  primaryButton: {
    marginTop: 18,
    backgroundColor: BRAND,
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButtonDisabled: { backgroundColor: '#a8b6b0' },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  secondaryButton: {
    marginTop: 10,
    borderRadius: 18,
    paddingVertical: 15,
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d7d1c4',
  },
  secondaryButtonText: { color: INK, fontSize: 15, fontWeight: '700' },
});
