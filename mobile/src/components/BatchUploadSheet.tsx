/**
 * BatchUploadSheet — bottom sheet for confirming and starting a batch MTP upload.
 */
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface Props {
  visible: boolean;
  selectedCount: number;
  totalPending: number;
  onClose: () => void;
  onUploadSelected: () => void;
  onUploadAll: () => void;
}

export default function BatchUploadSheet({
  visible,
  selectedCount,
  totalPending,
  onClose,
  onUploadSelected,
  onUploadAll,
}: Props) {
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
        <Text style={styles.title}>Upload anh len server</Text>
        <Text style={styles.subtitle}>
          {totalPending} anh chua duoc upload
        </Text>

        <View style={styles.options}>
          {selectedCount > 0 && (
            <TouchableOpacity style={styles.optionRow} onPress={onUploadSelected}>
              <View style={[styles.optionIcon, { backgroundColor: '#dcfce7' }]}>
                <MaterialCommunityIcons name="checkbox-marked-circle-outline" size={22} color="#16a34a" />
              </View>
              <View style={styles.optionText}>
                <Text style={styles.optionLabel}>Upload anh da chon</Text>
                <Text style={styles.optionDesc}>{selectedCount} anh duoc chon</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color="#94a3b8" />
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.optionRow} onPress={onUploadAll}>
            <View style={[styles.optionIcon, { backgroundColor: '#dbeafe' }]}>
              <MaterialCommunityIcons name="cloud-upload-outline" size={22} color="#2563eb" />
            </View>
            <View style={styles.optionText}>
              <Text style={styles.optionLabel}>Upload tat ca anh cho</Text>
              <Text style={styles.optionDesc}>{totalPending} anh chua send</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color="#94a3b8" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
          <Text style={styles.cancelText}>Huy</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
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
  options: { gap: 12, marginBottom: 20 },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 14,
    gap: 12,
  },
  optionIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: { flex: 1 },
  optionLabel: { fontSize: 15, fontWeight: '600', color: '#172033' },
  optionDesc: { fontSize: 12, color: '#64748b', marginTop: 2 },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
  },
  cancelText: { fontSize: 15, fontWeight: '600', color: '#64748b' },
});
