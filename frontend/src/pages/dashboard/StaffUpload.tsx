import { useState, useCallback } from 'react';
import { Tag, Spin, Button, Upload, message, Progress } from 'antd';
import { EnvironmentOutlined, CalendarOutlined, UploadOutlined, InboxOutlined } from '@ant-design/icons';
import { Check, Calendar, MapPin } from 'lucide-react';
import type { UploadFile } from 'antd/es/upload/interface';
import { useMyLocations, type MyLocation } from '../../hooks/useMyLocations';
import { useMyStats } from '../../hooks/useStaffStats';
import { apiClient, invalidateApiCache } from '../../lib/api-client';

const { Dragger } = Upload;

const BORDER = '#e2e5ea';
const TEXT_MUTED = '#8b91a0';
const PRIMARY = '#1a6b4e';
const SURFACE = '#f6f7f9';

const CARD_COLORS = [
  { color: '#1a6b4e', bg: '#e8f5f0' },
  { color: '#2563eb', bg: '#eff6ff' },
  { color: '#d4870e', bg: '#fef3e8' },
  { color: '#7c3aed', bg: '#f5f3ff' },
  { color: '#db2777', bg: '#fdf2f8' },
];

interface UploadResult {
  uploaded: number;
  failed: number;
  files: { media_id: string; filename: string; s3_key: string; size_kb: number }[];
  errors: { filename: string; error: string }[];
}

