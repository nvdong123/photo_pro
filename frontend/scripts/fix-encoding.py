"""
Fix encoding corruption in Landing.tsx and FrontendLayout.tsx.
Writes both files fresh with correct UTF-8 Vietnamese text.
Run from repo root: python frontend/scripts/fix-encoding.py
"""
import os

BASE = os.path.join(os.path.dirname(__file__), '..', 'src', 'pages', 'frontend')

# ---------------------------------------------------------------------------
# Landing.tsx  (no footer — footer lives in FrontendLayout)
# ---------------------------------------------------------------------------
LANDING = """import { useEffect, useRef, useState } from 'react';
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

// Hero background - Vietnam travel landscape from Unsplash
const HERO_BG =
  'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=1920&q=80';

const GALLERY_SAMPLES = [
  { id: 1, src: 'https://images.unsplash.com/photo-1583417319070-4a69db38a482?auto=format&fit=crop&w=600&q=80', label: 'H\u1ed9i An' },
  { id: 2, src: 'https://images.unsplash.com/photo-1528360983277-13d401cdc186?auto=format&fit=crop&w=600&q=80', label: 'H\u1ea1 Long Bay' },
  { id: 3, src: 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?auto=format&fit=crop&w=600&q=80', label: '\u0110\u00e0 N\u1eb5ng' },
  { id: 4, src: 'https://images.unsplash.com/photo-1598493869462-d9d6a4b7b59b?auto=format&fit=crop&w=600&q=80', label: '\u0110\u00e0 L\u1ea1t' },
  { id: 5, src: 'https://images.unsplash.com/photo-1544764200-d834fd210a23?auto=format&fit=crop&w=600&q=80', label: 'Ph\u00fa Qu\u1ed1c' },
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
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          <h1 className="hero-title">
            Kho\u1ea3nh Kh\u1eafc C\u1ee7a B\u1ea1n,<br />
            <span className="hero-title-accent">M\u00e3i M\u00e3i Trong T\u1ea7m Tay</span>
          </h1>
          <p className="hero-subtitle">
            CAPTURE YOUR JOURNEY \u00b7 FIND YOUR MOMENTS \u00b7 OWN YOUR MEMORIES
          </p>
          <div className="hero-actions">
            <Button
              type="primary"
              size="large"
              icon={<SearchOutlined />}
              onClick={() => navigate('/face-search')}
              className="hero-btn-primary"
            >
              \U0001F50D T\u00ecm \u1ea2nh C\u1ee7a T\u00f4i
            </Button>
            <Button
              size="large"
              icon={<PictureOutlined />}
              onClick={() => navigate('/albums')}
              className="hero-btn-outline"
            >
              \U0001F4C1 Xem Albums
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
              { icon: '\U0001F4F7', value: `${photos.toLocaleString('vi-VN')}+`,   label: '\u1ea2nh Ch\u1ea5t L\u01b0\u1ee3ng Cao' },
              { icon: '\U0001F604', value: `${clients.toLocaleString('vi-VN')}+`,  label: 'Kh\u00e1ch H\u00e0i L\u00f2ng' },
              { icon: '\U0001F4CD', value: `${locs.toLocaleString('vi-VN')}+`,     label: '\u0110\u1ecba \u0110i\u1ec3m' },
              { icon: '\U0001F916', value: 'AI',                                    label: 'Nh\u1eadn Di\u1ec7n Khu\u00f4n M\u1eb7t' },
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
            <div className="section-eyebrow">\u0110\u01a1n Gi\u1ea3n &amp; Nhanh Ch\u00f3ng</div>
            <h2 className="section-title-dark">C\u00e1ch T\u00ecm \u1ea2nh C\u1ee7a B\u1ea1n</h2>
          </div>
          <div className="hiw-grid">
            {[
              { icon: <MobileOutlined />, step: '01', title: 'Ch\u1ee5p Selfie',  desc: 'Ho\u1eb7c t\u1ea3i \u1ea3nh c\u00f3 m\u1eb7t b\u1ea1n t\u1eeb thi\u1ebft b\u1ecb' },
              { icon: <ScanOutlined />,   step: '02', title: 'AI T\u00ecm \u1ea2nh',   desc: 'C\u00f4ng ngh\u1ec7 AI nh\u1eadn di\u1ec7n \u0026 t\u00ecm trong v\u00e0i gi\u00e2y' },
              { icon: <CreditCardOutlined />, step: '03', title: 'Mua \u0026 T\u1ea3i', desc: 'Thanh to\u00e1n nhanh, nh\u1eadn \u1ea3nh HD ngay l\u1eadp t\u1ee9c' },
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
            <div className="section-eyebrow">B\u1ed9 S\u01b0u T\u1eadp</div>
            <h2 className="section-title-dark">Kh\u00e1m Ph\u00e1 Nh\u1eefng Kho\u1ea3nh Kh\u1eafc</h2>
            <p className="section-subtitle-dark">H\u00e0ng ngh\u00ecn b\u1ee9c \u1ea3nh ch\u1ea5t l\u01b0\u1ee3ng cao \u0111ang ch\u1edd b\u1ea1n</p>
          </div>
          <div className="gallery-dark-grid">
            {GALLERY_SAMPLES.map(item => (
              <div key={item.id} className="gallery-dark-thumb" onClick={() => navigate('/albums')}>
                <img src={item.src} alt={item.label} loading="lazy" />
                <div className="gallery-dark-overlay">
                  <span>\U0001F4CD {item.label}</span>
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
              Xem T\u1ea5t C\u1ea3 Albums
            </Button>
          </div>
        </div>
      </section>

      {/* Albums quick (only when API returns data) */}
      {(apiAlbums?.length ?? 0) > 0 && (
        <section style={{ background: '#0e0e0e', paddingBottom: 80 }}>
          <div className="container">
            <h2 className="section-title-dark" style={{ marginBottom: 24 }}>\u0110\u1ecba \u0110i\u1ec3m G\u1ea7n \u0110\u00e2y</h2>
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
                        <span><PictureOutlined /> {album.photoCount} \u1ea3nh</span>
                      </div>
                      <Button type="primary" block icon={<SearchOutlined />}
                        onClick={() => navigate('/albums')} style={{ marginTop: 'auto' }}>
                        T\u00ecm \u1ea2nh T\u1ea1i \u0110\u00e2y
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
      <section id="pricing" style={{ background: '#111', padding: '80px 0' }}>
        <div className="container">
          <div className="section-header-dark">
            <div className="section-eyebrow">Minh B\u1ea1ch &amp; \u0110\u01a1n Gi\u1ea3n</div>
            <h2 className="section-title-dark"><DollarOutlined /> B\u1ea3ng Gi\u00e1 \u1ea2nh HD</h2>
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
                          {bundle.price.toLocaleString('vi-VN')}\u0111
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.45)', marginBottom: savingsPct > 0 ? 8 : 24 }}>
                          {unitPrice.toLocaleString('vi-VN')}\u0111 / \u1ea3nh
                        </div>
                        {savingsPct > 0 && (
                          <div style={{ marginBottom: 20 }}>
                            <Tag color="success" style={{ borderRadius: 20 }}>Ti\u1ebft ki\u1ec7m {savingsPct}%</Tag>
                          </div>
                        )}
                        <Button
                          type={isRecommended ? 'primary' : 'default'}
                          onClick={() => navigate('/face-search')}
                          block
                          style={isRecommended ? {} : { background: 'transparent', borderColor: 'rgba(255,255,255,0.25)', color: 'rgba(255,255,255,0.8)' }}
                        >
                          Ch\u1ecdn G\u00f3i
                        </Button>
                      </div>
                    );
                    return isRecommended ? (
                      <Badge.Ribbon key={bundle.id} text="\u2605 KHUY\u1ebeN NGH\u1ecaI" color="var(--accent)">
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
            message={<strong>Auto-pack Th\u00f4ng Minh</strong>}
            description="H\u1ec7 th\u1ed1ng t\u1ef1 \u0111\u1ed9ng ch\u1ecdn g\u00f3i t\u1ed1i \u01b0u khi b\u1ea1n ch\u1ecdn \u1ea3nh. V\u00ed d\u1ee5: Ch\u1ecdn 2 \u1ea3nh \u2192 \u0110\u1ec1 xu\u1ea5t G\u00f3i 3 (ti\u1ebft ki\u1ec7m th\u00eam 1 \u1ea3nh!)"
            style={{ borderRadius: 12, background: 'rgba(26,107,78,0.12)', border: '1px solid rgba(26,107,78,0.3)' }}
          />
        </div>
      </section>

      {/* FAQ */}
      <section className="dark-section">
        <div className="container">
          <div className="section-header-dark">
            <div className="section-eyebrow">H\u1ed7 Tr\u1ee3</div>
            <h2 className="section-title-dark"><QuestionCircleOutlined /> C\u00e2u H\u1ecfi Th\u01b0\u1eddng G\u1eb7p</h2>
          </div>
          <div style={{ maxWidth: 720, margin: '0 auto' }}>
            <Collapse
              bordered={false}
              className="faq-dark"
              items={[
                {
                  key: '1',
                  label: <span style={{ fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>L\u00e0m sao t\u00ecm \u0111\u01b0\u1ee3c \u1ea3nh c\u1ee7a t\u00f4i?</span>,
                  children: <p style={{ color: 'rgba(255,255,255,0.5)', margin: 0 }}>Ch\u1ec9 c\u1ea7n ch\u1ee5p selfie ho\u1eb7c t\u1ea3i \u1ea3nh c\u00f3 m\u1eb7t b\u1ea1n, AI s\u1ebd t\u00ecm t\u1ea5t c\u1ea3 \u1ea3nh c\u00f3 b\u1ea1n trong h\u1ec7 th\u1ed1ng.</p>,
                },
                {
                  key: '2',
                  label: <span style={{ fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>\u1ea2nh selfie c\u1ee7a t\u00f4i c\u00f3 \u0111\u01b0\u1ee3c l\u01b0u kh\u00f4ng?</span>,
                  children: <p style={{ color: 'rgba(255,255,255,0.5)', margin: 0 }}>Kh\u00f4ng. \u1ea2nh selfie \u0111\u01b0\u1ee3c x\u1eed l\u00fd ngay tr\u00ean thi\u1ebft b\u1ecb c\u1ee7a b\u1ea1n, ch\u00fang t\u00f4i kh\u00f4ng l\u01b0u tr\u1eef \u1ea3nh m\u1eb7t c\u1ee7a b\u1ea1n.</p>,
                },
                {
                  key: '3',
                  label: <span style={{ fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>T\u00f4i c\u00f3 th\u1ec3 t\u1ea3i \u1ea3nh trong bao l\u00e2u?</span>,
                  children: <p style={{ color: 'rgba(255,255,255,0.5)', margin: 0 }}>Link t\u1ea3i c\u00f3 hi\u1ec7u l\u1ef1c 7 ng\u00e0y sau khi thanh to\u00e1n. B\u1ea1n c\u00f3 th\u1ec3 t\u1ea3i \u1ea3nh nhi\u1ec1u l\u1ea7n trong th\u1eddi gian n\u00e0y.</p>,
                },
                {
                  key: '4',
                  label: <span style={{ fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>T\u00f4i qu\u00ean m\u00e3 \u0111\u01a1n h\u00e0ng th\u00ec sao?</span>,
                  children: <p style={{ color: 'rgba(255,255,255,0.5)', margin: 0 }}>B\u1ea1n c\u00f3 th\u1ec3 tra c\u1ee9u b\u1eb1ng s\u1ed1 \u0111i\u1ec7n tho\u1ea1i \u0111\u00e3 \u0111\u1eb7t h\u00e0ng.</p>,
                },
              ]}
            />
          </div>
        </div>
      </section>

    </div>
  );
}
"""

