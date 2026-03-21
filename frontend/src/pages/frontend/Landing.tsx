import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAlbums } from '../../hooks/useAlbums';
import { usePublicBundles } from '../../hooks/usePublicBundles';
import { Button, Badge, Card, Tag, Skeleton, Collapse, Alert } from 'antd';
import {
  SearchOutlined, MobileOutlined, ScanOutlined, CreditCardOutlined,
  DollarOutlined, BulbOutlined, QuestionCircleOutlined, PictureOutlined,
  DownOutlined,
} from '@ant-design/icons';
import { Camera, Users, MapPin, Sparkles } from 'lucide-react';
import '../styles/frontend.css';

// Hero background - Vietnam travel landscape from Unsplash
const HERO_BG =
  'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=1920&q=80';

const GALLERY_SAMPLES = [
  { id: 1, src: 'https://images.unsplash.com/photo-1583417319070-4a69db38a482?auto=format&fit=crop&w=600&q=80', label: 'Hội An' },
  { id: 2, src: 'https://images.unsplash.com/photo-1528360983277-13d401cdc186?auto=format&fit=crop&w=600&q=80', label: 'Hạ Long Bay' },
  { id: 3, src: 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?auto=format&fit=crop&w=600&q=80', label: 'Đà Nẵng' },
  { id: 4, src: 'https://images.unsplash.com/photo-1598493869462-d9d6a4b7b59b?auto=format&fit=crop&w=600&q=80', label: 'Đà Lạt' },
  { id: 5, src: 'https://images.unsplash.com/photo-1544764200-d834fd210a23?auto=format&fit=crop&w=600&q=80', label: 'Phú Quốc' },
  { id: 6, src: 'https://images.unsplash.com/photo-1568702846914-96b305d2aaeb?auto=format&fit=crop&w=600&q=80', label: 'Sa Pa' },
];

function useCountUp(target: number, duration = 1800, active = false) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!active) return;
    let start: number | null = null;
    const step = (ts: number) => {
      if (!start) start = ts;
      const pct = Math.min((ts - start) / duration, 1);
      setCount(Math.floor(pct * target));
      if (pct < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [active, target, duration]);
  return count;
}

interface Album { id: string; name: string; photoCount: number; thumbnailUrl: string | null; }

