import { useState, useEffect } from 'react';
import { Tabs, Button, Tag, message, Input, Select, Checkbox, Modal, Table, DatePicker } from 'antd';
import dayjs from 'dayjs';
import { PlusOutlined, EditOutlined, DeleteOutlined, StarFilled, StarOutlined, SaveOutlined, PictureOutlined, GiftOutlined, TagOutlined } from '@ant-design/icons';
import { hasRole } from '../../hooks/useAuth';
import { useBundles } from '../../hooks/useBundles';
import { useCoupons } from '../../hooks/useCoupons';
import type { Coupon } from '../../hooks/useCoupons';

const BORDER = '#e2e5ea';
const PRIMARY = '#1a6b4e';
const PRIMARY_LIGHT = '#e8f5f0';
const WARNING = '#d4870e';
const DANGER = '#d63b3b';
const SURFACE_ALT = '#f6f7f9';
const TEXT_MUTED = '#8b91a0';

interface Bundle { id: string; name: string; photos: number; price: number; featured: boolean; sold: number; }

interface BundleForm { name: string; quantity: string; price: string; featured: boolean; }
interface CouponForm { code: string; type: string; value: string; quantity: string; expiry: string; }

const EMPTY_BUNDLE: BundleForm = { name: '', quantity: '', price: '', featured: false };
const EMPTY_COUPON: CouponForm = { code: '', type: '', value: '', quantity: '', expiry: '' };

