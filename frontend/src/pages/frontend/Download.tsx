import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDownloadInfo } from '../../hooks/useDownloadInfo';
import { API_BASE } from '../../lib/api-client';
import { Button, Alert, Spin, message } from 'antd';
import { DownloadOutlined, InboxOutlined, BulbOutlined, QuestionCircleOutlined, PhoneOutlined, MessageOutlined, AlertOutlined } from '@ant-design/icons';
import '../styles/frontend.css';

export default function Download() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { data: info, loading, error } = useDownloadInfo(token ?? '');
  const [timeLeft, setTimeLeft] = useState('--:--:--');

  // Detect mobile device
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
    (typeof window !== 'undefined' && window.innerWidth < 768);

  useEffect(() => {
    if (!info?.expires_at) return;
    const expiresAt = new Date(info.expires_at).getTime();

    const tick = () => {
      const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      if (remaining <= 0) { setTimeLeft('Đã hết hạn'); return; }
      const h = Math.floor(remaining / 3600);
      const m = Math.floor((remaining % 3600) / 60);
      const s = remaining % 60;
      setTimeLeft(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    };

    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [info?.expires_at]);

  const handleDownloadAll = () => {
    if (!token) return;
    window.location.href = `${API_BASE}/api/v1/download/${token}/zip`;
  };

  const handleDownloadPhoto = (mediaId: string) => {
    if (!token) return;
    // Use direct redirect to presigned URL — avoids popup blocking on mobile
    const url = `${API_BASE}/api/v1/download/${token}/single/${mediaId}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  if (loading) {
    return (
      <div style={{ paddingTop: '120px', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" tip="Đang tải thông tin đơn hàng..." />
      </div>
    );
  }

  if (error || !info) {
    return (
      <div style={{ paddingTop: '120px', minHeight: '100vh', padding: '120px 24px 40px' }}>
        <div className="container" style={{ maxWidth: 600 }}>
          <Alert
            type="error"
            showIcon
            message="Link tải ảnh không hợp lệ hoặc đã hết hạn"
            description={error ?? 'Vui lòng kiểm tra lại link hoặc liên hệ hỗ trợ.'}
            action={<Button onClick={() => navigate('/lookup')}>Tra cứu đơn hàng</Button>}
          />
        </div>
      </div>
    );
  }

  const photos = info.photo_previews ?? [];

  return (
    <div className="page-section active" style={{ paddingTop: '120px', paddingBottom: '40px', minHeight: '100vh' }}>
      <div className="container">
        {/* Page Header */}
        <div className="page-header">
          <h1><DownloadOutlined /> Tải Ảnh</h1>
          <p>Tải xuống các ảnh của bạn</p>
        </div>

        {/* Order Info Bar */}
        <div
          className="card card-padded mb-3"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '16px',
            flexWrap: 'wrap',
            backgroundColor: 'rgba(26, 107, 78, 0.05)',
            borderLeft: '4px solid var(--primary)'
          }}
        >
          <div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Mã Đơn Hàng</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--primary)' }}>{info.order_code}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Số lượng ảnh</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{photos.length} ảnh</div>
          </div>
          <div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Thời gian còn lại</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: timeLeft === 'Đã hết hạn' ? 'var(--error)' : 'var(--primary)' }}>
              {timeLeft}
            </div>
          </div>
        </div>

        {/* Expiry Warning */}
        <Alert
          type="warning"
          showIcon
          icon={<AlertOutlined />}
          style={{ marginBottom: '24px' }}
          message={<><strong>Lưu ý:</strong> Link này sẽ hết hạn vào <strong>{new Date(info.expires_at).toLocaleString('vi-VN')}</strong>. Vui lòng tải tất cả ảnh về máy trước khi hết hạn.</>}
        />

        {/* Download section — ZIP on desktop, individual on mobile */}
        {!isMobile ? (
          /* ── Desktop: ZIP download ── */
          <div style={{ background: '#1a6b4e', color: 'white', padding: '20px', borderRadius: '8px', marginBottom: '24px', textAlign: 'center' }}>
            <h3 style={{ color: 'white', marginBottom: '8px', fontSize: '1.1rem', fontWeight: 700 }}><InboxOutlined /> Tải Tất Cả Ảnh</h3>
            <p style={{ opacity: 0.9, marginBottom: '16px' }}>File ZIP chứa toàn bộ ảnh gốc chất lượng cao</p>
            <Button
              size="large"
              onClick={handleDownloadAll}
              icon={<DownloadOutlined />}
              style={{ background: 'white', color: '#1a6b4e', fontWeight: 600, height: 'auto', padding: '12px 32px', fontSize: '18px' }}
            >
              Tải Tất Cả (ZIP)
            </Button>
            <p style={{ fontSize: '14px', opacity: 0.8, marginTop: '16px', marginBottom: 0 }}>
              Dung lượng: <strong>~{(photos.length * 3).toFixed(1)} MB</strong>
            </p>
          </div>
        ) : (
          /* ── Mobile: individual per-photo download ── */
          <div style={{ background: '#1a6b4e', color: 'white', padding: '16px', borderRadius: '8px', marginBottom: '24px', textAlign: 'center' }}>
            <h3 style={{ color: 'white', marginBottom: '6px', fontSize: '1rem', fontWeight: 700 }}><InboxOutlined /> Tải Lần Lượt Từng Ảnh</h3>
            <p style={{ opacity: 0.85, marginBottom: 0, fontSize: '0.88rem' }}>Nhấn nút Tải trên mỗi ảnh bên dưới để lưu về thiết bị</p>
          </div>
        )}

        {/* Individual Photo Download */}
        <div style={{ background: '#fff', padding: '16px', borderRadius: '8px', border: '1px solid #e0e0e0', marginBottom: '24px' }}>
          <div style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid #e0e0e0' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>
              {isMobile ? 'Tải Từng Ảnh' : 'Hoặc Tải Từng Ảnh'}
            </h3>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
            {photos.map((photo, index) => (
              <div
                key={photo.media_id}
                style={{
                  position: 'relative',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  background: '#f9f9f9',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                  aspectRatio: '1'
                }}
              >
                <img
                  src={photo.preview_url}
                  alt={`Photo ${index + 1}`}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
                <div
                  className="dl-overlay"
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    padding: '12px',
                    background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-end',
                    height: '100%',
                  }}
                >
                  <div style={{ color: 'white', fontSize: '12px' }}>
                    <div style={{ fontWeight: 600 }}>Photo {index + 1}</div>
                    <div style={{ fontSize: '11px', opacity: 0.8 }}>~3 MB</div>
                  </div>
                  <Button
                    size="small"
                    onClick={() => handleDownloadPhoto(photo.media_id)}
                    icon={<DownloadOutlined />}
                    style={{ background: 'white', color: '#1a6b4e', fontWeight: 600 }}
                  >
                    Tải
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tips Section */}
        <div style={{ background: '#f9f9f9', padding: '16px', borderRadius: '8px', border: '1px solid #e0e0e0', marginBottom: '24px' }}>
          <h3 style={{ marginBottom: '12px', fontSize: '1rem', fontWeight: 700 }}><BulbOutlined /> Mẹo Tải Ảnh</h3>
          <ul style={{ margin: 0, paddingLeft: '20px', color: '#666', lineHeight: '1.8' }}>
            <li>Nên tải file ZIP để có tất cả ảnh một lần</li>
            <li>Ảnh gốc có độ phân giải cao, kích thước lớn</li>
            <li>Nếu link hết hạn, liên hệ hotline để được hỗ trợ</li>
            <li>Lưu ảnh vào Google Drive/Cloud để an toàn</li>
            <li>Có thể in ảnh ở studio với chất lượng tốt nhất</li>
          </ul>
        </div>

        {/* Contact Support */}
        <div style={{ background: '#fff', padding: '16px', borderRadius: '8px', border: '1px solid #e0e0e0', textAlign: 'center' }}>
          <h3 style={{ marginBottom: '12px', fontSize: '1rem', fontWeight: 700 }}><QuestionCircleOutlined /> Cần Hỗ Trợ?</h3>
          <p style={{ color: '#666', marginBottom: '16px' }}>Gặp vấn đề khi tải ảnh? Liên hệ ngay:</p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button href="tel:0987654321" icon={<PhoneOutlined />}>Hotline</Button>
            <Button href="https://zalo.me/wonderlandphoto" target="_blank" rel="noopener noreferrer" icon={<MessageOutlined />}>Zalo</Button>
          </div>
        </div>
      </div>

      <style>{`
        .dl-overlay { opacity: 0; transition: opacity 0.2s; }
        .dl-overlay:hover { opacity: 1; }
      `}</style>
    </div>
  );
}
