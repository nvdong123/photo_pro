import { useState } from 'react';
import { Input, Select, Button, Tag, DatePicker, message, Modal, Table, Spin } from 'antd';
import { SearchOutlined, EyeOutlined, RollbackOutlined, CopyOutlined, DownloadOutlined, CheckCircleOutlined, ClockCircleOutlined, ShoppingOutlined } from '@ant-design/icons';
import { Clock } from 'lucide-react';
import { hasRole } from '../../hooks/useAuth';
import { useOrders, useOrderDetail, resendEmail } from '../../hooks/useOrders';

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

export default function Orders() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [detailOrderId, setDetailOrderId] = useState<string | null>(null);
  const [refundOrder, setRefundOrder] = useState<Order | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const [refundNote, setRefundNote] = useState('');

  const { data: ordersData, loading } = useOrders({ status: statusFilter || undefined, search: search || undefined, page });
  const { data: orderDetail, loading: detailLoading } = useOrderDetail(detailOrderId ?? '');

  const STATUS_BACKEND_MAP: Record<string, OrderStatus> = {
    PAID: 'completed', PENDING: 'processing', REFUNDED: 'refunded', EXPIRED: 'expired',
    paid: 'completed', pending: 'processing', refunded: 'refunded', expired: 'expired',
  };

  const orders: Order[] = (ordersData?.items ?? []).map((o: any) => ({
    id: o.id,
    code: o.order_code,
    phone: o.customer_phone ?? '-',
    email: o.customer_email ?? '-',
    album: '-',
    photoCount: o.photo_count ?? 0,
    price: (o.total_price ?? 0).toLocaleString('vi-VN') + 'đ',
    status: STATUS_BACKEND_MAP[o.status] ?? 'processing',
    date: o.created_at ? new Date(o.created_at).toLocaleString('vi-VN') : '-',
    expiry: o.download_expires_at ? new Date(o.download_expires_at).toLocaleString('vi-VN') : '-',
    lookupLink: o.download_token ? `${window.location.origin}/d/${o.download_token}` : '',
  }));

  const totalCount = ordersData?.total ?? 0;

  const stats = [
    { label: 'Hoàn thành', val: orders.filter(o => o.status === 'completed').length, color: '#1a854a', icon: <CheckCircleOutlined style={{ fontSize: 22, color: '#1a854a' }} /> },
    { label: 'Đang xử lý', val: orders.filter(o => o.status === 'processing').length, color: '#d4870e', icon: <ClockCircleOutlined style={{ fontSize: 22, color: '#d4870e' }} /> },
    { label: 'Đã hoàn tiền', val: orders.filter(o => o.status === 'refunded').length, color: '#d63b3b', icon: <RollbackOutlined style={{ fontSize: 22, color: '#d63b3b' }} /> },
    { label: 'Tổng đơn', val: totalCount, color: PRIMARY, icon: <ShoppingOutlined style={{ fontSize: 22, color: PRIMARY }} /> },
  ];

  const resetFilters = () => { setSearch(''); setStatusFilter(''); setPage(1); };

  const handleExportCSV = () => {
    if (orders.length === 0) { message.warning('Không có dữ liệu để xuất'); return; }
    const headers = ['Mã đơn', 'Số điện thoại', 'Email', 'Số ảnh', 'Tổng tiền', 'Trạng thái', 'Ngày mua', 'Hết hạn'];
    const rows = orders.map(o => [
      o.code, o.phone, o.email, o.photoCount,
      o.price.replace('\u0111', ''),
      STATUS_MAP[o.status].label,
      o.date, o.expiry,
    ]);
    const csv = [headers, ...rows]
      .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `don_hang_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    message.success('Xuất file thành công!');
  };

  const canRefund = hasRole(['admin-system', 'admin-sales']);

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
    // Find the list-level order to get code/phone/email for header while detail loads
    const listOrder = orders.find(o => o.id === detailOrderId);
    const detail = orderDetail;

    const fmtDt = (iso: string | null | undefined) => {
      if (!iso) return '-';
      const d = new Date(iso);
      const h = String(d.getHours()).padStart(2, '0');
      const m = String(d.getMinutes()).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const mo = String(d.getMonth() + 1).padStart(2, '0');
      return `${h}:${m} ${day}/${mo}/${d.getFullYear()}`;
    };

    const downloadUrl = detail?.delivery?.download_url ?? listOrder?.lookupLink ?? '';
    const currentRefundOrder = listOrder ?? null;

    return (
      <Modal
        open={!!detailOrderId}
        onCancel={() => setDetailOrderId(null)}
        title={<>Chi tiết đơn hàng <span style={{ color: PRIMARY }}>{listOrder?.code ?? ''}</span></>}
        footer={[
          <Button key="close" onClick={() => setDetailOrderId(null)}>Đóng</Button>,
          canRefund && listOrder?.status === 'completed' && (
            <Button key="refund" danger icon={<RollbackOutlined />} onClick={() => { setDetailOrderId(null); setRefundOrder(currentRefundOrder); }}>Hoàn tiền</Button>
          ),
        ]}
        width={580}
      >
        {detailLoading ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}><Spin /></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Thông tin khách hàng */}
            <div>
              <strong style={{ display: 'block', marginBottom: 8 }}>Thông tin khách hàng</strong>
              <div style={{ background: SURFACE_ALT, padding: 12, borderRadius: 8 }}>
                <div style={{ marginBottom: 4 }}>Số điện thoại: <strong>{detail?.customer_phone ?? listOrder?.phone ?? '-'}</strong></div>
                <div>Email: <strong>{detail?.customer_email ?? listOrder?.email ?? '-'}</strong></div>
              </div>
            </div>
            {/* Thông tin đơn hàng */}
            <div>
              <strong style={{ display: 'block', marginBottom: 8 }}>Thông tin đơn hàng</strong>
              <div style={{ background: SURFACE_ALT, padding: 12, borderRadius: 8 }}>
                <div style={{ marginBottom: 4 }}>Số ảnh: <strong>{detail?.photo_count ?? listOrder?.photoCount ?? 0} ảnh</strong></div>
                <div style={{ marginBottom: 4 }}>Tổng tiền: <strong>{((detail?.amount ?? 0) || 0).toLocaleString('vi-VN')}đ</strong></div>
                <div style={{ marginBottom: 4 }}>Ngày mua: <strong>{fmtDt(detail?.created_at ?? listOrder?.date)}</strong></div>
                {detail?.delivery?.expires_at && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Clock size={14} style={{ color: TEXT_MUTED, flexShrink: 0 }} />
                    Hết hạn: <strong>{fmtDt(detail.delivery.expires_at)}</strong>
                  </div>
                )}
              </div>
            </div>
            {/* Danh sách ảnh */}
            {detail && (detail.photos.length > 0 || detail.items.length > 0) && (
              <div>
                <strong style={{ display: 'block', marginBottom: 8 }}>Danh sách ảnh ({detail.photos.length > 0 ? detail.photos.length : detail.items.length} ảnh)</strong>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(detail.photos.length > 0 ? detail.photos.length : detail.items.length, 4)}, 1fr)`, gap: 8 }}>
                  {detail.photos.length > 0
                    ? detail.photos.map((p, i) => (
                        <div key={i} style={{ aspectRatio: '3/4', borderRadius: 8, overflow: 'hidden', background: '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {p.preview_url
                            ? <img src={p.preview_url} alt={p.filename} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : <span style={{ color: '#fff', fontSize: 10, padding: 4, textAlign: 'center' }}>{p.filename}</span>}
                        </div>
                      ))
                    : detail.items.map((item, i) => (
                        <div key={i} style={{ aspectRatio: '3/4', borderRadius: 8, overflow: 'hidden', background: '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {item.thumb_url
                            ? <img src={item.thumb_url} alt={item.photographer_code} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : <span style={{ color: '#fff', fontSize: 10, padding: 4, textAlign: 'center' }}>{item.photographer_code}</span>}
                        </div>
                      ))
                  }
                </div>
              </div>
            )}
            {/* Delivery */}
            {detail?.delivery && (
              <div>
                <strong style={{ display: 'block', marginBottom: 8 }}>Thông tin tải ảnh</strong>
                <div style={{ background: SURFACE_ALT, padding: 12, borderRadius: 8 }}>
                  <div style={{ marginBottom: 4 }}>Đã tải: <strong>{detail.delivery.download_count}/{detail.delivery.max_downloads} lượt</strong></div>
                  <div>Trạng thái: <Tag color={detail.delivery.is_active ? 'success' : 'default'}>{detail.delivery.is_active ? 'Còn hiệu lực' : 'Đã vô hiệu'}</Tag></div>
                </div>
              </div>
            )}
            {/* Link tải ảnh */}
            {downloadUrl && (
              <div>
                <strong style={{ display: 'block', marginBottom: 8 }}>Link tải ảnh</strong>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Input value={downloadUrl} readOnly style={{ flex: 1, fontFamily: 'monospace', fontSize: 12, background: SURFACE_ALT }} />
                  <Button icon={<CopyOutlined />} onClick={() => copyLink(downloadUrl)} />
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    );
  };

  // ---- Refund Modal ----
  const renderRefundModal = () => {
    const o = refundOrder;
    return (
      <Modal
        open={!!refundOrder}
        onCancel={() => { setRefundOrder(null); setRefundReason(''); setRefundNote(''); }}
        title="Hoàn tiền đơn hàng"
        footer={[
          <Button key="cancel" onClick={() => { setRefundOrder(null); setRefundReason(''); setRefundNote(''); }}>Hủy</Button>,
          <Button key="confirm" danger icon={<RollbackOutlined />} onClick={handleRefund}>Xác nhận hoàn tiền</Button>,
        ]}
        width={480}
      >
        {o && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 13 }}>
              <strong>Cảnh báo:</strong> Hành động này không thể hoàn tác. Link tải ảnh sẽ bị vô hiệu hóa ngay lập tức.
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 6, fontSize: 14 }}>Lý do hoàn tiền <span style={{ color: '#d63b3b' }}>*</span></label>
              <Select value={refundReason || undefined} placeholder="Chọn lý do..." onChange={v => setRefundReason(v)} style={{ width: '100%' }}>
                {REFUND_REASONS.map(r => <Select.Option key={r.value} value={r.value}>{r.label}</Select.Option>)}
              </Select>
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 6, fontSize: 14 }}>Ghi chú</label>
              <Input.TextArea value={refundNote} onChange={e => setRefundNote(e.target.value)}
                placeholder="Mô tả chi tiết lý do hoàn tiền..."
                rows={3}
              />
            </div>
          </div>
        )}
      </Modal>
    );
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Quản lý Đơn hàng</h1>
        <Button icon={<DownloadOutlined />} onClick={handleExportCSV}>Xuất Excel</Button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 24 }}>
        {stats.map(s => (
          <div key={s.label} style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 8, background: SURFACE_ALT, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>{s.icon}</div>
            <div>
              <div style={{ fontSize: 12, color: TEXT_MUTED }}>{s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.val}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <Input prefix={<SearchOutlined />} placeholder="Tìm theo mã, SĐT, email..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
          <Select value={statusFilter || undefined} placeholder="Tất cả trạng thái" onChange={v => { setStatusFilter(v || ''); setPage(1); }} allowClear>
            <Select.Option value="PAID">Hoàn thành</Select.Option>
            <Select.Option value="PENDING">Đang xử lý</Select.Option>
            <Select.Option value="REFUNDED">Đã hoàn tiền</Select.Option>
            <Select.Option value="EXPIRED">Hết hạn</Select.Option>
          </Select>
          <DatePicker placeholder="Lọc theo ngày" style={{ width: '100%' }} />
          <Button onClick={resetFilters}>Xóa lọc</Button>
        </div>
      </div>

      {/* Table */}
      <Table
        dataSource={orders}
        loading={loading}
        rowKey="id"
        scroll={{ x: 900 }}
        style={{ borderRadius: 12, border: `1px solid ${BORDER}`, overflow: 'hidden' }}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total: totalCount,
          onChange: setPage,
          showTotal: (total: number, range: [number, number]) => `Hiển thị ${range[0]}–${range[1]} trong tổng số ${total} đơn hàng`,
        }}
        locale={{ emptyText: <div style={{ textAlign: 'center', padding: 40, color: TEXT_MUTED }}>Không có đơn hàng nào</div> }}
        onRow={o => ({ style: { opacity: o.status === 'expired' ? 0.7 : 1 } })}
        columns={[
          { title: 'Mã đơn', dataIndex: 'code', key: 'code', render: (v: string) => <span style={{ fontWeight: 700, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{v}</span> },
          { title: 'Khách hàng', key: 'customer', render: (o: Order) => <div><div>{o.phone}</div><div style={{ fontSize: 12, color: TEXT_MUTED }}>{o.email}</div></div> },
          { title: 'Album', dataIndex: 'album', key: 'album', render: (v: string) => <span style={{ color: '#5a6170' }}>{v}</span> },
          { title: 'Số ảnh', dataIndex: 'photoCount', key: 'photoCount', render: (v: number) => `${v} ảnh` },
          { title: 'Tổng tiền', dataIndex: 'price', key: 'price', render: (v: string) => <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{v}</span> },
          { title: 'Trạng thái', dataIndex: 'status', key: 'status', render: (v: OrderStatus) => <Tag color={STATUS_MAP[v].color}>{STATUS_MAP[v].label}</Tag> },
          { title: 'Ngày mua', dataIndex: 'date', key: 'date', render: (v: string) => <span style={{ color: '#5a6170', fontSize: 13, whiteSpace: 'nowrap' }}>{v}</span> },
          { title: 'Hết hạn', dataIndex: 'expiry', key: 'expiry', render: (v: string) => <span style={{ color: '#5a6170', fontSize: 13, whiteSpace: 'nowrap' }}>{v}</span> },
          {
            title: 'Thao tác', key: 'actions',
            render: (o: Order) => (
              <div style={{ display: 'flex', gap: 4 }}>
                <Button size="small" icon={<EyeOutlined />} onClick={() => setDetailOrderId(o.id)} title="Xem chi tiết" />
                {canRefund && o.status === 'completed' && (
                  <Button size="small" danger icon={<RollbackOutlined />} onClick={() => setRefundOrder(o)} title="Hoàn tiền" />
                )}
              </div>
            ),
          },
        ]}
      />

      {renderDetailModal()}
      {renderRefundModal()}
    </div>
  );
}
