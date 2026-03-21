import { useState, useRef, useCallback } from 'react';
import { Button, Tag, message, Progress, Spin, Segmented } from 'antd';
import {
  UploadOutlined,
  AppstoreOutlined,
  BarsOutlined,
  CloudUploadOutlined,
} from '@ant-design/icons';

interface LocationInfo {
  date: string;
  myPhotos: number;
  sold: number;
  color: string;
  bg: string;
}

const ASSIGNED_LOCATIONS: string[] = ['Bà Nà Hills', 'Hội An'];

const LOCATION_DATA: Record<string, LocationInfo> = {
  'Bà Nà Hills': { date: '20/02/2026', myPhotos: 80, sold: 45, color: '#1a6b4e', bg: '#e8f5f0' },
  'Hội An':      { date: '19/02/2026', myPhotos: 55, sold: 28, color: '#2563eb', bg: '#eff6ff' },
  'Cầu Rồng':   { date: '18/02/2026', myPhotos: 30, sold: 12, color: '#d4870e', bg: '#fef3e8' },
  'Sơn Trà':    { date: '17/02/2026', myPhotos: 0,  sold: 0,  color: '#7c3aed', bg: '#f5f3ff' },
};

interface UploadFileItem {
  id: string;
  name: string;
  size: string;
  progress: number;
  status: 'uploading' | 'done' | 'error';
}

type PhotoStatus = 'available' | 'sold';

interface PhotoItem {
  id: number;
  label: string;
  status: PhotoStatus;
  time: string;
  bg: string;
}

const PHOTO_COLORS = ['#e8d5b7', '#c4d6b0', '#b0c4d6', '#d6b0b0', '#d6d0b0', '#b0d6c4', '#c4b0d6', '#d6b0c4'];

function generatePhotos(count: number): PhotoItem[] {
  const statuses: PhotoStatus[] = ['available', 'available', 'available', 'sold', 'available', 'sold'];
  return Array.from({ length: Math.min(count, 24) }, (_, i) => ({
    id: i + 1,
    label: `IMG_${String(342 + i).padStart(4, '0')}.jpg`,
    status: statuses[i % statuses.length],
    time: `${String(8 + Math.floor(i / 4)).padStart(2, '0')}:${String((i * 7) % 60).padStart(2, '0')}`,
    bg: PHOTO_COLORS[i % PHOTO_COLORS.length],
  }));
}