export default function Pricing() {
  const { bundles: apiBundles, create: createBundle, update: updateBundle, remove: removeBundle } = useBundles();
  const { coupons: apiCoupons, create: createCoupon, update: updateCoupon, remove: removeCoupon } = useCoupons();

  const bundles: Bundle[] = (apiBundles ?? []).map((b): Bundle => ({
    id: b.id,
    name: b.name,
    photos: b.photo_count,
    price: b.price,
    featured: b.is_popular,
    sold: 0,
  }));

  const [bundleModal, setBundleModal] = useState<{ open: boolean; item: Bundle | null }>({ open: false, item: null });
  const [bundleForm, setBundleForm] = useState<BundleForm>(EMPTY_BUNDLE);
  const [bundleCalc, setBundleCalc] = useState<{ perPhoto: string; savings: string } | null>(null);

  const [couponModal, setCouponModal] = useState<{ open: boolean; item: Coupon | null }>({ open: false, item: null });
  const [couponForm, setCouponForm] = useState<CouponForm>(EMPTY_COUPON);

  const canEdit = hasRole(['admin-system', 'admin-sales']);

  useEffect(() => {
    const price = parseInt(bundleForm.price);
    const qty = parseInt(bundleForm.quantity);
    if (price > 0 && qty > 0) {
      const perPhoto = Math.round(price / qty);
      const savings = Math.round((1 - perPhoto / 20000) * 100);
      setBundleCalc({
        perPhoto: perPhoto.toLocaleString('vi-VN') + 'đ',
        savings: savings > 0 ? `Tiết kiệm ${savings}%` : 'Không tiết kiệm',
      });
    } else { setBundleCalc(null); }
  }, [bundleForm.price, bundleForm.quantity]);

  const openBundle = (item: Bundle | null) => {
    setBundleModal({ open: true, item });
    setBundleForm(item ? { name: item.name, quantity: String(item.photos), price: String(item.price), featured: item.featured } : EMPTY_BUNDLE);
    setBundleCalc(null);
  };
  const closeBundle = () => setBundleModal({ open: false, item: null });

  const saveBundle = async () => {
    if (!bundleForm.name || !bundleForm.quantity || !bundleForm.price) { message.error('Vui lòng điền đầy đủ thông tin'); return; }
    try {
      if (bundleModal.item) {
        await updateBundle(bundleModal.item.id, {
          name: bundleForm.name,
          photo_count: parseInt(bundleForm.quantity),
          price: parseInt(bundleForm.price),
          is_active: true,
          is_popular: bundleForm.featured,
        });
      } else {
        await createBundle({
          name: bundleForm.name,
          photo_count: parseInt(bundleForm.quantity),
          price: parseInt(bundleForm.price),
        });
      }
      message.success('Đã lưu gói bundle thành công!');
      closeBundle();
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Lưu gói thất bại');
    }
  };

  const deleteBundle = (id: string) => {
    Modal.confirm({
      title: 'Xóa gói',
      content: 'Bạn có chắc muốn xóa gói này?',
      okText: 'Xóa',
      okType: 'danger',
      cancelText: 'Hủy',
      onOk: async () => {
        try { await removeBundle(id); message.success('Đã xóa gói'); }
        catch (err) { message.error(err instanceof Error ? err.message : 'Xóa gói thất bại'); }
      },
    });
  };

  const toggleFeatured = (b: Bundle) => {
    if (b.featured) {
      Modal.confirm({
        title: 'Bỏ đánh dấu phổ biến',
        content: 'Bỏ đánh dấu gói này là PHỔ BIẾN NHẤT?',
        okText: 'Xác nhận',
        cancelText: 'Hủy',
        onOk: async () => {
          try {
            await updateBundle(b.id, { is_popular: false });
            message.success('Đã bỏ đánh dấu gói phổ biến');
          } catch (err) {
            message.error(err instanceof Error ? err.message : 'Cập nhật thất bại');
          }
        },
      });
    } else {
      Modal.confirm({
        title: 'Đánh dấu phổ biến',
        content: 'Đánh dấu gói này là PHỔ BIẾN NHẤT? Gói hiện tại đang được đánh dấu sẽ bỏ đánh dấu.',
        okText: 'Xác nhận',
        cancelText: 'Hủy',
        onOk: async () => {
          try {
            await updateBundle(b.id, { is_popular: true });
            message.success('Đã đánh dấu gói này là PHỔ BIẾN NHẤT!');
          } catch (err) {
            message.error(err instanceof Error ? err.message : 'Cập nhật thất bại');
          }
        },
      });
    }
  };

  const openCoupon = (item: Coupon | null) => {
    setCouponModal({ open: true, item });
    setCouponForm(item ? {
      code: item.code,
      type: item.discount_type,
      value: String(item.discount_value),
      quantity: item.max_uses != null ? String(item.max_uses) : '',
      expiry: item.expires_at ? item.expires_at.slice(0, 10) : '',
    } : EMPTY_COUPON);
  };
  const closeCoupon = () => setCouponModal({ open: false, item: null });

  const saveCoupon = async () => {
    if (!couponForm.code || !couponForm.type || !couponForm.value) { message.error('Vui lòng điền đầy đủ thông tin'); return; }
    try {
      const payload = {
        code: couponForm.code.toUpperCase(),
        discount_type: couponForm.type,
        discount_value: parseInt(couponForm.value),
        max_uses: couponForm.quantity ? parseInt(couponForm.quantity) : null,
        expires_at: couponForm.expiry ? new Date(couponForm.expiry).toISOString() : null,
      };
      if (couponModal.item) {
        await updateCoupon(couponModal.item.id, payload);
      } else {
        await createCoupon(payload);
      }
      message.success('Đã lưu mã giảm giá thành công!');
      closeCoupon();
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Lưu mã giảm giá thất bại');
    }
  };

  const deleteCoupon = (id: string) => {
    Modal.confirm({
      title: 'Xóa mã giảm giá',
      content: 'Bạn có chắc muốn xóa mã giảm giá này?',
      okText: 'Xóa',
      okType: 'danger',
      cancelText: 'Hủy',
      onOk: async () => {
        try { await removeCoupon(id); message.success('Đã xóa mã giảm giá'); }
        catch (err) { message.error(err instanceof Error ? err.message : 'Xóa mã giảm giá thất bại'); }
      },
    });
  };

  const fmt = (v: number) => v.toLocaleString('vi-VN') + 'đ';
  const fieldStyle = { width: '100%', padding: '8px 12px', border: `1px solid ${BORDER}`, borderRadius: 6, fontSize: 14, outline: 'none', boxSizing: 'border-box' as const };
  const labelStyle = { display: 'block' as const, fontWeight: 600, marginBottom: 6, fontSize: 14 };

  const renderBundleModal = () => (
    <Modal
      open={bundleModal.open}
      onCancel={closeBundle}
      title={bundleModal.item ? 'Chỉnh sửa gói bundle' : 'Tạo gói bundle mới'}
      footer={[<Button key="cancel" onClick={closeBundle}>Hủy</Button>, <Button key="save" type="primary" icon={<SaveOutlined />} onClick={saveBundle}>Lưu</Button>]}
      width={480}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '8px 0' }}>
        <div>
          <label style={labelStyle}>Tên gói <span style={{ color: DANGER }}>*</span></label>
          <Input style={fieldStyle} value={bundleForm.name} onChange={e => setBundleForm(f => ({ ...f, name: e.target.value }))} placeholder="VD: Gói 5 ảnh" />
        </div>
        <div>
          <label style={labelStyle}>Số lượng ảnh <span style={{ color: DANGER }}>*</span></label>
          <Input style={fieldStyle} type="number" min={1} value={bundleForm.quantity} onChange={e => setBundleForm(f => ({ ...f, quantity: e.target.value }))} placeholder="VD: 5" />
        </div>
        <div>
          <label style={labelStyle}>Giá gói (VNĐ) <span style={{ color: DANGER }}>*</span></label>
          <Input style={fieldStyle} type="number" min={1000} step={1000} value={bundleForm.price} onChange={e => setBundleForm(f => ({ ...f, price: e.target.value }))} placeholder="VD: 80000" />
        </div>
        <div>
          <Checkbox
            checked={bundleForm.featured}
            onChange={e => setBundleForm(f => ({ ...f, featured: e.target.checked }))}
            style={{ fontWeight: 600, fontSize: 14 }}
          >Đánh dấu là gói phổ biến</Checkbox>
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
            <StarFilled style={{ color: '#f59e0b' }} /> <strong>Gói này sẽ được đánh dấu là PHỔ BIẾN NHẤT</strong>
            <p style={{ margin: '4px 0 0', fontSize: 13 }}>Chỉ nên chọn 1 gói phổ biến duy nhất để tăng hiệu quả chuyển đổi.</p>
          </div>
        )}
      </div>
    </Modal>
  );

  const renderCouponModal = () => (
    <Modal
      open={couponModal.open}
      onCancel={closeCoupon}
      title={couponModal.item ? 'Chỉnh sửa mã giảm giá' : 'Tạo mã giảm giá mới'}
      footer={[<Button key="cancel" onClick={closeCoupon}>Hủy</Button>, <Button key="save" type="primary" icon={<SaveOutlined />} onClick={saveCoupon}>Lưu</Button>]}
      width={480}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '8px 0' }}>
        <div>
          <label style={labelStyle}>Mã coupon <span style={{ color: DANGER }}>*</span> <small style={{ color: TEXT_MUTED, fontWeight: 400 }}>(Chữ in hoa, không dấu, không khoảng trắng)</small></label>
          <Input style={{ ...fieldStyle, textTransform: 'uppercase', fontFamily: 'monospace' }} value={couponForm.code} onChange={e => setCouponForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="VD: TETNGUYENDAN" />
        </div>
        <div>
          <label style={labelStyle}>Loại giảm giá <span style={{ color: DANGER }}>*</span></label>
          <Select style={{ width: '100%' }} value={couponForm.type || undefined} placeholder="Chọn loại..." onChange={v => setCouponForm(f => ({ ...f, type: v, value: '' }))}>
            <Select.Option value="percent">Giảm theo %</Select.Option>
            <Select.Option value="fixed">Giảm số tiền cố định</Select.Option>
          </Select>
        </div>
        {couponForm.type && (
          <div>
            <label style={labelStyle}>{couponForm.type === 'percent' ? 'Giá trị (%)' : 'Giá trị (VNĐ)'} <span style={{ color: DANGER }}>*</span></label>
            <Input style={fieldStyle} type="number" min={1} max={couponForm.type === 'percent' ? 100 : undefined}
              value={couponForm.value} onChange={e => setCouponForm(f => ({ ...f, value: e.target.value }))}
              placeholder={couponForm.type === 'percent' ? 'VD: 20 (giảm 20%)' : 'VD: 10000 (giảm 10,000đ)'} />
          </div>
        )}
        <div>
          <label style={labelStyle}>Số lượng <small style={{ color: TEXT_MUTED, fontWeight: 400 }}>(Để trống = không giới hạn)</small></label>
          <Input style={fieldStyle} type="number" min={1} value={couponForm.quantity} onChange={e => setCouponForm(f => ({ ...f, quantity: e.target.value }))} placeholder="VD: 100" />
        </div>
        <div>
          <label style={labelStyle}>Ngày hết hạn <small style={{ color: TEXT_MUTED, fontWeight: 400 }}>(Để trống = vĩnh viễn)</small></label>
          <DatePicker
            value={couponForm.expiry ? dayjs(couponForm.expiry, 'YYYY-MM-DD') : null}
            onChange={(val) => setCouponForm(f => ({ ...f, expiry: val ? val.format('YYYY-MM-DD') : '' }))}
            style={{ width: '100%' }}
            format="DD/MM/YYYY"
            placeholder="Chọn ngày hết hạn"
          />
        </div>
      </div>
    </Modal>
  );

  const bundleTab = (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Gói Bundle Pricing</h2>
        {canEdit && <Button type="primary" icon={<PlusOutlined />} onClick={() => openBundle(null)}>Tạo gói mới</Button>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, 280px)', justifyContent: 'center', gap: 24 }}>
        {bundles.map(b => {
          const perPhoto = Math.round(b.price / b.photos);
          const savings = Math.round((1 - perPhoto / 20000) * 100);
          const cardColor = b.photos === 8 ? WARNING : PRIMARY;
          const iconBg = b.photos === 8 ? '#fef3e8' : PRIMARY_LIGHT;
          return (
            <div key={b.id} style={{ background: '#fff', border: b.featured ? `2px solid ${PRIMARY}` : `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden' }}>
              {b.featured && <div style={{ background: PRIMARY, color: '#fff', textAlign: 'center', padding: '6px', fontSize: 11, fontWeight: 700, letterSpacing: '0.5px' }}>PHỔ BIẾN NHẤT</div>}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 24px 16px', width: '100%', boxSizing: 'border-box' }}>
                <div style={{ width: 64, height: 64, margin: '0 auto 16px', background: iconBg, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <PictureOutlined style={{ fontSize: 32, color: cardColor }} />
                </div>
                <h3 style={{ fontSize: 24, margin: '0 0 8px', fontWeight: 700, textAlign: 'center' }}>{b.name}</h3>
                <div style={{ fontSize: 32, fontWeight: 800, color: cardColor, marginBottom: 4 }}>{fmt(b.price)}</div>
                <div style={{ fontSize: 13, color: TEXT_MUTED }}>{perPhoto.toLocaleString('vi-VN')}đ / ảnh</div>
                {savings > 0 && (
                  <div style={{ display: 'inline-block', marginTop: 8, padding: '4px 12px', background: b.photos === 8 ? WARNING : '#1a854a', color: 'white', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>
                    Tiết kiệm {savings}%
                  </div>
                )}
                <div style={{ margin: '24px 0', padding: 16, background: b.featured ? PRIMARY_LIGHT : SURFACE_ALT, borderRadius: 8, width: '100%', boxSizing: 'border-box' }}>
                  <div style={{ fontSize: 13, color: b.featured ? '#134a36' : '#5a6170', marginBottom: 4 }}>Đã bán</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: b.featured ? PRIMARY : '#1a1d23' }}>{b.sold} gói</div>
                </div>
                {canEdit && (
                  <div style={{ display: 'flex', gap: 8, width: '100%' }}>
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

  const coupons = apiCoupons ?? [];
  const couponTab = (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Mã giảm giá (Coupon)</h2>
        {canEdit && <Button type="primary" icon={<PlusOutlined />} onClick={() => openCoupon(null)}>Tạo mã giảm giá</Button>}
      </div>
      <Table
        dataSource={coupons}
        rowKey="id"
        size="middle"
        pagination={false}
        style={{ border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden' }}
        columns={[
          { title: 'Mã coupon', dataIndex: 'code', key: 'code', render: (code: string) => <strong style={{ fontFamily: 'monospace', background: PRIMARY_LIGHT, padding: '4px 8px', borderRadius: 4, color: PRIMARY }}>{code}</strong> },
          { title: 'Loại giảm giá', dataIndex: 'discount_type', key: 'discount_type', render: (type: string) => type === 'percent' ? 'Giảm %' : 'Giảm tiền' },
          { title: 'Giá trị', key: 'value', render: (_: unknown, c: Coupon) => <strong>{c.discount_type === 'percent' ? `${c.discount_value}%` : fmt(c.discount_value)}</strong> },
          { title: 'Số lượng', key: 'max_uses', render: (_: unknown, c: Coupon) => c.max_uses != null ? String(c.max_uses) : 'Không giới hạn' },
          { title: 'Đã dùng', dataIndex: 'used_count', key: 'used_count' },
          { title: 'Hết hạn', key: 'expires_at', render: (_: unknown, c: Coupon) => c.expires_at ? <span style={{ color: '#5a6170' }}>{dayjs(c.expires_at).format('DD/MM/YYYY')}</span> : <span style={{ color: '#5a6170' }}>-</span> },
          { title: 'Trạng thái', key: 'status', render: (_: unknown, c: Coupon) => { const expired = c.expires_at && new Date(c.expires_at) < new Date(); return <Tag color={!expired && c.is_active ? 'green' : 'default'}>{!expired && c.is_active ? 'Đang hoạt động' : 'Hết hạn'}</Tag>; } },
          { title: 'Thao tác', key: 'actions', render: (_: unknown, c: Coupon) => canEdit ? <div style={{ display: 'flex', gap: 4 }}><Button size="small" icon={<EditOutlined />} onClick={() => openCoupon(c)} /><Button size="small" danger icon={<DeleteOutlined />} onClick={() => deleteCoupon(c.id)} /></div> : null },
        ]}
      />
    </div>
  );

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 24 }}>Quản lý Bảng giá</h1>
      <Tabs items={[{ key: 'bundles', label: <span><GiftOutlined /> Gói Bundle</span>, children: bundleTab }, { key: 'coupons', label: <span><TagOutlined /> Mã giảm giá</span>, children: couponTab }]} />
      {renderBundleModal()}
      {renderCouponModal()}
    </div>
  );
}
