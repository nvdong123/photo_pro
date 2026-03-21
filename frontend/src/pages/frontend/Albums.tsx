import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAlbums } from '../../hooks/useAlbums';
import { Button, Spin, Alert } from 'antd';
import { SearchOutlined, CalendarOutlined, BulbOutlined, PictureOutlined } from '@ant-design/icons';
import { MapPin } from 'lucide-react';
import '../styles/frontend.css';

interface Album {
  id: string;
  name: string;
  photoCount: number;
}

export default function Albums() {
  const navigate = useNavigate();
  const { data: apiAlbums, loading } = useAlbums();
  const albums: Album[] = (apiAlbums ?? []).map(a => ({
    id: a.id,
    name: a.name,
    photoCount: a.media_count,
  }));

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '84px 24px 24px' }}>
      {/* Page Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 700, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: 8 }}><MapPin size={24} /> Bạn Đã Chụp Ảnh Tại Đâu?</h1>
        <p style={{ color: '#666', margin: 0 }}>Chọn địa điểm để tìm ảnh nhanh hơn</p>
      </div>

      {/* Search All Button */}
      <div style={{ marginBottom: '24px' }}>
        <Button
          type="primary"
          size="large"
          block
          icon={<SearchOutlined />}
          onClick={() => navigate('/face-search')}
          style={{ height: '48px', fontSize: '1rem', fontWeight: 600 }}
        >
          TÌM TRONG TẤT CẢ ĐỊA ĐIỂM
        </Button>
      </div>

      {/* Info Alert */}
      <Alert
        type="info"
        showIcon
        icon={<BulbOutlined />}
        message={<><strong>Không nhớ địa điểm?</strong> Đừng lo! Nhấn nút “Tìm trong tất cả địa điểm” và AI sẽ tìm giúp bạn.</>}
        style={{ marginBottom: '24px', borderRadius: '8px' }}
      />

      {/* Albums Grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <Spin size="large" />
        </div>
      ) : (
        <div className="album-grid">
          {albums.map((album) => (
            <div 
              key={album.id}
              className="album-card"
            >
              <div
                className="album-cover"
                style={{
                  backgroundImage: `url(https://source.unsplash.com/featured/400x200/?${encodeURIComponent(album.name + ' vietnam travel')})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  position: 'relative',
                }}
              >
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.25)', borderRadius: 'inherit' }} />
                <MapPin size={32} color="rgba(255,255,255,0.8)" style={{ position: 'relative', zIndex: 1 }} />
              </div>
              <div className="album-info">
                <div className="album-title" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <MapPin size={14} style={{ flexShrink: 0, color: '#1a6b4e' }} />{album.name}
                </div>
                <div className="album-meta">
                  <span><PictureOutlined /> {album.photoCount} ảnh</span>
                </div>
                <Button 
                  type="primary"
                  block
                  icon={<SearchOutlined />}
                  onClick={() => navigate(`/face-search?album_id=${album.id}&album_name=${encodeURIComponent(album.name)}`)}
                  style={{ marginTop: 'auto' }}
                >
                  Tìm Ảnh Tại Đây
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
