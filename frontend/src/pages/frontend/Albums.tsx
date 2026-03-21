import { useNavigate } from 'react-router-dom';
import { useAlbums } from '../../hooks/useAlbums';
import { Button, Alert } from 'antd';
import { SearchOutlined, BulbOutlined, PictureOutlined } from '@ant-design/icons';
import { MapPin } from 'lucide-react';
import '../styles/frontend.css';

interface Album {
  id: string;
  name: string;
  photoCount: number;
  thumbnailUrl: string | null;
}

export default function Albums() {
  const navigate = useNavigate();
  const { data: apiAlbums, loading } = useAlbums();
  const albums: Album[] = (apiAlbums ?? []).map(a => ({
    id: a.id,
    name: a.name,
    photoCount: a.media_count,
    thumbnailUrl: a.thumbnail_url,
  }));

  return (
    <div style={{ background: '#0f0f0f', minHeight: '100vh', padding: '84px 24px 24px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 700, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: 8, color: '#fff' }}>
            <MapPin size={24} /> Bạn Đã Chụp Ảnh Tại Đâu?
          </h1>
          <p style={{ color: '#9ca3af', margin: 0 }}>Chọn địa điểm để tìm ảnh nhanh hơn</p>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <Button type="primary" size="large" block icon={<SearchOutlined />}
            onClick={() => navigate('/face-search')}
            style={{ height: '48px', fontSize: '1rem', fontWeight: 600 }}>
            TÌM TRONG TẤT CẢ ĐỊA ĐIỂM
          </Button>
        </div>

        <Alert type="info" showIcon icon={<BulbOutlined />}
          message={<span style={{ color: '#e0e0e0' }}><strong>Không nhớ địa điểm?</strong> Đừng lo! Nhấn nút "Tìm trong tất cả địa điểm" và AI sẽ tìm giúp bạn.</span>}
          style={{ marginBottom: '24px', borderRadius: '8px', background: 'rgba(26,107,78,0.10)', border: '1px solid rgba(26,107,78,0.25)' }} />

        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 20 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ background: '#1a1a1a', borderRadius: 12, border: '1px solid #2a2a2a', overflow: 'hidden' }}>
                <div style={{ height: 180, background: '#222' }} />
                <div style={{ padding: 16 }}>
                  <div style={{ height: 16, background: '#333', borderRadius: 4, marginBottom: 8, width: '60%' }} />
                  <div style={{ height: 12, background: '#2a2a2a', borderRadius: 4, width: '30%' }} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 20 }}>
            {albums.map((album) => (
              <div key={album.id} style={{
                background: '#1a1a1a', borderRadius: 12, border: '1px solid #2a2a2a',
                overflow: 'hidden', display: 'flex', flexDirection: 'column',
                transition: 'border-color 0.2s, transform 0.2s',
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#1a6b4e'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#2a2a2a'; e.currentTarget.style.transform = 'none'; }}
              >
                {/* Thumbnail */}
                <div style={{
                  height: 180, position: 'relative', overflow: 'hidden',
                  background: album.thumbnailUrl
                    ? '#111'
                    : 'linear-gradient(135deg, #1a6b3c 0%, #0f3d22 100%)',
                }}>
                  {album.thumbnailUrl ? (
                    <img
                      src={album.thumbnailUrl}
                      alt={album.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      loading="lazy"
                    />
                  ) : (
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      height: '100%', flexDirection: 'column', gap: 8,
                    }}>
                      <MapPin size={32} color="rgba(255,255,255,0.4)" />
                      <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: '1.1rem', fontWeight: 600 }}>
                        {album.name}
                      </span>
                    </div>
                  )}
                </div>
                {/* Info */}
                <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#fff', fontWeight: 600, fontSize: '1rem' }}>
                    <MapPin size={14} style={{ flexShrink: 0, color: '#5dffb0' }} />{album.name}
                  </div>
                  <div style={{ color: '#9ca3af', fontSize: '0.85rem' }}>
                    <PictureOutlined /> {album.photoCount} ảnh
                  </div>
                  <Button type="primary" block icon={<SearchOutlined />}
                    onClick={() => navigate(`/face-search?album_id=${album.id}&album_name=${encodeURIComponent(album.name)}`)}
                    style={{ marginTop: 'auto' }}>
                    Tìm Ảnh Tại Đây
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}