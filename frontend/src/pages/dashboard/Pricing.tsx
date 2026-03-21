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
        perPhoto: perPhoto.toLocaleString('vi-VN') + '\u0111',
        savings: savings > 0 ? `Ti\u1ebft ki\u1ec7m ${savings}%` : 'Kh\u00f4ng ti\u1ebft ki\u1ec7m',
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
    if (!bundleForm.name || !bundleForm.quantity || !bundleForm.price) { message.error('Vui l\u00f2ng \u0111i\u1ec1n \u0111\u1ea7y \u0111\u1ee7 th\u00f4ng tin'); return; }
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
      message.success('\u0110\u00e3 l\u01b0u g\u00f3i bundle th\u00e0nh c\u00f4ng!');
      closeBundle();
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'L\u01b0u g\u00f3i th\u1ea5t b\u1ea1i');
    }
  };

  const deleteBundle = (id: string) => {
    Modal.confirm({
      title: 'X\u00f3a g\u00f3i',
      content: 'B\u1ea1n c\u00f3 ch\u1eafc mu\u1ed1n x\u00f3a g\u00f3i n\u00e0y?',
      okText: 'X\u00f3a',
      okType: 'danger',
      cancelText: 'H\u1ee7y',
      onOk: async () => {
        try { await removeBundle(id); message.success('\u0110\u00e3 x\u00f3a g\u00f3i'); }
        catch (err) { message.error(err instanceof Error ? err.message : 'X\u00f3a g\u00f3i th\u1ea5t b\u1ea1i'); }
      },
    });
  };

  const toggleFeatured = (b: Bundle) => {
    if (b.featured) {
      Modal.confirm({
        title: 'B\u1ecf \u0111\u00e1nh d\u1ea5u ph\u1ed5 bi\u1ebfn',
        content: 'B\u1ecf \u0111\u00e1nh d\u1ea5u g\u00f3i n\u00e0y l\u00e0 PH\u1ed4 BI\u1ebeN NH\u1ea4T?',
        okText: 'X\u00e1c nh\u1eadn',
        cancelText: 'H\u1ee7y',
        onOk: async () => {
          try {
            await updateBundle(b.id, { is_popular: false });
            message.success('\u0110\u00e3 b\u1ecf \u0111\u00e1nh d\u1ea5u g\u00f3i ph\u1ed5 bi\u1ebfn');
          } catch (err) {
            message.error(err instanceof Error ? err.message : 'C\u1eadp nh\u1eadt th\u1ea5t b\u1ea1i');
          }
        },
      });
    } else {
      Modal.confirm({
        title: '\u0110\u00e1nh d\u1ea5u ph\u1ed5 bi\u1ebfn',
        content: '\u0110\u00e1nh d\u1ea5u g\u00f3i n\u00e0y l\u00e0 PH\u1ed4 BI\u1ebeN NH\u1ea4T? G\u00f3i hi\u1ec7n t\u1ea1i \u0111ang \u0111\u01b0\u1ee3c \u0111\u00e1nh d\u1ea5u s\u1ebd b\u1ecf \u0111\u00e1nh d\u1ea5u.',
        okText: 'X\u00e1c nh\u1eadn',
        cancelText: 'H\u1ee7y',
        onOk: async () => {
          try {
            await updateBundle(b.id, { is_popular: true });
            message.success('\u0110\u00e3 \u0111\u00e1nh d\u1ea5u g\u00f3i n\u00e0y l\u00e0 PH\u1ed4 BI\u1ebeN NH\u1ea4T!');
          } catch (err) {
            message.error(err instanceof Error ? err.message : 'C\u1eadp nh\u1eadt th\u1ea5t b\u1ea1i');
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
    if (!couponForm.code || !couponForm.type || !couponForm.value) { message.error('Vui l\u00f2ng \u0111i\u1ec1n \u0111\u1ea7y \u0111\u1ee7 th\u00f4ng tin'); return; }
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
      message.success('\u0110\u00e3 l\u01b0u m\u00e3 gi\u1ea3m gi\u00e1 th\u00e0nh c\u00f4ng!');
      closeCoupon();
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'L\u01b0u m\u00e3 gi\u1ea3m gi\u00e1 th\u1ea5t b\u1ea1i');
    }
  };

  const deleteCoupon = (id: string) => {
    Modal.confirm({
      title: 'X\u00f3a m\u00e3 gi\u1ea3m gi\u00e1',
      content: 'B\u1ea1n c\u00f3 ch\u1eafc mu\u1ed1n x\u00f3a m\u00e3 gi\u1ea3m gi\u00e1 n\u00e0y?',
      okText: 'X\u00f3a',
      okType: 'danger',
      cancelText: 'H\u1ee7y',
      onOk: async () => {
        try { await removeCoupon(id); message.success('\u0110\u00e3 x\u00f3a m\u00e3 gi\u1ea3m gi\u00e1'); }
        catch (err) { message.error(err instanceof Error ? err.message : 'X\u00f3a m\u00e3 gi\u1ea3m gi\u00e1 th\u1ea5t b\u1ea1i'); }
      },
    });
  };

  const fmt = (v: number) => v.toLocaleString('vi-VN') + '\u0111';
  const fieldStyle = { width: '100%', padding: '8px 12px', border: `1px solid ${BORDER}`, borderRadius: 6, fontSize: 14, outline: 'none', boxSizing: 'border-box' as const };
  const labelStyle = { display: 'block' as const, fontWeight: 600, marginBottom: 6, fontSize: 14 };

  const renderBundleModal = () => (
    <Modal
      open={bundleModal.open}
      onCancel={closeBundle}
      title={bundleModal.item ? 'Ch\u1ec9nh s\u1eeda g\u00f3i bundle' : 'T\u1ea1o g\u00f3i bundle m\u1edbi'}
      footer={[<Button key="cancel" onClick={closeBundle}>H\u1ee7y</Button>, <Button key="save" type="primary" icon={<SaveOutlined />} onClick={saveBundle}>L\u01b0u</Button>]}
      width={480}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '8px 0' }}>
        <div>
          <label style={labelStyle}>T\u00ean g\u00f3i <span style={{ color: DANGER }}>*</span></label>
          <Input style={fieldStyle} value={bundleForm.name} onChange={e => setBundleForm(f => ({ ...f, name: e.target.value }))} placeholder="VD: G\u00f3i 5 \u1ea3nh" />
        </div>
        <div>
          <label style={labelStyle}>S\u1ed1 l\u01b0\u1ee3ng \u1ea3nh <span style={{ color: DANGER }}>*</span></label>
          <Input style={fieldStyle} type="number" min={1} value={bundleForm.quantity} onChange={e => setBundleForm(f => ({ ...f, quantity: e.target.value }))} placeholder="VD: 5" />
        </div>
        <div>
          <label style={labelStyle}>Gi\u00e1 g\u00f3i (VN\u0110) <span style={{ color: DANGER }}>*</span></label>
          <Input style={fieldStyle} type="number" min={1000} step={1000} value={bundleForm.price} onChange={e => setBundleForm(f => ({ ...f, price: e.target.value }))} placeholder="VD: 80000" />
        </div>
        <div>
          <Checkbox
            checked={bundleForm.featured}
            onChange={e => setBundleForm(f => ({ ...f, featured: e.target.checked }))}
            style={{ fontWeight: 600, fontSize: 14 }}
          >\u0110\u00e1nh d\u1ea5u l\u00e0 g\u00f3i ph\u1ed5 bi\u1ebfn</Checkbox>
          <small style={{ color: '#5a6170', display: 'block', marginTop: 4, fontSize: 12 }}>G\u00f3i ph\u1ed5 bi\u1ebfn s\u1ebd \u0111\u01b0\u1ee3c highlight v\u1edbi badge "PH\u1ed4 BI\u1ebeN NH\u1ea4T"</small>
        </div>
        {bundleCalc && (
          <div style={{ padding: '12px 16px', background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: 8, fontSize: 13, color: '#1d4ed8' }}>
            <strong>T\u00ednh to\u00e1n:</strong>
            <div style={{ marginTop: 8 }}>
              Gi\u00e1 / \u1ea3nh: <strong>{bundleCalc.perPhoto}</strong><br />
              So v\u1edbi g\u00f3i 1 \u1ea3nh (20,000\u0111): <strong>{bundleCalc.savings}</strong>
            </div>
          </div>
        )}
        {bundleForm.featured && (
          <div style={{ padding: '12px 16px', background: '#fef3e8', border: '1px solid #fcd34d', borderRadius: 8, fontSize: 13, color: '#92400e' }}>
            <StarFilled style={{ color: '#f59e0b' }} /> <strong>G\u00f3i n\u00e0y s\u1ebd \u0111\u01b0\u1ee3c \u0111\u00e1nh d\u1ea5u l\u00e0 PH\u1ed4 BI\u1ebeN NH\u1ea4T</strong>
            <p style={{ margin: '4px 0 0', fontSize: 13 }}>Ch\u1ec9 n\u00ean ch\u1ecdn 1 g\u00f3i ph\u1ed5 bi\u1ebfn duy nh\u1ea5t \u0111\u1ec3 t\u0103ng hi\u1ec7u qu\u1ea3 chuy\u1ec3n \u0111\u1ed5i.</p>
          </div>
        )}
      </div>
    </Modal>
  );

  const renderCouponModal = () => (
    <Modal
      open={couponModal.open}
      onCancel={closeCoupon}
      title={couponModal.item ? 'Ch\u1ec9nh s\u1eeda m\u00e3 gi\u1ea3m gi\u00e1' : 'T\u1ea1o m\u00e3 gi\u1ea3m gi\u00e1 m\u1edbi'}
      footer={[<Button key="cancel" onClick={closeCoupon}>H\u1ee7y</Button>, <Button key="save" type="primary" icon={<SaveOutlined />} onClick={saveCoupon}>L\u01b0u</Button>]}
      width={480}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '8px 0' }}>
        <div>
          <label style={labelStyle}>M\u00e3 coupon <span style={{ color: DANGER }}>*</span> <small style={{ color: TEXT_MUTED, fontWeight: 400 }}>(Ch\u1eef in hoa, kh\u00f4ng d\u1ea5u, kh\u00f4ng kho\u1ea3ng tr\u1eafng)</small></label>
          <Input style={{ ...fieldStyle, textTransform: 'uppercase', fontFamily: 'monospace' }} value={couponForm.code} onChange={e => setCouponForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="VD: TETNGUYENDAN" />
        </div>
        <div>
          <label style={labelStyle}>Lo\u1ea1i gi\u1ea3m gi\u00e1 <span style={{ color: DANGER }}>*</span></label>
          <Select style={{ width: '100%' }} value={couponForm.type || undefined} placeholder="Ch\u1ecdn lo\u1ea1i..." onChange={v => setCouponForm(f => ({ ...f, type: v, value: '' }))}>
            <Select.Option value="percent">Gi\u1ea3m theo %</Select.Option>
            <Select.Option value="fixed">Gi\u1ea3m s\u1ed1 ti\u1ec1n c\u1ed1 \u0111\u1ecbnh</Select.Option>
          </Select>
        </div>
        {couponForm.type && (
          <div>
            <label style={labelStyle}>{couponForm.type === 'percent' ? 'Gi\u00e1 tr\u1ecb (%)' : 'Gi\u00e1 tr\u1ecb (VN\u0110)'} <span style={{ color: DANGER }}>*</span></label>
            <Input style={fieldStyle} type="number" min={1} max={couponForm.type === 'percent' ? 100 : undefined}
              value={couponForm.value} onChange={e => setCouponForm(f => ({ ...f, value: e.target.value }))}
              placeholder={couponForm.type === 'percent' ? 'VD: 20 (gi\u1ea3m 20%)' : 'VD: 10000 (gi\u1ea3m 10,000\u0111)'} />
          </div>
        )}
        <div>
          <label style={labelStyle}>S\u1ed1 l\u01b0\u1ee3ng <small style={{ color: TEXT_MUTED, fontWeight: 400 }}>(\u0110\u1ec3 tr\u1ed1ng = kh\u00f4ng gi\u1edbi h\u1ea1n)</small></label>
          <Input style={fieldStyle} type="number" min={1} value={couponForm.quantity} onChange={e => setCouponForm(f => ({ ...f, quantity: e.target.value }))} placeholder="VD: 100" />
        </div>
        <div>
          <label style={labelStyle}>Ng\u00e0y h\u1ebft h\u1ea1n <small style={{ color: TEXT_MUTED, fontWeight: 400 }}>(\u0110\u1ec3 tr\u1ed1ng = v\u0129nh vi\u1ec5n)</small></label>
          <DatePicker
            value={couponForm.expiry ? dayjs(couponForm.expiry, 'YYYY-MM-DD') : null}
            onChange={(val) => setCouponForm(f => ({ ...f, expiry: val ? val.format('YYYY-MM-DD') : '' }))}
            style={{ width: '100%' }}
            format="DD/MM/YYYY"
            placeholder="Ch\u1ecdn ng\u00e0y h\u1ebft h\u1ea1n"
          />
        </div>
      </div>
    </Modal>
  );

  const bundleTab = (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>G\u00f3i Bundle Pricing</h2>
        {canEdit && <Button type="primary" icon={<PlusOutlined />} onClick={() => openBundle(null)}>T\u1ea1o g\u00f3i m\u1edbi</Button>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, 280px)', justifyContent: 'center', gap: 24 }}>
        {bundles.map(b => {
          const perPhoto = Math.round(b.price / b.photos);
          const savings = Math.round((1 - perPhoto / 20000) * 100);
          const cardColor = b.photos === 8 ? WARNING : PRIMARY;
          const iconBg = b.photos === 8 ? '#fef3e8' : PRIMARY_LIGHT;
          return (
            <div key={b.id} style={{ background: '#fff', border: b.featured ? `2px solid ${PRIMARY}` : `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden' }}>
              {b.featured && <div style={{ background: PRIMARY, color: '#fff', textAlign: 'center', padding: '6px', fontSize: 11, fontWeight: 700, letterSpacing: '0.5px' }}>PH\u1ed4 BI\u1ebeN NH\u1ea4T</div>}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 24px 16px', width: '100%', boxSizing: 'border-box' }}>
                <div style={{ width: 64, height: 64, margin: '0 auto 16px', background: iconBg, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <PictureOutlined style={{ fontSize: 32, color: cardColor }} />
                </div>
                <h3 style={{ fontSize: 24, margin: '0 0 8px', fontWeight: 700, textAlign: 'center' }}>{b.name}</h3>
                <div style={{ fontSize: 32, fontWeight: 800, color: cardColor, marginBottom: 4 }}>{fmt(b.price)}</div>
                <div style={{ fontSize: 13, color: TEXT_MUTED }}>{perPhoto.toLocaleString('vi-VN')}\u0111 / \u1ea3nh</div>
                {savings > 0 && (
                  <div style={{ display: 'inline-block', marginTop: 8, padding: '4px 12px', background: b.photos === 8 ? WARNING : '#1a854a', color: 'white', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>
                    Ti\u1ebft ki\u1ec7m {savings}%
                  </div>
                )}
                <div style={{ margin: '24px 0', padding: 16, background: b.featured ? PRIMARY_LIGHT : SURFACE_ALT, borderRadius: 8, width: '100%', boxSizing: 'border-box' }}>
                  <div style={{ fontSize: 13, color: b.featured ? '#134a36' : '#5a6170', marginBottom: 4 }}>\u0110\u00e3 b\u00e1n</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: b.featured ? PRIMARY : '#1a1d23' }}>{b.sold} g\u00f3i</div>
                </div>
                {canEdit && (
                  <div style={{ display: 'flex', gap: 8, width: '100%' }}>
                    <Button size="small" icon={<EditOutlined />} style={{ flex: 1 }} onClick={() => openBundle(b)}>S\u1eeda</Button>
                    <Button size="small" type={b.featured ? 'primary' : 'default'} icon={b.featured ? <StarFilled /> : <StarOutlined />} onClick={() => toggleFeatured(b)} title={b.featured ? 'B\u1ecf \u0111\u00e1nh d\u1ea5u ph\u1ed5 bi\u1ebfn' : '\u0110\u00e1nh d\u1ea5u ph\u1ed5 bi\u1ebfn'} />
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
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>M\u00e3 gi\u1ea3m gi\u00e1 (Coupon)</h2>
        {canEdit && <Button type="primary" icon={<PlusOutlined />} onClick={() => openCoupon(null)}>T\u1ea1o m\u00e3 gi\u1ea3m gi\u00e1</Button>}
      </div>
      <Table
        dataSource={coupons}
        rowKey="id"
        size="middle"
        pagination={false}
        style={{ border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden' }}
        columns={[
          { title: 'M\u00e3 coupon', dataIndex: 'code', key: 'code', render: (code: string) => <strong style={{ fontFamily: 'monospace', background: PRIMARY_LIGHT, padding: '4px 8px', borderRadius: 4, color: PRIMARY }}>{code}</strong> },
          { title: 'Lo\u1ea1i gi\u1ea3m gi\u00e1', dataIndex: 'discount_type', key: 'discount_type', render: (type: string) => type === 'percent' ? 'Gi\u1ea3m %' : 'Gi\u1ea3m ti\u1ec1n' },
          { title: 'Gi\u00e1 tr\u1ecb', key: 'value', render: (_: unknown, c: Coupon) => <strong>{c.discount_type === 'percent' ? `${c.discount_value}%` : fmt(c.discount_value)}</strong> },
          { title: 'S\u1ed1 l\u01b0\u1ee3ng', key: 'max_uses', render: (_: unknown, c: Coupon) => c.max_uses != null ? String(c.max_uses) : 'Kh\u00f4ng gi\u1edbi h\u1ea1n' },
          { title: '\u0110\u00e3 d\u00f9ng', dataIndex: 'used_count', key: 'used_count' },
          { title: 'H\u1ebft h\u1ea1n', key: 'expires_at', render: (_: unknown, c: Coupon) => c.expires_at ? <span style={{ color: '#5a6170' }}>{dayjs(c.expires_at).format('DD/MM/YYYY')}</span> : <span style={{ color: '#5a6170' }}>-</span> },
          { title: 'Tr\u1ea1ng th\u00e1i', key: 'status', render: (_: unknown, c: Coupon) => { const expired = c.expires_at && new Date(c.expires_at) < new Date(); return <Tag color={!expired && c.is_active ? 'green' : 'default'}>{!expired && c.is_active ? '\u0110ang ho\u1ea1t \u0111\u1ed9ng' : 'H\u1ebft h\u1ea1n'}</Tag>; } },
          { title: 'Thao t\u00e1c', key: 'actions', render: (_: unknown, c: Coupon) => canEdit ? <div style={{ display: 'flex', gap: 4 }}><Button size="small" icon={<EditOutlined />} onClick={() => openCoupon(c)} /><Button size="small" danger icon={<DeleteOutlined />} onClick={() => deleteCoupon(c.id)} /></div> : null },
        ]}
      />
    </div>
  );

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 24 }}>Qu\u1ea3n l\u00fd B\u1ea3ng gi\u00e1</h1>
      <Tabs items={[{ key: 'bundles', label: <span><GiftOutlined /> G\u00f3i Bundle</span>, children: bundleTab }, { key: 'coupons', label: <span><TagOutlined /> M\u00e3 gi\u1ea3m gi\u00e1</span>, children: couponTab }]} />
      {renderBundleModal()}
      {renderCouponModal()}
    </div>
  );
}
