import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
function write(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf8');
  console.log('Written:', path);
}
const base = 'c:/Users/datth/Downloads/photopro-react/src';

// ===== PRICING (fixed forms + bundle cards) =====
write(`${base}/pages/dashboard/Pricing.tsx`, `
import { useState, useEffect } from 'react';
import { Tabs, Button, Tag, message } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, StarFilled, StarOutlined, SaveOutlined, PictureOutlined } from '@ant-design/icons';
import { hasRole } from '../../hooks/useAuth';

const BORDER = '#e2e5ea';
const PRIMARY = '#1a6b4e';
const PRIMARY_LIGHT = '#e8f5f0';
const WARNING = '#d4870e';
const DANGER = '#d63b3b';
const SURFACE_ALT = '#f6f7f9';
const TEXT_MUTED = '#8b91a0';

interface Bundle { id: number; name: string; photos: number; price: number; featured: boolean; sold: number; }
interface Coupon { id: number; code: string; type: 'percent' | 'fixed'; value: number; quantity: string; used: number; expiry: string; status: 'active' | 'expired'; }

const INITIAL_BUNDLES: Bundle[] = [
  { id: 1, name: 'Gói 1 ảnh', photos: 1, price: 20000, featured: false, sold: 150 },
  { id: 2, name: 'Gói 3 ảnh', photos: 3, price: 50000, featured: true, sold: 420 },
  { id: 3, name: 'Gói 8 ảnh', photos: 8, price: 100000, featured: false, sold: 280 },
];

const INITIAL_COUPONS: Coupon[] = [
  { id: 1, code: 'WELCOME2026', type: 'percent', value: 20, quantity: '100', used: 45, expiry: '31/03/2026', status: 'active' },
  { id: 2, code: 'TETNGUYENDAN', type: 'fixed', value: 10000, quantity: '50', used: 12, expiry: '15/02/2026', status: 'expired' },
  { id: 3, code: 'FIRSTBUY', type: 'percent', value: 15, quantity: 'Không giới hạn', used: 238, expiry: '-', status: 'active' },
];

interface BundleForm { name: string; quantity: string; price: string; featured: boolean; }
interface CouponForm { code: string; type: string; value: string; quantity: string; expiry: string; }

const EMPTY_BUNDLE: BundleForm = { name: '', quantity: '', price: '', featured: false };
const EMPTY_COUPON: CouponForm = { code: '', type: '', value: '', quantity: '', expiry: '' };

export default function Pricing() {
  const [bundles, setBundles] = useState<Bundle[]>(INITIAL_BUNDLES);
  const [coupons, setCoupons] = useState<Coupon[]>(INITIAL_COUPONS);

  const [bundleModal, setBundleModal] = useState<{ open: boolean; item: Bundle | null }>({ open: false, item: null });
  const [bundleForm, setBundleForm] = useState<BundleForm>(EMPTY_BUNDLE);
  const [bundleCalc, setBundleCalc] = useState<{ perPhoto: string; savings: string } | null>(null);

  const [couponModal, setCouponModal] = useState<{ open: boolean; item: Coupon | null }>({ open: false, item: null });
  const [couponForm, setCouponForm] = useState<CouponForm>(EMPTY_COUPON);

  const canEdit = hasRole(['admin-system', 'admin-sales']);

  // --- Bundle calculation ---
  useEffect(() => {
    const price = parseInt(bundleForm.price);
    const qty = parseInt(bundleForm.quantity);
    if (price > 0 && qty > 0) {
      const perPhoto = Math.round(price / qty);
      const savings = Math.round((1 - perPhoto / 20000) * 100);
      setBundleCalc({
        perPhoto: perPhoto.toLocaleString('vi-VN') + 'đ',
        savings: savings > 0 ? \`Tiết kiệm \${savings}%\` : 'Không tiết kiệm',
      });
    } else { setBundleCalc(null); }
  }, [bundleForm.price, bundleForm.quantity]);

  const openBundle = (item: Bundle | null) => {
    setBundleModal({ open: true, item });
    setBundleForm(item ? { name: item.name, quantity: String(item.photos), price: String(item.price), featured: item.featured } : EMPTY_BUNDLE);
    setBundleCalc(null);
  };
  const closeBundle = () => setBundleModal({ open: false, item: null });

  const saveBundle = () => {
    if (!bundleForm.name || !bundleForm.quantity || !bundleForm.price) { message.error('Vui lòng điền đầy đủ thông tin'); return; }
    if (bundleModal.item) {
      setBundles(p => p.map(b => b.id === bundleModal.item!.id ? { ...b, name: bundleForm.name, photos: parseInt(bundleForm.quantity), price: parseInt(bundleForm.price), featured: bundleForm.featured } : b));
    } else {
      setBundles(p => [...p, { id: Date.now(), name: bundleForm.name, photos: parseInt(bundleForm.quantity), price: parseInt(bundleForm.price), featured: bundleForm.featured, sold: 0 }]);
    }
    if (bundleForm.featured) message.success('✨ Gói đã được lưu và đánh dấu là PHỔ BIẾN NHẤT!');
    else message.success('Đã lưu gói bundle thành công!');
    closeBundle();
  };

  const deleteBundle = (id: number) => {
    if (window.confirm('Bạn có chắc muốn xóa gói này?')) { setBundles(p => p.filter(b => b.id !== id)); message.success('Đã xóa gói'); }
  };

  const toggleFeatured = (b: Bundle) => {
    if (b.featured) {
      if (window.confirm('Bỏ đánh dấu gói này là PHỔ BIẾN NHẤT?')) { setBundles(p => p.map(x => x.id === b.id ? { ...x, featured: false } : x)); message.success('Đã bỏ đánh dấu gói phổ biến'); }
    } else {
      if (window.confirm('Đánh dấu gói này là PHỔ BIẾN NHẤT?\\n\\n⚠️ Gói hiện tại đang được đánh dấu sẽ bị bỏ đánh dấu.')) {
        setBundles(p => p.map(x => ({ ...x, featured: x.id === b.id }))); message.success('✨ Đã đánh dấu gói này là PHỔ BIẾN NHẤT!');
      }
    }
  };

  const openCoupon = (item: Coupon | null) => {
    setCouponModal({ open: true, item });
    setCouponForm(item ? { code: item.code, type: item.type, value: String(item.value), quantity: item.quantity === 'Không giới hạn' ? '' : item.quantity, expiry: '' } : EMPTY_COUPON);
  };
  const closeCoupon = () => setCouponModal({ open: false, item: null });

  const saveCoupon = () => {
    if (!couponForm.code || !couponForm.type || !couponForm.value) { message.error('Vui lòng điền đầy đủ thông tin'); return; }
    const qty = couponForm.quantity || 'Không giới hạn';
    const exp = couponForm.expiry || '-';
    if (couponModal.item) {
      setCoupons(p => p.map(c => c.id === couponModal.item!.id ? { ...c, code: couponForm.code.toUpperCase(), type: couponForm.type as 'percent' | 'fixed', value: parseFloat(couponForm.value), quantity: qty, expiry: exp } : c));
    } else {
      setCoupons(p => [...p, { id: Date.now(), code: couponForm.code.toUpperCase(), type: couponForm.type as 'percent' | 'fixed', value: parseFloat(couponForm.value), quantity: qty, used: 0, expiry: exp, status: 'active' }]);
    }
    message.success('Đã lưu mã giảm giá thành công!');
    closeCoupon();
  };

  const deleteCoupon = (id: number) => {
    if (window.confirm('Bạn có chắc muốn xóa mã giảm giá này?')) { setCoupons(p => p.filter(c => c.id !== id)); message.success('Đã xóa mã giảm giá'); }
  };

  const fmt = (v: number) => v.toLocaleString('vi-VN') + 'đ';
  const fieldStyle = { width: '100%', padding: '8px 12px', border: \`1px solid \${BORDER}\`, borderRadius: 6, fontSize: 14, outline: 'none', boxSizing: 'border-box' as const };
  const labelStyle = { display: 'block' as const, fontWeight: 600, marginBottom: 6, fontSize: 14 };

  // ---- Bundle Modal ----
  const renderBundleModal = () => {
    if (!bundleModal.open) return null;
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={e => { if (e.target === e.currentTarget) closeBundle(); }}>
        <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: \`1px solid \${BORDER}\` }}>
            <h3 style={{ margin: 0, fontWeight: 700, fontSize: 16 }}>{bundleModal.item ? 'Chỉnh sửa gói bundle' : 'Tạo gói bundle mới'}</h3>
            <button onClick={closeBundle} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#5a6170', lineHeight: 1, padding: 4 }}>×</button>
          </div>
          <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={labelStyle}>Tên gói <span style={{ color: DANGER }}>*</span></label>
              <input style={fieldStyle} value={bundleForm.name} onChange={e => setBundleForm(f => ({ ...f, name: e.target.value }))} placeholder="VD: Gói 5 ảnh" />
            </div>
            <div>
              <label style={labelStyle}>Số lượng ảnh <span style={{ color: DANGER }}>*</span></label>
              <input style={fieldStyle} type="number" min={1} value={bundleForm.quantity} onChange={e => setBundleForm(f => ({ ...f, quantity: e.target.value }))} placeholder="VD: 5" />
            </div>
            <div>
              <label style={labelStyle}>Giá gói (VNĐ) <span style={{ color: DANGER }}>*</span></label>
              <input style={fieldStyle} type="number" min={1000} step={1000} value={bundleForm.price} onChange={e => setBundleForm(f => ({ ...f, price: e.target.value }))} placeholder="VD: 80000" />
            </div>
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
                <input type="checkbox" checked={bundleForm.featured} onChange={e => setBundleForm(f => ({ ...f, featured: e.target.checked }))} />
                <span>Đánh dấu là gói phổ biến</span>
              </label>
              <small style={{ color: '#5a6170', display: 'block', marginTop: 4, fontSize: 12 }}>Gói phổ biến sẽ được highlight với badge "PHỔ BIẾN NHẤT"</small>
            </div>
            {bundleCalc && (
              <div style={{ padding: '12px 16px', background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: 8, fontSize: 13, color: '#1d4ed8' }}>
                <strong>Tính toán:</strong>
                <div style={{ marginTop: 8 }}>
                  Giá / ảnh: <strong>{bundleCalc.perPhoto}</strong><br />
                  So với gói 1 ảnh (20,000đ): <strong>{bundleCalc.savings}</strong>
                </div>
              </div>
            )}
            {bundleForm.featured && (
              <div style={{ padding: '12px 16px', background: '#fef3e8', border: '1px solid #fcd34d', borderRadius: 8, fontSize: 13, color: '#92400e' }}>
                ⭐ <strong>Gói này sẽ được đánh dấu là PHỔ BIẾN NHẤT</strong>
                <p style={{ margin: '4px 0 0', fontSize: 13 }}>Chỉ nên chọn 1 gói phổ biến duy nhất để tăng hiệu quả chuyển đổi.</p>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '16px 24px', borderTop: \`1px solid \${BORDER}\` }}>
            <Button onClick={closeBundle}>Hủy</Button>
            <Button type="primary" icon={<SaveOutlined />} onClick={saveBundle}>Lưu</Button>
          </div>
        </div>
      </div>
    );
  };

  // ---- Coupon Modal ----
  const renderCouponModal = () => {
    if (!couponModal.open) return null;
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={e => { if (e.target === e.currentTarget) closeCoupon(); }}>
        <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: \`1px solid \${BORDER}\` }}>
            <h3 style={{ margin: 0, fontWeight: 700, fontSize: 16 }}>{couponModal.item ? 'Chỉnh sửa mã giảm giá' : 'Tạo mã giảm giá mới'}</h3>
            <button onClick={closeCoupon} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#5a6170', lineHeight: 1, padding: 4 }}>×</button>
          </div>
          <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={labelStyle}>Mã coupon <span style={{ color: DANGER }}>*</span> <small style={{ color: TEXT_MUTED, fontWeight: 400 }}>(Chữ in hoa, không dấu, không khoảng trắng)</small></label>
              <input style={{ ...fieldStyle, textTransform: 'uppercase', fontFamily: 'monospace' }} value={couponForm.code} onChange={e => setCouponForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="VD: TETNGUYENDAN" />
            </div>
            <div>
              <label style={labelStyle}>Loại giảm giá <span style={{ color: DANGER }}>*</span></label>
              <select style={fieldStyle} value={couponForm.type} onChange={e => setCouponForm(f => ({ ...f, type: e.target.value, value: '' }))}>
                <option value="">Chọn loại...</option>
                <option value="percent">Giảm theo %</option>
                <option value="fixed">Giảm số tiền cố định</option>
              </select>
            </div>
            {couponForm.type && (
              <div>
                <label style={labelStyle}>{couponForm.type === 'percent' ? 'Giá trị (%)' : 'Giá trị (VNĐ)'} <span style={{ color: DANGER }}>*</span></label>
                <input style={fieldStyle} type="number" min={1} max={couponForm.type === 'percent' ? 100 : undefined}
                  value={couponForm.value} onChange={e => setCouponForm(f => ({ ...f, value: e.target.value }))}
                  placeholder={couponForm.type === 'percent' ? 'VD: 20 (giảm 20%)' : 'VD: 10000 (giảm 10,000đ)'} />
              </div>
            )}
            <div>
              <label style={labelStyle}>Số lượng <small style={{ color: TEXT_MUTED, fontWeight: 400 }}>(Để trống = không giới hạn)</small></label>
              <input style={fieldStyle} type="number" min={1} value={couponForm.quantity} onChange={e => setCouponForm(f => ({ ...f, quantity: e.target.value }))} placeholder="VD: 100" />
            </div>
            <div>
              <label style={labelStyle}>Ngày hết hạn <small style={{ color: TEXT_MUTED, fontWeight: 400 }}>(Để trống = vĩnh viễn)</small></label>
              <input style={fieldStyle} type="date" value={couponForm.expiry} onChange={e => setCouponForm(f => ({ ...f, expiry: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '16px 24px', borderTop: \`1px solid \${BORDER}\` }}>
            <Button onClick={closeCoupon}>Hủy</Button>
            <Button type="primary" icon={<SaveOutlined />} onClick={saveCoupon}>Lưu</Button>
          </div>
        </div>
      </div>
    );
  };

  // ---- Bundle Cards ----
  const bundleTab = (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Gói Bundle Pricing</h2>
        {canEdit && <Button type="primary" icon={<PlusOutlined />} onClick={() => openBundle(null)}>Tạo gói mới</Button>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 24 }}>
        {bundles.map(b => {
          const perPhoto = Math.round(b.price / b.photos);
          const savings = Math.round((1 - perPhoto / 20000) * 100);
          const cardColor = b.photos === 8 ? WARNING : PRIMARY;
          const iconBg = b.photos === 8 ? '#fef3e8' : PRIMARY_LIGHT;
          return (
            <div key={b.id} style={{ background: '#fff', border: b.featured ? \`2px solid \${PRIMARY}\` : \`1px solid \${BORDER}\`, borderRadius: 12, overflow: 'hidden' }}>
              {b.featured && <div style={{ background: PRIMARY, color: '#fff', textAlign: 'center', padding: '6px', fontSize: 11, fontWeight: 700, letterSpacing: '0.5px' }}>PHỔ BIẾN NHẤT</div>}
              <div style={{ textAlign: 'center', padding: '24px 24px 16px' }}>
                <div style={{ width: 64, height: 64, margin: '0 auto 16px', background: iconBg, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <PictureOutlined style={{ fontSize: 32, color: cardColor }} />
                </div>
                <h3 style={{ fontSize: 24, margin: '0 0 8px', fontWeight: 700 }}>{b.name}</h3>
                <div style={{ fontSize: 32, fontWeight: 800, color: cardColor, marginBottom: 4 }}>{fmt(b.price)}</div>
                <div style={{ fontSize: 13, color: TEXT_MUTED }}>{perPhoto.toLocaleString('vi-VN')}đ / ảnh</div>
                {savings > 0 && (
                  <div style={{ display: 'inline-block', marginTop: 8, padding: '4px 12px', background: b.photos === 8 ? WARNING : '#1a854a', color: 'white', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>
                    {b.photos === 8 ? '🔥 ' : ''}Tiết kiệm {savings}%
                  </div>
                )}
                <div style={{ margin: '24px 0', padding: 16, background: b.featured ? PRIMARY_LIGHT : SURFACE_ALT, borderRadius: 8 }}>
                  <div style={{ fontSize: 13, color: b.featured ? '#134a36' : '#5a6170', marginBottom: 4 }}>Đã bán</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: b.featured ? PRIMARY : '#1a1d23' }}>{b.sold} gói</div>
                </div>
                {canEdit && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button size="small" icon={<EditOutlined />} style={{ flex: 1 }} onClick={() => openBundle(b)}>Sửa</Button>
                    <Button size="small" type={b.featured ? 'primary' : 'default'} icon={b.featured ? <StarFilled /> : <StarOutlined />} onClick={() => toggleFeatured(b)} title={b.featured ? 'Bỏ đánh dấu phổ biến' : 'Đánh dấu phổ biến'} />
                    <Button size="small" danger icon={<DeleteOutlined />} onClick={() => deleteBundle(b.id)} />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  // ---- Coupon Tab ----
  const couponTab = (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Mã giảm giá (Coupon)</h2>
        {canEdit && <Button type="primary" icon={<PlusOutlined />} onClick={() => openCoupon(null)}>Tạo mã giảm giá</Button>}
      </div>
      <div style={{ background: '#fff', border: \`1px solid \${BORDER}\`, borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: SURFACE_ALT }}>
              {['Mã coupon', 'Loại giảm giá', 'Giá trị', 'Số lượng', 'Đã dùng', 'Hết hạn', 'Trạng thái', 'Thao tác'].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#5a6170', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {coupons.map(c => (
              <tr key={c.id} style={{ borderTop: \`1px solid \${BORDER}\` }}>
                <td style={{ padding: '12px 16px' }}>
                  <strong style={{ fontFamily: 'monospace', background: PRIMARY_LIGHT, padding: '4px 8px', borderRadius: 4, color: PRIMARY }}>{c.code}</strong>
                </td>
                <td style={{ padding: '12px 16px' }}>{c.type === 'percent' ? 'Giảm %' : 'Giảm tiền'}</td>
                <td style={{ padding: '12px 16px', fontWeight: 600 }}>{c.type === 'percent' ? \`\${c.value}%\` : fmt(c.value)}</td>
                <td style={{ padding: '12px 16px' }}>{c.quantity}</td>
                <td style={{ padding: '12px 16px' }}>{c.used}</td>
                <td style={{ padding: '12px 16px', color: '#5a6170' }}>{c.expiry}</td>
                <td style={{ padding: '12px 16px' }}>
                  <Tag color={c.status === 'active' ? 'green' : 'default'}>{c.status === 'active' ? 'Đang hoạt động' : 'Hết hạn'}</Tag>
                </td>
                <td style={{ padding: '12px 16px' }}>
                  {canEdit && (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <Button size="small" icon={<EditOutlined />} onClick={() => openCoupon(c)} />
                      <Button size="small" danger icon={<DeleteOutlined />} onClick={() => deleteCoupon(c.id)} />
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 24 }}>Quản lý Bảng giá</h1>
      <Tabs items={[{ key: 'bundles', label: '📦 Gói Bundle', children: bundleTab }, { key: 'coupons', label: '🎟️ Mã giảm giá', children: couponTab }]} />
      {renderBundleModal()}
      {renderCouponModal()}
    </div>
  );
}
`.trimStart());
console.log('Pricing.tsx done');