export default function StaffUpload() {
  const [selectedLoc, setSelectedLoc] = useState<string | null>(null);
  const [uploadFiles, setUploadFiles] = useState<UploadFileItem[]>([]);
  const [photoView, setPhotoView] = useState<'grid' | 'list'>('grid');
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const totalPhotos = ASSIGNED_LOCATIONS.reduce((s, n) => s + (LOCATION_DATA[n]?.myPhotos || 0), 0);
  const totalSold = ASSIGNED_LOCATIONS.reduce((s, n) => s + (LOCATION_DATA[n]?.sold || 0), 0);
  const todayPhotos = 12;

  const currentLocData = selectedLoc ? LOCATION_DATA[selectedLoc] : null;
  const photos = currentLocData ? generatePhotos(currentLocData.myPhotos) : [];

  function selectLocation(name: string) {
    setSelectedLoc(name);
    setUploadFiles([]);
  }

  function simulateUpload(files: File[]) {
    if (files.length > 20) {
      message.warning('Tối đa 20 ảnh/lần. Chỉ 20 ảnh đầu tiên được chọn.');
    }
    const limited = files.slice(0, 20);
    const items: UploadFileItem[] = limited.map((f, i) => ({
      id: `file-${Date.now()}-${i}`,
      name: f.name,
      size: (f.size / 1024 / 1024).toFixed(1) + ' MB',
      progress: 0,
      status: 'uploading' as const,
    }));
    setUploadFiles(prev => [...prev, ...items]);

    items.forEach((item, idx) => {
      const speed = 800 + Math.random() * 1500;
      const delay = idx * 300;
      setTimeout(() => {
        let progress = 0;
        const interval = setInterval(() => {
          progress += Math.random() * 15 + 5;
          if (progress >= 100) {
            progress = 100;
            clearInterval(interval);
            setUploadFiles(prev => prev.map(f =>
              f.id === item.id ? { ...f, progress: 100, status: 'done' } : f
            ));
          } else {
            setUploadFiles(prev => prev.map(f =>
              f.id === item.id ? { ...f, progress: Math.floor(progress) } : f
            ));
          }
        }, speed / 10);
      }, delay);
    });
  }

  function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    if (!selectedLoc) { message.error('Vui lòng chọn địa điểm trước khi upload.'); return; }
    simulateUpload(Array.from(fileList));
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFiles(e.dataTransfer.files);
  }, [selectedLoc]);

  const doneCount = uploadFiles.filter(f => f.status === 'done').length;
  const hasUploads = uploadFiles.length > 0;

  // Scroll into upload section after location select
  function handleSelectLoc(name: string) {
    selectLocation(name);
    setTimeout(() => {
      document.getElementById('uploadSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Upload Ảnh</h1>
      </div>

      {/* Quick Stats Banner */}
      <div style={{
        display: 'flex', alignItems: 'center', background: '#fff',
        border: '1px solid #e2e5ea', borderRadius: 12,
        padding: '16px 24px', marginBottom: 24,
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}>
        {[
          { icon: '', value: ASSIGNED_LOCATIONS.length, label: 'Địa điểm', bg: '#e8f5f0', color: '#1a6b4e' },
          { icon: '', value: totalPhotos, label: 'Tổng ảnh', bg: '#e8f5f0', color: '#1a6b4e' },
          { icon: '', value: totalSold, label: 'Đã bán', bg: '#dcfce7', color: '#1a854a' },
          { icon: '', value: todayPhotos, label: 'Hôm nay', bg: '#fef3e8', color: '#d4870e' },
        ].map((item, i, arr) => (
          <div key={item.label} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10, background: item.bg, color: item.color,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0,
            }}>
              {item.icon}
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#1a1d23', lineHeight: 1.1 }}>{item.value}</div>
              <div style={{ fontSize: 12, color: '#8b91a0', fontWeight: 500 }}>{item.label}</div>
            </div>
            {i < arr.length - 1 && (
              <div style={{ width: 1, height: 36, background: '#e2e5ea', margin: '0 8px' }} />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Choose Location */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e5ea', marginBottom: 24, overflow: 'hidden' }}>
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid #e2e5ea',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
             Chọn Địa Điểm
          </h3>
          <Tag color="blue">{ASSIGNED_LOCATIONS.length} địa điểm</Tag>
        </div>
        <div style={{ padding: 20 }}>
          {ASSIGNED_LOCATIONS.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#8b91a0' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}></div>
              <h4 style={{ margin: '0 0 4px', fontWeight: 600 }}>Chưa có địa điểm</h4>
              <p style={{ margin: 0 }}>Bạn chưa được phân công vào địa điểm nào. Liên hệ Admin để được phân công.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {ASSIGNED_LOCATIONS.map(name => {
                const d = LOCATION_DATA[name];
                const isSelected = selectedLoc === name;
                return (
                  <div
                    key={name}
                    onClick={() => handleSelectLoc(name)}
                    style={{
                      border: `2px solid ${isSelected ? d.color : '#e2e5ea'}`,
                      borderRadius: 14,
                      cursor: 'pointer',
                      overflow: 'hidden',
                      background: isSelected ? d.bg : '#fff',
                      boxShadow: isSelected ? `0 4px 20px ${d.color}26` : '0 1px 3px rgba(0,0,0,0.04)',
                      transition: 'all 0.25s',
                      position: 'relative',
                    }}
                  >
                    {/* Color bar */}
                    <div style={{ height: 6, background: d.color }} />
                    <div style={{ padding: 20 }}>
                      <div style={{ display: 'flex', gap: 14, marginBottom: 16, alignItems: 'flex-start' }}>
                        <div style={{
                          width: 48, height: 48, borderRadius: 12, background: d.bg, color: d.color,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0,
                        }}>
                          
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 2 }}>{name}</div>
                          <div style={{ fontSize: 12, color: '#8b91a0', display: 'flex', alignItems: 'center', gap: 4 }}>
                             {d.date}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div style={{ padding: '10px 12px', background: 'rgba(0,0,0,0.03)', borderRadius: 8, textAlign: 'center' }}>
                          <div style={{ fontSize: 20, fontWeight: 800, color: d.color }}>{d.myPhotos}</div>
                          <div style={{ fontSize: 11, color: '#8b91a0', marginTop: 2 }}>Ảnh của tôi</div>
                        </div>
                        <div style={{ padding: '10px 12px', background: 'rgba(0,0,0,0.03)', borderRadius: 8, textAlign: 'center' }}>
                          <div style={{ fontSize: 20, fontWeight: 800, color: d.color }}>{d.sold}</div>
                          <div style={{ fontSize: 11, color: '#8b91a0', marginTop: 2 }}>Đã bán</div>
                        </div>
                      </div>
                    </div>
                    {isSelected && (
                      <div style={{
                        position: 'absolute', top: 16, right: 16,
                        width: 26, height: 26, borderRadius: '50%', background: d.color,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: `0 2px 8px ${d.color}4d`,
                        color: '#fff', fontSize: 14,
                      }}>
                        
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Step 2: Upload & Photos (shown after location selected) */}
      {selectedLoc && currentLocData && (
        <div id="uploadSection">
          {/* Selected location banner */}
          <div style={{
            background: 'linear-gradient(135deg, #1a6b4e 0%, #145a3e 100%)',
            borderRadius: 12, padding: '16px 24px', marginBottom: 24,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#fff',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 12,
                background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
              }}>
                
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{selectedLoc}</h3>
                <span style={{ fontSize: 13, opacity: 0.85 }}>
                   {currentLocData.date} · {currentLocData.myPhotos} ảnh đã upload
                </span>
              </div>
            </div>
            <Tag color="success" style={{ fontSize: 12, padding: '4px 12px' }}> Đang hoạt động</Tag>
          </div>

          {/* Upload Zone */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e5ea', marginBottom: 24, overflow: 'hidden' }}>
            <div style={{
              padding: '16px 20px', borderBottom: '1px solid #e2e5ea',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <CloudUploadOutlined /> Tải ảnh lên
              </h3>
              {hasUploads && <Tag color="blue">{uploadFiles.length} ảnh</Tag>}
            </div>
            <div style={{ padding: 20 }}>
              {/* Drop zone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={onDrop}
                style={{
                  border: `2px dashed ${isDragOver ? '#1a6b4e' : '#e2e5ea'}`,
                  borderRadius: 16, padding: '40px 24px', cursor: 'pointer', textAlign: 'center',
                  background: isDragOver
                    ? 'rgba(26,107,78,0.06)'
                    : 'linear-gradient(135deg, rgba(26,107,78,0.02) 0%, rgba(26,107,78,0.06) 100%)',
                  boxShadow: isDragOver ? '0 0 0 4px rgba(26,107,78,0.08)' : 'none',
                  transition: 'all 0.25s',
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/heic"
                  style={{ display: 'none' }}
                  onChange={e => handleFiles(e.target.files)}
                />
                <div style={{
                  width: 72, height: 72, borderRadius: '50%',
                  background: '#e8f5f0', color: '#1a6b4e',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: 12, fontSize: 32,
                  transition: 'transform 0.2s',
                }}>
                  
                </div>
                <h4 style={{ margin: '0 0 4px', fontWeight: 600, fontSize: 16 }}>Kéo thả ảnh vào đây</h4>
                <p style={{ color: '#8b91a0', margin: '0 0 12px', fontSize: 13 }}>
                  hoặc nhấn để chọn file từ máy tính
                </p>
                <div style={{
                  display: 'inline-flex', gap: 16, padding: '8px 20px',
                  background: '#f6f7f9', borderRadius: 20,
                  fontSize: 12, color: '#5a6170',
                }}>
                  <span> JPG, PNG, HEIC</span>
                  <span> Tối đa 20 ảnh/lần</span>
                  <span> 50MB/ảnh</span>
                </div>
              </div>

              {/* Upload progress list */}
              {hasUploads && (
                <div style={{ marginTop: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <h5 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                      {doneCount === uploadFiles.length ? (
                        <span style={{ color: '#1a854a' }}> Upload hoàn tất!</span>
                      ) : (
                        <><Spin size="small" /> Đang tải lên...</>
                      )}
                    </h5>
                    <span style={{ fontSize: 13, color: '#8b91a0' }}>{doneCount}/{uploadFiles.length} hoàn thành</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {uploadFiles.map(f => (
                      <div key={f.id} style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '12px 14px', background: '#f6f7f9', borderRadius: 10,
                        border: `1px solid ${f.status === 'done' ? '#bbf7d0' : '#e2e5ea'}`,
                      }}>
                        <div style={{
                          width: 38, height: 38, borderRadius: 8, background: '#e8f5f0', color: '#1a6b4e',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 18,
                        }}>
                          
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                          <div style={{ fontSize: 12, color: '#8b91a0' }}>{f.size}</div>
                        </div>
                        <div style={{ width: 120, flexShrink: 0 }}>
                          <Progress percent={f.progress} size="small" showInfo={false} style={{ marginBottom: 0 }} />
                        </div>
                        <div style={{
                          width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: f.status === 'done' ? '#dcfce7' : 'transparent',
                          color: f.status === 'done' ? '#1a854a' : '#8b91a0',
                          fontSize: 12,
                        }}>
                          {f.status === 'done' ? '' : `${f.progress}%`}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Photo Grid */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e5ea', overflow: 'hidden' }}>
            <div style={{
              padding: '16px 20px', borderBottom: '1px solid #e2e5ea',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                 Ảnh đã upload
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, color: '#8b91a0' }}>{currentLocData.myPhotos} ảnh</span>
                <Segmented
                  value={photoView}
                  onChange={(v) => setPhotoView(v as 'grid' | 'list')}
                  options={[
                    { value: 'grid', icon: <AppstoreOutlined /> },
                    { value: 'list', icon: <BarsOutlined /> },
                  ]}
                />
              </div>
            </div>
            <div style={{ padding: 20 }}>
              {currentLocData.myPhotos === 0 ? (
                <div style={{ textAlign: 'center', padding: '56px 24px' }}>
                  <div style={{
                    width: 80, height: 80, borderRadius: '50%', background: '#e8f5f0', color: '#1a6b4e',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, marginBottom: 16,
                  }}>
                    
                  </div>
                  <h4 style={{ margin: '0 0 4px', fontWeight: 600 }}>Chưa có ảnh nào</h4>
                  <p style={{ color: '#8b91a0', margin: 0, fontSize: 13 }}>Hãy upload ảnh đầu tiên cho địa điểm này!</p>
                </div>
              ) : (
                <div style={photoView === 'grid' ? {
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                  gap: 14,
                } : {
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}>
                  {photos.map(p => (
                    photoView === 'grid' ? (
                      <div key={p.id} style={{
                        position: 'relative', borderRadius: 12, overflow: 'hidden',
                        aspectRatio: '3/4', background: p.bg,
                        border: '1px solid #e2e5ea', cursor: 'pointer',
                        transition: 'all 0.2s',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'rgba(0,0,0,0.15)', fontSize: 28, fontWeight: 800,
                      }}
                      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.1)'; }}
                      onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
                      >
                        {p.id}
                        <div style={{ position: 'absolute', top: 10, right: 10 }}>
                          <Tag color={p.status === 'sold' ? 'success' : 'blue'} style={{ fontSize: 10, padding: '2px 8px' }}>
                            {p.status === 'sold' ? 'Đã bán' : 'Có sẵn'}
                          </Tag>
                        </div>
                        <div style={{
                          position: 'absolute', bottom: 0, left: 0, right: 0,
                          padding: '10px 12px',
                          background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
                          color: '#fff', fontSize: 11,
                        }}>
                          {p.label} · {p.time}
                        </div>
                      </div>
                    ) : (
                      <div key={p.id} style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '10px 14px', background: '#f6f7f9', borderRadius: 8,
                        border: '1px solid #e2e5ea', cursor: 'pointer',
                      }}>
                        <div style={{
                          width: 40, height: 40, borderRadius: 8, background: p.bg,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontWeight: 700, fontSize: 13, color: '#666', flexShrink: 0,
                        }}>
                          {p.id}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 500, fontSize: 13 }}>{p.label}</div>
                          <div style={{ fontSize: 11, color: '#8b91a0' }}>{p.time}</div>
                        </div>
                        <Tag color={p.status === 'sold' ? 'success' : 'blue'} style={{ fontSize: 11 }}>
                          {p.status === 'sold' ? 'Đã bán' : 'Có sẵn'}
                        </Tag>
                      </div>
                    )
                  ))}
                  {currentLocData.myPhotos > 24 && photoView === 'grid' && (
                    <div style={{
                      borderRadius: 12, border: '2px dashed #e2e5ea',
                      aspectRatio: '3/4', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', background: '#f6f7f9',
                    }}>
                      <div style={{ textAlign: 'center', color: '#8b91a0' }}>
                        <strong style={{ fontSize: 24, display: 'block', color: '#1a6b4e' }}>+{currentLocData.myPhotos - 24}</strong>
                        <span style={{ fontSize: 12 }}>ảnh khác</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
