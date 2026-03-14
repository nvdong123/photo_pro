import { useState, useEffect } from 'react';
import { Tabs, Button, message, Input, Select, Checkbox, Divider, Typography } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import { hasRole } from '../../hooks/useAuth';
import { useSettings } from '../../hooks/useSettings';

const BORDER = '#e2e5ea';
const PRIMARY = '#1a6b4e';
const SURFACE_ALT = '#f6f7f9';
const TEXT_MUTED = '#8b91a0';
const DANGER = '#d63b3b';

const fieldStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', border: `1px solid ${BORDER}`,
  borderRadius: 6, fontSize: 14, outline: 'none', boxSizing: 'border-box',
};
const labelStyle: React.CSSProperties = { display: 'block', fontWeight: 600, marginBottom: 6, fontSize: 14 };
const hintStyle: React.CSSProperties = { fontSize: 13, color: TEXT_MUTED, marginTop: 8 };
const cardStyle: React.CSSProperties = {
  background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden', marginBottom: 20,
};
const cardHeaderStyle: React.CSSProperties = {
  padding: '16px 20px', borderBottom: `1px solid ${BORDER}`,
};
const cardBodyStyle: React.CSSProperties = { padding: 20, display: 'flex', flexDirection: 'column', gap: 16 };
const formGroupStyle: React.CSSProperties = {};

