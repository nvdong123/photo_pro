import { useState, useRef, useCallback } from 'react';
import { useMyLocations, type MyLocation } from '../../hooks/useMyLocations';

const PRIMARY = '#1a6b4e';
const BORDER = '#e2e5ea';
const API_BASE = import.meta.env.VITE_API_URL ?? '';
const MAX_FILES = 50;

type FileStatus = 'pending' | 'uploading' | 'done' | 'error';

interface FileItem {
  id: string;
  file: File;
  progress: number;
  status: FileStatus;
  error?: string;
}

export default function UsbUploadTab() {
  const { data: locations, loading: locLoading } = useMyLocations();

  const [selectedLocation, setSelectedLocation] = useState<MyLocation | null>(null);
  const [shootDate, setShootDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [fileItems, setFileItems] = useState<FileItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadDone, setUploadDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).slice(0, MAX_FILES);
    const items: FileItem[] = files.map(f => ({
      id: `${f.name}-${f.size}-${f.lastModified}`,
      file: f,
      progress: 0,
      status: 'pending',
    }));
    setFileItems(items);
    setUploadDone(false);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files)
      .filter(f => f.type === 'image/jpeg')
      .slice(0, MAX_FILES);
    const items: FileItem[] = files.map(f => ({
      id: `${f.name}-${f.size}-${f.lastModified}`,
      file: f,
      progress: 0,
      status: 'pending',
    }));
    setFileItems(items);
    setUploadDone(false);
  };

  const uploadOne = (item: FileItem, locationId: string, token: string | null): Promise<void> => {
    return new Promise(resolve => {
      const form = new FormData();
      form.append('location_id', locationId);
      form.append('shoot_date', shootDate);
      form.append('files', item.file);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_BASE}/api/v1/staff/upload/batch`);
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

      xhr.upload.onprogress = ev => {
        if (ev.lengthComputable) {
          const pct = Math.round((ev.loaded / ev.total) * 100);
          setFileItems(prev =>
            prev.map(fi => fi.id === item.id ? { ...fi, progress: pct, status: 'uploading' } : fi)
          );
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          setFileItems(prev =>
            prev.map(fi => fi.id === item.id ? { ...fi, progress: 100, status: 'done' } : fi)
          );
        } else {
          setFileItems(prev =>
            prev.map(fi => fi.id === item.id ? { ...fi, status: 'error', error: `HTTP ${xhr.status}` } : fi)
          );
        }
        resolve();
      };

      xhr.onerror = () => {
        setFileItems(prev =>
          prev.map(fi => fi.id === item.id ? { ...fi, status: 'error', error: 'Lỗi mạng' } : fi)
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
    const pending = fileItems.filter(f => f.status === 'pending');

    for (const item of pending) {
      await uploadOne(item, selectedLocation.id, token);
    }

    setUploading(false);
    setUploadDone(true);
  }, [selectedLocation, fileItems, shootDate]);

  const doneCount  = fileItems.filter(f => f.status === 'done').length;
  const errorCount = fileItems.filter(f => f.status === 'error').length;

  return (
    <div>
      {/* Location selector */}
      <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${BORDER}`, padding: 20, marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 8 }}>
          Địa điểm chụp
        </label>
        {locLoading ? (
          <p style={{ color: '#9ca3af', fontSize: 13 }}>Đang tải...</p>
        ) : (
          <select
            value={selectedLocation?.id ?? ''}
            onChange={e => {
              const loc = (locations ?? []).find(l => l.id === e.target.value) ?? null;
              setSelectedLocation(loc);
            }}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 8,
              border: `1px solid ${BORDER}`,
              fontSize: 14,
              background: '#fff',
              color: '#111827',
            }}
          >
            <option value="">-- Chọn địa điểm --</option>
            {(locations ?? []).filter(l => l.can_upload).map(l => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        )}

        {/* Shoot date */}
        <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginTop: 14, marginBottom: 8 }}>
          Ngày chụp
        </label>
        <input
          type="date"
          value={shootDate}
          onChange={e => setShootDate(e.target.value)}
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: 8,
            border: `1px solid ${BORDER}`,
            fontSize: 14,
            color: '#111827',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        style={{
          background: '#fff',
          borderRadius: 12,
          border: `2px dashed ${BORDER}`,
          padding: 24,
          textAlign: 'center',
          cursor: 'pointer',
          marginBottom: 12,
          transition: 'border-color 0.15s',
        }}
        onClick={() => inputRef.current?.click()}
      >
        <div style={{ fontSize: 32, marginBottom: 8 }}>📂</div>
        <p style={{ margin: 0, fontSize: 14, color: '#374151', fontWeight: 600 }}>
          Nhấn để chọn ảnh
        </p>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: '#9ca3af' }}>
          Hoặc kéo thả vào đây · JPEG · Tối đa {MAX_FILES} file
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/jpeg"
          style={{ display: 'none' }}
          onChange={handleFileSelect}
        />
      </div>

      {/* File list */}
      {fileItems.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${BORDER}`, marginBottom: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <div style={{ padding: '12px 16px', borderBottom: `1px solid #f3f4f6`, fontSize: 13, fontWeight: 600, color: '#374151' }}>
            {fileItems.length} file được chọn
          </div>
          <div style={{ maxHeight: 280, overflowY: 'auto' }}>
            {fileItems.map(fi => (
              <div key={fi.id} style={{ padding: '10px 16px', borderBottom: `1px solid #f9fafb`, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 12, color: '#6b7280', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {fi.file.name}
                </span>
                {fi.status === 'uploading' && (
                  <div style={{ width: 80, height: 6, background: '#e5e7eb', borderRadius: 3, flexShrink: 0 }}>
                    <div style={{ width: `${fi.progress}%`, height: '100%', background: PRIMARY, borderRadius: 3, transition: 'width 0.1s' }} />
                  </div>
                )}
                {fi.status === 'done' && <span style={{ color: '#059669', fontSize: 16, flexShrink: 0 }}>✓</span>}
                {fi.status === 'error' && (
                  <span style={{ color: '#dc2626', fontSize: 12, flexShrink: 0 }}>{fi.error ?? 'Lỗi'}</span>
                )}
                {fi.status === 'pending' && <span style={{ color: '#9ca3af', fontSize: 11, flexShrink: 0 }}>Chờ</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upload button */}
      {fileItems.length > 0 && (
        <button
          onClick={handleUpload}
          disabled={uploading || !selectedLocation}
          style={{
            width: '100%',
            padding: '14px',
            background: uploading || !selectedLocation ? '#9ca3af' : PRIMARY,
            color: '#fff',
            border: 'none',
            borderRadius: 10,
            fontSize: 15,
            fontWeight: 700,
            cursor: uploading || !selectedLocation ? 'not-allowed' : 'pointer',
            transition: 'background 0.15s',
          }}
        >
          {uploading ? 'Đang upload...' : `Upload ${fileItems.filter(f => f.status === 'pending').length} ảnh`}
        </button>
      )}

      {/* Result summary */}
      {uploadDone && (
        <div style={{
          marginTop: 12,
          padding: '14px 16px',
          background: errorCount === 0 ? '#f0fdf4' : '#fff7ed',
          borderRadius: 10,
          border: `1px solid ${errorCount === 0 ? '#bbf7d0' : '#fed7aa'}`,
          fontSize: 14,
          color: errorCount === 0 ? '#065f46' : '#92400e',
          fontWeight: 600,
          textAlign: 'center',
        }}>
          {doneCount > 0 && `✓ ${doneCount} ảnh đã upload thành công`}
          {errorCount > 0 && ` · ${errorCount} lỗi`}
        </div>
      )}
    </div>
  );
}
