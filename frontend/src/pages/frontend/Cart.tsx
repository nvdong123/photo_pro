import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePublicBundles } from '../../hooks/usePublicBundles';
import { Button, Input, Modal, message } from 'antd';
import { ShoppingCartOutlined, DeleteOutlined, PictureOutlined, FileTextOutlined, DollarOutlined, AimOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import '../styles/frontend.css';

interface Photo {
  id: number;
  albumId: number;
  similarity: number;
  warning: string;
  uploadDate: string;
  url: string;
}

interface PricingTier {
  photos: number;
  price: number;
  name: string;
}

interface PackageUsed {
  name: string;
  count: number;
  totalPrice: number;
}

interface PricingResult {
  originalPrice: number;
  finalPrice: number;
  discount: number;
  savedPercent: number;
  packages: PackageUsed[];
}

export default function Cart() {
  const navigate = useNavigate();
  const [selectedPhotos, setSelectedPhotos] = useState<Photo[]>([]);
  const [notes, setNotes] = useState('');

  const { bundles } = usePublicBundles();
  const pricingTiers: PricingTier[] = (bundles ?? []).map(b => ({
    photos: b.photo_count,
    price: b.price,
    name: b.name,
  }));

  useEffect(() => {
    const stored = localStorage.getItem('photopro_selected_photos');
    if (stored) {
      try { setSelectedPhotos(JSON.parse(stored)); } catch { /* ignore */ }
    }
  }, []);

  // Greedy algorithm giống HTML demo
  const calculatePricing = (count: number): PricingResult => {
    const SINGLE_PRICE = pricingTiers.find(t => t.photos === 1)?.price ?? 20000;
    const originalPrice = count * SINGLE_PRICE;

    if (count === 0) {
      return { originalPrice: 0, finalPrice: 0, discount: 0, savedPercent: 0, packages: [] };
    }

    // Sort tiers giảm dần theo số ảnh
    const tiers = [...pricingTiers].sort((a, b) => b.photos - a.photos);

    let remaining = count;
    let finalPrice = 0;
    const packages: PackageUsed[] = [];

    for (const tier of tiers) {
      if (remaining >= tier.photos && tier.photos > 1) {
        const qty = Math.floor(remaining / tier.photos);
        if (qty > 0) {
          packages.push({ name: tier.name, count: qty, totalPrice: qty * tier.price });
          finalPrice += qty * tier.price;
          remaining -= qty * tier.photos;
        }
      }
    }

    // Ảnh lẻ còn lại
    if (remaining > 0) {
      packages.push({ name: 'Ảnh lẻ', count: remaining, totalPrice: remaining * SINGLE_PRICE });
      finalPrice += remaining * SINGLE_PRICE;
    }

    const discount = originalPrice - finalPrice;
    const savedPercent = discount > 0 ? Math.round((discount / originalPrice) * 100) : 0;

    return { originalPrice, finalPrice, discount, savedPercent, packages };
  };

  const removePhoto = (photoId: number) => {
    setSelectedPhotos((prev) => {
      const updated = prev.filter((p) => p.id !== photoId);
      localStorage.setItem('photopro_selected_photos', JSON.stringify(updated));
      return updated;
    });
  };

  const handleCheckout = () => {
    if (selectedPhotos.length === 0) {
      message.error('Vui lòng chọn ít nhất 1 ảnh');
      return;
    }
    navigate('/checkout');
  };

  const clearCart = () => {
    Modal.confirm({
      title: 'Xóa giỏ hàng',
      content: 'Bạn có chắc chắn muốn xóa tất cả ảnh trong giỏ?',
      okText: 'Xóa',
      okType: 'danger',
      cancelText: 'Hủy',
      onOk: () => {
        setSelectedPhotos([]);
        localStorage.removeItem('photopro_selected_photos');
      },
    });
  };

  const formatPrice = (price: number): string => {
    return price.toLocaleString('vi-VN') + 'đ';
  };


  return (
    <div className="page-section active" style={{ paddingTop: '120px', paddingBottom: '24px', minHeight: '100vh' }}>
      <div className="container">
        {/* Page Header */}
        <div className="page-header">
          <h1><ShoppingCartOutlined /> Giỏ Hàng</h1>
          <p>Xem lại các ảnh đã chọn trước khi thanh toán</p>
        </div>

        {/* Content Grid */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'calc(100% - 400px) 350px', 
          gap: '24px',
          // @ts-ignore
          '@media (max-width: 1024px)': {
            gridTemplateColumns: '1fr'
          }
        }} className="responsive-grid-cart">
          {/* Left Column - Photos and Notes */}
          <div>
            {/* Photo Grid */}
            <div className="card card-padded mb-3">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>
                  Ảnh đã chọn ({selectedPhotos.length})
                </h3>
                <Button
                  onClick={clearCart}
                  type="text"
                  danger
                  size="small"
                  icon={<DeleteOutlined />}
                  style={{ padding: '6px 12px' }}
                >
                  Xóa tất cả
                </Button>
              </div>

              {selectedPhotos.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                  <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'center' }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-secondary)' }}>
                      <circle cx="9" cy="21" r="1"/>
                      <circle cx="20" cy="21" r="1"/>
                      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
                    </svg>
                  </div>
                  <h3 style={{ fontWeight: 700, marginBottom: '8px', fontSize: '1.2rem', justifyContent: 'center' }}>Giỏ hàng trống</h3>
                  <p style={{ color: 'var(--text-secondary)', marginBottom: '20px', textAlign: 'center' }}>Chưa có ảnh nào được chọn</p>
                  <Button type="primary" onClick={() => navigate('/albums')}>
                    <PictureOutlined /> Chọn Ảnh Ngay
                  </Button>
                </div>
              ) : (
              <div className="photo-grid">
                {selectedPhotos.map((photo) => (
                  <div
                    key={photo.id}
                    className="photo-card"
                    style={{ position: 'relative' }}
                  >
                    <img
                      src={photo.url}
                      alt={`Photo ${photo.id}`}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        borderRadius: '8px'
                      }}
                    />
                    <Button
                      type="text"
                      danger
                      onClick={() => removePhoto(photo.id)}
                      style={{
                        position: 'absolute',
                        top: '8px',
                        right: '8px',
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        backgroundColor: 'rgba(0, 0, 0, 0.7)',
                        color: 'white',
                        padding: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1rem',
                        minWidth: 'unset',
                      }}
                    >
                      ✕
                    </Button>
                    <div
                      style={{
                        position: 'absolute',
                        bottom: '8px',
                        left: '8px',
                        backgroundColor: 'rgba(0, 0, 0, 0.7)',
                        color: 'white',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '0.8rem',
                        fontWeight: 600
                      }}
                    >
                      {photo.similarity}% khớp
                    </div>
                  </div>
                ))}
              </div>
              )}
            </div>

            {/* Notes Section */}
            <div className="card card-padded">
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '16px' }}><FileTextOutlined /> Ghi Chú</h3>
              <Input.TextArea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Nhập ghi chú hoặc yêu cầu đặc biệt (tùy chọn)"
                style={{ minHeight: '120px', resize: 'vertical', fontSize: '0.95rem' }}
                autoSize={{ minRows: 4 }}
              />
            </div>
          </div>

          {/* Right Column - Summary (Sticky) */}
          <div
            style={{
              position: 'sticky',
              top: '100px',
              height: 'fit-content'
            }}
            className="summary-sidebar-cart"
          >
            <div className="card card-padded">
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '20px' }}>
                <DollarOutlined /> Chi Tiết Thanh Toán
              </h3>

              {(() => {
                const pricing = calculatePricing(selectedPhotos.length);
                return (
                  <>
                    {/* Price Breakdown */}
                    <div style={{ marginBottom: '20px', paddingBottom: '20px', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Số lượng ảnh:</span>
                        <strong>{selectedPhotos.length}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Giá gốc (lẻ):</span>
                        <span style={{ textDecoration: pricing.discount > 0 ? 'line-through' : 'none', color: 'var(--text-secondary)' }}>
                          {formatPrice(pricing.originalPrice)}
                        </span>
                      </div>

                      {/* Package breakdown */}
                      <div style={{ marginBottom: '10px' }}>
                        <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '6px' }}>Gói áp dụng:</div>
                        {pricing.packages.map((pkg, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', backgroundColor: pkg.name === 'Ảnh lẻ' ? 'transparent' : 'var(--surface-elevated)', borderRadius: '6px', marginBottom: '4px', border: pkg.name === 'Ảnh lẻ' ? 'none' : '1px solid var(--border)' }}>
                            <span style={{ fontSize: '0.9rem' }}>
                              {pkg.name === 'Ảnh lẻ' ? `${pkg.count} ảnh lẻ` : `${pkg.name} × ${pkg.count}`}
                            </span>
                            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{formatPrice(pkg.totalPrice)}</span>
                          </div>
                        ))}
                      </div>

                      {/* Discount row */}
                      {pricing.discount > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--success, #1a6b4e)', fontWeight: 600 }}>
                          <span>Tiết kiệm ({pricing.savedPercent}%):</span>
                          <span>-{formatPrice(pricing.discount)}</span>
                        </div>
                      )}
                    </div>

                    {/* Total */}
                    <div style={{ marginBottom: '24px', paddingBottom: '20px', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '1rem', fontWeight: 700 }}>Tổng thanh toán:</span>
                        <span style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--primary)' }}>
                          {formatPrice(pricing.finalPrice)}
                        </span>
                      </div>
                    </div>
                  </>
                );
              })()}

              <Button
                type="primary"
                block
                onClick={handleCheckout}
                icon={<AimOutlined />}
                style={{ marginBottom: '12px' }}
              >
                Tiến Hành Thanh Toán
              </Button>

              {/* Continue Shopping */}
              <Button
                block
                icon={<ArrowLeftOutlined />}
                onClick={() => navigate('/results')}
              >
                Chọn Thêm Ảnh
              </Button>
            </div>
          </div>
        </div>
      </div>
      
      <style>{`
        @media (max-width: 1024px) {
          .responsive-grid-cart {
            display: grid !important;
            grid-template-columns: 1fr !important;
            gap: 20px !important;
          }
          
          .summary-sidebar-cart {
            position: static !important;
            top: auto !important;
            height: auto !important;
          }
        }
      `}</style>
    </div>
  );
}