# ---------------------------------------------------------------------------
# FrontendLayout.tsx  (navbar + footer shared across all frontend routes)
# ---------------------------------------------------------------------------
FRONTEND_LAYOUT = """import { useEffect, useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Button } from 'antd';
import { SearchOutlined, MenuOutlined, CloseOutlined } from '@ant-design/icons';
import '../styles/frontend.css';

export default function FrontendLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  // Close mobile menu on navigation
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  const isHome = location.pathname === '/';

  const handleNavLink = (href: string) => {
    setMenuOpen(false);
    if (href.startsWith('#')) {
      if (isHome) {
        document.getElementById(href.slice(1))?.scrollIntoView({ behavior: 'smooth' });
      } else {
        navigate('/' + href);
      }
    } else {
      navigate(href);
    }
  };

  const navLinks = [
    { label: 'T\u00ecm \u1ea2nh',  href: '/face-search' },
    { label: 'Albums',       href: '/albums' },
    { label: 'B\u1ea3ng Gi\u00e1', href: '#pricing' },
  ];

  return (
    <>
      {/* Fixed Navbar */}
      <header
        style={{
          position: 'fixed',
          top: 0, left: 0, right: 0,
          height: 64,
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 32px',
          transition: 'background 0.3s ease, backdrop-filter 0.3s ease, box-shadow 0.3s ease',
          background: scrolled ? 'rgba(8,8,8,0.90)' : 'transparent',
          backdropFilter: scrolled ? 'blur(18px) saturate(1.2)' : 'none',
          boxShadow: scrolled ? '0 1px 0 rgba(255,255,255,0.06)' : 'none',
        }}
      >
        {/* Logo */}
        <div
          onClick={() => navigate('/')}
          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', flexShrink: 0 }}
        >
          <img
            src="/images/Logo_PhotoPro_no_bg.png"
            alt="PhotoPro"
            style={{ height: 40, objectFit: 'contain' }}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        </div>

        {/* Desktop nav links */}
        <nav className="fnav-links">
          {navLinks.map(link => (
            <button key={link.label} onClick={() => handleNavLink(link.href)} className="fnav-link">
              {link.label}
            </button>
          ))}
        </nav>

        {/* CTA + hamburger */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <Button
            type="primary"
            icon={<SearchOutlined />}
            onClick={() => navigate('/face-search')}
            className="fnav-cta"
            style={{ fontWeight: 600 }}
          >
            T\u00ecm \u1ea2nh Ngay
          </Button>
          <button
            onClick={() => setMenuOpen(v => !v)}
            className="fnav-hamburger"
            aria-label="Menu"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: '#fff', lineHeight: 0 }}
          >
            {menuOpen ? <CloseOutlined style={{ fontSize: 20 }} /> : <MenuOutlined style={{ fontSize: 20 }} />}
          </button>
        </div>
      </header>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div
          style={{
            position: 'fixed',
            top: 64, left: 0, right: 0,
            background: 'rgba(8,8,8,0.96)',
            backdropFilter: 'blur(18px)',
            zIndex: 999,
            padding: '16px 24px 24px',
            borderBottom: '1px solid rgba(255,255,255,0.07)',
          }}
        >
          {navLinks.map(link => (
            <button
              key={link.label}
              onClick={() => handleNavLink(link.href)}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                background: 'none', border: 'none',
                color: 'rgba(255,255,255,0.85)', fontSize: '1rem', fontWeight: 500,
                padding: '13px 0', cursor: 'pointer',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              {link.label}
            </button>
          ))}
          <Button
            type="primary" block icon={<SearchOutlined />}
            onClick={() => { setMenuOpen(false); navigate('/face-search'); }}
            style={{ marginTop: 16, height: 48, fontWeight: 600 }}
          >
            T\u00ecm \u1ea2nh Ngay
          </Button>
        </div>
      )}

      {/* Page content */}
      <main>
        <Outlet />
      </main>

      {/* Footer */}
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
                N\u1ec1n t\u1ea3ng b\u00e1n \u1ea3nh s\u1ef1 ki\u1ec7n du l\u1ecbch h\u00e0ng \u0111\u1ea7u.<br />
                T\u00ecm l\u1ea1i kho\u1ea3nh kh\u1eafc c\u1ee7a b\u1ea1n ch\u1ec9 v\u1edbi 1 selfie.
              </p>
            </div>
            <div className="footer-links">
              <div>
                <p className="footer-col-title">D\u1ecbch V\u1ee5</p>
                {([['T\u00ecm \u1ea2nh', '/face-search'], ['Xem Albums', '/albums'], ['Tra \u0110\u01a1n H\u00e0ng', '/lookup']] as [string, string][]).map(([label, href]) => (
                  <button key={href} onClick={() => navigate(href)} className="footer-link">{label}</button>
                ))}
              </div>
              <div>
                <p className="footer-col-title">Ph\u00e1p L\u00fd</p>
                {(['\u0110i\u1ec1u Kho\u1ea3n', 'Ch\u00ednh S\u00e1ch', 'Li\u00ean H\u1ec7'] as string[]).map(label => (
                  <span key={label} className="footer-link" style={{ cursor: 'default' }}>{label}</span>
                ))}
              </div>
            </div>
          </div>
          <div className="footer-bottom">
            \u00a9 2026 PhotoPro \u00b7 H\u1ed3 Ch\u00ed Minh, Vi\u1ec7t Nam
          </div>
        </div>
      </footer>
    </>
  );
}
"""

# ---------------------------------------------------------------------------
# Write both files
# ---------------------------------------------------------------------------
for filename, content in [
    ('Landing.tsx', LANDING),
    ('FrontendLayout.tsx', FRONTEND_LAYOUT),
]:
    path = os.path.join(BASE, filename)
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(content)
    size = os.path.getsize(path)
    print(f'OK  {path}  ({size:,} bytes)')

print('Done.')
