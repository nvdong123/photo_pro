import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Wifi, Upload } from 'lucide-react';
import { getUser, isLoggedIn } from '../../hooks/useAuth';
import FtpCredentialsTab from './FtpCredentialsTab';
import DirectUploadTab from './DirectUploadTab';

const PRIMARY = '#1a6b4e';

export default function CameraConnect() {
  const navigate = useNavigate();
  const user = getUser();

  // Gate: must be logged in
  if (!isLoggedIn()) {
    navigate('/login');
    return null;
  }

  const [tab, setTab] = useState<'ftp' | 'direct'>('ftp');

  return (
    <div style={{ minHeight: '100dvh', background: '#f5f7fa', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header style={{
        background: PRIMARY,
        color: '#fff',
        padding: '0 20px',
        height: 56,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <button
          onClick={() => navigate('/dashboard')}
          style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}
          aria-label="Back"
        >
          <ChevronLeft size={22} />
        </button>
        <span style={{ fontWeight: 700, fontSize: 17, letterSpacing: 0.2 }}>Kết Nối Máy Ảnh</span>
        <span style={{ fontSize: 13, opacity: 0.8 }}>{user?.name ?? ''}</span>
      </header>

      {/* Tab bar */}
      <div style={{
        display: 'flex',
        background: '#fff',
        borderBottom: '2px solid #e8edf2',
        position: 'sticky',
        top: 56,
        zIndex: 99,
      }}>
        <button
          onClick={() => setTab('ftp')}
          style={{
            flex: 1,
            padding: '14px 0',
            background: 'none',
            border: 'none',
            borderBottom: tab === 'ftp' ? `3px solid ${PRIMARY}` : '3px solid transparent',
            color: tab === 'ftp' ? PRIMARY : '#6b7280',
            fontWeight: tab === 'ftp' ? 700 : 400,
            fontSize: 15,
            cursor: 'pointer',
            transition: 'all 0.18s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          <Wifi size={16} /> WiFi / FTP
        </button>
        <button
          onClick={() => setTab('direct')}
          style={{
            flex: 1,
            padding: '14px 0',
            background: 'none',
            border: 'none',
            borderBottom: tab === 'direct' ? `3px solid ${PRIMARY}` : '3px solid transparent',
            color: tab === 'direct' ? PRIMARY : '#6b7280',
            fontWeight: tab === 'direct' ? 700 : 400,
            fontSize: 15,
            cursor: 'pointer',
            transition: 'all 0.18s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          <Upload size={16} /> Trực Tiếp
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: '16px', maxWidth: 600, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
        {tab === 'ftp' ? <FtpCredentialsTab /> : <DirectUploadTab />}
      </div>
    </div>
  );
}
