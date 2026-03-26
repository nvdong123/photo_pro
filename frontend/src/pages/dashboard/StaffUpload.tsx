import { useState, useCallback, useRef } from 'react';
import { Tag, Spin, Button, message } from 'antd';
import { EnvironmentOutlined, CalendarOutlined, UploadOutlined, CheckCircleFilled, CloseCircleFilled, FileImageOutlined } from '@ant-design/icons';
import { Check, Calendar, MapPin } from 'lucide-react';
import { useMyLocations, type MyLocation } from '../../hooks/useMyLocations';
import { useMyStats } from '../../hooks/useStaffStats';
import { invalidateApiCache } from '../../lib/api-client';

const BORDER = '#e2e5ea';
const TEXT_MUTED = '#8b91a0';
const PRIMARY = '#1a6b4e';

type FileStatus = 'pending' | 'uploading' | 'done' | 'error';

interface FileItem {
  id: string;
  file: File;
  progress: number;
  status: FileStatus;
  error?: string;
}

const API_BASE = import.meta.env.VITE_API_URL ?? '';

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
  const [fileItems, setFileItems] = useState<FileItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadDone, setUploadDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const stats = [
    { label: 'Địa điểm', value: locations?.length ?? 0, color: PRIMARY, bg: '#e8f5f0' },
    { label: 'Tổng ảnh', value: myStats?.total_photos_uploaded ?? 0, color: PRIMARY, bg: '#e8f5f0' },
    { label: 'Đã bán', value: myStats?.total_photos_sold ?? 0, color: '#1a854a', bg: '#dcfce7' },
    { label: 'Hôm nay', value: 0, color: '#d4870e', bg: '#fef3e8' },
  ];

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const items: FileItem[] = files.map((f) => ({
      id: `${f.name}-${f.size}-${f.lastModified}`,
      file: f,
      progress: 0,
      status: 'pending',
    }));
    setFileItems(items);
    setUploadDone(false);
    e.target.value = '';
  };

  const uploadOne = (item: FileItem, locationId: string, token: string | null): Promise<void> => {
    return new Promise((resolve) => {
      const form = new FormData();
      form.append('location_id', locationId);
      form.append('files', item.file);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_BASE}/api/v1/staff/upload`);
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) {
          const pct = Math.round((ev.loaded / ev.total) * 100);
          setFileItems((prev) =>
            prev.map((fi) => fi.id === item.id ? { ...fi, progress: pct, status: 'uploading' } : fi)
          );
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          setFileItems((prev) =>
            prev.map((fi) => fi.id === item.id ? { ...fi, progress: 100, status: 'done' } : fi)
          );
        } else {
          setFileItems((prev) =>
            prev.map((fi) => fi.id === item.id ? { ...fi, status: 'error', error: `HTTP ${xhr.status}` } : fi)
          );
        }
        resolve();
      };

      xhr.onerror = () => {
        setFileItems((prev) =>
          prev.map((fi) => fi.id === item.id ? { ...fi, status: 'error', error: 'Lỗi mạng' } : fi)
        );
        resolve();
      };

      xhr.send(form);
    });
  };

  const handleUpload = useCallback(async () => {
    if (!selectedLocation || fileItems.length === 0) return;

    setUploading(true);
    setUploadDone(false);

    const token = localStorage.getItem('admin_token');

    for (const item of fileItems) {
      setFileItems((prev) =>
        prev.map((fi) => fi.id === item.id ? { ...fi, status: 'uploading', progress: 0 } : fi)
      );
      await uploadOne(item, selectedLocation.id, token);
    }

    setUploading(false);
    setUploadDone(true);

    const doneItems = fileItems.filter((fi) => fi.status !== 'error');
    const errItems  = fileItems.filter((fi) => fi.status === 'error');

    if (doneItems.length > 0) {
      message.success(`Upload thành công ${doneItems.length} ảnh!`);
      invalidateApiCache('/my-locations');
      invalidateApiCache('/staff/statistics');
      refetch?.();
    }
    if (errItems.length > 0) {
      message.error(`${errItems.length} ảnh upload thất bại`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLocation, fileItems, refetch]);

  const doneCount  = fileItems.filter((fi) => fi.status === 'done').length;
  const totalCount = fileItems.length;

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
            {totalCount > 0 && (
              <span style={{ fontSize: 13, color: uploadDone ? '#1a6b4e' : TEXT_MUTED, fontWeight: 600 }}>
                {uploadDone ? '✓ Upload hoàn tất!' : `${doneCount}/${totalCount} hoàn thành`}
              </span>
            )}
          </div>
          <div style={{ padding: 20 }}>
            {/* Drop zone / file picker */}
            <div
              onClick={() => !uploading && inputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (uploading) return;
                const files = Array.from(e.dataTransfer.files).filter((f) => f.type === 'image/jpeg');
                const items: FileItem[] = files.map((f) => ({
                  id: `${f.name}-${f.size}-${f.lastModified}`,
                  file: f, progress: 0, status: 'pending',
                }));
                setFileItems(items);
                setUploadDone(false);
              }}
              style={{
                border: `2px dashed ${BORDER}`, borderRadius: 10, padding: '32px 20px',
                textAlign: 'center', cursor: uploading ? 'default' : 'pointer',
                background: '#fafbfc', marginBottom: fileItems.length > 0 ? 16 : 0,
                transition: 'border-color 0.2s',
              }}
            >
              <UploadOutlined style={{ fontSize: 32, color: PRIMARY, marginBottom: 8 }} />
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Kéo thả ảnh JPEG vào đây hoặc click để chọn</div>
              <div style={{ fontSize: 12, color: TEXT_MUTED }}>Tối đa 25MB/ảnh, chỉ chấp nhận file JPEG</div>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept=".jpg,.jpeg"
                style={{ display: 'none' }}
                onChange={handleFileSelect}
              />
            </div>

            {/* Per-file progress rows */}
            {fileItems.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                {fileItems.map((fi) => {
                  const sizeMB = (fi.file.size / 1024 / 1024).toFixed(1);
                  const isDone  = fi.status === 'done';
                  const isErr   = fi.status === 'error';
                  const isActive = fi.status === 'uploading';
                  return (
                    <div key={fi.id} style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 0', borderBottom: `1px solid ${BORDER}`,
                    }}>
                      <FileImageOutlined style={{ fontSize: 24, color: TEXT_MUTED, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 500, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {fi.file.name}
                        </div>
                        <div style={{ fontSize: 11, color: TEXT_MUTED }}>{sizeMB} MB</div>
                        {(isActive || isDone) && (
                          <div style={{ marginTop: 4, height: 4, borderRadius: 2, background: '#e8f5f0', overflow: 'hidden' }}>
                            <div style={{
                              height: '100%', borderRadius: 2,
                              background: isDone ? '#52c41a' : PRIMARY,
                              width: `${fi.progress}%`,
                              transition: 'width 0.15s',
                            }} />
                          </div>
                        )}
                      </div>
                      <div style={{ flexShrink: 0, width: 32, textAlign: 'center' }}>
                        {isDone  && <CheckCircleFilled  style={{ color: '#52c41a', fontSize: 18 }} />}
                        {isErr   && <CloseCircleFilled  style={{ color: '#ff4d4f', fontSize: 18 }} title={fi.error} />}
                        {isActive && <span style={{ fontSize: 12, color: PRIMARY, fontWeight: 600 }}>{fi.progress}%</span>}
                        {fi.status === 'pending' && <span style={{ fontSize: 11, color: TEXT_MUTED }}>—</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
              <Button
                type="primary"
                icon={<UploadOutlined />}
                size="large"
                loading={uploading}
                disabled={fileItems.length === 0}
                onClick={handleUpload}
                style={{ background: PRIMARY, borderColor: PRIMARY }}
              >
                {uploading ? 'Đang upload...' : `Upload ${totalCount} ảnh`}
              </Button>
              {fileItems.length > 0 && !uploading && (
                <Button size="large" onClick={() => { setFileItems([]); setUploadDone(false); }}>
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
