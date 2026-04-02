import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Upload,
  CheckCircle,
  AlertCircle,
  Loader,
  Clock,
  ArrowUpCircle,
  FolderOpen,
  X,
} from 'lucide-react';
import { useMyLocations, type MyLocation } from '../../hooks/useMyLocations';
import { useUpload, type FileItem, type FileStatus } from '../../hooks/useUpload';
import { useStaffPhotoStream } from '../../hooks/useSSE';

const PRIMARY = '#1a6b4e';
const BORDER = '#e2e5ea';
const MAX_FILES = 50;

const ALLOWED_EXTS = ['.jpg', '.jpeg', '.png', '.cr2', '.nef', '.arw', '.rw2', '.rw', '.raf'];

function statusLabel(fi: Pick<FileItem, 'status' | 'retryAttempt' | 'maxRetries' | 'error'>): string {
  switch (fi.status) {
    case 'pending':    return 'Chờ';
    case 'uploading':  return 'Đang upload...';
    case 'retrying':   return `Thử lại ${fi.retryAttempt ?? '?'}/${fi.maxRetries}...`;
    case 'done':       return 'Đang xử lý';
    case 'processing': return 'Đang nhận diện';
    case 'indexed':    return 'Đã nhận diện';
    case 'cancelled':  return 'Đã hủy';
    case 'error':      return fi.error ?? 'Upload thất bại — thử lại sau';
  }
}

function StatusIcon({ status }: { status: FileStatus }) {
  const size = 16;
  switch (status) {
    case 'indexed':    return <CheckCircle size={size} color="#059669" />;
    case 'done':
    case 'processing': return <Loader size={size} color="#d97706" style={{ animation: 'spin 1s linear infinite' }} />;
    case 'retrying':   return <Loader size={size} color="#f59e0b" style={{ animation: 'spin 1s linear infinite' }} />;
    case 'error':      return <AlertCircle size={size} color="#dc2626" />;
    case 'cancelled':  return <AlertCircle size={size} color="#9ca3af" />;
    case 'uploading':  return <ArrowUpCircle size={size} color={PRIMARY} />;
    default:           return <Clock size={size} color="#9ca3af" />;
  }
}