export default function StaffUpload() {
  const { data: locations, loading: locLoading, refetch } = useMyLocations();
  const { data: myStats, loading: statsLoading } = useMyStats();
  const [selectedLocation, setSelectedLocation] = useState<MyLocation | null>(null);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const stats = [
    { label: 'Địa điểm', value: locations?.length ?? 0, color: PRIMARY, bg: '#e8f5f0' },
    { label: 'Tổng ảnh', value: myStats?.total_photos_uploaded ?? 0, color: PRIMARY, bg: '#e8f5f0' },
    { label: 'Đã bán', value: myStats?.total_photos_sold ?? 0, color: '#1a854a', bg: '#dcfce7' },
    { label: 'Hôm nay', value: 0, color: '#d4870e', bg: '#fef3e8' },
  ];

  const handleUpload = useCallback(async () => {
    if (!selectedLocation || fileList.length === 0) return;

    setUploading(true);
    setUploadProgress(0);

    // Upload in batches of 20
    const batchSize = 20;
    let totalUploaded = 0;
    let totalFailed = 0;
    const allErrors: { filename: string; error: string }[] = [];

    for (let i = 0; i < fileList.length; i += batchSize) {
      const batch = fileList.slice(i, i + batchSize);
      const form = new FormData();
      form.append('location_id', selectedLocation.id);
      for (const f of batch) {
        if (f.originFileObj) {
          form.append('files', f.originFileObj);
        }
      }

      try {
        const result = await apiClient.postForm<UploadResult>('/api/v1/staff/upload', form);
        totalUploaded += result.uploaded;
        totalFailed += result.failed;
        allErrors.push(...result.errors);
      } catch (err: unknown) {
        totalFailed += batch.length;
        const errorMsg = err instanceof Error ? err.message : 'Upload batch failed';
        for (const f of batch) {
          allErrors.push({ filename: f.name, error: errorMsg });
        }
      }

      setUploadProgress(Math.min(100, Math.round(((i + batch.length) / fileList.length) * 100)));
    }

    setUploading(false);
    setUploadProgress(100);

    if (totalUploaded > 0) {
      message.success(`Upload thành công ${totalUploaded} ảnh!`);
      invalidateApiCache('/my-locations');
      invalidateApiCache('/staff/statistics');
      refetch?.();
    }
    if (totalFailed > 0) {
      message.error(`${totalFailed} ảnh upload thất bại`);
      for (const e of allErrors.slice(0, 3)) {
        message.warning(`${e.filename}: ${e.error}`, 5);
      }
    }

    setFileList([]);
    setUploadProgress(0);
  }, [selectedLocation, fileList, refetch]);

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Upload Ảnh</h1>
      </div>

      {/* Quick Stats */}
      <div style={{
        display: 'flex', alignItems: 'center', background: '#fff',
        border: `1px solid ${BORDER}`, borderRadius: 12,
        padding: '16px 24px', marginBottom: 24,
      }}>
        {stats.map((item, i, arr) => (
          <div key={item.label} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10, background: item.bg, color: item.color,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0,
            }}>
              {i === 0 ? <EnvironmentOutlined /> : i === 2 ? <Check className="w-4 h-4" /> : i === 3 ? <Calendar className="w-4 h-4" /> : <UploadOutlined />}
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#1a1d23', lineHeight: 1.1 }}>
                {statsLoading || locLoading ? '—' : item.value}
              </div>
              <div style={{ fontSize: 12, color: TEXT_MUTED, fontWeight: 500 }}>{item.label}</div>
            </div>
            {i < arr.length - 1 && <div style={{ width: 1, height: 36, background: BORDER, margin: '0 8px' }} />}
          </div>
        ))}
      </div>

      {/* Location Selection */}
      <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${BORDER}`, overflow: 'hidden', marginBottom: 24 }}>
        <div style={{
          padding: '16px 20px', borderBottom: `1px solid ${BORDER}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <h3 style={{ margin: 0 }}>Chọn Địa Điểm</h3>
          {!locLoading && locations && (
            <Tag color="blue">{locations.length} địa điểm</Tag>
          )}
        </div>
        <div style={{ padding: 20 }}>
          {locLoading ? (
            <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
          ) : !locations || locations.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: TEXT_MUTED }}>
              <div style={{ fontSize: 40, marginBottom: 12, display: 'flex', justifyContent: 'center' }}><MapPin className="w-10 h-10" style={{ color: '#8b91a0' }} /></div>
              <h4 style={{ margin: '0 0 4px', fontWeight: 600 }}>Chưa có địa điểm</h4>
              <p style={{ margin: 0 }}>Bạn chưa được phân công vào địa điểm nào. Liên hệ Admin để được phân công.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {locations.map((loc, i) => {
                const palette = CARD_COLORS[i % CARD_COLORS.length];
                const isSelected = selectedLocation?.id === loc.id;
                return (
                  <div
                    key={loc.id}
                    onClick={() => loc.can_upload && setSelectedLocation(loc)}
                    style={{
                      border: `2px solid ${isSelected ? palette.color : palette.color + '33'}`,
                      borderRadius: 14, overflow: 'hidden',
                      background: isSelected ? palette.bg : '#fff',
                      boxShadow: isSelected ? `0 0 0 2px ${palette.color}33` : '0 1px 4px rgba(0,0,0,0.06)',
                      transition: 'all 0.2s',
                      cursor: loc.can_upload ? 'pointer' : 'not-allowed',
                      opacity: loc.can_upload ? 1 : 0.6,
                    }}
                  >
                    <div style={{ height: 5, background: palette.color }} />
                    <div style={{ padding: 20 }}>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                        <div style={{
                          width: 44, height: 44, borderRadius: 11, background: palette.bg, color: palette.color,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0,
                        }}>
                          <EnvironmentOutlined />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 2 }}>{loc.name}</div>
                          {loc.shoot_date && (
                            <div style={{ fontSize: 12, color: TEXT_MUTED, display: 'flex', alignItems: 'center', gap: 4 }}>
                              <CalendarOutlined /> {loc.shoot_date}
                            </div>
                          )}
                          {loc.address && (
                            <div style={{ fontSize: 12, color: TEXT_MUTED, marginTop: 2 }}>{loc.address}</div>
                          )}
                        </div>
                        {loc.can_upload ? (
                          <Tag color={isSelected ? 'green' : 'default'} style={{ flexShrink: 0 }}>
                            {isSelected ? 'Đã chọn' : 'Upload'}
                          </Tag>
                        ) : (
                          <Tag color="default" style={{ flexShrink: 0 }}>Chỉ xem</Tag>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Upload Area */}
      {selectedLocation && (
        <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${BORDER}`, overflow: 'hidden', marginBottom: 24 }}>
          <div style={{
            padding: '16px 20px', borderBottom: `1px solid ${BORDER}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <h3 style={{ margin: 0 }}>
              Upload vào: <span style={{ color: PRIMARY }}>{selectedLocation.name}</span>
            </h3>
            {fileList.length > 0 && <Tag color="blue">{fileList.length} ảnh</Tag>}
          </div>
          <div style={{ padding: 20 }}>
            <Dragger
              multiple
              accept=".jpg,.jpeg"
              fileList={fileList}
              beforeUpload={() => false}
              onChange={({ fileList: newList }) => setFileList(newList)}
              disabled={uploading}
              showUploadList={{ showPreviewIcon: false }}
            >
              <p className="ant-upload-drag-icon"><InboxOutlined /></p>
              <p className="ant-upload-text">Kéo thả ảnh JPEG vào đây hoặc click để chọn</p>
              <p className="ant-upload-hint">Tối đa 25MB/ảnh, chỉ chấp nhận file JPEG</p>
            </Dragger>

            {uploading && (
              <Progress percent={uploadProgress} status="active" style={{ marginTop: 16 }} />
            )}

            <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
              <Button
                type="primary"
                icon={<UploadOutlined />}
                size="large"
                loading={uploading}
                disabled={fileList.length === 0}
                onClick={handleUpload}
                style={{ background: PRIMARY, borderColor: PRIMARY }}
              >
                {uploading ? 'Đang upload...' : `Upload ${fileList.length} ảnh`}
              </Button>
              {fileList.length > 0 && !uploading && (
                <Button size="large" onClick={() => setFileList([])}>
                  Xóa tất cả
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Instructions */}
      <div style={{
        marginTop: 20, padding: '14px 18px', background: '#eff6ff',
        border: '1px solid #93c5fd', borderRadius: 10, fontSize: 13, color: '#1d4ed8',
      }}>
        <strong>Hướng dẫn upload:</strong>
        <ol style={{ margin: '8px 0 0', paddingLeft: 20 }}>
          <li>Chọn <strong>địa điểm</strong> muốn upload ảnh.</li>
          <li>Kéo thả hoặc chọn các file ảnh JPEG (tối đa 25MB/ảnh).</li>
          <li>Nhấn <strong>"Upload"</strong> — hệ thống sẽ tự động xử lý watermark và nhận diện khuôn mặt.</li>
        </ol>
      </div>
    </div>
  );
}
