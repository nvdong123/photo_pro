import { useEffect, useState } from 'react';
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
    { label: 'Tìm Ảnh',  href: '/face-search' },
    { label: 'Albums',       href: '/albums' },
    { label: 'Bảng Giá', href: '#pricing' },
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
            style={{ height: 48, objectFit: 'contain' }}
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
            Tìm Ảnh Ngay
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
            Tìm Ảnh Ngay
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
                Nền tảng bán ảnh sự kiện du lịch hàng đầu.<br />
                Tìm lại khoảnh khắc của bạn chỉ với 1 selfie.
              </p>
            </div>
            <div className="footer-links">
              <div>
                <p className="footer-col-title">Dịch Vụ</p>
                {([['Tìm Ảnh', '/face-search'], ['Xem Albums', '/albums'], ['Tra Đơn Hàng', '/lookup']] as [string, string][]).map(([label, href]) => (
                  <button key={href} onClick={() => navigate(href)} className="footer-link">{label}</button>
                ))}
              </div>
              <div>
                <p className="footer-col-title">Pháp Lý</p>
                {(['Điều Khoản', 'Chính Sách', 'Liên Hệ'] as string[]).map(label => (
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
    </>
  );
}
