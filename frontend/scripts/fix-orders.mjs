import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
function write(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf8');
  console.log('Written:', path);
}
const base = 'c:/Users/datth/Downloads/photopro-react/src';

// ===== ORDERS (fixed forms) =====
write(`${base}/pages/dashboard/Orders.tsx`, `
import { useState } from 'react';
import { Input, Select, Button, Tag, DatePicker, message } from 'antd';
import { SearchOutlined, EyeOutlined, RollbackOutlined, CopyOutlined, DownloadOutlined } from '@ant-design/icons';
import { hasRole } from '../../hooks/useAuth';

const BORDER = '#e2e5ea';
const SURFACE_ALT = '#f6f7f9';
const PRIMARY = '#1a6b4e';
const TEXT_MUTED = '#8b91a0';
const PAGE_SIZE = 10;

type OrderStatus = 'completed' | 'processing' | 'refunded' | 'expired';
interface Order {
  id: string; code: string; phone: string; email: string; album: string;
  photoCount: number; price: string; status: OrderStatus; date: string;
  expiry: string; lookupLink: string;
}

const STATUS_MAP: Record<OrderStatus, { color: string; label: string }> = {
  completed: { color: 'green', label: 'Hoàn thành' },
  processing: { color: 'orange', label: 'Đang xử lý' },
  refunded: { color: 'red', label: 'Đã hoàn tiền' },
  expired: { color: 'default', label: 'Hết hạn' },
};

const REFUND_REASONS = [
  { value: 'customer_request', label: 'Khách hàng yêu cầu' },
  { value: 'wrong_photos', label: 'Ảnh không đúng' },
  { value: 'quality_issue', label: 'Vấn đề chất lượng' },
  { value: 'duplicate_order', label: 'Đơn hàng trùng' },
  { value: 'other', label: 'Lý do khác' },
];

const ORDERS: Order[] = [
  { id: '1', code: '#WL2024ABC', phone: '0901234567', email: 'customer@email.com', album: 'Bà Nà Hills 20/02', photoCount: 3, price: '50,000đ', status: 'completed', date: '20/02/2026 14:30', expiry: '27/02/2026 14:30', lookupLink: 'https://studio-abc.photopro.vn/d/abc123xyz' },
  { id: '2', code: '#OR8765XYZ', phone: '0912345678', email: '-', album: 'Hội An 19/02', photoCount: 8, price: '100,000đ', status: 'completed', date: '19/02/2026 10:15', expiry: '26/02/2026 10:15', lookupLink: 'https://studio-abc.photopro.vn/d/xyz789abc' },
  { id: '3', code: '#QW4321MNO', phone: '0909876543', email: 'user@domain.com', album: 'Cầu Rồng 18/02', photoCount: 1, price: '20,000đ', status: 'processing', date: '18/02/2026 16:45', expiry: '25/02/2026 16:45', lookupLink: 'https://studio-abc.photopro.vn/d/mno456pqr' },
  { id: '4', code: '#ER5678PQR', phone: '0923456789', email: '-', album: 'Mỹ Khê 17/02', photoCount: 3, price: '50,000đ', status: 'completed', date: '17/02/2026 11:20', expiry: '24/02/2026 11:20', lookupLink: 'https://studio-abc.photopro.vn/d/pqr123stu' },
  { id: '5', code: '#TY9012DEF', phone: '0934567890', email: 'test@test.com', album: 'Bà Nà Hills 16/02', photoCount: 8, price: '100,000đ', status: 'refunded', date: '16/02/2026 09:00', expiry: '-', lookupLink: '' },
  { id: '6', code: '#UI3456GHI', phone: '0945678901', email: '-', album: 'Hội An 15/02', photoCount: 3, price: '50,000đ', status: 'expired', date: '08/02/2026 15:30', expiry: '15/02/2026 15:30', lookupLink: '' },
];

export default function Orders() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [packageFilter, setPackageFilter] = useState('');
  const [page, setPage] = useState(1);
  const [detailOrder, setDetailOrder] = useState<Order | null>(null);
  const [refundOrder, setRefundOrder] = useState<Order | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const [refundNote, setRefundNote] = useState('');

  const canRefund = hasRole(['admin-system', 'admin-sales']);

  const filtered = ORDERS.filter(o =>
    (!statusFilter || o.status === statusFilter) &&
    (!packageFilter || String(o.photoCount) === packageFilter) &&
    (!search || o.code.toLowerCase().includes(search.toLowerCase()) || o.phone.includes(search) || o.email.toLowerCase().includes(search.toLowerCase()))
  );
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const stats = [
    { label: 'Hoàn thành', val: ORDERS.filter(o => o.status === 'completed').length, color: '#1a854a', icon: '✅' },
    { label: 'Đang xử lý', val: ORDERS.filter(o => o.status === 'processing').length, color: '#d4870e', icon: '⏳' },
    { label: 'Đã hoàn tiền', val: ORDERS.filter(o => o.status === 'refunded').length, color: '#d63b3b', icon: '↩️' },
    { label: 'Tổng doanh thu', val: '42.5M', color: PRIMARY, icon: '💰' },
  ];

  const resetFilters = () => { setSearch(''); setStatusFilter(''); setPackageFilter(''); };

  const handleRefund = () => {
    if (!refundReason) { message.error('Vui lòng chọn lý do hoàn tiền'); return; }
    message.success('Đã hoàn tiền thành công!');
    setRefundOrder(null); setRefundReason(''); setRefundNote('');
  };

  const copyLink = (link: string) => {
    navigator.clipboard.writeText(link).then(() => message.success('Đã sao chép link!')).catch(() => message.error('Không thể sao chép'));
  };

  // ---- Order Detail Modal ----
  const renderDetailModal = () => {
    const o = detailOrder;
    if (!o) return null;
    const photoColors = ['linear-gradient(135deg,#1a6b4e 0%,#134a36 100%)', 'linear-gradient(135deg,#2563eb 0%,#1e40af 100%)', 'linear-gradient(135deg,#d4870e 0%,#92400e 100%)', 'linear-gradient(135deg,#7c3aed 0%,#5b21b6 100%)', 'linear-gradient(135deg,#db2777 0%,#9d174d 100%)', 'linear-gradient(135deg,#059669 0%,#065f46 100%)', 'linear-gradient(135deg,#dc2626 0%,#991b1b 100%)', 'linear-gradient(135deg,#0891b2 0%,#164e63 100%)'];
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={(e) => { if (e.target === e.currentTarget) setDetailOrder(null); }}>
        <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 580, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: \`1px solid \${BORDER}\` }}>
            <h3 style={{ margin: 0, fontWeight: 700, fontSize: 16 }}>Chi tiết đơn hàng <span style={{ color: PRIMARY }}>{o.code}</span></h3>
            <button onClick={() => setDetailOrder(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#5a6170', lineHeight: 1, padding: 4 }}>×</button>
          </div>
          <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Thông tin khách hàng */}
            <div>
              <strong style={{ display: 'block', marginBottom: 8 }}>Thông tin khách hàng</strong>
              <div style={{ background: SURFACE_ALT, padding: 12, borderRadius: 8 }}>
                <div style={{ marginBottom: 4 }}>📱 Số điện thoại: <strong>{o.phone}</strong></div>
                <div>📧 Email: <strong>{o.email}</strong></div>
              </div>
            </div>
            {/* Thông tin đơn hàng */}
            <div>
              <strong style={{ display: 'block', marginBottom: 8 }}>Thông tin đơn hàng</strong>
              <div style={{ background: SURFACE_ALT, padding: 12, borderRadius: 8 }}>
                <div style={{ marginBottom: 4 }}>📂 Album: <strong>{o.album}</strong></div>
                <div style={{ marginBottom: 4 }}>📸 Số ảnh: <strong>{o.photoCount} ảnh</strong></div>
                <div style={{ marginBottom: 4 }}>💰 Gói giá: <strong>Gói {o.photoCount} ảnh - {o.price}</strong></div>
                <div style={{ marginBottom: 4 }}>📅 Ngày mua: <strong>{o.date}</strong></div>
                <div>⏰ Hết hạn: <strong>{o.expiry}</strong></div>
              </div>
            </div>
            {/* Danh sách ảnh */}
            <div>
              <strong style={{ display: 'block', marginBottom: 8 }}>Danh sách ảnh</strong>
              <div style={{ display: 'grid', gridTemplateColumns: \`repeat(\${Math.min(o.photoCount, 4)}, 1fr)\`, gap: 8 }}>
                {Array.from({ length: o.photoCount }).map((_, i) => (
                  <div key={i} style={{ aspectRatio: '3/4', background: photoColors[i % photoColors.length], borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 11, fontWeight: 600 }}>
                    IMG_00{i + 1}.jpg
                  </div>
                ))}
              </div>
            </div>
            {/* Link tải ảnh */}
            {o.lookupLink && (
              <div>
                <strong style={{ display: 'block', marginBottom: 8 }}>Link tải ảnh</strong>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input type="text" value={o.lookupLink} readOnly style={{ flex: 1, fontFamily: 'monospace', fontSize: 12, padding: '6px 10px', border: \`1px solid \${BORDER}\`, borderRadius: 6, background: SURFACE_ALT }} />
                  <Button icon={<CopyOutlined />} onClick={() => copyLink(o.lookupLink)} />
                </div>
              </div>
            )}
            {/* Lịch sử */}
            <div>
              <strong style={{ display: 'block', marginBottom: 8 }}>Lịch sử</strong>
              <div style={{ fontSize: 13, color: '#5a6170' }}>
                <div style={{ padding: '8px 0', borderBottom: \`1px solid \${BORDER}\` }}>✅ <strong>{o.date}</strong> - Thanh toán thành công</div>
                <div style={{ padding: '8px 0', borderBottom: \`1px solid \${BORDER}\` }}>📧 <strong>{o.date.replace(/(\d+:\d+)/, (m) => { const [h, min] = m.split(':'); return \`\${h}:\${String(parseInt(min) + 1).padStart(2, '0')}\`; })}</strong> - Gửi link qua SMS</div>
                <div style={{ padding: '8px 0' }}>📥 Khách tải ảnh (1/5 lượt)</div>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '16px 24px', borderTop: \`1px solid \${BORDER}\` }}>
            <Button onClick={() => setDetailOrder(null)}>Đóng</Button>
            {canRefund && o.status === 'completed' && (
              <Button danger icon={<RollbackOutlined />} onClick={() => { setDetailOrder(null); setRefundOrder(o); }}>Hoàn tiền</Button>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ---- Refund Modal ----
  const renderRefundModal = () => {
    const o = refundOrder;
    if (!o) return null;
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={(e) => { if (e.target === e.currentTarget) { setRefundOrder(null); setRefundReason(''); setRefundNote(''); } }}>
        <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 480, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: \`1px solid \${BORDER}\` }}>
            <h3 style={{ margin: 0, fontWeight: 700, fontSize: 16 }}>Hoàn tiền đơn hàng</h3>
            <button onClick={() => { setRefundOrder(null); setRefundReason(''); setRefundNote(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#5a6170', lineHeight: 1, padding: 4 }}>×</button>
          </div>
          <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 13 }}>
              <strong>Cảnh báo:</strong> Hành động này không thể hoàn tác. Link tải ảnh sẽ bị vô hiệu hóa ngay lập tức.
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 6, fontSize: 14 }}>Lý do hoàn tiền <span style={{ color: '#d63b3b' }}>*</span></label>
              <select value={refundReason} onChange={e => setRefundReason(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', border: \`1px solid \${BORDER}\`, borderRadius: 6, fontSize: 14, outline: 'none' }}>
                <option value="">Chọn lý do...</option>
                {REFUND_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 6, fontSize: 14 }}>Ghi chú</label>
              <textarea value={refundNote} onChange={e => setRefundNote(e.target.value)}
                placeholder="Mô tả chi tiết lý do hoàn tiền..."
                rows={3}
                style={{ width: '100%', padding: '8px 12px', border: \`1px solid \${BORDER}\`, borderRadius: 6, fontSize: 14, resize: 'vertical', boxSizing: 'border-box', outline: 'none' }}
              />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '16px 24px', borderTop: \`1px solid \${BORDER}\` }}>
            <Button onClick={() => { setRefundOrder(null); setRefundReason(''); setRefundNote(''); }}>Hủy</Button>
            <Button danger icon={<RollbackOutlined />} onClick={handleRefund}>Xác nhận hoàn tiền</Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Quản lý Đơn hàng</h1>
        <Button icon={<DownloadOutlined />}>Xuất Excel</Button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 24 }}>
        {stats.map(s => (
          <div key={s.label} style={{ background: '#fff', border: \`1px solid \${BORDER}\`, borderRadius: 12, padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 8, background: SURFACE_ALT, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>{s.icon}</div>
            <div>
              <div style={{ fontSize: 12, color: TEXT_MUTED }}>{s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.val}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ background: '#fff', border: \`1px solid \${BORDER}\`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <Input prefix={<SearchOutlined />} placeholder="Tìm theo mã, SĐT, email..." value={search} onChange={e => setSearch(e.target.value)} />
          <Select value={statusFilter || undefined} placeholder="Tất cả trạng thái" onChange={v => setStatusFilter(v || '')} allowClear>
            <Select.Option value="completed">Hoàn thành</Select.Option>
            <Select.Option value="processing">Đang xử lý</Select.Option>
            <Select.Option value="refunded">Đã hoàn tiền</Select.Option>
            <Select.Option value="expired">Hết hạn</Select.Option>
          </Select>
          <Select value={packageFilter || undefined} placeholder="Tất cả gói" onChange={v => setPackageFilter(v || '')} allowClear>
            <Select.Option value="1">Gói 1 ảnh</Select.Option>
            <Select.Option value="3">Gói 3 ảnh</Select.Option>
            <Select.Option value="8">Gói 8 ảnh</Select.Option>
          </Select>
          <DatePicker placeholder="Lọc theo ngày" style={{ width: '100%' }} />
          <Button onClick={resetFilters}>Xóa lọc</Button>
        </div>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', border: \`1px solid \${BORDER}\`, borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
            <thead>
              <tr style={{ background: SURFACE_ALT }}>
                {['Mã đơn', 'Khách hàng', 'Album', 'Số ảnh', 'Tổng tiền', 'Trạng thái', 'Ngày mua', 'Hết hạn', 'Thao tác'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#5a6170', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginated.map(o => (
                <tr key={o.id} style={{ borderTop: \`1px solid \${BORDER}\`, opacity: o.status === 'expired' ? 0.7 : 1 }}>
                  <td style={{ padding: '12px 16px', fontWeight: 700, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{o.code}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <div>{o.phone}</div>
                    <div style={{ fontSize: 12, color: TEXT_MUTED }}>{o.email}</div>
                  </td>
                  <td style={{ padding: '12px 16px', color: '#5a6170' }}>{o.album}</td>
                  <td style={{ padding: '12px 16px' }}>{o.photoCount} ảnh</td>
                  <td style={{ padding: '12px 16px', fontWeight: 600, whiteSpace: 'nowrap' }}>{o.price}</td>
                  <td style={{ padding: '12px 16px' }}><Tag color={STATUS_MAP[o.status].color}>{STATUS_MAP[o.status].label}</Tag></td>
                  <td style={{ padding: '12px 16px', color: '#5a6170', fontSize: 13, whiteSpace: 'nowrap' }}>{o.date}</td>
                  <td style={{ padding: '12px 16px', color: '#5a6170', fontSize: 13, whiteSpace: 'nowrap' }}>{o.expiry}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <Button size="small" icon={<EyeOutlined />} onClick={() => setDetailOrder(o)} title="Xem chi tiết" />
                      {canRefund && o.status === 'completed' && (
                        <Button size="small" danger icon={<RollbackOutlined />} onClick={() => setRefundOrder(o)} title="Hoàn tiền" />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {paginated.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: TEXT_MUTED }}>Không có đơn hàng nào</div>}
        <div style={{ padding: '12px 16px', borderTop: \`1px solid \${BORDER}\`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 13, color: '#5a6170' }}>Hiển thị {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} trong tổng số {filtered.length} đơn hàng</div>
          <div style={{ display: 'flex', gap: 4 }}>
            <Button size="small" disabled={page === 1} onClick={() => setPage(p => p - 1)}>«</Button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map(p => (
              <Button key={p} size="small" type={p === page ? 'primary' : 'default'} onClick={() => setPage(p)}>{p}</Button>
            ))}
            {totalPages > 5 && <Button size="small" disabled>...</Button>}
            <Button size="small" disabled={page === totalPages || totalPages === 0} onClick={() => setPage(p => p + 1)}>»</Button>
          </div>
        </div>
      </div>

      {renderDetailModal()}
      {renderRefundModal()}
    </div>
  );
}
`.trimStart());
console.log('Orders.tsx done');
