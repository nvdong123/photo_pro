import { useEffect, useState, useRef } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAlbums } from '../../hooks/useAlbums';
import { apiClient } from '../../lib/api-client';
import { Button, Radio, Checkbox, Alert, DatePicker, message } from 'antd';
import {
  ScanOutlined,
  EnvironmentOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  InfoCircleOutlined,
  CameraOutlined,
  VideoCameraOutlined,
  PictureOutlined,
  BulbOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { Check } from 'lucide-react';
import dayjs from 'dayjs';
import '../styles/frontend.css';

interface Album {
  id: string;
  name: string;
  icon: string;
  media_count: number;
}

export default function FaceSearch() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scannerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoSearchTriggeredRef = useRef(false);

  const urlAlbumId = searchParams.get('album_id');

  const { data: albumsData } = useAlbums();
  const albums: Album[] = (albumsData ?? []).map((a) => ({ id: a.id, name: a.name, icon: '', media_count: a.media_count }));
  const [searchScope, setSearchScope] = useState(() => urlAlbumId ? 'specific' : 'all');
  const [selectedAlbums, setSelectedAlbums] = useState<string[]>(() => urlAlbumId ? [urlAlbumId] : []);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [activeDateQuick, setActiveDateQuick] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facesDetected, setFacesDetected] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);

  const runFaceSearchPipeline = async (imageBlob?: Blob) => {
    const imageToSearch = imageBlob ?? uploadedFile;
    if (!imageToSearch) return;

    setIsSearching(true);
    const progressSteps = [
      'Đang phát hiện khuôn mặt...',
      'Đang trích xuất đặc trưng...',
      'Đang tìm kiếm trong cơ sở dữ liệu...',
      'Đang sắp xếp kết quả...',
    ];
    let stepIdx = 0;
    message.open({ key: 'face-search-loading', type: 'loading', content: progressSteps[0], duration: 0 });
    const stepTimer = setInterval(() => {
      stepIdx = Math.min(stepIdx + 1, progressSteps.length - 1);
      message.open({ key: 'face-search-loading', type: 'loading', content: progressSteps[stepIdx], duration: 0 });
    }, 700);

    const form = new FormData();
    form.append('image', imageToSearch, 'selfie.jpg');
    if (dateFrom) form.append('shoot_date', dateFrom);
    if (selectedAlbums.length > 0) form.append('album_id', selectedAlbums[0]);

    try {
      const data = await apiClient.postForm<{ results: unknown[]; total: number }>(
        '/api/v1/search/face',
        form,
      );
      sessionStorage.setItem('photopro_search_results', JSON.stringify(data.results));
      navigate('/results');
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Lỗi tìm kiếm khuôn mặt');
    } finally {
      clearInterval(stepTimer);
      message.destroy('face-search-loading');
      setIsSearching(false);
    }
  };

  // Re-attach stream after any re-render that recreates the <video> element.
  useEffect(() => {
    if (!isCameraOpen || !cameraStream || !videoRef.current) return;

    const videoEl = videoRef.current;
    if (videoEl.srcObject !== cameraStream) {
      videoEl.srcObject = cameraStream;
    }

    const tryPlay = async () => {
      try {
        await videoEl.play();
      } catch (err) {
        console.error('Video play error:', err);
      }
    };

    if (videoEl.readyState >= 2) {
      void tryPlay();
    } else {
      videoEl.onloadedmetadata = () => {
        void tryPlay();
      };
    }

    return () => {
      videoEl.onloadedmetadata = null;
    };
  }, [isCameraOpen, cameraStream]);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (scannerIntervalRef.current) {
        clearInterval(scannerIntervalRef.current);
      }
    };
  }, []);

  const setQuickDate = (range: string) => {
    setActiveDateQuick(range);
    const today = new Date();
    const fmt = (d: Date) => d.toISOString().split('T')[0];
    const newTo = fmt(today);
    if (range === 'all') {
      setDateFrom('');
      setDateTo('');
      return;
    }
    setDateTo(newTo);
    switch (range) {
      case 'today': setDateFrom(fmt(today)); break;
      case '3days': { const d = new Date(today); d.setDate(d.getDate() - 2); setDateFrom(fmt(d)); break; }
      case '7days': { const d = new Date(today); d.setDate(d.getDate() - 6); setDateFrom(fmt(d)); break; }
      case '30days': { const d = new Date(today); d.setDate(d.getDate() - 29); setDateFrom(fmt(d)); break; }
    }
  };

  const clearDateFilter = () => {
    setDateFrom('');
    setDateTo('');
    setActiveDateQuick(null);
  };

  const handleAlbumToggle = (albumId: string) => {
    setSelectedAlbums((prev) =>
      prev.includes(albumId)
        ? prev.filter((id) => id !== albumId)
        : [...prev, albumId]
    );
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSearch = () => {
    if (!uploadedFile) {
      message.error('Vui lòng chọn ảnh để quét');
      return;
    }
    runFaceSearchPipeline();
  };

  const handleCancel = () => {
    setPreviewUrl(null);
    setUploadedFile(null);
  };

  const startCamera = async () => {
    setCameraError(null);
    setFacesDetected(false);
    autoSearchTriggeredRef.current = false;

    // flushSync buộc React render ngay lập tức → video element có trong DOM ngay
    flushSync(() => setIsCameraOpen(true));

    if (!window.isSecureContext) {
      setCameraError('Camera chỉ hoạt động trên HTTPS hoặc localhost. Trang hiện tại không an toàn (HTTP).');
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Trình duyệt không hỗ trợ truy cập camera (MediaDevices API).');
      return;
    }

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch (err: any) {
        // Fallback cho trình duyệt không hỗ trợ facingMode hoặc constraint cụ thể
        if (err?.name === 'OverconstrainedError' || err?.name === 'NotFoundError') {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        } else {
          throw err;
        }
      }

      streamRef.current = stream;

      // videoRef.current chắc chắn có vì flushSync đã render xong
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(console.error);
      }

      setCameraStream(stream); // cập nhật UI: ẩn fallback, hiện video
      simulateFaceDetection();
    } catch (camErr: any) {
      if (camErr.name === 'NotFoundError' || camErr.name === 'DevicesNotFoundError') {
        setCameraError('Không tìm thấy thiết bị camera.');
      } else if (camErr.name === 'NotAllowedError') {
        setCameraError('Bạn đã chặn quyền camera. Vui lòng bấm biểu tượng ổ khóa trên thanh địa chỉ và cho phép Camera.');
      } else if (camErr.name === 'NotReadableError') {
        setCameraError('Camera đang được ứng dụng khác sử dụng (Zoom/Teams/OBS...). Vui lòng đóng ứng dụng đó rồi thử lại.');
      } else if (camErr.name === 'SecurityError') {
        setCameraError('Trình duyệt chặn camera vì lý do bảo mật. Hãy dùng HTTPS hoặc localhost.');
      } else if (camErr.name === 'AbortError') {
        setCameraError('Không thể khởi tạo camera (AbortError). Vui lòng thử lại.');
      } else {
        setCameraError('Không thể truy cập camera: ' + camErr.message);
      }
    }
  };

  const closeCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraStream(null);
    if (scannerIntervalRef.current) {
      clearInterval(scannerIntervalRef.current);
      scannerIntervalRef.current = null;
    }
    setIsCameraOpen(false);
    setFacesDetected(false);
    autoSearchTriggeredRef.current = false;
  };

  useEffect(() => {
    if (!isCameraOpen || !facesDetected || autoSearchTriggeredRef.current) return;

    autoSearchTriggeredRef.current = true;
    const timer = setTimeout(() => {
      // Capture frame then search
      if (videoRef.current && canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
          canvasRef.current.width = videoRef.current.videoWidth || 640;
          canvasRef.current.height = videoRef.current.videoHeight || 480;
          ctx.drawImage(videoRef.current, 0, 0);
          canvasRef.current.toBlob((blob) => {
            closeCamera();
            if (blob) runFaceSearchPipeline(blob);
          }, 'image/jpeg', 0.9);
          return;
        }
      }
      closeCamera();
      runFaceSearchPipeline();
    }, 900);

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facesDetected, isCameraOpen]);

  const simulateFaceDetection = () => {
    let detectionStep = 0;
    
    scannerIntervalRef.current = setInterval(() => {
      detectionStep++;
      
      if (detectionStep >= 3) {
        setFacesDetected(true);
        if (scannerIntervalRef.current) {
          clearInterval(scannerIntervalRef.current);
          scannerIntervalRef.current = null;
        }
      }
    }, 600);
  };

  const capturePhoto = () => {
    if (!streamRef.current && cameraError) {
      // Simulated camera mode - create a placeholder image
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 500;
      const ctx = canvas.getContext('2d');
      
      if (ctx) {
        // Draw gradient background
        const gradient = ctx.createLinearGradient(0, 0, 0, 500);
        gradient.addColorStop(0, '#667eea');
        gradient.addColorStop(1, '#764ba2');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 400, 500);
        
        // Draw face emoji in center
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 64px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('DEMO', 200, 250);
        
        canvas.toBlob((blob) => {
          if (blob) {
            const file = new File([blob], 'simulated-camera.jpg', { type: 'image/jpeg' });
            setUploadedFile(file);
            const reader = new FileReader();
            reader.onloadend = () => {
              setPreviewUrl(reader.result as string);
            };
            reader.readAsDataURL(file);
            closeCamera();
          }
        }, 'image/jpeg', 0.95);
      }
      return;
    }

    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        context.drawImage(videoRef.current, 0, 0);

        canvasRef.current.toBlob((blob) => {
          if (blob) {
            const file = new File([blob], 'camera-capture.jpg', { type: 'image/jpeg' });
            setUploadedFile(file);

            const reader = new FileReader();
            reader.onloadend = () => {
              setPreviewUrl(reader.result as string);
            };
            reader.readAsDataURL(file);

            closeCamera();
          }
        }, 'image/jpeg', 0.95);
      }
    }
  };

  return (
    <div className="page-section active" style={{ paddingTop: '84px', paddingBottom: '40px' }}>
      <div className="container">
        {/* Page Header */}
        <div className="page-header">
          <h1><ScanOutlined /> Quét Khuôn Mặt</h1>
          <p>Tìm ảnh của bạn bằng AI nhận diện khuôn mặt</p>
        </div>

        {/* Search Scope */}
        <div className="card card-padded mb-3">
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '16px' }}><EnvironmentOutlined /> Phạm Vi Tìm Kiếm</h3>
          <div style={{ marginBottom: '16px' }}>
            <Radio.Group
              value={searchScope}
              onChange={(e) => {
                setSearchScope(e.target.value);
                if (e.target.value === 'all') setSelectedAlbums([]);
              }}
              style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}
            >
              <Radio value="all" style={{ padding: '8px 12px', borderRadius: '8px' }}>Tìm trong tất cả albums</Radio>
              <Radio value="specific" style={{ padding: '8px 12px', borderRadius: '8px' }}>Chọn albums cụ thể</Radio>
            </Radio.Group>
          </div>

          {/* Album Selection (Conditional) */}
          {searchScope === 'specific' && (
            <div style={{ padding: '16px', backgroundColor: 'var(--surface)', borderRadius: '12px' }}>
              <p style={{ fontWeight: 500, marginBottom: '12px', fontSize: '0.95rem' }}>Chọn albums:</p>
              <Checkbox.Group
                value={selectedAlbums}
                onChange={(vals) => setSelectedAlbums(vals as string[])}
                style={{ display: 'grid', gap: '8px', width: '100%' }}
              >
                {albums.map((album) => (
                  <Checkbox
                    key={album.id}
                    value={album.id}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', borderRadius: '6px', marginLeft: 0 }}
                  >
                    <span style={{ fontSize: '1rem' }}>{album.icon}</span>
                    <span style={{ fontWeight: 500, fontSize: '0.95rem' }}>{album.name}</span>
                  </Checkbox>
                ))}
              </Checkbox.Group>
            </div>
          )}
        </div>

        {/* Date Filter — B1 */}
        <div className="card card-padded mb-3">
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '8px' }}><CalendarOutlined /> Khoảng Thời Gian</h3>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
            Thu hẹp phạm vi tìm kiếm theo ngày chụp
          </p>

          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '16px' }}>
            <div style={{ flex: 1, minWidth: '180px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '6px' }}>Từ ngày</label>
              <DatePicker
                value={dateFrom ? dayjs(dateFrom) : null}
                onChange={(val) => { setDateFrom(val ? val.format('YYYY-MM-DD') : ''); setActiveDateQuick(null); }}
                style={{ width: '100%' }}
                size="large"
                placeholder="Từ ngày"
                format="DD/MM/YYYY"
              />
            </div>
            <div style={{ flex: 1, minWidth: '180px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '6px' }}>Đến ngày</label>
              <DatePicker
                value={dateTo ? dayjs(dateTo) : null}
                onChange={(val) => { setDateTo(val ? val.format('YYYY-MM-DD') : ''); setActiveDateQuick(null); }}
                style={{ width: '100%' }}
                size="large"
                placeholder="Đến ngày"
                format="DD/MM/YYYY"
              />
            </div>
          </div>

          {/* Quick select buttons */}
          <div style={{ display: 'flex', gap: '10px', rowGap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            {([{ key: 'today', label: 'Hôm nay' }, { key: '3days', label: '3 ngày' }, { key: '7days', label: '7 ngày' }, { key: '30days', label: '30 ngày' }, { key: 'all', label: 'Tất cả' }] as const).map(q => (
              <Button
                key={q.key}
                size="small"
                type={activeDateQuick === q.key ? 'primary' : 'default'}
                shape="round"
                icon={q.key === 'today' ? <ClockCircleOutlined /> : undefined}
                onClick={() => setQuickDate(q.key)}
                style={{
                  height: 34,
                  paddingInline: 14,
                  fontSize: 14,
                  fontWeight: 500,
                  lineHeight: 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                }}
              >{q.label}</Button>
            ))}
          </div>

          {/* Active filter info */}
          {(dateFrom || dateTo) && (
            <div style={{
              marginTop: '12px', padding: '8px 12px',
              background: 'rgba(26,107,78,0.08)', borderRadius: '8px',
              fontSize: '13px', color: 'var(--primary, #1a6b4e)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span>
                <InfoCircleOutlined /> Tìm ảnh từ {dateFrom ? new Date(dateFrom).toLocaleDateString('vi-VN') : '...'} đến {dateTo ? new Date(dateTo).toLocaleDateString('vi-VN') : '...'}
              </span>
              <Button type="link" size="small" onClick={clearDateFilter} style={{ padding: 0 }}>Xóa bộ lọc</Button>
            </div>
          )}
        </div>

        {/* Camera Overlay */}
        {isCameraOpen && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '20px',
          }} onClick={(e) => { if (e.target === e.currentTarget) closeCamera(); }}>
            <style>{`
              @keyframes face-spin { to { transform: rotate(360deg); } }
            `}</style>

            {/* Camera container */}
            <div style={{
              position: 'relative',
              width: '100%',
              maxWidth: '580px',
              borderRadius: '20px',
              overflow: 'hidden',
              backgroundColor: '#0a0a0a',
              aspectRatio: '4/3',
              boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
            }}>
              {/* Video element - luôn render khi overlay mở để videoRef available */}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)', display: cameraStream ? 'block' : 'none' }}
              />
              {/* Dark background - hiện khi chưa có stream */}
              {!cameraStream && (
                <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center, #1a1a2e 0%, #0a0a0a 100%)' }} />
              )}

              {/* Top-right controls */}
              <div style={{ position: 'absolute', top: 14, right: 14, display: 'flex', gap: 8, zIndex: 10 }}>
                <button
                  onClick={() => { closeCamera(); setTimeout(() => startCamera(), 200); }}
                  style={{
                    width: 40, height: 40, borderRadius: '50%', border: 'none', cursor: 'pointer',
                    background: '#000',
                    color: '#fff', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                  title="Làm mới camera"
                >↺</button>
                <button
                  onClick={closeCamera}
                  style={{
                    width: 40, height: 40, borderRadius: '50%', border: 'none', cursor: 'pointer',
                    background: '#000',
                    color: '#fff', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                  title="Đóng camera"
                >✕</button>
              </div>

              {/* Face guide overlay */}
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5 }}>
                {/* Corner brackets */}
                {([
                  { top: '12%', left: '16%', borderTop: '3px solid rgba(255,255,255,0.85)', borderLeft: '3px solid rgba(255,255,255,0.85)' },
                  { top: '12%', right: '16%', borderTop: '3px solid rgba(255,255,255,0.85)', borderRight: '3px solid rgba(255,255,255,0.85)' },
                  { bottom: '20%', left: '16%', borderBottom: '3px solid rgba(255,255,255,0.85)', borderLeft: '3px solid rgba(255,255,255,0.85)' },
                  { bottom: '20%', right: '16%', borderBottom: '3px solid rgba(255,255,255,0.85)', borderRight: '3px solid rgba(255,255,255,0.85)' },
                ] as React.CSSProperties[]).map((s, i) => (
                  <div key={i} style={{ position: 'absolute', width: 26, height: 26, borderRadius: 3, ...s }} />
                ))}

                {/* Oval face guide */}
                <div style={{
                  width: '36%',
                  aspectRatio: '3/4',
                  borderRadius: '50%',
                  border: `2px solid ${facesDetected ? '#4fffb0' : 'rgba(255,255,255,0.55)'}`,
                  boxShadow: facesDetected ? '0 0 0 3px rgba(79,255,176,0.25)' : 'none',
                  transition: 'border-color 0.4s, box-shadow 0.4s',
                  marginBottom: '12%',
                }} />

                {/* Status pill */}
                <div style={{
                  position: 'absolute',
                  bottom: '10%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: 'rgba(0,0,0,0.6)',
                  backdropFilter: 'blur(8px)',
                  borderRadius: 999,
                  padding: '8px 22px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  whiteSpace: 'nowrap',
                }}>
                  {facesDetected ? (
                    <>
                      <Check className="w-4 h-4" style={{ color: '#4fffb0' }} />
                      <span style={{ color: '#fff', fontSize: 14, fontWeight: 500 }}>Phát hiện khuôn mặt!</span>
                    </>
                  ) : (
                    <>
                      <span style={{
                        display: 'inline-block', width: 16, height: 16, borderRadius: '50%',
                        border: '2.5px solid rgba(255,255,255,0.3)', borderTopColor: '#fff',
                        animation: 'face-spin 0.8s linear infinite', flexShrink: 0,
                      }} />
                      <span style={{ color: '#fff', fontSize: 14, fontWeight: 500 }}>Đang tìm khuôn mặt...</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Hint + actions below */}
            <p style={{ marginTop: 14, fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center' }}>
              <BulbOutlined /> Di chuyển khuôn mặt vào khung hình và giữ yên – Hệ thống sẽ tự động chụp
            </p>

            {false && (
              <Button type="primary" size="large" onClick={capturePhoto} style={{ marginTop: 4 }}>
                Chụp Ảnh
              </Button>
            )}

            {cameraError && (
              <Alert
                type="info"
                showIcon
                style={{ marginTop: '16px' }}
                message={cameraError}
              />
            )}
          </div>
        )}

        {/* Face Search Box */}
        {!previewUrl && (
          <div className="card card-padded mb-3">
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 20px' }}>
              <div style={{ fontSize: '64px', marginBottom: '16px' }}><CameraOutlined /></div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '8px' }}>Chụp hoặc tải ảnh khuôn mặt</h3>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '0.95rem' }}>
                AI sẽ tìm tất cả ảnh có khuôn mặt của bạn
              </p>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '24px' }}>
                <Button type="primary" onClick={startCamera} icon={<VideoCameraOutlined />}>Mở Camera</Button>
                <Button onClick={() => fileInputRef.current?.click()} icon={<PictureOutlined />}>Chọn Ảnh</Button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />

              <div style={{ paddingTop: '24px', borderTop: '1px solid var(--border)' }}>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: 0 }}>
                  <BulbOutlined /> <strong>Mẹo:</strong> Sử dụng ảnh mặt rõ nét, nhìn thẳng để kết quả tốt nhất
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Preview Section */}
        {previewUrl && (
          <div className="card card-padded mb-3">
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '16px' }}>Ảnh đã tải lên:</h3>
            <div style={{ textAlign: 'center' }}>
              <img
                src={previewUrl}
                alt="Preview"
                style={{
                  maxWidth: '300px',
                  maxHeight: '300px',
                  borderRadius: '12px',
                  boxShadow: 'var(--shadow)',
                  marginBottom: '16px'
                }}
              />
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                <Button
                  type="primary"
                  onClick={handleSearch}
                  loading={isSearching}
                  disabled={isSearching}
                  icon={<SearchOutlined />}
                >
                  {isSearching ? 'Đang xử lý...' : 'Bắt Đầu Tìm Kiếm'}
                </Button>
                <Button onClick={handleCancel} disabled={isSearching}>✕ Hủy</Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Hidden canvas for capturing photos */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
}
