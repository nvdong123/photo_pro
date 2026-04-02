import { useState, useCallback, useRef, useEffect } from 'react';
import { Tag, Spin, Button, message } from 'antd';
import { EnvironmentOutlined, CalendarOutlined, UploadOutlined, FileImageOutlined, ReloadOutlined } from '@ant-design/icons';
import { Check, Calendar, MapPin, X, CheckCircle, AlertCircle, Loader, Clock, ArrowUpCircle } from 'lucide-react';
import { useMyLocations, type MyLocation } from '../../hooks/useMyLocations';
import { useMyStats } from '../../hooks/useStaffStats';
import { apiClient, invalidateApiCache } from '../../lib/api-client';
import { useUpload, type FileItem, type FileStatus } from '../../hooks/useUpload';
import { useStaffPhotoStream } from '../../hooks/useSSE';

const BORDER = '#e2e5ea';
const TEXT_MUTED = '#8b91a0';
const PRIMARY = '#1a6b4e';

interface LocationPhoto {
  media_id: string;
  thumb_url: string | null;
  shoot_date: string | null;
  process_status: string;
  created_at: string;
}

const CARD_COLORS = [
  { color: '#1a6b4e', bg: '#e8f5f0' },
  { color: '#2563eb', bg: '#eff6ff' },
  { color: '#d4870e', bg: '#fef3e8' },
  { color: '#7c3aed', bg: '#f5f3ff' },
  { color: '#db2777', bg: '#fdf2f8' },
];

function statusLabel(fi: FileItem): string {
  switch (fi.status) {
    case 'pending':    return 'Chờ upload';
    case 'uploading':  return `Đang upload... ${fi.progress}%`;
    case 'retrying':   return `Thử lại ${fi.retryAttempt ?? '?'}/${fi.maxRetries}...`;
    case 'done':       return 'Đã upload';
    case 'processing': return 'Đang xử lý...';
    case 'indexed':    return '✅ Hoàn thành';
    case 'cancelled':  return 'Đã huỷ';
    case 'error':      return fi.error ?? 'Upload thất bại';
  }
}

function StatusIcon({ status }: { status: FileStatus }) {
  const sz = 16;
  switch (status) {
    case 'indexed':    return <CheckCircle size={sz} color="#059669" />;
    case 'done':
    case 'processing': return <Loader size={sz} color="#d97706" style={{ animation: 'spin 1s linear infinite' }} />;
    case 'retrying':   return <Loader size={sz} color="#f59e0b" style={{ animation: 'spin 1s linear infinite' }} />;
    case 'error':      return <AlertCircle size={sz} color="#dc2626" />;
    case 'cancelled':  return <AlertCircle size={sz} color="#9ca3af" />;
    case 'uploading':  return <ArrowUpCircle size={sz} color={PRIMARY} />;
    default:           return <Clock size={sz} color="#9ca3af" />;
  }
}