export default function Landing() {
  const navigate = useNavigate();
  const { data: apiAlbums, loading } = useAlbums();
  const { bundles, loading: bundleLoading } = usePublicBundles();
  const statsRef = useRef<HTMLDivElement>(null);
  const [statsActive, setStatsActive] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setStatsActive(true); },
      { threshold: 0.3 },
    );
    if (statsRef.current) observer.observe(statsRef.current);
    return () => observer.disconnect();
  }, []);

  // Scroll to hash section on mount (e.g. /#pricing from navbar)
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash) {
      const timer = setTimeout(
        () => document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth' }),
        150,
      );
      return () => clearTimeout(timer);
    }
  }, []);

  const photos  = useCountUp(10000, 2000, statsActive);
  const clients = useCountUp(500,   1600, statsActive);
  const locs    = useCountUp(20,    1200, statsActive);

  const albums: Album[] = (apiAlbums ?? []).slice(0, 4).map(a => ({
    id: a.id,
    name: a.name,
    photoCount: a.media_count,
    thumbnailUrl: a.thumbnail_url,
  }));

  return (
    <div className="landing-dark">

      {/* HERO - full-screen cinematic */}
      <section
        className="hero-cinematic"
        style={{
          height: '100vh',
          minHeight: 600,
          backgroundImage: `url(${HERO_BG})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="hero-overlay" />
        <div className="hero-content">
          <img
            src="/images/Logo_PhotoPro_no_bg.png"
            alt="PhotoPro"
            className="hero-logo"
            style={{ height: 80 }}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          <h1 className="hero-title">
            Khoảnh Khắc Của Bạn,<br />
            <span className="hero-title-accent">Mãi Mãi Trong Tầm Tay</span>
          </h1>
          <p className="hero-subtitle">
            CAPTURE YOUR JOURNEY · FIND YOUR MOMENTS · OWN YOUR MEMORIES
          </p>
          <div className="hero-actions">
            <Button
              type="primary"
              size="large"
              icon={<SearchOutlined />}
              onClick={() => navigate('/face-search')}
              className="hero-btn-primary"
            >
              Tìm Ảnh Của Tôi
            </Button>
            <Button
              size="large"
              icon={<PictureOutlined />}
              onClick={() => navigate('/albums')}
              className="hero-btn-outline"
            >
              Xem Albums
            </Button>
          </div>
        </div>
        <button
          className="hero-scroll-indicator"
          onClick={() => document.getElementById('stats')?.scrollIntoView({ behavior: 'smooth' })}
          aria-label="Scroll down"
        >
          <DownOutlined />
        </button>
      </section>

      {/* STATS BAR */}
      <section id="stats" ref={statsRef} className="stats-dark">
        <div className="container">
          <div className="stats-grid">
            {[
              { icon: <Camera size={32} color="#fff" />, value: `${photos.toLocaleString('vi-VN')}+`,   label: 'Ảnh Chất Lượng Cao' },
              { icon: <Users   size={32} color="#fff" />, value: `${clients.toLocaleString('vi-VN')}+`,  label: 'Khách Hài Lòng' },
              { icon: <MapPin  size={32} color="#fff" />, value: `${locs.toLocaleString('vi-VN')}+`,     label: 'Địa Điểm' },
              { icon: <Sparkles size={32} color="#fff" />, value: 'AI',                                  label: 'Nhận Diện Khuôn Mặt' },
            ].map((s, i, arr) => (
              <div
                key={s.label}
                className="stat-item"
                style={{ borderRight: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.07)' : 'none' }}
              >
                <div className="stat-icon">{s.icon}</div>
                <div className="stat-value">{s.value}</div>
                <div className="stat-label">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="dark-section">
        <div className="container">
          <div className="section-header-dark">
            <div className="section-eyebrow">Đơn Giản &amp; Nhanh Chóng</div>
            <h2 className="section-title-dark">Cách Tìm Ảnh Của Bạn</h2>
          </div>
          <div className="hiw-grid">
            {[
              { icon: <MobileOutlined />, step: '01', title: 'Chụp Selfie',  desc: 'Hoặc tải ảnh có mặt bạn từ thiết bị' },
              { icon: <ScanOutlined />,   step: '02', title: 'AI Tìm Ảnh',   desc: 'Công nghệ AI nhận diện & tìm trong vài giây' },
              { icon: <CreditCardOutlined />, step: '03', title: 'Mua & Tải', desc: 'Thanh toán nhanh, nhận ảnh HD ngay lập tức' },
            ].map(item => (
              <div key={item.step} className="hiw-card">
                <div className="hiw-step">{item.step}</div>
                <div className="hiw-icon">{item.icon}</div>
                <h3 className="hiw-title">{item.title}</h3>
                <p className="hiw-desc">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* GALLERY PREVIEW */}
      <section style={{ background: '#0a0a0a', padding: '80px 0' }}>
        <div className="container">
          <div className="section-header-dark">
            <div className="section-eyebrow">Bộ Sưu Tập</div>
            <h2 className="section-title-dark">Khám Phá Những Khoảnh Khắc</h2>
            <p className="section-subtitle-dark">Hàng nghìn bức ảnh chất lượng cao đang chờ bạn</p>
          </div>
          <div className="gallery-dark-grid">
            {GALLERY_SAMPLES.map(item => (
              <div key={item.id} className="gallery-dark-thumb" onClick={() => navigate('/albums')}>
                <img src={item.src} alt={item.label} loading="lazy" />
                <div className="gallery-dark-overlay">
                  <MapPin size={14} color="#5dffb0" style={{ marginRight: 4 }} />
                  <span>{item.label}</span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'center', marginTop: 40 }}>
            <Button
              size="large"
              onClick={() => navigate('/albums')}
              icon={<PictureOutlined />}
              className="btn-dark-outline"
            >
              Xem Tất Cả Albums
            </Button>
          </div>
        </div>
      </section>

      {/* Albums quick (only when API returns data) */}
      {(apiAlbums?.length ?? 0) > 0 && (
        <section style={{ background: '#0e0e0e', paddingBottom: 80 }}>
          <div className="container">
            <h2 className="section-title-dark" style={{ marginBottom: 24 }}>Địa Điểm Gần Đây</h2>
            {loading ? (
              <Skeleton active />
            ) : (
              <div className="album-grid">
                {albums.map(album => (
                  <div key={album.id} className="album-card" style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}>
                    <div className="album-cover" style={{
                      background: album.thumbnailUrl ? '#111' : 'linear-gradient(135deg, #1a6b3c 0%, #0f3d22 100%)',
                    }}>
                      {album.thumbnailUrl ? (
                        <img src={album.thumbnailUrl} alt={album.name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                      ) : (
                        <PictureOutlined style={{ fontSize: 48, opacity: 0.3, color: '#fff' }} />
                      )}
                    </div>
                    <div className="album-info">
                      <div className="album-title" style={{ color: '#fff' }}>{album.name}</div>
                      <div className="album-meta" style={{ color: 'rgba(255,255,255,0.45)' }}>
                        <span><PictureOutlined /> {album.photoCount} ảnh</span>
                      </div>
                      <Button type="primary" block icon={<SearchOutlined />}
                        onClick={() => navigate('/albums')} style={{ marginTop: 'auto' }}>
                        Tìm Ảnh Tại Đây
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* PRICING */}
      <section id="pricing" className="dark-section" style={{ padding: '80px 0' }}>
        <div className="container">
          <div className="section-header-dark">
            <div className="section-eyebrow">Minh Bạch &amp; Đơn Giản</div>
            <h2 className="section-title-dark"><DollarOutlined /> Bảng Giá Ảnh HD</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 24, marginBottom: 32, paddingTop: 16 }}>
            {bundleLoading
              ? Array.from({ length: 3 }).map((_, i) => (
                  <Card key={i} style={{ borderRadius: 16, background: '#fff', border: '1px solid #e0e0e0' }} bodyStyle={{ padding: 28 }}>
                    <Skeleton active paragraph={{ rows: 3 }} />
                  </Card>
                ))
              : (() => {
                  const singleBundle = bundles.find(b => b.photo_count === 1);
                  const baseUnitPrice = singleBundle
                    ? singleBundle.price
                    : bundles.length > 0 ? bundles[0].price / bundles[0].photo_count : 0;
                  return bundles.map(bundle => {
                    const fullPrice = bundle.photo_count * baseUnitPrice;
                    const savingsPct = fullPrice > bundle.price
                      ? Math.round((1 - bundle.price / fullPrice) * 100) : 0;
                    const unitPrice = Math.round(bundle.price / bundle.photo_count);
                    const isRecommended = bundle.is_popular;
                    const card = (
                      <div
                        style={{
                          background: isRecommended
                            ? 'linear-gradient(135deg, #0d3622 0%, #1a6b4e 100%)'
                            : '#1a1a1a',
                          border: `1px solid ${isRecommended ? 'rgba(26,107,78,0.7)' : '#2a2a2a'}`,
                          borderRadius: 16,
                          padding: 28,
                          textAlign: 'center',
                          boxShadow: isRecommended ? '0 8px 40px rgba(26,107,78,0.22)' : 'none',
                          height: '100%',
                        }}
                      >
                        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff', marginBottom: 12 }}>
                          {bundle.name}
                        </div>
                        <div style={{ fontSize: '2.6rem', fontWeight: 800, color: isRecommended ? '#5dffb0' : '#1a6b4e', marginBottom: 8 }}>
                          {bundle.price.toLocaleString('vi-VN')}đ
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)', marginBottom: savingsPct > 0 ? 8 : 24 }}>
                          {unitPrice.toLocaleString('vi-VN')}đ / ảnh
                        </div>
                        {savingsPct > 0 && (
                          <div style={{ marginBottom: 20 }}>
                            <Tag color="success" style={{ borderRadius: 20 }}>Tiết kiệm {savingsPct}%</Tag>
                          </div>
                        )}
                        <Button
                          type={isRecommended ? 'primary' : 'default'}
                          onClick={() => navigate('/face-search')}
                          block
                          style={isRecommended ? {} : { borderColor: '#444', color: '#fff' }}
                        >
                          Chọn Gói
                        </Button>
                      </div>
                    );
                    return isRecommended ? (
                      <Badge.Ribbon key={bundle.id} text="KHUYẾN NGHỊI" color="var(--accent)">
                        {card}
                      </Badge.Ribbon>
                    ) : (
                      <div key={bundle.id}>{card}</div>
                    );
                  });
                })()
            }
          </div>
          <Alert
            type="info"
            showIcon
            icon={<BulbOutlined />}
            message={<strong>Auto-pack Thông Minh</strong>}
            description="Hệ thống tự động chọn gói tối ưu khi bạn chọn ảnh. Ví dụ: Chọn 2 ảnh → Đề xuất Gói 3 (tiết kiệm thêm 1 ảnh!)"
            style={{ borderRadius: 12, background: 'rgba(26,107,78,0.08)', border: '1px solid rgba(26,107,78,0.2)' }}
          />
        </div>
      </section>

      {/* FAQ */}
      <section className="dark-section">
        <div className="container">
          <div className="section-header-dark">
            <div className="section-eyebrow">Hỗ Trợ</div>
            <h2 className="section-title-dark"><QuestionCircleOutlined /> Câu Hỏi Thường Gặp</h2>
          </div>
          <div style={{ maxWidth: 720, margin: '0 auto' }}>
            <Collapse
              bordered={false}
              className="faq-dark"
              items={[
                {
                  key: '1',
                  label: <span style={{ fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>Làm sao tìm được ảnh của tôi?</span>,
                  children: <p style={{ color: 'rgba(255,255,255,0.5)', margin: 0 }}>Chỉ cần chụp selfie hoặc tải ảnh có mặt bạn, AI sẽ tìm tất cả ảnh có bạn trong hệ thống.</p>,
                },
                {
                  key: '2',
                  label: <span style={{ fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>Ảnh selfie của tôi có được lưu không?</span>,
                  children: <p style={{ color: 'rgba(255,255,255,0.5)', margin: 0 }}>Không. Ảnh selfie được xử lý ngay trên thiết bị của bạn, chúng tôi không lưu trữ ảnh mặt của bạn.</p>,
                },
                {
                  key: '3',
                  label: <span style={{ fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>Tôi có thể tải ảnh trong bao lâu?</span>,
                  children: <p style={{ color: 'rgba(255,255,255,0.5)', margin: 0 }}>Link tải có hiệu lực 7 ngày sau khi thanh toán. Bạn có thể tải ảnh nhiều lần trong thời gian này.</p>,
                },
                {
                  key: '4',
                  label: <span style={{ fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>Tôi quên mã đơn hàng thì sao?</span>,
                  children: <p style={{ color: 'rgba(255,255,255,0.5)', margin: 0 }}>Bạn có thể tra cứu bằng số điện thoại đã đặt hàng.</p>,
                },
              ]}
            />
          </div>
        </div>
      </section>

    </div>
  );
}
