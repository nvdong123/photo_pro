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

// Hero background â€” Vietnam / travel landscape from Unsplash
const HERO_BG =
  'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=1920&q=80';

const GALLERY_SAMPLES = [
  { id: 1, src: 'https://images.unsplash.com/photo-1583417319070-4a69db38a482?auto=format&fit=crop&w=600&q=80', label: 'Há»™i An' },
  { id: 2, src: 'https://images.unsplash.com/photo-1528360983277-13d401cdc186?auto=format&fit=crop&w=600&q=80', label: 'Háº¡ Long Bay' },
  { id: 3, src: 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?auto=format&fit=crop&w=600&q=80', label: 'ÄÃ  Náºµng' },
  { id: 4, src: 'https://images.unsplash.com/photo-1598493869462-d9d6a4b7b59b?auto=format&fit=crop&w=600&q=80', label: 'ÄÃ  Láº¡t' },
  { id: 5, src: 'https://images.unsplash.com/photo-1544764200-d834fd210a23?auto=format&fit=crop&w=600&q=80', label: 'PhÃº Quá»‘c' },
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

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
          HERO â€” full-screen cinematic
      â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
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
            Khoáº£nh Kháº¯c Cá»§a Báº¡n,<br />
            <span className="hero-title-accent">MÃ£i MÃ£i Trong Táº§m Tay</span>
          </h1>
          <p className="hero-subtitle">
            CAPTURE YOUR JOURNEY Â· FIND YOUR MOMENTS Â· OWN YOUR MEMORIES
          </p>
          <div className="hero-actions">
            <Button
              type="primary"
              size="large"
              icon={<SearchOutlined />}
              onClick={() => navigate('/face-search')}
              className="hero-btn-primary"
            >
              ðŸ” TÃ¬m áº¢nh Cá»§a TÃ´i
            </Button>
            <Button
              size="large"
              icon={<PictureOutlined />}
              onClick={() => navigate('/albums')}
              className="hero-btn-outline"
            >
              ðŸ“ Xem Albums
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

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
          STATS BAR
      â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      <section id="stats" ref={statsRef} className="stats-dark">
        <div className="container">
          <div className="stats-grid">
            {[
              { icon: 'ðŸ“·', value: `${photos.toLocaleString('vi-VN')}+`,   label: 'áº¢nh Cháº¥t LÆ°á»£ng Cao' },
              { icon: 'ðŸ˜„', value: `${clients.toLocaleString('vi-VN')}+`,  label: 'KhÃ¡ch HÃ i LÃ²ng' },
              { icon: 'ðŸ“', value: `${locs.toLocaleString('vi-VN')}+`,     label: 'Äá»‹a Äiá»ƒm' },
              { icon: 'ðŸ¤–', value: 'AI',                                    label: 'Nháº­n Diá»‡n KhuÃ´n Máº·t' },
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

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
          HOW IT WORKS
      â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      <section className="dark-section">
        <div className="container">
          <div className="section-header-dark">
            <div className="section-eyebrow">ÄÆ¡n Giáº£n &amp; Nhanh ChÃ³ng</div>
            <h2 className="section-title-dark">CÃ¡ch TÃ¬m áº¢nh Cá»§a Báº¡n</h2>
          </div>
          <div className="hiw-grid">
            {[
              { icon: <MobileOutlined />, step: '01', title: 'Chá»¥p Selfie',  desc: 'Hoáº·c táº£i áº£nh cÃ³ máº·t báº¡n tá»« thiáº¿t bá»‹' },
              { icon: <ScanOutlined />,   step: '02', title: 'AI TÃ¬m áº¢nh',   desc: 'CÃ´ng nghá»‡ AI nháº­n diá»‡n & tÃ¬m trong vÃ i giÃ¢y' },
              { icon: <CreditCardOutlined />, step: '03', title: 'Mua & Táº£i', desc: 'Thanh toÃ¡n nhanh, nháº­n áº£nh HD ngay láº­p tá»©c' },
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

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
          GALLERY PREVIEW
      â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      <section style={{ background: '#0a0a0a', padding: '80px 0' }}>
        <div className="container">
          <div className="section-header-dark">
            <div className="section-eyebrow">Bá»™ SÆ°u Táº­p</div>
            <h2 className="section-title-dark">KhÃ¡m PhÃ¡ Nhá»¯ng Khoáº£nh Kháº¯c</h2>
            <p className="section-subtitle-dark">HÃ ng nghÃ¬n bá»©c áº£nh cháº¥t lÆ°á»£ng cao Ä‘ang chá» báº¡n</p>
          </div>
          <div className="gallery-dark-grid">
            {GALLERY_SAMPLES.map(item => (
              <div key={item.id} className="gallery-dark-thumb" onClick={() => navigate('/albums')}>
                <img src={item.src} alt={item.label} loading="lazy" />
                <div className="gallery-dark-overlay">
                  <span>ðŸ“ {item.label}</span>
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
              Xem Táº¥t Cáº£ Albums
            </Button>
          </div>
        </div>
      </section>

      {/* Albums quick (only when API returns data) */}
      {(apiAlbums?.length ?? 0) > 0 && (
        <section style={{ background: '#0e0e0e', paddingBottom: 80 }}>
          <div className="container">
            <h2 className="section-title-dark" style={{ marginBottom: 24 }}>Äá»‹a Äiá»ƒm Gáº§n ÄÃ¢y</h2>
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
                        <span><PictureOutlined /> {album.photoCount} áº£nh</span>
                      </div>
                      <Button type="primary" block icon={<SearchOutlined />}
                        onClick={() => navigate('/albums')} style={{ marginTop: 'auto' }}>
                        TÃ¬m áº¢nh Táº¡i ÄÃ¢y
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
          PRICING
      â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      <section id="pricing" style={{ background: '#111', padding: '80px 0' }}>
        <div className="container">
          <div className="section-header-dark">
            <div className="section-eyebrow">Minh Báº¡ch &amp; ÄÆ¡n Giáº£n</div>
            <h2 className="section-title-dark"><DollarOutlined /> Báº£ng GiÃ¡ áº¢nh HD</h2>
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
                          {bundle.price.toLocaleString('vi-VN')}Ä‘
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.45)', marginBottom: savingsPct > 0 ? 8 : 24 }}>
                          {unitPrice.toLocaleString('vi-VN')}Ä‘ / áº£nh
                        </div>
                        {savingsPct > 0 && (
                          <div style={{ marginBottom: 20 }}>
                            <Tag color="success" style={{ borderRadius: 20 }}>Tiáº¿t kiá»‡m {savingsPct}%</Tag>
                          </div>
                        )}
                        <Button
                          type={isRecommended ? 'primary' : 'default'}
                          onClick={() => navigate('/face-search')}
                          block
                          style={isRecommended ? {} : { background: 'transparent', borderColor: 'rgba(255,255,255,0.25)', color: 'rgba(255,255,255,0.8)' }}
                        >
                          Chá»n GÃ³i
                        </Button>
                      </div>
                    );
                    return isRecommended ? (
                      <Badge.Ribbon key={bundle.id} text="â­ KHUYáº¾N NGHá»Š" color="var(--accent)">
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
            message={<strong>Auto-pack ThÃ´ng Minh</strong>}
            description="Há»‡ thá»‘ng tá»± Ä‘á»™ng chá»n gÃ³i tá»‘i Æ°u khi báº¡n chá»n áº£nh. VÃ­ dá»¥: Chá»n 2 áº£nh â†’ Äá» xuáº¥t GÃ³i 3 (tiáº¿t kiá»‡m thÃªm 1 áº£nh!)"
            style={{ borderRadius: 12, background: 'rgba(26,107,78,0.12)', border: '1px solid rgba(26,107,78,0.3)' }}
          />
        </div>
      </section>

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
          FAQ
      â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      <section className="dark-section">
        <div className="container">
          <div className="section-header-dark">
            <div className="section-eyebrow">Há»— Trá»£</div>
            <h2 className="section-title-dark"><QuestionCircleOutlined /> CÃ¢u Há»i ThÆ°á»ng Gáº·p</h2>
          </div>
          <div style={{ maxWidth: 720, margin: '0 auto' }}>
            <Collapse
              bordered={false}
              className="faq-dark"
              items={[
                {
                  key: '1',
                  label: <span style={{ fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>LÃ m sao tÃ¬m Ä‘Æ°á»£c áº£nh cá»§a tÃ´i?</span>,
                  children: <p style={{ color: 'rgba(255,255,255,0.5)', margin: 0 }}>Chá»‰ cáº§n chá»¥p selfie hoáº·c táº£i áº£nh cÃ³ máº·t báº¡n, AI sáº½ tÃ¬m táº¥t cáº£ áº£nh cÃ³ báº¡n trong há»‡ thá»‘ng.</p>,
                },
                {
                  key: '2',
                  label: <span style={{ fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>áº¢nh selfie cá»§a tÃ´i cÃ³ Ä‘Æ°á»£c lÆ°u khÃ´ng?</span>,
                  children: <p style={{ color: 'rgba(255,255,255,0.5)', margin: 0 }}>KhÃ´ng. áº¢nh selfie Ä‘Æ°á»£c xá»­ lÃ½ ngay trÃªn thiáº¿t bá»‹ cá»§a báº¡n, chÃºng tÃ´i khÃ´ng lÆ°u trá»¯ áº£nh máº·t cá»§a báº¡n.</p>,
                },
                {
                  key: '3',
                  label: <span style={{ fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>TÃ´i cÃ³ thá»ƒ táº£i áº£nh trong bao lÃ¢u?</span>,
                  children: <p style={{ color: 'rgba(255,255,255,0.5)', margin: 0 }}>Link táº£i cÃ³ hiá»‡u lá»±c 7 ngÃ y sau khi thanh toÃ¡n. Báº¡n cÃ³ thá»ƒ táº£i áº£nh nhiá»u láº§n trong thá»i gian nÃ y.</p>,
                },
                {
                  key: '4',
                  label: <span style={{ fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>TÃ´i quÃªn mÃ£ Ä‘Æ¡n hÃ ng thÃ¬ sao?</span>,
                  children: <p style={{ color: 'rgba(255,255,255,0.5)', margin: 0 }}>Báº¡n cÃ³ thá»ƒ tra cá»©u báº±ng sá»‘ Ä‘iá»‡n thoáº¡i Ä‘Ã£ Ä‘áº·t hÃ ng.</p>,
                },
              ]}
            />
          </div>
        </div>
      </section>

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
          FOOTER
      â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
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
                Ná»n táº£ng bÃ¡n áº£nh sá»± kiá»‡n du lá»‹ch hÃ ng Ä‘áº§u.<br />
                TÃ¬m láº¡i khoáº£nh kháº¯c cá»§a báº¡n chá»‰ vá»›i 1 selfie.
              </p>
            </div>
            <div className="footer-links">
              <div>
                <p className="footer-col-title">Dá»‹ch Vá»¥</p>
                {[['TÃ¬m áº¢nh', '/face-search'], ['Xem Albums', '/albums'], ['Tra ÄÆ¡n HÃ ng', '/lookup']].map(([label, href]) => (
                  <button key={href} onClick={() => navigate(href)} className="footer-link">{label}</button>
                ))}
              </div>
              <div>
                <p className="footer-col-title">PhÃ¡p LÃ½</p>
                {['Äiá»u Khoáº£n', 'ChÃ­nh SÃ¡ch', 'LiÃªn Há»‡'].map(label => (
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
