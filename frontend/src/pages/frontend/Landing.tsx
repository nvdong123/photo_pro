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
import '../styles/frontend.css';

// Hero background — Vietnam / travel landscape from Unsplash
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

interface Album { id: string; name: string; photoCount: number; }

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
      const timer = setTimeout(() => document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth' }), 150);
      return () => clearTimeout(timer);
    }
  }, []);

  const photos    = useCountUp(10000, 2000, statsActive);
  const clients   = useCountUp(500,   1600, statsActive);
  const locs      = useCountUp(20,    1200, statsActive);

  const albums: Album[] = (apiAlbums ?? []).slice(0, 4).map(a => ({
    id: a.id,
    name: a.name,
    photoCount: a.media_count,
  }));

  return (
    <div className="landing-dark">

      {/* ═══════════════════════════════════════════
          HERO — full-screen cinematic
      ═══════════════════════════════════════════ */}
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
              🔍 Tìm Ảnh Của Tôi
            </Button>
            <Button
              size="large"
              icon={<PictureOutlined />}
              onClick={() => navigate('/albums')}
              className="hero-btn-outline"
            >
              📁 Xem Albums
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

      {/* ═══════════════════════════════════════════
          STATS BAR
      ═══════════════════════════════════════════ */}
      <section id="stats" ref={statsRef} className="stats-dark">
        <div className="container">
          <div className="stats-grid">
            {[
              { icon: '📷', value: `${photos.toLocaleString('vi-VN')}+`,   label: 'Ảnh Chất Lượng Cao' },
              { icon: '😄', value: `${clients.toLocaleString('vi-VN')}+`,  label: 'Khách Hài Lòng' },
              { icon: '📍', value: `${locs.toLocaleString('vi-VN')}+`,     label: 'Địa Điểm' },
              { icon: '🤖', value: 'AI',                                    label: 'Nhận Diện Khuôn Mặt' },
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

      {/* ═══════════════════════════════════════════
          HOW IT WORKS
      ═══════════════════════════════════════════ */}
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

      {/* ═══════════════════════════════════════════
          GALLERY PREVIEW
      ═══════════════════════════════════════════ */}
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
                  <span>📍 {item.label}</span>
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
                    <div className="album-cover" style={{ background: '#111' }}>
                      <PictureOutlined style={{ fontSize: 48, opacity: 0.3, color: '#fff' }} />
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

      {/* ═══════════════════════════════════════════
          PRICING
      ═══════════════════════════════════════════ */}
      <section id="pricing" style={{ background: '#111', padding: '80px 0' }}>
        <div className="container">
          <div className="section-header-dark">
            <div className="section-eyebrow">Minh Bạch &amp; Đơn Giản</div>
            <h2 className="section-title-dark"><DollarOutlined /> Bảng Giá Ảnh HD</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 24, marginBottom: 32, paddingTop: 16 }}>
            {bundleLoading
              ? Array.from({ length: 3 }).map((_, i) => (
                  <Card key={i} style={{ borderRadius: 16, background: '#1a1a1a', border: '1px solid #2a2a2a' }} bodyStyle={{ padding: 28 }}>
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
                        <div style={{ fontSize: '2.6rem', fontWeight: 800, color: isRecommended ? '#5dffb0' : '#fff', marginBottom: 8 }}>
                          {bundle.price.toLocaleString('vi-VN')}đ
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.45)', marginBottom: savingsPct > 0 ? 8 : 24 }}>
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
                          style={isRecommended ? {} : { background: 'transparent', borderColor: 'rgba(255,255,255,0.25)', color: 'rgba(255,255,255,0.8)' }}
                        >
                          Chọn Gói
                        </Button>
                      </div>
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
          <Alert
            type="info"
            showIcon
            icon={<BulbOutlined />}
            message={<strong>Auto-pack Thông Minh</strong>}
            description="Hệ thống tự động chọn gói tối ưu khi bạn chọn ảnh. Ví dụ: Chọn 2 ảnh → Đề xuất Gói 3 (tiết kiệm thêm 1 ảnh!)"
            style={{ borderRadius: 12, background: 'rgba(26,107,78,0.12)', border: '1px solid rgba(26,107,78,0.3)' }}
          />
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          FAQ
      ═══════════════════════════════════════════ */}
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

      {/* ═══════════════════════════════════════════
          FOOTER
      ═══════════════════════════════════════════ */}
      <footer className="dark-footer">
        <div className="container">
          <div className="footer-top">
            <div className="footer-brand">
              <img
                src="/images/Logo_PhotoPro_no_bg.png"
                alt="PhotoPro"
                style={{ height: 36, marginBottom: 12 }}
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
              <p className="footer-tagline">
                Nền tảng bán ảnh sự kiện du lịch hàng đầu.<br />
                Tìm lại khoảnh khắc của bạn chỉ với 1 selfie.
              </p>
            </div>
            <div className="footer-links">
              <div>
                <p className="footer-col-title">Dịch Vụ</p>
                {[['Tìm Ảnh', '/face-search'], ['Xem Albums', '/albums'], ['Tra Đơn Hàng', '/lookup']].map(([label, href]) => (
                  <button key={href} onClick={() => navigate(href)} className="footer-link">{label}</button>
                ))}
              </div>
              <div>
                <p className="footer-col-title">Pháp Lý</p>
                {['Điều Khoản', 'Chính Sách', 'Liên Hệ'].map(label => (
                  <span key={label} className="footer-link" style={{ cursor: 'default' }}>{label}</span>
                ))}
              </div>
            </div>
          </div>
          <div className="footer-bottom">
            © 2026 PhotoPro · Hồ Chí Minh, Việt Nam
          </div>
        </div>
      </footer>
    </div>
  );
}

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
