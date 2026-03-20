import { useNavigate } from 'react-router-dom';
import { useAlbums } from '../../hooks/useAlbums';
import { usePublicBundles } from '../../hooks/usePublicBundles';
import { Button, Spin, Alert, Collapse, Badge, Card, Tag, Skeleton } from 'antd';
import {
  CameraOutlined,
  SearchOutlined,
  MobileOutlined,
  ScanOutlined,
  CreditCardOutlined,
  DollarOutlined,
  BulbOutlined,
  QuestionCircleOutlined,
  PictureOutlined,
} from '@ant-design/icons';
import '../styles/frontend.css';

// ── Logo SVG ─────────────────────────────────────────────────────────────────
function PhotoProLogo({ size = 40, showText = true }: { size?: number; showText?: boolean }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="40" height="40" rx="10" fill="var(--primary)" />
        {/* lens outer */}
        <circle cx="20" cy="21" r="9" stroke="white" strokeWidth="2.2" />
        {/* lens inner */}
        <circle cx="20" cy="21" r="5" fill="white" fillOpacity="0.25" stroke="white" strokeWidth="1.5" />
        {/* viewfinder top bar */}
        <rect x="13" y="11" width="14" height="3" rx="1.5" fill="white" />
        {/* flash bump */}
        <rect x="29" y="13" width="4" height="3" rx="1" fill="white" fillOpacity="0.7" />
        {/* center dot */}
        <circle cx="20" cy="21" r="2" fill="white" />
      </svg>
      {showText && (
        <span style={{ fontWeight: 800, fontSize: size * 0.55, color: 'var(--primary)', letterSpacing: '-0.5px', lineHeight: 1 }}>
          102Photo
        </span>
      )}
    </div>
  );
}

// ── Gallery sample data ───────────────────────────────────────────────────────
const GALLERY_SAMPLES = [
  { id: 1, src: 'https://picsum.photos/seed/banahills/600/400',   label: 'Bà Nà Hills' },
  { id: 2, src: 'https://picsum.photos/seed/hoian/600/400',       label: 'Hội An' },
  { id: 3, src: 'https://picsum.photos/seed/halong/600/400',      label: 'Hạ Long' },
  { id: 4, src: 'https://picsum.photos/seed/sapa2026/600/400',    label: 'Sa Pa' },
  { id: 5, src: 'https://picsum.photos/seed/dalat2026/600/400',   label: 'Đà Lạt' },
  { id: 6, src: 'https://picsum.photos/seed/phuquoc26/600/400',   label: 'Phú Quốc' },
];

interface Album {
  id: string;
  name: string;
  photoCount: number;
}

