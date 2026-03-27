import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input, Button, Checkbox, Radio, message, Typography } from 'antd';
import { CreditCardOutlined, UserOutlined, DollarOutlined, MobileOutlined, BankOutlined, WalletOutlined, ProfileOutlined, CheckCircleOutlined, ArrowLeftOutlined, LockOutlined } from '@ant-design/icons';
import { useCart } from '../../hooks/useCart';
import { useCheckout } from '../../hooks/useCheckout';
import { usePublicBundles } from '../../hooks/usePublicBundles';
import { usePublicSettings } from '../../hooks/useSettings';
import '../styles/frontend.css';

export default function Checkout() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ phone: '', email: '', name: '' });
  const [paymentMethod, setPaymentMethod] = useState<'vnpay' | 'momo' | 'payos' | 'bank'>('vnpay');
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [selectedPhotos, setSelectedPhotos] = useState<any[]>([]);
  const [processingPayment, setProcessingPayment] = useState(false);

  const { refetch, addItem, clearCart, cart } = useCart();
  const { checkout } = useCheckout();
  const { bundles: publicBundles } = usePublicBundles();
  const { vnpayEnabled, payosEnabled, momoEnabled, bankEnabled } = usePublicSettings();

  // Build list of active gateways in priority order
  const activeGateways = [
    vnpayEnabled  && { key: 'vnpay' as const,  label: 'VNPay',  desc: 'Thanh toán qua cổng VNPay - ATM, Visa, QR Code' },
    payosEnabled  && { key: 'payos' as const,  label: 'PayOS',  desc: 'Thanh toán qua PayOS - Chuyển khoản nhanh QR' },
    momoEnabled   && { key: 'momo' as const,   label: 'MoMo',   desc: 'Thanh toán ví MoMo' },
    bankEnabled   && { key: 'bank' as const,   label: 'Chuyển khoản ngân hàng', desc: 'Chuyển khoản trực tiếp qua ngân hàng' },
  ].filter(Boolean) as { key: 'vnpay' | 'momo' | 'payos' | 'bank'; label: string; desc: string }[];

  // Auto-select first active gateway when list loads
  useEffect(() => {
    if (activeGateways.length > 0 && !activeGateways.find(g => g.key === paymentMethod)) {
      setPaymentMethod(activeGateways[0].key);
    }
  }, [activeGateways.length]);

  useEffect(() => {
    const saved = localStorage.getItem('photopro_selected_photos');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setSelectedPhotos(parsed);
        syncToCart(parsed);
      } catch { /* ignore */ }
    }
  }, []);

  const syncToCart = async (photos: any[]) => {
    try {
      // Clear any stale items first so this selection is exactly what gets ordered
      await clearCart();
      await refetch();
      for (const p of photos) {
        if (p.media_id) await addItem(p.media_id);
      }
    } catch { /* non-fatal */ }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target as HTMLInputElement;
    setFormData((prev) => ({
      ...prev,
      [name]: value
    }));
  };

  const validateForm = (): boolean => {
    if (!formData.phone.trim()) {
      message.error('Vui lòng nhập số điện thoại');
      return false;
    }
    if (formData.phone.trim().length !== 10 || !/^\d{10}$/.test(formData.phone)) {
      message.error('Số điện thoại phải là 10 chữ số');
      return false;
    }
    if (!agreeTerms) {
      message.error('Vui lòng đồng ý với điều khoản sử dụng và chính sách bảo mật');
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;
    setProcessingPayment(true);
    try {
      const bundleId = cart?.suggested_pack?.lines?.[0]?.bundle_id ?? undefined;
      await checkout({
        customer_phone: formData.phone,
        customer_email: formData.email || undefined,
        bundle_id: bundleId,
        payment_method: paymentMethod,
      });
      // checkout() redirects browser to payment gateway; code below won't execute
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Đặt hàng thất bại, vui lòng thử lại');
      setProcessingPayment(false);
    }
  };

  const PRICING_TIERS = publicBundles.map(b => ({ quantity: b.photo_count, price: b.price }));

  const calculatePricing = (count: number) => {
    if (count === 0) return { originalPrice: 0, finalPrice: 0, savedPercent: 0, packages: [] as { label: string; count: number; unitPrice: number; subtotal: number }[] };
    const tiers = [...PRICING_TIERS].sort((a, b) => b.quantity - a.quantity);
    const singlePrice = PRICING_TIERS.find(t => t.quantity === 1)?.price ?? 20000;
    const originalPrice = count * singlePrice;
    let remaining = count;
    const packages: { label: string; count: number; unitPrice: number; subtotal: number }[] = [];
    let finalPrice = 0;
    for (const tier of tiers) {
      if (tier.quantity <= 1) continue;
      const used = Math.floor(remaining / tier.quantity);
      if (used > 0) {
        packages.push({ label: `Gói ${tier.quantity} ảnh`, count: used, unitPrice: tier.price, subtotal: used * tier.price });
        finalPrice += used * tier.price;
        remaining -= used * tier.quantity;
      }
    }
    if (remaining > 0) {
      packages.push({ label: 'Ảnh lẻ', count: remaining, unitPrice: singlePrice, subtotal: remaining * singlePrice });
      finalPrice += remaining * singlePrice;
    }
    const savedPercent = originalPrice > 0 ? Math.round((1 - finalPrice / originalPrice) * 100) : 0;
    return { originalPrice, finalPrice, savedPercent, packages };
  };

  const formatPrice = (price: number): string => price.toLocaleString('vi-VN') + 'đ';

  const pricing = calculatePricing(selectedPhotos.length);
  const totalPrice = pricing.finalPrice;

  return (
    <div className="page-section active" style={{ paddingTop: '120px', paddingBottom: '24px', minHeight: '100vh' }}>
      <div className="container">
        {/* Page Header */}
        <div className="page-header">
          <h1><CreditCardOutlined /> Thanh Toán</h1>
          <p>Hoàn tất đơn hàng của bạn</p>
        </div>

        {/* Content Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '24px' }} className="responsive-grid-checkout">
          {/* Left Column - Form and Payment */}
          <div>
            {/* Customer Information */}
            <div className="card card-padded mb-3">
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '16px' }}>
                <UserOutlined /> Thông Tin Khách Hàng
              </h3>

              {/* Phone Field */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '8px' }}>
                  Số điện thoại <span style={{ color: 'var(--error)' }}>*</span>
                </label>
                <Input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                  placeholder="0912345678"
                  size="large"
                  style={{ marginBottom: '8px' }}
                />
                <small style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  Link tải ảnh sẽ được gửi qua SMS
                </small>
              </div>

              {/* Email Field */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '8px' }}>
                  Email (tùy chọn)
                </label>
                <Input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  placeholder="email@example.com"
                  size="large"
                />
              </div>

              {/* Name Field */}
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '8px' }}>
                  Họ và tên (tùy chọn)
                </label>
                <Input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="Nguyễn Văn A"
                  size="large"
                />
              </div>
            </div>

            {/* Payment Method */}
            <div className="card card-padded mb-3">
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '20px' }}>
                <DollarOutlined /> Phương Thức Thanh Toán
              </h3>

              <Radio.Group value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} style={{ display: 'block' }}>
              {activeGateways.length === 0 && (
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', padding: '12px 0' }}>
                  Chưa có cổng thanh toán nào được kích hoạt. Vui lòng liên hệ admin.
                </div>
              )}
              {activeGateways.map(gw => (
                <label
                  key={gw.key}
                  style={{
                    display: 'block',
                    padding: '16px',
                    borderRadius: '8px',
                    border: `2px solid ${paymentMethod === gw.key ? 'var(--primary)' : 'var(--border)'}`,
                    backgroundColor: paymentMethod === gw.key ? 'rgba(26, 107, 78, 0.05)' : 'transparent',
                    cursor: 'pointer',
                    marginBottom: '12px',
                    transition: 'all 0.2s'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Radio value={gw.key} />
                    <div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700 }}><BankOutlined /> {gw.label}</div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{gw.desc}</div>
                    </div>
                  </div>
                </label>
              ))}
              </Radio.Group>
            </div>
          </div>

          {/* Right Column - Order Summary (Sticky) */}
          <div
            style={{
              position: 'sticky',
              top: '100px',
              height: 'fit-content'
            }}
            className="summary-sidebar-checkout"
          >
            <div className="card card-padded">
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '20px' }}>
                <ProfileOutlined /> Thông Tin Đơn Hàng
              </h3>

              {/* Price Breakdown */}
              <div style={{ marginBottom: '20px', paddingBottom: '20px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Số lượng ảnh:</span>
                  <strong>{selectedPhotos.length} ảnh</strong>
                </div>
                {pricing.savedPercent > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Tạm tính:</span>
                    <span style={{ textDecoration: 'line-through', color: 'var(--text-secondary)' }}>
                      {formatPrice(pricing.originalPrice)}
                    </span>
                  </div>
                )}

                {/* Package List */}
                <div style={{ paddingBottom: '12px', borderBottom: '1px solid var(--border)', marginBottom: '12px' }}>
                  <div style={{ marginBottom: '8px', fontWeight: 600, fontSize: '0.95rem' }}>
                    Gói áp dụng:
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {pricing.packages.map((pkg, i) => (
                      <div
                        key={i}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          backgroundColor: 'var(--surface-elevated)',
                          padding: '10px 12px',
                          borderRadius: '8px',
                          border: '1px solid var(--border)',
                          fontSize: '0.9rem'
                        }}
                      >
                        <span>{pkg.label} × {pkg.count}</span>
                        <span style={{ fontWeight: 600 }}>{formatPrice(pkg.subtotal)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {pricing.savedPercent > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Giảm giá:</span>
                    <span style={{ color: 'var(--success)', fontWeight: 600 }}>-{pricing.savedPercent}%</span>
                  </div>
                )}
              </div>

              {/* Total */}
              <div style={{ marginBottom: '24px', paddingBottom: '20px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '1rem', fontWeight: 700 }}>Tổng cộng:</span>
                  <span
                    style={{
                      fontSize: '1.5rem',
                      fontWeight: 700,
                      color: 'var(--primary)'
                    }}
                  >
                    {formatPrice(totalPrice)}
                  </span>
                </div>
              </div>

              {/* Terms Checkbox */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '20px' }}>
                <Checkbox
                  checked={agreeTerms}
                  onChange={(e) => setAgreeTerms(e.target.checked)}
                  style={{ marginTop: '2px', flexShrink: 0 }}
                />
                <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                  Tôi đồng ý với <Typography.Link style={{ color: 'var(--primary)' }}>điều khoản sử dụng</Typography.Link> và{' '}
                  <Typography.Link style={{ color: 'var(--primary)' }}>chính sách bảo mật</Typography.Link>
                </span>
              </div>
              <Button
                type="primary"
                block
                onClick={handleSubmit}
                disabled={!agreeTerms}
                icon={<CheckCircleOutlined />}
                style={{ marginBottom: '12px' }}
              >
                Xác Nhận Thanh Toán
              </Button>

              {/* Back Button */}
              <Button block icon={<ArrowLeftOutlined />} onClick={() => navigate('/cart')}>
                Quay Lại Giỏ Hàng
              </Button>

              <div style={{ marginTop: '14px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <LockOutlined /> Giao dịch được mã hóa và bảo mật
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Processing Overlay */}
      {processingPayment && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.65)', zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
          <div style={{ width: '48px', height: '48px', border: '4px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'co-spin 1s linear infinite' }} />
          <p style={{ color: 'white', fontSize: '1.1rem', fontWeight: 600, margin: 0 }}>Đang chuyển đến cổng thanh toán...</p>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.875rem', margin: 0 }}>Vui lòng đợi</p>
        </div>
      )}
      
      <style>{`
        @keyframes co-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @media (max-width: 1024px) {
          .responsive-grid-checkout { display: grid !important; grid-template-columns: 1fr !important; gap: 20px !important; }
          .summary-sidebar-checkout { position: static !important; top: auto !important; height: auto !important; }
        }
      `}</style>
    </div>
  );
}