import { useState, useEffect } from 'react';
import {
  View, Text, Image, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Dimensions, Modal, Alert,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import type { UploadStatus } from '../services/uploadService';

type Props = NativeStackScreenProps<RootStackParamList, 'ImageDetail'>;

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface ImageDetailParams {
  uri: string;
  name: string;
  size?: number;
  status?: UploadStatus;
  capturedAt?: number;
  addedAt?: string;
}

export default function ImageDetailScreen({ route, navigation }: Props) {
  const { uri, name, size, status, capturedAt, addedAt } = route.params as ImageDetailParams;
  const [loading, setLoading] = useState(true);
  const [showInfo, setShowInfo] = useState(true);

  useEffect(() => {
    navigation.setOptions({
      title: name || 'Chi tiết ảnh',
      headerRight: () => (
        <TouchableOpacity onPress={() => setShowInfo(!showInfo)} style={{ padding: 8 }}>
          <MaterialCommunityIcons 
            name={showInfo ? 'information' : 'information-outline'} 
            size={24} 
            color="#fff" 
          />
        </TouchableOpacity>
      ),
    });
  }, [navigation, name, showInfo]);

  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return 'N/A';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (timestamp?: number): string => {
    if (!timestamp) return 'N/A';
    return new Date(timestamp).toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusLabel = (s?: UploadStatus): string => {
    switch (s) {
      case 'UNUPLOAD': return 'Chưa upload';
      case 'CACHED': return 'Đã cache';
      case 'UPLOADING': return 'Đang upload';
      case 'UPLOADED': return 'Đã upload';
      case 'FAILED': return 'Thất bại';
      default: return 'N/A';
    }
  };

  const getStatusColor = (s?: UploadStatus): string => {
    switch (s) {
      case 'UNUPLOAD': return '#9ca3af';
      case 'CACHED': return '#10b981';
      case 'UPLOADING': return '#3b82f6';
      case 'UPLOADED': return '#22c55e';
      case 'FAILED': return '#ef4444';
      default: return '#9ca3af';
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.imageContainer}>
        <Image 
          source={{ uri }} 
          style={styles.image}
          resizeMode="contain"
          onLoad={() => setLoading(false)}
        />
        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#fff" />
            <Text style={styles.loadingText}>Đang tải ảnh...</Text>
          </View>
        )}
      </View>

      {showInfo && (
        <View style={styles.infoPanel}>
          <Text style={styles.fileName}>{name}</Text>
          
          <View style={styles.infoRow}>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Kích thước</Text>
              <Text style={styles.infoValue}>{formatFileSize(size)}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Trạng thái</Text>
              <View style={[styles.statusBadge, { backgroundColor: getStatusColor(status) }]}>
                <Text style={styles.statusText}>{getStatusLabel(status)}</Text>
              </View>
            </View>
          </View>

          <View style={styles.infoRow}>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Ngày chụp</Text>
              <Text style={styles.infoValue}>{formatDate(capturedAt)}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Ngày thêm</Text>
              <Text style={styles.infoValue}>
                {addedAt ? new Date(addedAt).toLocaleString('vi-VN', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                }) : 'N/A'}
              </Text>
            </View>
          </View>

          <View style={styles.exifSection}>
            <Text style={styles.exifTitle}>Thông tin EXIF</Text>
            <Text style={styles.exifNote}>
              Thông tin chi tiết chỉ có sẵn sau khi upload lên server
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  imageContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: SCREEN_WIDTH,
    flex: 1,
    backgroundColor: '#000',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: { color: '#fff', marginTop: 12, fontSize: 14 },
  infoPanel: {
    backgroundColor: '#1a1a1a',
    padding: 16,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  fileName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  infoItem: {
    flex: 1,
  },
  infoLabel: {
    color: '#9ca3af',
    fontSize: 12,
    marginBottom: 2,
  },
  infoValue: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  exifSection: {
    marginTop: 8,
    padding: 12,
    backgroundColor: '#262626',
    borderRadius: 8,
  },
  exifTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  exifNote: {
    color: '#9ca3af',
    fontSize: 12,
    fontStyle: 'italic',
  },
});