export default function DirectUploadTab() {
  const { data: locations, loading: locLoading } = useMyLocations();

  const [selectedLocation, setSelectedLocation] = useState<MyLocation | null>(null);
  const [shootDate, setShootDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [albumCode, setAlbumCode] = useState('');
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const inputRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);

  const { fileItems, uploading, uploadDone, setFiles, startUpload, cancelFile, markIndexed } = useUpload();

  // SSE: mark files as 'indexed' when Celery finishes face recognition
  // HttpOnly cookie is sent automatically — no token in URL
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

  const buildItems = (files: File[]): File[] =>
    files
      .filter((f) => {
        const ext = '.' + (f.name.split('.').pop()?.toLowerCase() ?? '');
        return ALLOWED_EXTS.includes(ext);
      })
      .slice(0, MAX_FILES);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const items = buildItems(Array.from(e.target.files ?? []));
    setFiles(items);
    if (items.length) setStep(2);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const items = buildItems(Array.from(e.dataTransfer.files));
    setFiles(items);
    if (items.length) setStep(2);
  };

  const handleUpload = useCallback(async () => {
    if (!selectedLocation || !fileItems.length) return;
    setStep(3);
    await startUpload({
      location_id: selectedLocation.id,
      shoot_date: shootDate,
      album_code: albumCode || undefined,
    });
  }, [selectedLocation, fileItems.length, shootDate, albumCode, startUpload]);

  const doneCount  = fileItems.filter((fi) => ['done', 'processing', 'indexed'].includes(fi.status)).length;
  const errorCount = fileItems.filter((fi) => fi.status === 'error').length;
  const cancelledCount = fileItems.filter((fi) => fi.status === 'cancelled').length;
  const totalCount = fileItems.length;

  // Active (non-terminal) items for overall progress calculation
  const terminalStatuses: FileStatus[] = ['done', 'processing', 'indexed', 'error', 'cancelled'];
  const overallPct = totalCount
    ? Math.round((fileItems.filter((fi) => terminalStatuses.includes(fi.status)).length / totalCount) * 100)
    : 0;

  return (
    <div>
      {/* ── Step indicator ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16, paddingLeft: 4 }}>
        {([1, 2, 3] as const).map((s, i) => (
          <div key={s} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: step >= s ? PRIMARY : '#e5e7eb',
              color: step >= s ? '#fff' : '#9ca3af',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 700, flexShrink: 0,
            }}>
              {s}
            </div>
            {i < 2 && (
              <div style={{ width: 32, height: 2, background: step > s ? PRIMARY : '#e5e7eb', flexShrink: 0 }} />
            )}
          </div>
        ))}
        <span style={{ marginLeft: 10, fontSize: 13, color: '#6b7280' }}>
          {step === 1 && 'Chọn địa điểm'}
          {step === 2 && 'Chọn ảnh'}
          {step === 3 && 'Đang upload'}
        </span>
      </div>

      {/* ── Step 1: Location + Date + Album ─────────────────────────────────── */}
      <div style={{
        background: '#fff', borderRadius: 12, border: `1px solid ${BORDER}`,
        padding: 20, marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 8 }}>
          Địa điểm chụp *
        </label>
        {locLoading ? (
          <p style={{ color: '#9ca3af', fontSize: 13, margin: 0 }}>Đang tải...</p>
        ) : (
          <select
            value={selectedLocation?.id ?? ''}
            onChange={(e) => {
              const loc = (locations ?? []).find((l) => l.id === e.target.value) ?? null;
              setSelectedLocation(loc);
              if (loc) setStep(Math.max(step, 2) as 2 | 3);
            }}
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 8,
              border: `1px solid ${BORDER}`, fontSize: 14, background: '#fff',
              color: '#111827', boxSizing: 'border-box',
            }}
          >
            <option value="">-- Chọn địa điểm --</option>
            {(locations ?? []).filter((l) => l.can_upload).map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        )}

        <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginTop: 14, marginBottom: 8 }}>
          Ngày chụp *
        </label>
        <input
          type="date"
          value={shootDate}
          onChange={(e) => setShootDate(e.target.value)}
          style={{
            width: '100%', padding: '10px 12px', borderRadius: 8,
            border: `1px solid ${BORDER}`, fontSize: 14, color: '#111827',
            boxSizing: 'border-box',
          }}
        />

        <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginTop: 14, marginBottom: 8 }}>
          Album (tuỳ chọn)
        </label>
        <input
          type="text"
          value={albumCode}
          onChange={(e) => setAlbumCode(e.target.value)}
          placeholder="VD: LeTotNghiep2026"
          style={{
            width: '100%', padding: '10px 12px', borderRadius: 8,
            border: `1px solid ${BORDER}`, fontSize: 14, color: '#111827',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* ── Step 2: Drop zone ───────────────────────────────────────────────── */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        style={{
          background: '#fff', borderRadius: 12,
          border: `2px dashed ${fileItems.length ? PRIMARY : BORDER}`,
          padding: 28, textAlign: 'center', cursor: 'pointer',
          marginBottom: 12, transition: 'border-color 0.15s',
        }}
        onClick={() => inputRef.current?.click()}
      >
        <Upload size={32} color={fileItems.length ? PRIMARY : '#9ca3af'} style={{ marginBottom: 8 }} />
        <p style={{ margin: 0, fontSize: 14, color: '#374151', fontWeight: 600 }}>
          {fileItems.length ? `${fileItems.length} file đã chọn` : 'Nhấn để chọn ảnh hoặc kéo thả vào đây'}
        </p>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: '#9ca3af' }}>
          JPG · PNG · RAW (CR2, NEF, ARW, RW2, RAF) · Tối đa {MAX_FILES} file · {'>'}50 MB mỗi file
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ALLOWED_EXTS.join(',')}
          style={{ display: 'none' }}
          onChange={handleFileSelect}
        />
      </div>

      {/* Choose folder button */}
      <button
        type="button"
        onClick={() => folderRef.current?.click()}
        style={{
          width: '100%', padding: '10px', background: '#f9fafb',
          border: `1px solid ${BORDER}`, borderRadius: 8,
          fontSize: 13, color: '#374151', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 6, marginBottom: 12,
        }}
      >
        <FolderOpen size={16} /> Chọn Thư Mục
      </button>
      <input
        ref={folderRef}
        type="file"
        // @ts-expect-error webkitdirectory is not in HTMLInputElement types
        webkitdirectory=""
        multiple
        accept={ALLOWED_EXTS.join(',')}
        style={{ display: 'none' }}
        onChange={handleFileSelect}
      />

      {/* ── Step 3: File list + progress ────────────────────────────────────── */}
      {fileItems.length > 0 && (
        <div style={{
          background: '#fff', borderRadius: 12, border: `1px solid ${BORDER}`,
          marginBottom: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        }}>
          {/* Overall progress bar (visible during upload) */}
          {uploading && (
            <div style={{ padding: '12px 16px', borderBottom: `1px solid #f3f4f6` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>
                  Đang upload: {doneCount}/{totalCount} ảnh
                </span>
                <span style={{ fontSize: 13, color: '#6b7280' }}>{overallPct}%</span>
              </div>
              <div style={{ height: 8, background: '#e5e7eb', borderRadius: 4 }}>
                <div style={{
                  width: `${overallPct}%`, height: '100%',
                  background: PRIMARY, borderRadius: 4,
                  transition: 'width 0.2s',
                }} />
              </div>
            </div>
          )}

          <div style={{ padding: '10px 16px', borderBottom: `1px solid #f3f4f6`, fontSize: 13, fontWeight: 600, color: '#374151' }}>
            {totalCount} file
          </div>

          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            {fileItems.map((fi) => {
              const canCancel = (fi.status === 'uploading' || fi.status === 'retrying') && !!fi.mediaId;
              return (
                <div
                  key={fi.id}
                  style={{
                    padding: '10px 16px', borderBottom: '1px solid #f9fafb',
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}
                >
                  <StatusIcon status={fi.status} />
                  <span style={{
                    fontSize: 12, color: '#6b7280', flex: 1,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {fi.file.name}
                  </span>
                  {(fi.status === 'uploading' || fi.status === 'retrying') && (
                    <div style={{ width: 60, height: 4, background: '#e5e7eb', borderRadius: 2, flexShrink: 0 }}>
                      <div style={{
                        width: `${fi.progress}%`, height: '100%',
                        background: fi.status === 'retrying' ? '#f59e0b' : PRIMARY,
                        borderRadius: 2, transition: 'width 0.1s',
                      }} />
                    </div>
                  )}
                  <span style={{
                    fontSize: 11,
                    color: fi.status === 'error' ? '#dc2626' : fi.status === 'retrying' ? '#d97706' : '#9ca3af',
                    flexShrink: 0, whiteSpace: 'nowrap', maxWidth: 130,
                    overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {statusLabel(fi)}
                  </span>
                  {canCancel && (
                    <button
                      onClick={() => cancelFile(fi.mediaId!)}
                      title="Hủy upload"
                      style={{
                        flexShrink: 0, background: 'none', border: 'none',
                        cursor: 'pointer', padding: 2, color: '#9ca3af',
                        display: 'flex', alignItems: 'center',
                      }}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Upload button ────────────────────────────────────────────────────── */}
      {fileItems.length > 0 && !uploadDone && (
        <button
          onClick={handleUpload}
          disabled={uploading || !selectedLocation}
          style={{
            width: '100%', padding: '14px',
            background: uploading || !selectedLocation ? '#9ca3af' : PRIMARY,
            color: '#fff', border: 'none', borderRadius: 10,
            fontSize: 15, fontWeight: 700,
            cursor: uploading || !selectedLocation ? 'not-allowed' : 'pointer',
            transition: 'background 0.15s',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          {uploading ? (
            <><Loader size={18} /> Đang upload...</>
          ) : (
            <><ArrowUpCircle size={18} /> Upload {fileItems.filter((fi) => fi.status === 'pending').length} ảnh</>
          )}
        </button>
      )}

      {/* Result summary */}
      {uploadDone && (
        <div style={{
          marginTop: 12, padding: '14px 16px',
          background: errorCount === 0 ? '#f0fdf4' : '#fff7ed',
          borderRadius: 10,
          border: `1px solid ${errorCount === 0 ? '#bbf7d0' : '#fed7aa'}`,
          fontSize: 14,
          color: errorCount === 0 ? '#065f46' : '#92400e',
          fontWeight: 600, textAlign: 'center',
        }}>
          {doneCount > 0 && `${doneCount} ảnh đã upload thành công`}
          {errorCount > 0 && ` · ${errorCount} lỗi`}
          {cancelledCount > 0 && ` · ${cancelledCount} đã hủy`}
          {doneCount > 0 && (
            <div style={{ fontSize: 12, fontWeight: 400, marginTop: 4, color: '#6b7280' }}>
              Đang nhận diện khuôn mặt... kết quả sẽ cập nhật bên dưới.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
