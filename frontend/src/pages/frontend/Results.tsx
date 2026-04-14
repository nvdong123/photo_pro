import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Select, Checkbox, Modal, message } from 'antd';
import { StarOutlined, ReloadOutlined, SearchOutlined, ArrowLeftOutlined, AppstoreOutlined, UnorderedListOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons';
import { AlertTriangle, CheckCircle2, Lightbulb, Image as ImageIcon } from 'lucide-react';
import { usePublicBundles } from '../../hooks/useBundles';
import '../styles/frontend.css';

interface Photo {
  id: number;
  albumId: number;
  similarity: number;
  warning: string;
  uploadDate: string;
  url: string;
}

interface Album {
  id: number;
  name: string;
  icon: string;
  category: string;
}

interface PhotosByAlbum {
  [key: string]: {
    album: Album;
    photos: Photo[];
  };
}

export default function Results() {
  const navigate = useNavigate();
  const [allPhotos, setAllPhotos] = useState<Photo[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [photosByAlbum, setPhotosByAlbum] = useState<PhotosByAlbum>({});
  const [selectedPhotos, setSelectedPhotos] = useState<number[]>([]);
  const [sortBy, setSortBy] = useState('album'); // similarity, album, date
  const [similarityFilter, setSimilarityFilter] = useState<number | null>(null); // null, 90, 70
  const [selectAll, setSelectAll] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState<Photo | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [galleryIndex, setGalleryIndex] = useState(0);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    groupAndFilterPhotos();
  }, [allPhotos, albums, sortBy, similarityFilter]);

  const loadData = async () => {
    try {
      // Read face search results from sessionStorage (set by FaceSearch.tsx)
      const raw = sessionStorage.getItem('photopro_search_results');
      if (!raw) {
        // No data — user reloaded or navigated directly; send back to search
        navigate('/face-search', { replace: true });
        return;
      }
      const apiResults: Array<{
          media_id: string;
          similarity: number;
          thumb_url: string;
          shoot_date: string;
          photographer_code: string;
          album_code: string | null;
        }> = JSON.parse(raw);

        // Build deduped album list from results
        const albumMap = new Map<string, Album>();
        let albumCounter = 1;
        apiResults.forEach((r) => {
          const key = r.album_code ?? r.photographer_code ?? 'default';
          if (!albumMap.has(key)) {
            albumMap.set(key, { id: albumCounter++, name: r.album_code ?? r.photographer_code ?? 'Album', icon: '', category: key });
          }
        });
        const albumsList = Array.from(albumMap.values());
        setAlbums(albumsList);

        // Map to Photo interface
        const photos: Photo[] = apiResults.slice(0, 10).map((r, idx) => {
          const key = r.album_code ?? r.photographer_code ?? 'default';
          const album = albumMap.get(key)!;
          return {
            id: idx + 1,
            albumId: album.id,
            similarity: Math.round(r.similarity),
            warning: r.similarity < 80 ? 'Độ khớp thấp' : '',
            uploadDate: r.shoot_date,
            url: r.thumb_url,
            // Store original media_id for cart operations
            media_id: r.media_id,
          } as Photo & { media_id: string };
        });
        setAllPhotos(photos);
    } catch (error) {
      console.error('Error loading results:', error);
    }
  };

  const groupAndFilterPhotos = () => {
    let filtered = [...allPhotos];

    // Apply similarity filter
    if (similarityFilter === 90) {
      filtered = filtered.filter((p) => p.similarity >= 90);
    } else if (similarityFilter === 70) {
      filtered = filtered.filter((p) => p.similarity >= 70);
    }

    // Apply sort
    if (sortBy === 'similarity') {
      filtered.sort((a, b) => b.similarity - a.similarity);
    } else if (sortBy === 'album') {
      filtered.sort((a, b) => a.albumId - b.albumId);
    } else if (sortBy === 'date') {
      filtered.sort((a, b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime());
    }

    // Group by album
    const grouped: PhotosByAlbum = {};
    albums.forEach((album) => {
      grouped[album.id] = {
        album,
        photos: filtered.filter((p) => p.albumId === album.id)
      };
    });

    setPhotosByAlbum(grouped);
  };

  const handleTogglePhoto = (photoId: number) => {
    setSelectedPhotos((prev) =>
      prev.includes(photoId)
        ? prev.filter((id) => id !== photoId)
        : [...prev, photoId]
    );
    setSelectAll(false);
  };

  const handleSelectAll = (checked: boolean) => {
    setSelectAll(checked);
    if (checked) {
      const allPhotoIds = Object.values(photosByAlbum).flatMap((group) => group.photos.map((p) => p.id));
      setSelectedPhotos(allPhotoIds);
    } else {
      setSelectedPhotos([]);
    }
  };

  const getTotalPhotosCount = () => {
    return Object.values(photosByAlbum).reduce((sum, group) => sum + group.photos.length, 0);
  };

  const handleCheckout = () => {
    if (selectedPhotos.length === 0) {
      message.error('Vui lòng chọn ít nhất 1 ảnh');
      return;
    }
    // Store selected photos with media_id for cart API
    const selected = (allPhotos as Array<Photo & { media_id?: string }>).filter((p) => selectedPhotos.includes(p.id));
    localStorage.setItem('photopro_selected_photos', JSON.stringify(selected));
    navigate('/cart');
  };

  // Flat list of all currently visible photos for gallery navigation
  const galleryPhotos = useMemo(() => {
    return Object.values(photosByAlbum).flatMap((group) => group.photos);
  }, [photosByAlbum]);

  const openPhotoPreview = (photo: Photo) => {
    const idx = galleryPhotos.findIndex((p) => p.id === photo.id);
    setGalleryIndex(idx >= 0 ? idx : 0);
    setPreviewPhoto(photo);
  };

  const navigateGallery = useCallback((direction: 'prev' | 'next') => {
    if (galleryPhotos.length === 0) return;
    const newIndex = direction === 'next'
      ? (galleryIndex + 1) % galleryPhotos.length
      : (galleryIndex - 1 + galleryPhotos.length) % galleryPhotos.length;
    setGalleryIndex(newIndex);
    setPreviewPhoto(galleryPhotos[newIndex]);
  }, [galleryIndex, galleryPhotos]);

  // Keyboard navigation for gallery
  useEffect(() => {
    if (!previewPhoto) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') navigateGallery('prev');
      if (e.key === 'ArrowRight') navigateGallery('next');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewPhoto, navigateGallery]);

  const { bundles } = usePublicBundles();

  const formatPrice = (price: number) => price.toLocaleString('vi-VN') + 'đ';

  const suggestion = useMemo(() => {
    const count = selectedPhotos.length;
    if (!bundles.length || count === 0) return null;
    const active = bundles.filter((b) => b.is_active);
    const single = active.find((b) => b.photo_count === 1);
    const singlePrice = single?.price ?? 0;

    // Greedy: largest bundles first
    const tiers = [...active].sort((a, b) => b.photo_count - a.photo_count);
    let remaining = count;
    let total = 0;
    let mainBundle = null as (typeof active)[0] | null;
    for (const b of tiers) {
      const qty = Math.floor(remaining / b.photo_count);
      if (qty > 0) {
        if (!mainBundle) mainBundle = b;
        total += qty * b.price;
        remaining -= qty * b.photo_count;
      }
    }
    if (remaining > 0 && single) total += remaining * singlePrice;

    const savings = singlePrice > 0 && singlePrice * count > total
      ? Math.round((1 - total / (singlePrice * count)) * 100)
      : 0;

    const exactMatch = active.find((b) => b.photo_count === count) ?? null;
    const nextBundle = [...active]
      .filter((b) => b.photo_count > count)
      .sort((a, b) => a.photo_count - b.photo_count)[0] ?? null;
    const diff = nextBundle ? nextBundle.photo_count - count : 0;
    const nextSavings = nextBundle && singlePrice > 0
      ? Math.round((1 - nextBundle.price / (singlePrice * nextBundle.photo_count)) * 100)
      : 0;

    return { total, mainBundle, savings, exactMatch, nextBundle, diff, nextSavings };
  }, [selectedPhotos.length, bundles]);

  return (
    <div className="page-section active" style={{ paddingTop: '120px', paddingBottom: '120px' }}>
      <div className="container">
        {/* Page Header */}
        <div className="page-header">
          <h1><StarOutlined /> Kết Quả Tìm Kiếm</h1>
          <p>Tìm thấy {getTotalPhotosCount()} ảnh khớp</p>
        </div>

        {/* Sort and Filter Bar */}
        <div className="card card-padded mb-3">
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: 600 }}>Sắp xếp:</span>
              <Select
                value={sortBy}
                onChange={(val) => setSortBy(val)}
                style={{ width: 180 }}
                options={[
                  { value: 'similarity', label: 'Độ khớp cao nhất' },
                  { value: 'album', label: 'Theo album' },
                  { value: 'date', label: 'Mới nhất' },
                ]}
              />
            </div>

            <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <Button
                size="small"
                type={similarityFilter === 90 ? 'primary' : 'default'}
                onClick={() => setSimilarityFilter(similarityFilter === 90 ? null : 90)}
              >
                ≥90%
              </Button>
              <Button
                size="small"
                type={similarityFilter === 70 ? 'primary' : 'default'}
                onClick={() => setSimilarityFilter(similarityFilter === 70 ? null : 70)}
              >
                ≥70%
              </Button>
              {(similarityFilter || sortBy !== 'similarity') && (
                <Button
                  size="small"
                  icon={<ReloadOutlined />}
                  onClick={() => {
                    setSimilarityFilter(null);
                    setSortBy('album');
                  }}
                >
                  Xóa lọc
                </Button>
              )}

              <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', marginLeft: '4px' }}>
                <button
                  onClick={() => setViewMode('grid')}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 32, height: 28, border: 'none', cursor: 'pointer',
                    background: viewMode === 'grid' ? 'var(--primary)' : 'var(--surface)',
                    color: viewMode === 'grid' ? '#fff' : 'var(--text-secondary)',
                    transition: 'all 0.2s',
                  }}
                >
                  <AppstoreOutlined />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 32, height: 28, border: 'none', borderLeft: '1px solid var(--border)', cursor: 'pointer',
                    background: viewMode === 'list' ? 'var(--primary)' : 'var(--surface)',
                    color: viewMode === 'list' ? '#fff' : 'var(--text-secondary)',
                    transition: 'all 0.2s',
                  }}
                >
                  <UnorderedListOutlined />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Select All */}
        {getTotalPhotosCount() > 0 && (
          <div className="card card-padded mb-3">
          <Checkbox
            checked={selectAll && selectedPhotos.length > 0}
            onChange={(e) => handleSelectAll(e.target.checked)}
            style={{ fontWeight: 600 }}
          >
            {selectedPhotos.length > 0
              ? `Đã chọn ${selectedPhotos.length}/${getTotalPhotosCount()} ảnh`
              : 'Chọn tất cả ảnh'}
          </Checkbox>
          </div>
        )}

        {/* Photos Grouped by Album */}
        {getTotalPhotosCount() === 0 ? (
          <div className="card card-padded" style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontSize: '3rem', marginBottom: '16px' }}><SearchOutlined /></div>
            <h3 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: '8px' }}>Không tìm thấy ảnh</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
              Thử chọn ảnh khác hoặc thay đổi phạm vi tìm kiếm
            </p>
            <Button type="primary" icon={<ArrowLeftOutlined />} onClick={() => navigate('/face-search')}>
              Quay Lại &amp; Thử Lại
            </Button>
          </div>
        ) : (
          <>
            {Object.values(photosByAlbum).map((group) =>
              group.photos.length > 0 ? (
                <div key={group.album.id} className="card card-padded mb-3">
                  <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <ImageIcon className="w-5 h-5" style={{ color: 'var(--primary)', flexShrink: 0 }} />
                    {group.album.name}
                  </h3>
                  <div className={viewMode === 'grid' ? 'photo-grid' : 'photo-list'}>
                    {group.photos.map((photo) => viewMode === 'list' ? (
                      /* ─── LIST VIEW: vertical large photos ─── */
                      <div
                        key={photo.id}
                        className={`photo-list-item ${selectedPhotos.includes(photo.id) ? 'selected' : ''}`}
                      >
                        <div
                          className="photo-list-image"
                          onClick={() => openPhotoPreview(photo)}
                          onContextMenu={(e) => e.preventDefault()}
                        >
                          <img
                            src={photo.url}
                            alt={`Photo ${photo.id}`}
                            draggable={false}
                            style={{ width: '100%', display: 'block', borderRadius: '8px', userSelect: 'none' }}
                          />
                          <div className="photo-list-watermark">
                            <span>@Vũng Tàu</span>
                          </div>
                        </div>
                        <div className="photo-list-footer">
                          <div className="photo-list-meta">
                            <span className="photo-list-similarity">{photo.similarity}%</span>
                            {photo.warning && (
                              <span className="photo-list-warning">
                                <AlertTriangle className="w-3 h-3" /> {photo.warning}
                              </span>
                            )}
                          </div>
                          <Checkbox
                            checked={selectedPhotos.includes(photo.id)}
                            onChange={() => handleTogglePhoto(photo.id)}
                          >
                            Chọn ảnh
                          </Checkbox>
                        </div>
                      </div>
                    ) : (
                      /* ─── GRID VIEW: original ─── */
                      <div
                        key={photo.id}
                        className={`photo-card ${selectedPhotos.includes(photo.id) ? 'selected' : ''}`}
                        style={{ cursor: 'default', position: 'relative' }}
                      >
                        <div
                          onClick={() => openPhotoPreview(photo)}
                          onContextMenu={(e) => e.preventDefault()}
                          style={{ position: 'relative', cursor: 'zoom-in', height: '100%' }}
                        >
                          <img
                            src={photo.url}
                            alt={`Photo ${photo.id}`}
                            draggable={false}
                            style={{
                              display: 'block',
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover',
                              borderRadius: '8px',
                              userSelect: 'none'
                            }}
                          />
                          <div
                            style={{
                              position: 'absolute',
                              inset: 0,
                              borderRadius: '8px',
                              pointerEvents: 'none',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            <span style={{
                              color: 'rgba(255,255,255,0.32)',
                              fontWeight: 500,
                              fontSize: '0.75rem',
                              letterSpacing: '0.08em',
                              textShadow: '0 1px 2px rgba(0,0,0,0.25)',
                              whiteSpace: 'nowrap'
                            }}>
                              @Vũng Tàu
                            </span>
                          </div>
                        </div>
                        <div className="photo-check">
                          <Checkbox
                            checked={selectedPhotos.includes(photo.id)}
                            onChange={(e) => {
                              e.nativeEvent.stopImmediatePropagation();
                              handleTogglePhoto(photo.id);
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                        <div className="photo-badge">
                          {photo.similarity}%
                        </div>
                        {photo.warning && (
                          <div className="photo-warning" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <AlertTriangle className="w-4 h-4" style={{ flexShrink: 0 }} />
                            {photo.warning}
                          </div>
                        )}
                        <div
                          style={{
                            position: 'absolute',
                            left: '8px',
                            bottom: '8px',
                            backgroundColor: 'rgba(0, 0, 0, 0.62)',
                            color: 'white',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '0.72rem',
                            fontWeight: 500,
                            pointerEvents: 'none'
                          }}
                        >
                          Click ảnh để xem
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null
            )}
          </>
        )}
      </div>

      {/* Sticky Bottom Bar */}
      {getTotalPhotosCount() > 0 && (
        <div className="sticky-bottom-bar">
          <div className="sticky-cart-content">
            {/* Left: selected count */}
            <div className="sticky-info">
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '2px' }}>Đã chọn</div>
              <div style={{ fontSize: '18px', fontWeight: 700 }}>{selectedPhotos.length} ảnh</div>
            </div>

            {/* Middle: bundle hint */}
            <div className="sticky-bundle-hint" style={{ flex: 1, minWidth: 0, padding: '0 8px' }}>
              {selectedPhotos.length > 0 && suggestion ? (
                suggestion.exactMatch ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--primary)', fontWeight: 600, fontSize: 13 }}>
                    <CheckCircle2 className="w-4 h-4" style={{ flexShrink: 0 }} />
                    Phù hợp với {suggestion.exactMatch.name}
                    {suggestion.savings > 0 && (
                      <span style={{ color: '#16a34a', fontSize: 12 }}>(tiết kiệm {suggestion.savings}%)</span>
                    )}
                  </div>
                ) : suggestion.nextBundle && suggestion.nextSavings > 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#d97706', fontWeight: 600, fontSize: 13 }}>
                    <Lightbulb className="w-4 h-4" style={{ flexShrink: 0 }} />
                    Thêm {suggestion.diff} ảnh để dùng {suggestion.nextBundle.name} (tiết kiệm {suggestion.nextSavings}%)
                  </div>
                ) : suggestion.mainBundle ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--primary)', fontWeight: 600, fontSize: 13 }}>
                    <CheckCircle2 className="w-4 h-4" style={{ flexShrink: 0 }} />
                    {suggestion.mainBundle.name}
                    {suggestion.savings > 0 && (
                      <span style={{ color: '#16a34a', fontSize: 12 }}>(tiết kiệm {suggestion.savings}%)</span>
                    )}
                  </div>
                ) : null
              ) : null}
            </div>

            <div className="sticky-price-action">
              <div className="sticky-price">
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Tổng</div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--primary)' }}>
                  {formatPrice(suggestion?.total ?? 0)}
                </div>
              </div>
              <Button
                type="primary"
                onClick={handleCheckout}
                disabled={selectedPhotos.length === 0}
              >
                Tiếp Tục →
              </Button>
            </div>
          </div>
        </div>
      )}

      <Modal
        open={!!previewPhoto}
        footer={null}
        onCancel={() => setPreviewPhoto(null)}
        centered
        width={760}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span>Xem ảnh</span>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 400 }}>
              {galleryPhotos.length > 0 ? `${galleryIndex + 1} / ${galleryPhotos.length}` : ''}
            </span>
          </div>
        }
      >
        {previewPhoto && (
          <div style={{ position: 'relative', lineHeight: 0 }}>
            {/* Previous button */}
            {galleryPhotos.length > 1 && (
              <button
                onClick={() => navigateGallery('prev')}
                style={{
                  position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
                  zIndex: 10, width: 40, height: 40, borderRadius: '50%',
                  background: 'rgba(0,0,0,0.5)', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontSize: 18, transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0,0,0,0.75)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(0,0,0,0.5)')}
              >
                <LeftOutlined />
              </button>
            )}

            <img
              src={previewPhoto.url}
              alt={`Preview ${previewPhoto.id}`}
              draggable={false}
              onContextMenu={(e) => e.preventDefault()}
              style={{ width: '100%', display: 'block', borderRadius: 8, userSelect: 'none' }}
            />

            {/* Next button */}
            {galleryPhotos.length > 1 && (
              <button
                onClick={() => navigateGallery('next')}
                style={{
                  position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                  zIndex: 10, width: 40, height: 40, borderRadius: '50%',
                  background: 'rgba(0,0,0,0.5)', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontSize: 18, transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0,0,0,0.75)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(0,0,0,0.5)')}
              >
                <RightOutlined />
              </button>
            )}

            {/* Watermark */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none',
                overflow: 'hidden',
                zIndex: 1
              }}
            >
              <span
                style={{
                  color: 'rgba(255,255,255,0.45)',
                  fontWeight: 600,
                  fontSize: '1.4rem',
                  letterSpacing: '0.08em',
                  textShadow: '0 1px 4px rgba(0,0,0,0.5)',
                  whiteSpace: 'nowrap'
                }}
              >
                @Vũng Tàu
              </span>
            </div>

            {/* Photo info bar */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 0 0', marginTop: 8,
            }}>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Độ khớp: <strong style={{ color: previewPhoto.similarity >= 90 ? '#16a34a' : '#d97706' }}>{previewPhoto.similarity}%</strong>
              </span>
              <Checkbox
                checked={selectedPhotos.includes(previewPhoto.id)}
                onChange={() => handleTogglePhoto(previewPhoto.id)}
              >
                Chọn ảnh này
              </Checkbox>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