export default function Settings() {
  const canEdit = hasRole(['admin-system']);
  const { settings: apiSettings, update } = useSettings();

  // --- Retention state ---
  const [photoRetention, setPhotoRetention] = useState(30);
  const [autoDeleteEnabled, setAutoDeleteEnabled] = useState(true);
  const [autoDeleteMode, setAutoDeleteMode] = useState('unsold');
  const [linkTTL, setLinkTTL] = useState(168);
  const [maxDownloads, setMaxDownloads] = useState('5');

  // --- Domain state ---
  const [subdomain, setSubdomain] = useState('studio-abc');
  const [customDomain, setCustomDomain] = useState('');

  // --- Payment state ---
  const [vnpayEnabled, setVnpayEnabled] = useState(true);
  const [vnpayTmnCode, setVnpayTmnCode] = useState('');
  const [vnpayHashSecret, setVnpayHashSecret] = useState('');
  const [momoEnabled, setMomoEnabled] = useState(true);
  const [momoPartnerCode, setMomoPartnerCode] = useState('');
  const [momoAccessKey, setMomoAccessKey] = useState('');
  const [bankEnabled, setBankEnabled] = useState(true);
  const [bankName, setBankName] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [bankOwner, setBankOwner] = useState('');

  // --- Appearance state ---
  const [selectedColor, setSelectedColor] = useState('green');
  const [customPrimary, setCustomPrimary] = useState('#1a6b4e');
  const [customAccent, setCustomAccent] = useState('#d4870e');

  useEffect(() => {
    if (!apiSettings) return;
    if (apiSettings.media_ttl_days) setPhotoRetention(parseInt(apiSettings.media_ttl_days));
    if (apiSettings.auto_delete_enabled !== undefined) setAutoDeleteEnabled(apiSettings.auto_delete_enabled === 'true');
    if (apiSettings.auto_delete_mode) setAutoDeleteMode(apiSettings.auto_delete_mode);
    if (apiSettings.link_ttl_hours) setLinkTTL(parseInt(apiSettings.link_ttl_hours));
    if (apiSettings.max_downloads) setMaxDownloads(apiSettings.max_downloads);
    if (apiSettings.subdomain) setSubdomain(apiSettings.subdomain);
    if (apiSettings.custom_domain !== undefined) setCustomDomain(apiSettings.custom_domain || '');
    if (apiSettings.vnpay_tmn_code) setVnpayTmnCode(apiSettings.vnpay_tmn_code);
    if (apiSettings.vnpay_hash_secret) setVnpayHashSecret(apiSettings.vnpay_hash_secret);
    if (apiSettings.momo_partner_code) setMomoPartnerCode(apiSettings.momo_partner_code);
    if (apiSettings.momo_access_key) setMomoAccessKey(apiSettings.momo_access_key);
    if (apiSettings.bank_name) setBankName(apiSettings.bank_name);
    if (apiSettings.bank_account) setBankAccount(apiSettings.bank_account);
    if (apiSettings.bank_owner) setBankOwner(apiSettings.bank_owner);
    if (apiSettings.primary_color) setSelectedColor(apiSettings.primary_color);
    if (apiSettings.custom_primary) setCustomPrimary(apiSettings.custom_primary);
    if (apiSettings.custom_accent) setCustomAccent(apiSettings.custom_accent);
  }, [apiSettings]);

  const saveAllSettings = async () => {
    try {
      await update('media_ttl_days', String(photoRetention));
      await update('auto_delete_enabled', String(autoDeleteEnabled));
      await update('auto_delete_mode', autoDeleteMode);
      await update('link_ttl_hours', String(linkTTL));
      await update('max_downloads', maxDownloads);
      await update('subdomain', subdomain);
      await update('custom_domain', customDomain);
      if (vnpayTmnCode) await update('vnpay_tmn_code', vnpayTmnCode);
      if (vnpayHashSecret) await update('vnpay_hash_secret', vnpayHashSecret);
      if (momoPartnerCode) await update('momo_partner_code', momoPartnerCode);
      if (momoAccessKey) await update('momo_access_key', momoAccessKey);
      if (bankName) await update('bank_name', bankName);
      if (bankAccount) await update('bank_account', bankAccount);
      if (bankOwner) await update('bank_owner', bankOwner);
      await update('primary_color', selectedColor);
      await update('custom_primary', customPrimary);
      await update('custom_accent', customAccent);
      message.success('Đã lưu cài đặt thành công!');
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Lưu thất bại, vui lòng thử lại');
    }
  };

  // ===== TAB 1: THỜI HẠN =====
  const retentionTab = (
    <div>
      {/* Card 1: Photo Retention */}
      <div style={cardStyle}>
        <div style={cardHeaderStyle}>
          <h3 style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>Thời hạn lưu trữ ảnh (Photo Retention)</h3>
        </div>
        <div style={cardBodyStyle}>
          <div style={formGroupStyle}>
            <label style={labelStyle}>Thời gian lưu trữ ảnh (ngày) *</label>
            <Input
              style={fieldStyle} type="number" min={7} max={365}
              value={photoRetention}
              onChange={e => setPhotoRetention(parseInt(e.target.value) || 30)}
              disabled={!canEdit}
            />
            <div style={hintStyle}>
              Ảnh sẽ tự động bị xóa sau <strong>{photoRetention}</strong> ngày kể từ ngày upload. (Từ 7-365 ngày)
            </div>
          </div>

          <div style={formGroupStyle}>
            <Checkbox
              checked={autoDeleteEnabled}
              onChange={e => setAutoDeleteEnabled(e.target.checked)}
              disabled={!canEdit}
              style={{ fontWeight: 600, fontSize: 14 }}
            >Bật tự động xóa ảnh hết hạn</Checkbox>
          </div>

          {autoDeleteEnabled && (
            <div style={formGroupStyle}>
              <label style={labelStyle}>Chế độ xóa</label>
              <Select style={{ width: '100%' }} value={autoDeleteMode} onChange={v => setAutoDeleteMode(v)} disabled={!canEdit}>
                <Select.Option value="all">Xóa tất cả ảnh hết hạn</Select.Option>
                <Select.Option value="unsold">Chỉ xóa ảnh chưa bán</Select.Option>
              </Select>
              <div style={hintStyle}>
                ⚠️ Ảnh đã bán sẽ được giữ lại thêm cho đến khi link download hết hạn.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Card 2: Download Link TTL */}
      <div style={cardStyle}>
        <div style={cardHeaderStyle}>
          <h3 style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>Thời hạn link tải ảnh (Download Link TTL)</h3>
        </div>
        <div style={cardBodyStyle}>
          <div style={formGroupStyle}>
            <label style={labelStyle}>Thời gian hiệu lực link (giờ) *</label>
            <Input
              style={fieldStyle} type="number" min={24} max={720}
              value={linkTTL}
              onChange={e => setLinkTTL(parseInt(e.target.value) || 168)}
              disabled={!canEdit}
            />
            <div style={hintStyle}>
              Link download sẽ hết hạn sau <strong>{linkTTL}</strong> giờ ({Math.floor(linkTTL / 24)} ngày). (Từ 24 giờ đến 720 giờ = 30 ngày)
            </div>
          </div>

          <div style={formGroupStyle}>
            <label style={labelStyle}>Số lần tải tối đa</label>
            <Input
              style={fieldStyle} type="number" min={1} max={100}
              value={maxDownloads}
              onChange={e => setMaxDownloads(e.target.value)}
              placeholder="Để trống = không giới hạn"
              disabled={!canEdit}
            />
            <div style={hintStyle}>Giới hạn số lần khách có thể tải ảnh từ link. Để trống = không giới hạn.</div>
          </div>
        </div>
      </div>

      {canEdit && (
        <Button type="primary" icon={<SaveOutlined />} onClick={saveAllSettings}>Lưu tất cả</Button>
      )}
    </div>
  );

  // ===== TAB 2: DOMAIN =====
  const domainTab = (
    <div>
      {/* Card 1: Subdomain */}
      <div style={cardStyle}>
        <div style={cardHeaderStyle}>
          <h3 style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>Subdomain PhotoPro</h3>
        </div>
        <div style={cardBodyStyle}>
          <div style={formGroupStyle}>
            <label style={labelStyle}>Subdomain *</label>
            <div style={{ display: 'flex' }}>
              <Input
                style={{ ...fieldStyle, borderRadius: '6px 0 0 6px', borderRight: 'none', flex: 1 }}
                type="text" value={subdomain}
                onChange={e => setSubdomain(e.target.value)}
                placeholder="your-studio"
                disabled={!canEdit}
              />
              <span style={{
                padding: '8px 12px', background: SURFACE_ALT,
                border: `1px solid ${BORDER}`, borderRadius: '0 6px 6px 0',
                fontSize: 14, color: TEXT_MUTED, whiteSpace: 'nowrap',
              }}>.photopro.vn</span>
            </div>
            <div style={hintStyle}>
              URL hiện tại: <strong>https://{subdomain || 'your-studio'}.photopro.vn</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Card 2: Custom Domain */}
      <div style={cardStyle}>
        <div style={cardHeaderStyle}>
          <h3 style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>Custom Domain</h3>
        </div>
        <div style={cardBodyStyle}>
          <div style={formGroupStyle}>
            <label style={labelStyle}>Domain tùy chỉnh</label>
            <Input
              style={fieldStyle} type="text"
              value={customDomain} onChange={e => setCustomDomain(e.target.value)}
              placeholder="photos.yourstudio.com"
              disabled={!canEdit}
            />
            <div style={hintStyle}>
              Cấu hình DNS CNAME: <code>photos.yourstudio.com</code> → <code>{subdomain || 'your-studio'}.photopro.vn</code>
            </div>
          </div>

          <div style={{ padding: '12px 16px', background: '#fef3e8', border: '1px solid #fcd34d', borderRadius: 8, fontSize: 13, color: '#92400e' }}>
            <strong>Hướng dẫn:</strong> Sau khi nhập domain, bạn cần cấu hình DNS record tại nhà cung cấp domain của mình. Liên hệ support nếu cần hỗ trợ.
          </div>
        </div>
      </div>

      {canEdit && (
        <Button type="primary" icon={<SaveOutlined />} onClick={saveAllSettings}>Lưu tất cả</Button>
      )}
    </div>
  );

  // ===== TAB 3: THANH TOÁN =====
  const paymentTab = (
    <div style={cardStyle}>
      <div style={cardHeaderStyle}>
        <h3 style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>Cổng thanh toán</h3>
      </div>
      <div style={cardBodyStyle}>
        {/* VNPay */}
        <div style={formGroupStyle}>
          <Checkbox checked={vnpayEnabled} onChange={e => setVnpayEnabled(e.target.checked)} disabled={!canEdit} style={{ fontWeight: 600, fontSize: 14 }}>VNPay</Checkbox>
        </div>
        <div style={formGroupStyle}>
          <label style={labelStyle}>VNPay TMN Code</label>
          <Input style={fieldStyle} type="text" placeholder="ABCD1234" value={vnpayTmnCode} onChange={e => setVnpayTmnCode(e.target.value)} disabled={!canEdit} />
        </div>
        <div style={formGroupStyle}>
          <label style={labelStyle}>VNPay Hash Secret</label>
          <Input.Password style={fieldStyle} placeholder="••••••••" value={vnpayHashSecret} onChange={e => setVnpayHashSecret(e.target.value)} disabled={!canEdit} />
        </div>

        <Divider style={{ margin: '8px 0' }} />

        {/* MoMo */}
        <div style={formGroupStyle}>
          <Checkbox checked={momoEnabled} onChange={e => setMomoEnabled(e.target.checked)} disabled={!canEdit} style={{ fontWeight: 600, fontSize: 14 }}>MoMo</Checkbox>
        </div>
        <div style={formGroupStyle}>
          <label style={labelStyle}>MoMo Partner Code</label>
          <Input style={fieldStyle} type="text" placeholder="MOMO1234" value={momoPartnerCode} onChange={e => setMomoPartnerCode(e.target.value)} disabled={!canEdit} />
        </div>
        <div style={formGroupStyle}>
          <label style={labelStyle}>MoMo Access Key</label>
          <Input.Password style={fieldStyle} placeholder="••••••••" value={momoAccessKey} onChange={e => setMomoAccessKey(e.target.value)} disabled={!canEdit} />
        </div>

        <Divider style={{ margin: '8px 0' }} />

        {/* Bank Transfer */}
        <div style={formGroupStyle}>
          <Checkbox checked={bankEnabled} onChange={e => setBankEnabled(e.target.checked)} disabled={!canEdit} style={{ fontWeight: 600, fontSize: 14 }}>Chuyển khoản ngân hàng</Checkbox>
        </div>
        <div style={formGroupStyle}>
          <label style={labelStyle}>Tên ngân hàng</label>
          <Input style={fieldStyle} type="text" placeholder="VD: Vietcombank" value={bankName} onChange={e => setBankName(e.target.value)} disabled={!canEdit} />
        </div>
        <div style={formGroupStyle}>
          <label style={labelStyle}>Số tài khoản</label>
          <Input style={fieldStyle} type="text" placeholder="1234567890" value={bankAccount} onChange={e => setBankAccount(e.target.value)} disabled={!canEdit} />
        </div>
        <div style={formGroupStyle}>
          <label style={labelStyle}>Chủ tài khoản</label>
          <Input style={fieldStyle} type="text" placeholder="NGUYEN VAN A" value={bankOwner} onChange={e => setBankOwner(e.target.value)} disabled={!canEdit} />
        </div>

        {canEdit && (
          <div style={{ paddingTop: 8 }}>
            <Button type="primary" icon={<SaveOutlined />} onClick={saveAllSettings}>Lưu tất cả</Button>
          </div>
        )}
      </div>
    </div>
  );

  // ===== TAB 4: GIAO DIỆN =====
  const COLOR_PRESETS = [
    { key: 'green',  primary: '#1a6b4e', accent: '#d4870e', name: 'Xanh lá',    sub: 'Mặc định' },
    { key: 'blue',   primary: '#2563eb', accent: '#f59e0b', name: 'Xanh dương', sub: 'Chuyên nghiệp' },
    { key: 'purple', primary: '#7c3aed', accent: '#ec4899', name: 'Tím',         sub: 'Sang trọng' },
    { key: 'red',    primary: '#dc2626', accent: '#ea580c', name: 'Đỏ',          sub: 'Năng động' },
    { key: 'teal',   primary: '#0d9488', accent: '#06b6d4', name: 'Teal',        sub: 'Nhiệt đới' },
    { key: 'slate',  primary: '#1e293b', accent: '#f97316', name: 'Slate Dark',  sub: 'Tối giản' },
    { key: 'brown',  primary: '#92400e', accent: '#d97706', name: 'Nâu',         sub: 'Cổ điển' },
  ];

  const handleSelectPreset = (c: typeof COLOR_PRESETS[0]) => {
    if (!canEdit) return;
    setSelectedColor(c.key);
    setCustomPrimary(c.primary);
    setCustomAccent(c.accent);
  };

  const appearanceTab = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Preset Colors */}
      <div style={cardStyle}>
        <div style={cardHeaderStyle}>
          <h3 style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>Preset màu sắc — chọn nhanh</h3>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: TEXT_MUTED }}>Mỗi preset bao gồm màu chính (Primary) và màu nhấn (Accent)</p>
        </div>
        <div style={cardBodyStyle}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
            {COLOR_PRESETS.map(c => (
              <div
                key={c.key}
                onClick={() => handleSelectPreset(c)}
                style={{
                  padding: '12px', textAlign: 'center',
                  border: `2px solid ${selectedColor === c.key ? c.primary : BORDER}`,
                  borderRadius: 10, cursor: canEdit ? 'pointer' : 'default',
                  background: selectedColor === c.key ? '#fafffe' : '#fff',
                  transition: 'border-color 0.15s, background 0.15s',
                }}
              >
                <div style={{ display: 'flex', gap: 4, justifyContent: 'center', marginBottom: 8 }}>
                  <div style={{ width: 28, height: 28, background: c.primary, borderRadius: 6 }} />
                  <div style={{ width: 28, height: 28, background: c.accent, borderRadius: 6 }} />
                </div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</div>
                <div style={{ fontSize: 11, color: TEXT_MUTED, marginTop: 2 }}>{c.sub}</div>
                {selectedColor === c.key && (
                  <div style={{ marginTop: 6, fontSize: 11, color: c.primary, fontWeight: 600 }}>✓ Đang dùng</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Custom Color Picker */}
      <div style={cardStyle}>
        <div style={cardHeaderStyle}>
          <h3 style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>Hoặc chọn màu tùy chỉnh</h3>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: TEXT_MUTED }}>Nhập mã HEX hoặc click ô màu để chọn</p>
        </div>
        <div style={cardBodyStyle}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            {/* Primary */}
            <div>
              <label style={{ ...labelStyle, marginBottom: 10 }}>Màu chính (Primary)</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <input
                  type="color"
                  value={customPrimary}
                  disabled={!canEdit}
                  onChange={e => {
                    setCustomPrimary(e.target.value);
                    setSelectedColor('custom');
                  }}
                  style={{ width: 48, height: 48, border: `2px solid ${BORDER}`, borderRadius: 8, cursor: canEdit ? 'pointer' : 'default', padding: 2 }}
                />
                <div style={{ flex: 1 }}>
                  <Input
                    type="text"
                    value={customPrimary}
                    disabled={!canEdit}
                    placeholder="#000000"
                    maxLength={7}
                    onChange={e => {
                      const v = e.target.value;
                      setCustomPrimary(v);
                      if (/^#[0-9A-Fa-f]{6}$/.test(v)) setSelectedColor('custom');
                    }}
                    style={{ ...fieldStyle, fontFamily: 'monospace', textTransform: 'uppercase' }}
                  />
                </div>
              </div>
              <div style={{ height: 8, borderRadius: 4, background: customPrimary }} />
            </div>
            {/* Accent */}
            <div>
              <label style={{ ...labelStyle, marginBottom: 10 }}>Màu nhấn (Accent)</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <input
                  type="color"
                  value={customAccent}
                  disabled={!canEdit}
                  onChange={e => {
                    setCustomAccent(e.target.value);
                    setSelectedColor('custom');
                  }}
                  style={{ width: 48, height: 48, border: `2px solid ${BORDER}`, borderRadius: 8, cursor: canEdit ? 'pointer' : 'default', padding: 2 }}
                />
                <div style={{ flex: 1 }}>
                  <Input
                    type="text"
                    value={customAccent}
                    disabled={!canEdit}
                    placeholder="#000000"
                    maxLength={7}
                    onChange={e => {
                      const v = e.target.value;
                      setCustomAccent(v);
                      if (/^#[0-9A-Fa-f]{6}$/.test(v)) setSelectedColor('custom');
                    }}
                    style={{ ...fieldStyle, fontFamily: 'monospace', textTransform: 'uppercase' }}
                  />
                </div>
              </div>
              <div style={{ height: 8, borderRadius: 4, background: customAccent }} />
            </div>
          </div>
        </div>
      </div>

      {/* Live Preview */}
      <div style={cardStyle}>
        <div style={cardHeaderStyle}>
          <h3 style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>Xem trước</h3>
        </div>
        <div style={cardBodyStyle}>
          <div style={{ padding: 20, border: `1px solid ${BORDER}`, borderRadius: 12, background: SURFACE_ALT }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
              <Button style={{ background: customPrimary, color: '#fff', border: 'none', fontWeight: 500 }}>Nút Primary</Button>
              <Button style={{ background: customAccent, color: '#fff', border: 'none', fontWeight: 500 }}>Nút Accent</Button>
              <span style={{
                padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 500,
                background: customPrimary + '20', color: customPrimary,
              }}>Badge</span>
              <Typography.Link style={{ color: customPrimary, fontWeight: 500 }}>Link text</Typography.Link>
            </div>
            <div style={{ display: 'flex', gap: 16, fontSize: 13 }}>
              <div style={{ padding: '8px 16px', borderRadius: 6, background: customPrimary, color: '#fff' }}>Text trên nền primary</div>
              <div style={{ padding: '8px 16px', borderRadius: 6, background: customAccent, color: '#fff' }}>Text trên nền accent</div>
            </div>
          </div>
        </div>
      </div>

      {/* Info + Save */}
      <div style={cardStyle}>
        <div style={cardBodyStyle}>
          <div style={{ padding: '12px 16px', background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: 8, fontSize: 13, color: '#1d4ed8' }}>
            Màu sắc sẽ được áp dụng cho cả Frontend (trang khách) và Dashboard (trang admin). Các biến màu phụ (light, dark) sẽ được tự động tạo từ màu chính.
          </div>
          {canEdit && (
            <div>
              <Button type="primary" icon={<SaveOutlined />} onClick={saveAllSettings}>Lưu tất cả</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div>
      <h1 style={{ margin: '0 0 16px', fontSize: 20, fontWeight: 700 }}>Cài đặt Hệ thống</h1>

      <div style={{ padding: '12px 16px', background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: 8, fontSize: 13, color: '#1d4ed8', marginBottom: 20, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <span style={{ fontSize: 16, flexShrink: 0 }}>ℹ️</span>
        <div>
          <strong style={{ display: 'block', marginBottom: 4 }}>Chỉ Admin System mới có quyền truy cập</strong>
          Thay đổi cài đặt hệ thống có thể ảnh hưởng đến toàn bộ hoạt động. Vui lòng cẩn thận khi điều chỉnh.
        </div>
      </div>

      <Tabs items={[
        { key: 'retention', label: '⏱ Thời hạn', children: retentionTab },
        { key: 'domain', label: '🌐 Domain', children: domainTab },
        { key: 'payment', label: '💳 Thanh toán', children: paymentTab },
        { key: 'appearance', label: '🎨 Giao diện', children: appearanceTab },
      ]} />
    </div>
  );
}
