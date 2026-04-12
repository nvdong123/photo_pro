/**
 * UploadQualitySheet — bottom sheet for selecting upload quality / format.
 */
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { UploadMetadata } from '../services/uploadService';

type CameraFormat = NonNullable<UploadMetadata['camera_format']>;

interface FormatOption {
  value: CameraFormat;
  label: string;
  desc: string;
  iconName: string;
  color: string;
  bg: string;
}

const FORMAT_OPTIONS: FormatOption[] = [
  {
    value: 'JPG_HD',
    label: 'JPG chat luong cao',
    desc: 'Full resolution JPEG, toi uu cho luu tru va chia se',
    iconName: 'image-outline',
    color: '#16a34a',
    bg: '#dcfce7',
  },
  {
    value: 'JPG',
    label: 'JPG tieu chuan',
    desc: 'JPEG kich thuoc giam, upload nhanh hon',
    iconName: 'image',
    color: '#2563eb',
    bg: '#dbeafe',
  },
  {
    value: 'RAW_JPG',
    label: 'RAW + JPG',
    desc: 'Upload ca 2 dinh dang (neu may anh ho tro dual slot)',
    iconName: 'layers-outline',
    color: '#7c3aed',
    bg: '#ede9fe',
  },
  {
    value: 'RAW_PNG',
    label: 'RAW nguyen ban',
    desc: 'File lon, giu nguyen chat luong goc hoan toan',
    iconName: 'raw',
    color: '#c2410c',
    bg: '#ffedd5',
  },
];

interface Props {
  visible: boolean;
  current: CameraFormat;
  onChange: (format: CameraFormat) => void;
  onClose: () => void;
}

export default function UploadQualitySheet({ visible, current, onChange, onClose }: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.title}>Dinh dang upload</Text>
        <Text style={styles.subtitle}>Chon dinh dang anh se upload len server</Text>

        <View style={styles.options}>
          {FORMAT_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.optionRow, current === opt.value && styles.optionRowActive]}
              onPress={() => { onChange(opt.value); onClose(); }}
            >
              <View style={[styles.optionIcon, { backgroundColor: opt.bg }]}>
                <MaterialCommunityIcons name={opt.iconName as any} size={22} color={opt.color} />
              </View>
              <View style={styles.optionText}>
                <Text style={[styles.optionLabel, current === opt.value && styles.optionLabelActive]}>
                  {opt.label}
                </Text>
                <Text style={styles.optionDesc}>{opt.desc}</Text>
              </View>
              {current === opt.value && (
                <MaterialCommunityIcons name="check-circle" size={20} color="#1c5c46" />
              )}
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
          <Text style={styles.cancelText}>Dong</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 32,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#e2e8f0',
    marginBottom: 16,
  },
  title: { fontSize: 17, fontWeight: '700', color: '#172033', marginBottom: 4 },
  subtitle: { fontSize: 13, color: '#64748b', marginBottom: 20 },
  options: { gap: 10, marginBottom: 20 },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 14,
    gap: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  optionRowActive: { borderColor: '#1c5c46', backgroundColor: '#f0fdf4' },
  optionIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: { flex: 1 },
  optionLabel: { fontSize: 15, fontWeight: '600', color: '#172033' },
  optionLabelActive: { color: '#1c5c46' },
  optionDesc: { fontSize: 12, color: '#64748b', marginTop: 2 },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
  },
  cancelText: { fontSize: 15, fontWeight: '600', color: '#64748b' },
});