export default function StaffUpload() {
  const { data: locations, loading: locLoading, refetch } = useMyLocations();
  const { data: myStats, loading: statsLoading } = useMyStats();
  const [selectedLocation, setSelectedLocation] = useState<MyLocation | null>(null);
  const [shootDate, setShootDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const inputRef = useRef<HTMLInputElement>(null);

  // Photo gallery for current location
  const [locationPhotos, setLocationPhotos] = useState<LocationPhoto[]>([]);
  const [photosLoading, setPhotosLoading] = useState(false);

  const fetchLocationPhotos = useCallback(async (locationId: string) => {
    setPhotosLoading(true);
    try {
      const data = await apiClient.get<LocationPhoto[]>(`/api/v1/admin/locations/${locationId}/photos?limit=100`);
      setLocationPhotos(data ?? []);
    } catch {
      setLocationPhotos([]);
    } finally {
      setPhotosLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedLocation) {
      fetchLocationPhotos(selectedLocation.id);
    } else {
      setLocationPhotos([]);
    }
  }, [selectedLocation, fetchLocationPhotos]);

  // Upload state from hook (presign → S3 PUT → confirm, with retry + cancel)
  const { fileItems, uploading, uploadDone, setFiles, startUpload, cancelFile, markIndexed } = useUpload();

  // SSE: mark files 'indexed' once face processing completes. Cookie auth — no JWT in URL.
  const { processedPhotos } = useStaffPhotoStream(null);
  const markedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    processedPhotos.forEach((e) => {
      if (!markedRef.current.has(e.media_id)) {
        markedRef.current.add(e.media_id);
        markIndexed(e.media_id);
      }
    });
  }, [processedPhotos, markIndexed]);

  // Auto-refresh gallery + invalidate caches when upload batch finishes
  useEffect(() => {
    if (!uploadDone) return;
    const succeeded = fileItems.filter((fi) => !['error', 'cancelled'].includes(fi.status)).length;
    const failed    = fileItems.filter((fi) => fi.status === 'error').length;
    if (succeeded > 0) {
      message.success(`Upload thành công ${succeeded} ảnh!`);
      invalidateApiCache('/my-locations');
      invalidateApiCache('/staff/statistics');
      refetch?.();
      if (selectedLocation) fetchLocationPhotos(selectedLocation.id);
    }
    if (failed > 0) message.error(`${failed} ảnh upload thất bại`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadDone]);

  const stats = [
    { label: 'Địa điểm', value: locations?.length ?? 0, color: PRIMARY, bg: '#e8f5f0' },
    { label: 'Tổng ảnh', value: myStats?.total_photos_uploaded ?? 0, color: PRIMARY, bg: '#e8f5f0' },
    { label: 'Đã bán', value: myStats?.total_photos_sold ?? 0, color: '#1a854a', bg: '#dcfce7' },
    { label: 'Hôm nay', value: 0, color: '#d4870e', bg: '#fef3e8' },
  ];

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFiles(Array.from(e.target.files ?? []));
    e.target.value = '';
  };

  const handleUpload = useCallback(async () => {
    if (!selectedLocation || fileItems.filter((fi) => fi.status === 'pending').length === 0) return;
    await startUpload({ location_id: selectedLocation.id, shoot_date: shootDate });
  }, [selectedLocation, shootDate, fileItems, startUpload]);

  const completedCount = fileItems.filter((fi) => ['done', 'processing', 'indexed'].includes(fi.status)).length;
  const totalCount     = fileItems.length;
  const pendingCount   = fileItems.filter((fi) => fi.status === 'pending').length;

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
                {uploadDone ? '✓ Upload hoàn tất!' : `${completedCount}/${totalCount} hoàn thành`}
              </span>
            )}
          </div>
          <div style={{ padding: 20 }}>
            {/* Date picker */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                Ngày chụp *
              </label>
              <input
                type="date"
                value={shootDate}
                onChange={(e) => setShootDate(e.target.value)}
                disabled={uploading}
                style={{
                  padding: '8px 12px', borderRadius: 8,
                  border: `1px solid ${BORDER}`, fontSize: 14, color: '#111827',
                }}
              />
            </div>

            {/* Drop zone / file picker */}
            <div
              onClick={() => !uploading && inputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (uploading) return;
                setFiles(Array.from(e.dataTransfer.files));
              }}
              style={{
                border: `2px dashed ${BORDER}`, borderRadius: 10, padding: '32px 20px',
                textAlign: 'center', cursor: uploading ? 'default' : 'pointer',
                background: '#fafbfc', marginBottom: fileItems.length > 0 ? 16 : 0,
                transition: 'border-color 0.2s',
              }}
            >
              <UploadOutlined style={{ fontSize: 32, color: PRIMARY, marginBottom: 8 }} />
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Kéo thả ảnh vào đây hoặc click để chọn</div>
              <div style={{ fontSize: 12, color: TEXT_MUTED }}>JPG, PNG, RAW — tối đa 50 ảnh</div>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept=".jpg,.jpeg,.png,.cr2,.nef,.arw,.rw2,.rw,.raf"
                style={{ display: 'none' }}
                onChange={handleFileSelect}
              />
            </div>

            {/* Per-file progress rows */}
            {fileItems.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                {fileItems.map((fi) => {
                  const sizeMB = (fi.file.size / 1024 / 1024).toFixed(1);
                  const isActive = fi.status === 'uploading' || fi.status === 'retrying';
                  const canCancel = (fi.status === 'uploading' || fi.status === 'retrying') && fi.mediaId;
                  const barColor = fi.status === 'retrying' ? '#f59e0b'
                    : fi.status === 'indexed' ? '#059669'
                    : PRIMARY;
                  return (
                    <div key={fi.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 0', borderBottom: `1px solid ${BORDER}`,
                    }}>
                      <FileImageOutlined style={{ fontSize: 20, color: TEXT_MUTED, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 500, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {fi.file.name}
                        </div>
                        <div style={{ fontSize: 11, color: TEXT_MUTED, marginBottom: 2 }}>
                          {sizeMB} MB · {statusLabel(fi)}
                        </div>
                        {isActive && (
                          <div style={{ height: 4, borderRadius: 2, background: '#e8f5f0', overflow: 'hidden' }}>
                            <div style={{
                              height: '100%', borderRadius: 2,
                              background: barColor,
                              width: `${fi.progress}%`,
                              transition: 'width 0.15s',
                            }} />
                          </div>
                        )}
                      </div>
                      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <StatusIcon status={fi.status} />
                        {canCancel && (
                          <button
                            onClick={() => cancelFile(fi.mediaId!)}
                            title="Huỷ"
                            style={{
                              border: 'none', background: 'none', cursor: 'pointer',
                              padding: 2, color: '#9ca3af', display: 'flex', alignItems: 'center',
                            }}
                          >
                            <X size={14} />
                          </button>
                        )}
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
                disabled={pendingCount === 0}
                onClick={handleUpload}
                style={{ background: PRIMARY, borderColor: PRIMARY }}
              >
                {uploading ? 'Đang upload...' : `Upload ${pendingCount > 0 ? pendingCount : totalCount} ảnh`}
              </Button>
              {fileItems.length > 0 && !uploading && (
                <Button size="large" onClick={() => setFiles([])}>
                  Xóa tất cả
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Ảnh đã upload tại địa điểm này */}
      {selectedLocation && (
        <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${BORDER}`, overflow: 'hidden', marginBottom: 24 }}>
          <div style={{
            padding: '16px 20px', borderBottom: `1px solid ${BORDER}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <h3 style={{ margin: 0 }}>Ảnh đã upload</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {locationPhotos.length > 0 && (
                <Tag color="blue">{locationPhotos.length} ảnh</Tag>
              )}
              <Button
                size="small"
                icon={<ReloadOutlined />}
                onClick={() => fetchLocationPhotos(selectedLocation.id)}
                loading={photosLoading}
              >
                Làm mới
              </Button>
            </div>
          </div>
          <div style={{ padding: 20 }}>
            {photosLoading ? (
              <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
            ) : locationPhotos.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: TEXT_MUTED }}>
                <FileImageOutlined style={{ fontSize: 32, marginBottom: 8 }} />
                <div>Chưa có ảnh nào được upload tại địa điểm này</div>
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
                gap: 10,
              }}>
                {locationPhotos.map((photo) => (
                  <div key={photo.media_id} style={{ position: 'relative' }}>
                    <div style={{
                      width: '100%', paddingBottom: '100%', position: 'relative',
                      borderRadius: 8, overflow: 'hidden',
                      background: '#f0f0f0', border: `1px solid ${BORDER}`,
                    }}>
                      {photo.thumb_url ? (
                        <img
                          src={photo.thumb_url}
                          alt=""
                          style={{
                            position: 'absolute', inset: 0,
                            width: '100%', height: '100%', objectFit: 'cover',
                          }}
                        />
                      ) : (
                        <div style={{
                          position: 'absolute', inset: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: TEXT_MUTED, fontSize: 24,
                        }}>
                          <FileImageOutlined />
                        </div>
                      )}
                      {/* Status badge */}
                      <div style={{
                        position: 'absolute', bottom: 4, right: 4,
                        background: photo.process_status === 'indexed' ? '#52c41a'
                          : photo.process_status === 'derivatives_ready' ? '#1677ff'
                          : photo.process_status === 'failed' ? '#ff4d4f'
                          : '#8c8c8c',
                        borderRadius: 4, width: 8, height: 8,
                      }} title={photo.process_status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
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
