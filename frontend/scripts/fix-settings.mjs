import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
const out = 'c:/Users/datth/Downloads/photopro-react/src/pages/dashboard/Settings.tsx';
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `
import { useState } from 'react';
import { Tabs, Button, message } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import { hasRole } from '../../hooks/useAuth';

const BORDER = '#e2e5ea';
const PRIMARY = '#1a6b4e';
const SURFACE_ALT = '#f6f7f9';
const TEXT_MUTED = '#8b91a0';
const DANGER = '#d63b3b';

const fieldStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', border: \`1px solid \${BORDER}\`,
  borderRadius: 6, fontSize: 14, outline: 'none', boxSizing: 'border-box',
};
const labelStyle: React.CSSProperties = { display: 'block', fontWeight: 600, marginBottom: 6, fontSize: 14 };
const hintStyle: React.CSSProperties = { fontSize: 13, color: TEXT_MUTED, marginTop: 8 };
const cardStyle: React.CSSProperties = {
  background: '#fff', border: \`1px solid \${BORDER}\`, borderRadius: 12, overflow: 'hidden', marginBottom: 20,
};
const cardHeaderStyle: React.CSSProperties = {
  padding: '16px 20px', borderBottom: \`1px solid \${BORDER}\`,
};
const cardBodyStyle: React.CSSProperties = { padding: 20, display: 'flex', flexDirection: 'column', gap: 16 };
const formGroupStyle: React.CSSProperties = {};

export default function Settings() {
  const canEdit = hasRole(['admin-system']);

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

  const saveAllSettings = () => {
    const settings = {
      photoRetention, autoDeleteEnabled, autoDeleteMode,
      linkTTL, maxDownloads,
      subdomain, customDomain,
      vnpayEnabled, vnpayTmnCode,
      momoEnabled, momoPartnerCode,
      bankEnabled, bankName, bankAccount, bankOwner,
      primaryColor: selectedColor,
    };
    console.log('Save settings:', settings);
    message.success('Đã lưu cài đặt thành công!');
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
            <input
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
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: canEdit ? 'pointer' : 'default', fontWeight: 600, fontSize: 14 }}>
              <input
                type="checkbox" checked={autoDeleteEnabled}
                onChange={e => setAutoDeleteEnabled(e.target.checked)}
                disabled={!canEdit}
              />
              <span>Bật tự động xóa ảnh hết hạn</span>
            </label>
          </div>

          {autoDeleteEnabled && (
            <div style={formGroupStyle}>
              <label style={labelStyle}>Chế độ xóa</label>
              <select style={fieldStyle} value={autoDeleteMode} onChange={e => setAutoDeleteMode(e.target.value)} disabled={!canEdit}>
                <option value="all">Xóa tất cả ảnh hết hạn</option>
                <option value="unsold">Chỉ xóa ảnh chưa bán</option>
              </select>
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
            <input
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
            <input
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
              <input
                style={{ ...fieldStyle, borderRadius: '6px 0 0 6px', borderRight: 'none', flex: 1 }}
                type="text" value={subdomain}
                onChange={e => setSubdomain(e.target.value)}
                placeholder="your-studio"
                disabled={!canEdit}
              />
              <span style={{
                padding: '8px 12px', background: SURFACE_ALT,
                border: \`1px solid \${BORDER}\`, borderRadius: '0 6px 6px 0',
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
            <input
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
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: canEdit ? 'pointer' : 'default', fontWeight: 600, fontSize: 14 }}>
            <input type="checkbox" checked={vnpayEnabled} onChange={e => setVnpayEnabled(e.target.checked)} disabled={!canEdit} />
            <span>VNPay</span>
          </label>
        </div>
        <div style={formGroupStyle}>
          <label style={labelStyle}>VNPay TMN Code</label>
          <input style={fieldStyle} type="text" placeholder="ABCD1234" value={vnpayTmnCode} onChange={e => setVnpayTmnCode(e.target.value)} disabled={!canEdit} />
        </div>
        <div style={formGroupStyle}>
          <label style={labelStyle}>VNPay Hash Secret</label>
          <input style={fieldStyle} type="password" placeholder="••••••••" value={vnpayHashSecret} onChange={e => setVnpayHashSecret(e.target.value)} disabled={!canEdit} />
        </div>

        <hr style={{ margin: '8px 0', border: 'none', borderTop: \`1px solid \${BORDER}\` }} />

        {/* MoMo */}
        <div style={formGroupStyle}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: canEdit ? 'pointer' : 'default', fontWeight: 600, fontSize: 14 }}>
            <input type="checkbox" checked={momoEnabled} onChange={e => setMomoEnabled(e.target.checked)} disabled={!canEdit} />
            <span>MoMo</span>
          </label>
        </div>
        <div style={formGroupStyle}>
          <label style={labelStyle}>MoMo Partner Code</label>
          <input style={fieldStyle} type="text" placeholder="MOMO1234" value={momoPartnerCode} onChange={e => setMomoPartnerCode(e.target.value)} disabled={!canEdit} />
        </div>
        <div style={formGroupStyle}>
          <label style={labelStyle}>MoMo Access Key</label>
          <input style={fieldStyle} type="password" placeholder="••••••••" value={momoAccessKey} onChange={e => setMomoAccessKey(e.target.value)} disabled={!canEdit} />
        </div>

        <hr style={{ margin: '8px 0', border: 'none', borderTop: \`1px solid \${BORDER}\` }} />

        {/* Bank Transfer */}
        <div style={formGroupStyle}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: canEdit ? 'pointer' : 'default', fontWeight: 600, fontSize: 14 }}>
            <input type="checkbox" checked={bankEnabled} onChange={e => setBankEnabled(e.target.checked)} disabled={!canEdit} />
            <span>Chuyển khoản ngân hàng</span>
          </label>
        </div>
        <div style={formGroupStyle}>
          <label style={labelStyle}>Tên ngân hàng</label>
          <input style={fieldStyle} type="text" placeholder="VD: Vietcombank" value={bankName} onChange={e => setBankName(e.target.value)} disabled={!canEdit} />
        </div>
        <div style={formGroupStyle}>
          <label style={labelStyle}>Số tài khoản</label>
          <input style={fieldStyle} type="text" placeholder="1234567890" value={bankAccount} onChange={e => setBankAccount(e.target.value)} disabled={!canEdit} />
        </div>
        <div style={formGroupStyle}>
          <label style={labelStyle}>Chủ tài khoản</label>
          <input style={fieldStyle} type="text" placeholder="NGUYEN VAN A" value={bankOwner} onChange={e => setBankOwner(e.target.value)} disabled={!canEdit} />
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
    { key: 'green', color: '#1a6b4e', name: 'Xanh lá', sub: 'Mặc định' },
    { key: 'blue', color: '#2563eb', name: 'Xanh dương', sub: 'Chuyên nghiệp' },
    { key: 'purple', color: '#7c3aed', name: 'Tím', sub: 'Sang trọng' },
    { key: 'red', color: '#dc2626', name: 'Đỏ', sub: 'Năng động' },
  ];

  const appearanceTab = (
    <div style={cardStyle}>
      <div style={cardHeaderStyle}>
        <h3 style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>Màu sắc chủ đạo</h3>
      </div>
      <div style={cardBodyStyle}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 }}>
          {COLOR_PRESETS.map(c => (
            <div
              key={c.key}
              onClick={() => canEdit && setSelectedColor(c.key)}
              style={{
                padding: 16,
                border: \`2px solid \${selectedColor === c.key ? PRIMARY : BORDER}\`,
                borderRadius: 8,
                cursor: canEdit ? 'pointer' : 'default',
              }}
            >
              <div style={{ width: 48, height: 48, background: c.color, borderRadius: 8, marginBottom: 8 }} />
              <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</div>
              <div style={{ fontSize: 12, color: TEXT_MUTED }}>{c.sub}</div>
            </div>
          ))}
        </div>

        <div style={{ padding: '12px 16px', background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: 8, fontSize: 13, color: '#1d4ed8' }}>
          Màu sắc sẽ được áp dụng cho cả Frontend (trang khách) và Dashboard (trang admin).
        </div>

        {canEdit && (
          <div>
            <Button type="primary" icon={<SaveOutlined />} onClick={saveAllSettings}>Lưu tất cả</Button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Cài đặt Hệ thống</h1>
        {canEdit && <Button type="primary" icon={<SaveOutlined />} onClick={saveAllSettings}>Lưu tất cả</Button>}
      </div>

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
`.trimStart(), 'utf8');
console.log('Settings.tsx written');
