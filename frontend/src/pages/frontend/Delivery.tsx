import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Checkbox, Alert, message } from 'antd';
import { DownloadOutlined, InboxOutlined, PictureOutlined, BulbOutlined, QuestionCircleOutlined, PhoneOutlined, MessageOutlined, AlertOutlined } from '@ant-design/icons';
import '../styles/frontend.css';

interface Photo {
  id: number;
  name: string;
  imageURL: string;
}

export default function Delivery() {
  const navigate = useNavigate();
  const [showOriginalSize, setShowOriginalSize] = useState(false);
  const [timeLeft, setTimeLeft] = useState('23:59:59');

  const [orderCode, setOrderCode] = useState('WL0000');
  const [photos, setPhotos] = useState<Photo[]>([]);

  useEffect(() => {
    // Load order info from localStorage
    try {
      const savedOrder = localStorage.getItem('photopro_order');
      if (savedOrder) {
        const order = JSON.parse(savedOrder);
        if (order.code) setOrderCode(order.code);
      }
    } catch { /* ignore */ }

    // Load selected photos from localStorage
    try {
      const savedPhotos = localStorage.getItem('photopro_selected_photos');
      if (savedPhotos) {
        const parsed: any[] = JSON.parse(savedPhotos);
        setPhotos(parsed.map((p, i) => ({
          id: p.id ?? i + 1,
          name: p.name ?? `Photo ${i + 1}`,
          imageURL: p.imageURL ?? p.url ?? `https://via.placeholder.com/200x200?text=Photo+${i + 1}`
        })));
      }
    } catch { /* ignore */ }

    // Countdown from expiryHours (default 24h)
    let expiryHours = 24;
    try {
      const savedOrder = localStorage.getItem('photopro_order');
      if (savedOrder) {
        const order = JSON.parse(savedOrder);
        if (order.expiryHours) expiryHours = order.expiryHours;
      }
    } catch { /* ignore */ }

    let seconds = expiryHours * 3600;
    const interval = setInterval(() => {
      seconds--;
      if (seconds < 0) {
        setTimeLeft('Đã hết hạn');
        clearInterval(interval);
      } else {
        const hours = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        setTimeLeft(`${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const handleDownloadAll = () => {
    message.loading({ content: 'Đang tạo ZIP với tất cả ảnh... Vui lòng chờ.', key: 'download-all', duration: 2 });
    setTimeout(() => {
      message.success({ content: '✓ Tải xuống hoàn tất!', key: 'download-all' });
    }, 2000);
  };

  const handleDownloadPhoto = (photoId: number) => {
    message.loading({ content: `Đang tải ảnh ${photoId}...`, key: `download-${photoId}`, duration: 1 });
    setTimeout(() => {
      message.success({ content: `✓ Ảnh ${photoId} đã tải xuống!`, key: `download-${photoId}` });
    }, 1000);
  };

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
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--primary)' }}>
              {orderCode}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Số lượng ảnh</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>
              {photos.length} ảnh
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Thời gian còn lại</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--primary)' }}>
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
          message={<><strong>Lưu ý:</strong> Link này sẽ hết hạn sau <strong style={{ whiteSpace: 'nowrap' }}>24 giờ</strong>. Vui lòng tải tất cả ảnh về máy trước khi hết hạn.</>}
        />

        {/* Download All Button */}
        <div style={{ background: '#1a6b4e', color: 'white', padding: '20px', borderRadius: '8px', marginBottom: '24px', textAlign: 'center' }}>
          <h3 style={{ color: 'white', marginBottom: '8px', fontSize: '1.1rem', fontWeight: 700 }}><InboxOutlined /> Tải Tất Cả Ảnh</h3>
          <p style={{ opacity: 0.9, marginBottom: '16px' }}>File ZIP chứa toàn bộ ảnh chất lượng cao</p>
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

        {/* Individual Photo Download */}
        <div style={{ background: '#fff', padding: '16px', borderRadius: '8px', border: '1px solid #e0e0e0', marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid #e0e0e0' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Hoặc Tải Từng Ảnh</h3>
            <Checkbox
              checked={showOriginalSize}
              onChange={(e) => setShowOriginalSize(e.target.checked)}
            >
              Xem kích thước gốc
            </Checkbox>
          </div>

          {/* Photos Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: '16px'
          }}>
            {photos.map((photo, index) => (
              <div
                key={photo.id}
                style={{
                  position: 'relative',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  background: '#f9f9f9',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  cursor: 'pointer',
                  aspectRatio: '1'
                }}

              >
                <img
                  src={photo.imageURL}
                  alt={`Photo ${index + 1}`}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block'
                  }}
                />
                
                {/* Download Overlay */}
                <div
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
                    opacity: 0,
                    transition: 'opacity 0.2s',
                    height: '100%',
                  }}

                >
                  <div style={{ color: 'white', fontSize: '12px' }}>
                    <div style={{ fontWeight: 600 }}>Photo {index + 1}</div>
                    <div style={{ fontSize: '11px', opacity: 0.8 }}>~3 MB</div>
                  </div>
                  <Button
                    size="small"
                    onClick={() => handleDownloadPhoto(photo.id)}
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
            <li style={{ marginBottom: '8px' }}>Nên tải file ZIP để có tất cả ảnh một lần</li>
            <li style={{ marginBottom: '8px' }}>Ảnh gốc có độ phân giải cao, kích thước lớn</li>
            <li style={{ marginBottom: '8px' }}>Nếu link hết hạn, liên hệ hotline để được hỗ trợ</li>
            <li style={{ marginBottom: '8px' }}>Lưu ảnh vào Google Drive/Cloud để an toàn</li>
            <li>Có thể in ảnh ở studio với chất lượng tốt nhất</li>
          </ul>
        </div>

        {/* Contact Support */}
        <div style={{ background: '#fff', padding: '16px', borderRadius: '8px', border: '1px solid #e0e0e0', textAlign: 'center', marginBottom: '24px' }}>
          <h3 style={{ marginBottom: '12px', fontSize: '1rem', fontWeight: 700 }}><QuestionCircleOutlined /> Cần Hỗ Trợ?</h3>
          <p style={{ color: '#666', marginBottom: '16px' }}>
            Gặp vấn đề khi tải ảnh? Liên hệ ngay:
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button href="tel:0987654321" icon={<PhoneOutlined />}>Hotline</Button>
            <Button href="https://zalo.me/wonderlandphoto" target="_blank" rel="noopener noreferrer" icon={<MessageOutlined />}>Zalo</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
