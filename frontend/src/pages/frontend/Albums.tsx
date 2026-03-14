import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAlbums } from '../../hooks/useAlbums';
import { Button, Spin, Alert } from 'antd';
import { EnvironmentOutlined, SearchOutlined, CalendarOutlined, BulbOutlined, PictureOutlined } from '@ant-design/icons';
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
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px' }}>
      {/* Page Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 700, marginBottom: '8px' }}><EnvironmentOutlined /> Bạn Đã Chụp Ảnh Tại Đâu?</h1>
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
              <div className="album-cover"><PictureOutlined style={{ fontSize: 48, opacity: 0.5 }} /></div>
              <div className="album-info">
                <div className="album-title">{album.name}</div>
                <div className="album-meta">
                  <span><PictureOutlined /> {album.photoCount} ảnh</span>
                </div>
                <Button 
                  type="primary"
                  block
                  icon={<SearchOutlined />}
                  onClick={() => navigate('/face-search')}
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