export default function Landing() {
  const navigate = useNavigate();
  const { data: apiAlbums, loading } = useAlbums();
  const { bundles, loading: bundleLoading } = usePublicBundles();
  const albums: Album[] = (apiAlbums ?? []).slice(0, 4).map(a => ({
    id: a.id,
    name: a.name,
    photoCount: a.media_count,
  }));

  return (
    <div className="page-section active" style={{ paddingTop: 30, marginTop: 0 }}>
      <div className="container">
        {/* Hero Section */}
        <div className="card card-padded text-center" style={{ marginBottom: '24px' }}>
          {/* Logo */}
          <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'center' }}>
            <PhotoProLogo size={56} showText />
          </div>
          <h1 style={{ fontSize: '2.5rem', fontWeight: 800, marginBottom: '16px', color: 'var(--primary)' }}>
            Lưu Giữ Khoảnh Khắc Đẹp<br />
            <span className="mobile-hidden">Trong Chuyến Du Lịch</span>
          </h1>
          <p style={{ fontSize: '1.1rem', color: 'var(--text-secondary)', marginBottom: '32px', maxWidth: '600px', marginLeft: 'auto', marginRight: 'auto' }}>
            Chúng tôi đã chụp hàng nghìn bức ảnh tại các điểm du lịch nổi tiếng.<br />
            <strong>Tìm ảnh của bạn chỉ với 1 selfie!</strong>
          </p>
          <Button
            type="primary"
            size="large"
            onClick={() => navigate('/face-search')}
            icon={<SearchOutlined />}
            style={{ marginBottom: '24px', height: 48, fontSize: '1rem', fontWeight: 600, paddingLeft: 32, paddingRight: 32 }}
          >
            TÌM ẢNH CỦA TÔI
          </Button>
        </div>

        {/* Stats Bar */}
        <div style={{
          marginBottom: '24px',
          background: 'linear-gradient(135deg, #0a4d36 0%, var(--primary) 100%)',
          borderRadius: 16,
          padding: '20px 24px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 0,
        }}>
          {[
            { num: '10,000+', label: 'Ảnh Đã Chụp',        icon: '📷' },
            { num: '500+',    label: 'Khách Hài Lòng',    icon: '😄' },
            { num: '20+',     label: 'Địa Điểm',           icon: '📍' },
            { num: 'AI',      label: 'Nhận Diện Khuôn Mặt', icon: '🤖' },
          ].map((s, i, arr) => (
            <div key={s.label} style={{
              textAlign: 'center',
              padding: '8px 16px',
              borderRight: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.15)' : 'none',
            }}>
              <div style={{ fontSize: '1.6rem', marginBottom: 4 }}>{s.icon}</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fff', lineHeight: 1.1 }}>{s.num}</div>
              <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.75)', marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* How It Works */}
        <div style={{ marginBottom: '24px' }}>
          <h2 className="text-center" style={{ fontSize: '1.8rem', fontWeight: 700, marginBottom: '24px' }}>
            Cách Tìm Ảnh Của Bạn
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
            <div className="card card-padded text-center">
              <div style={{ fontSize: '3rem', marginBottom: '12px' }}><MobileOutlined /></div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '8px', justifyContent: 'center' }}>1. Chụp Selfie</h3>
              <p style={{ color: 'var(--text-secondary)' }}>Hoặc tải ảnh có mặt bạn</p>
            </div>
            <div className="card card-padded text-center">
              <div style={{ fontSize: '3rem', marginBottom: '12px' }}><ScanOutlined /></div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '8px', justifyContent: 'center' }}>2. AI Tìm Ảnh</h3>
              <p style={{ color: 'var(--text-secondary)' }}>Có bạn trong vài giây</p>
            </div>
            <div className="card card-padded text-center">
              <div style={{ fontSize: '3rem', marginBottom: '12px' }}><CreditCardOutlined /></div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '8px', justifyContent: 'center' }}>3. Mua & Tải</h3>
              <p style={{ color: 'var(--text-secondary)' }}>Ảnh HD về điện thoại</p>
            </div>
          </div>
        </div>

        {/* Gallery Preview */}
        <div style={{ marginBottom: '24px' }}>
          <h2 className="text-center" style={{ fontSize: '1.8rem', fontWeight: 700, marginBottom: '8px' }}>
            Ảnh Được Chụp Tại Các Địa Điểm
          </h2>
          <p className="text-center" style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
            Hàng nghìn bức ảnh chất lượng cao đang chờ bạn khám phá
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
            {GALLERY_SAMPLES.map(item => (
              <div
                key={item.id}
                onClick={() => navigate('/albums')}
                style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', aspectRatio: '3/2', cursor: 'pointer' }}
                className="gallery-thumb"
              >
                <img
                  src={item.src}
                  alt={item.label}
                  loading="lazy"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transition: 'transform 0.3s ease' }}
                />
                <div className="gallery-overlay" style={{
                  position: 'absolute', inset: 0,
                  background: 'linear-gradient(to top, rgba(0,0,0,0.65) 0%, transparent 55%)',
                  display: 'flex', alignItems: 'flex-end',
                  padding: '12px',
                  opacity: 0,
                  transition: 'opacity 0.25s ease',
                }}>
                  <span style={{ color: '#fff', fontWeight: 700, fontSize: '0.95rem', textShadow: '0 1px 4px rgba(0,0,0,0.4)' }}>
                    📍 {item.label}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="text-center">
            <Button size="large" onClick={() => navigate('/albums')} icon={<PictureOutlined />}>
              Xem Tất Cả Albums
            </Button>
          </div>
        </div>

        {/* Albums */}
        <div style={{ marginBottom: '24px' }}>
          <h2 className="text-center" style={{ fontSize: '1.8rem', fontWeight: 700, marginBottom: '24px' }}>
            Địa Điểm Chụp Ảnh Gần Đây
          </h2>
          {loading ? (
            <div className="text-center" style={{ padding: '40px' }}>
              <Spin size="large" />
            </div>
          ) : (
            <div className="album-grid">
              {albums.map((album) => (
                <div 
                  key={album.id}
                  className="album-card"
                >
                  <div className="album-cover"><PictureOutlined style={{ fontSize: 48, opacity: 0.4 }} /></div>
                  <div className="album-info">
                    <div className="album-title">{album.name}</div>
                    <div className="album-meta">
                      <span><PictureOutlined /> {album.photoCount} ảnh</span>
                    </div>
                    <Button
                      type="primary"
                      block
                      icon={<SearchOutlined />}
                      onClick={() => navigate('/albums')}
                      style={{ marginTop: 'auto' }}
                    >
                      Tìm Ảnh Tại Đây
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="text-center" style={{ marginTop: '24px' }}>
            <Button onClick={() => navigate('/albums')}>Xem Tất Cả Địa Điểm</Button>
          </div>
        </div>

        {/* Pricing */}
        <div style={{ marginBottom: '24px' }}>
          <h2 className="text-center" style={{ fontSize: '1.8rem', fontWeight: 700, marginBottom: '24px', justifyContent: 'center' }}>
            <DollarOutlined /> Bảng Giá Ảnh HD
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '24px', paddingTop: '16px' }}>
            {bundleLoading
              ? Array.from({ length: 3 }).map((_, i) => (
                  <Card key={i} style={{ borderRadius: '16px' }} bodyStyle={{ padding: '28px' }}>
                    <Skeleton active paragraph={{ rows: 3 }} />
                  </Card>
                ))
              : (() => {
                  // Use the bundle with photo_count=1 as the base price reference
                  const singleBundle = bundles.find(b => b.photo_count === 1);
                  const baseUnitPrice = singleBundle
                    ? singleBundle.price
                    : bundles.length > 0
                      ? bundles[0].price / bundles[0].photo_count
                      : 0;

                  return bundles.map((bundle) => {
                    const fullPrice = bundle.photo_count * baseUnitPrice;
                    const savingsPct =
                      fullPrice > bundle.price
                        ? Math.round((1 - bundle.price / fullPrice) * 100)
                        : 0;
                    const unitPrice = Math.round(bundle.price / bundle.photo_count);
                    const isRecommended = bundle.is_popular;

                    const card = (
                      <Card
                        style={{
                          border: `2px solid ${isRecommended ? 'var(--accent)' : 'var(--border)'}`,
                          borderRadius: '16px',
                          textAlign: 'center',
                          boxShadow: isRecommended ? '0 0 0 4px var(--accent-light)' : undefined,
                          transition: 'all 0.2s',
                        }}
                        bodyStyle={{ padding: '28px' }}
                      >
                        <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text)', marginBottom: '12px' }}>
                          {bundle.name}
                        </div>
                        <div style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--primary)', marginBottom: '8px' }}>
                          {bundle.price.toLocaleString('vi-VN')}đ
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: savingsPct > 0 ? '8px' : '24px' }}>
                          {unitPrice.toLocaleString('vi-VN')}đ / ảnh
                        </div>
                        {savingsPct > 0 && (
                          <div style={{ marginBottom: '20px' }}>
                            <Tag color="success">Tiết kiệm {savingsPct}%</Tag>
                          </div>
                        )}
                        <Button
                          type={isRecommended ? 'primary' : 'default'}
                          onClick={() => navigate('/face-search')}
                          block
                          style={isRecommended ? { display: 'block' } : undefined}
                        >
                          Chọn Gói
                        </Button>
                      </Card>
                    );

                    return isRecommended ? (
                      <Badge.Ribbon key={bundle.id} text="⭐ KHUYẾN NGHỊ" color="var(--accent)">
                        {card}
                      </Badge.Ribbon>
                    ) : (
                      <div key={bundle.id}>{card}</div>
                    );
                  });
                })()
            }
          </div>
          {/* Auto-pack info */}
          <Alert
            type="info"
            showIcon
            icon={<BulbOutlined />}
            message={<strong>Auto-pack Thông Minh</strong>}
            description="Hệ thống tự động chọn gói tối ưu khi bạn chọn ảnh. Ví dụ: Chọn 2 ảnh → Đề xuất Gói 3 (tiết kiệm thêm 1 ảnh!)"
            style={{ borderRadius: '12px' }}
          />
        </div>

        {/* FAQ */}
        <div className="card card-padded" style={{ marginBottom: '24px' }}>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 700, marginBottom: '24px' }}><QuestionCircleOutlined /> Câu Hỏi Thường Gặp</h2>
          <Collapse
            bordered={false}
            style={{ background: 'transparent' }}
            items={[
              {
                key: '1',
                label: <span style={{ fontWeight: 700, color: 'var(--primary)' }}>Làm sao tìm được ảnh của tôi?</span>,
                children: <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Chỉ cần chụp selfie hoặc tải ảnh có mặt bạn, AI sẽ tìm tất cả ảnh có bạn trong hệ thống.</p>,
              },
              {
                key: '2',
                label: <span style={{ fontWeight: 700, color: 'var(--primary)' }}>Ảnh selfie của tôi có được lưu không?</span>,
                children: <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Không. Ảnh selfie được xử lý ngay trên thiết bị của bạn, chúng tôi không lưu trữ ảnh mặt của bạn.</p>,
              },
              {
                key: '3',
                label: <span style={{ fontWeight: 700, color: 'var(--primary)' }}>Tôi có thể tải ảnh trong bao lâu?</span>,
                children: <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Link tải có hiệu lực 7 ngày sau khi thanh toán. Bạn có thể tải ảnh nhiều lần trong thời gian này.</p>,
              },
              {
                key: '4',
                label: <span style={{ fontWeight: 700, color: 'var(--primary)' }}>Tôi quên mã đơn hàng thì sao?</span>,
                children: <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Bạn có thể tra cứu bằng số điện thoại đã đặt hàng.</p>,
              },
            ]}
          />
        </div>


      </div>
    </div>
  );
}
