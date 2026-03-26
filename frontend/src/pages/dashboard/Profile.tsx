import { useState, useEffect } from 'react';
import { Tabs, Button, Switch, Tag, message, Input } from 'antd';
import { UserOutlined, LockOutlined, BellOutlined, HistoryOutlined, EditOutlined, SaveOutlined, CloseOutlined, CheckOutlined, WarningOutlined, DeleteOutlined, UserAddOutlined } from '@ant-design/icons';
import { getUser, getAvatarInitials, ROLE_LABELS } from '../../hooks/useAuth';
import { apiClient } from '../../lib/api-client';

const BORDER = '#e2e5ea';
const PRIMARY = '#1a6b4e';
const SURFACE_ALT = '#f6f7f9';
const TEXT_MUTED = '#8b91a0';
const DANGER = '#d63b3b';

const fieldStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', border: `1px solid ${BORDER}`,
  borderRadius: 6, fontSize: 14, outline: 'none', boxSizing: 'border-box', background: '#fff',
};
const fieldDisabledStyle: React.CSSProperties = {
  ...fieldStyle, background: SURFACE_ALT, color: '#5a6170', cursor: 'not-allowed',
};
const labelStyle: React.CSSProperties = { display: 'block', fontWeight: 600, marginBottom: 6, fontSize: 14 };
const cardStyle: React.CSSProperties = { background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden', marginBottom: 20 };
const cardHeaderStyle: React.CSSProperties = { padding: '16px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
const cardBodyStyle: React.CSSProperties = { padding: 20 };

const ACTIVITIES = [
  { type: 'success', icon: <CheckOutlined />, title: 'Tạo album mới', desc: 'Album "Bà Nà Hills" đã được tạo với 150 ảnh', time: '2 giờ trước' },
  { type: 'info', icon: <EditOutlined />, title: 'Cập nhật giá gói', desc: 'Thay đổi giá gói 8 ảnh từ 120,000₫ thành 100,000₫', time: '5 giờ trước' },
  { type: 'warning', icon: <UserAddOutlined />, title: 'Thêm nhân viên mới', desc: 'Nhân viên "Nguyễn Văn A" đã được thêm vào hệ thống', time: '1 ngày trước' },
  { type: 'danger', icon: <DeleteOutlined />, title: 'Xóa ảnh hết hạn', desc: '45 ảnh đã hết hạn đã được xóa tự động', time: '2 ngày trước' },
];

const ACTIVITY_ICON_STYLES: Record<string, React.CSSProperties> = {
  success: { background: '#dcfce7', border: '2px solid #16a34a', color: '#16a34a' },
  info:    { background: '#eff6ff', border: '2px solid #2563eb', color: '#2563eb' },
  warning: { background: '#fef3e8', border: '2px solid #d4870e', color: '#d4870e' },
  danger:  { background: '#fee2e2', border: '2px solid #dc2626', color: '#dc2626' },
};

const NOTIFS = [
  { key: 'newOrder',     label: 'Đơn hàng mới',         desc: 'Nhận thông báo khi có đơn hàng mới',        default: true },
  { key: 'payment',      label: 'Thanh toán thành công', desc: 'Thông báo khi khách hàng thanh toán',       default: true },
  { key: 'albumExpiry',  label: 'Album sắp hết hạn',     desc: 'Cảnh báo trước 3 ngày khi album hết hạn',  default: true },
  { key: 'weeklyReport', label: 'Báo cáo doanh thu',     desc: 'Gửi báo cáo hàng tuần qua email',          default: false },
  { key: 'system',       label: 'Cập nhật hệ thống',     desc: 'Thông báo về tính năng và bảo trì',        default: true },
];

function formatRevenue(val: number): string {
  if (val >= 1_000_000_000) return `${(val / 1_000_000_000).toFixed(1)}B`;
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(0)}K`;
  return val.toLocaleString('vi-VN');
}

export default function Profile() {
  const user = getUser();

  // Info form — loaded from API
  const [editMode, setEditMode] = useState(false);
  const [fullName, setFullName] = useState(user?.name || '');
  const [email, setEmail]       = useState(user?.username || '');
  const [phone, setPhone]       = useState('');
  const [draft, setDraft]       = useState({ fullName, phone });

  // Load from GET /api/v1/admin/auth/me on mount
  useEffect(() => {
    apiClient.get<{ id: string; full_name: string | null; email: string; phone: string | null }>('/api/v1/admin/auth/me')
      .then(data => {
        setFullName(data.full_name || '');
        setEmail(data.email);
        setPhone(data.phone || '');
      })
      .catch(() => { /* silently fallback to localStorage values */ });
  }, []);

  const startEdit = () => {
    setDraft({ fullName, phone });
    setEditMode(true);
  };
  const cancelEdit = () => setEditMode(false);
  const saveInfo = async () => {
    try {
      await apiClient.patch('/api/v1/admin/auth/me', {
        full_name: draft.fullName,
        phone: draft.phone,
      });
      setFullName(draft.fullName);
      setPhone(draft.phone);
      setEditMode(false);
      message.success('Thông tin đã được cập nhật!');
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Cập nhật thất bại');
    }
  };

  // Password form
  const [pwForm, setPwForm]     = useState({ current: '', newPw: '', confirm: '' });
  const [pwLoading, setPwLoading] = useState(false);
  const handlePwSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwForm.newPw !== pwForm.confirm) { message.error('Mật khẩu xác nhận không khớp!'); return; }
    if (pwForm.newPw.length < 8) { message.error('Mật khẩu phải có ít nhất 8 ký tự!'); return; }
    setPwLoading(true);
    try {
      await apiClient.post('/api/v1/admin/auth/change-password', {
        old_password: pwForm.current,
        new_password: pwForm.newPw,
      });
      message.success('Mật khẩu đã được đổi thành công!');
      setPwForm({ current: '', newPw: '', confirm: '' });
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Đổi mật khẩu thất bại');
    } finally {
      setPwLoading(false);
    }
  };

  // Activity log from API
  interface ActivityItem { ip: string; device: string; created_at: string; }
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  useEffect(() => {
    apiClient.get<ActivityItem[]>('/api/v1/admin/auth/activity')
      .then(r => setActivities(r ?? []))
      .catch(() => setActivities([]));
  }, []);

  // Notifications settings from API
  const initNotifs = Object.fromEntries(NOTIFS.map(n => [n.key, n.default]));
  const [notifs, setNotifs] = useState<Record<string, boolean>>(initNotifs);
  const [notifsLoaded, setNotifsLoaded] = useState(false);
  useEffect(() => {
    apiClient.get<Record<string, boolean>>('/api/v1/admin/notifications/settings')
      .then(r => { setNotifs(p => ({ ...p, ...r })); setNotifsLoaded(true); })
      .catch(() => setNotifsLoaded(true));
  }, []);
  const saveNotifSettings = async () => {
    try {
      await apiClient.post('/api/v1/admin/notifications/settings', notifs);
      message.success('Đã lưu cài đặt thông báo!');
    } catch {
      message.error('Lưu thất bại');
    }
  };

  // Live stats from API
  const [statsData, setStatsData] = useState({ photos: '...', orders: '...', revenue: '...' });
  useEffect(() => {
    // Photos uploaded by this staff
    apiClient.get<{ data: { total_photos_uploaded?: number } }>('/api/v1/admin/staff/statistics/me')
      .then(r => setStatsData(p => ({ ...p, photos: (r.data?.total_photos_uploaded ?? 0).toLocaleString('vi-VN') })))
      .catch(() => setStatsData(p => ({ ...p, photos: '-' })));
    // Total orders count
    apiClient.get<{ data: { items?: unknown[] }; meta?: { total?: number } }>('/api/v1/admin/orders?limit=1')
      .then(r => {
        const total = (r as unknown as { meta?: { total?: number } }).meta?.total
          ?? (r as unknown as { data?: { total?: number } }).data?.total
          ?? 0;
        setStatsData(p => ({ ...p, orders: Number(total).toLocaleString('vi-VN') }));
      })
      .catch(() => setStatsData(p => ({ ...p, orders: '-' })));
    // Total revenue
    apiClient.get<{ data: { summary?: { total_revenue?: number } } }>('/api/v1/admin/revenue?period=year')
      .then(r => {
        const rev = r.data?.summary?.total_revenue ?? 0;
        setStatsData(p => ({ ...p, revenue: formatRevenue(rev) }));
      })
      .catch(() => setStatsData(p => ({ ...p, revenue: '-' })));
  }, []);

  const stats = [
    { label: 'Ảnh đã chụp', val: statsData.photos, color: PRIMARY },
    { label: 'Đơn hàng', val: statsData.orders, color: '#2563eb' },
    { label: 'Doanh thu', val: statsData.revenue, color: '#d4870e' },
  ];

  // ===== TAB INFO =====
  const infoTab = (
    <div style={cardStyle}>
      <div style={cardHeaderStyle}>
        <h3 style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>Thông Tin Cá Nhân</h3>
        {!editMode
          ? <Button icon={<EditOutlined />} onClick={startEdit}>Chỉnh sửa</Button>
          : <Button icon={<CloseOutlined />} onClick={cancelEdit}>Hủy</Button>
        }
      </div>
      <div style={cardBodyStyle}>
        <form onSubmit={e => { e.preventDefault(); void saveInfo(); }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Họ và tên</label>
              <Input style={editMode ? fieldStyle : fieldDisabledStyle}
                value={editMode ? draft.fullName : fullName}
                onChange={e => setDraft(d => ({ ...d, fullName: e.target.value }))}
                disabled={!editMode} />
            </div>
            <div>
              <label style={labelStyle}>Vai trò</label>
              <Input style={fieldDisabledStyle} value={ROLE_LABELS[user?.role || 'manager']} disabled />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Email</label>
              <Input style={fieldDisabledStyle} type="email" value={email} disabled />
            </div>
            <div>
              <label style={labelStyle}>Số điện thoại</label>
              <Input style={editMode ? fieldStyle : fieldDisabledStyle} type="tel"
                value={editMode ? draft.phone : phone}
                onChange={e => setDraft(d => ({ ...d, phone: e.target.value }))}
                disabled={!editMode} />
            </div>
          </div>
          {editMode && (
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', paddingTop: 16, borderTop: `1px solid ${BORDER}` }}>
              <Button onClick={cancelEdit} icon={<CloseOutlined />}>Hủy</Button>
              <Button type="primary" htmlType="submit" icon={<SaveOutlined />}>Lưu thay đổi</Button>
            </div>
          )}
        </form>
      </div>
    </div>
  );

  // ===== TAB SECURITY =====
  const securityTab = (
    <div>
      <div style={cardStyle}>
        <div style={cardHeaderStyle}>
          <h3 style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>Đổi Mật Khẩu</h3>
        </div>
        <div style={cardBodyStyle}>
          <form onSubmit={handlePwSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 480 }}>
            <div>
              <label style={labelStyle}>Mật khẩu hiện tại</label>
              <Input.Password style={fieldStyle} placeholder="••••••••"
                value={pwForm.current} onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Mật khẩu mới</label>
              <Input.Password style={fieldStyle} placeholder="••••••••"
                value={pwForm.newPw} onChange={e => setPwForm(f => ({ ...f, newPw: e.target.value }))} />
              <small style={{ fontSize: 12, color: TEXT_MUTED, display: 'block', marginTop: 6 }}>
                Tối thiểu 8 ký tự, bao gồm chữ hoa, chữ thường và số
              </small>
            </div>
            <div>
              <label style={labelStyle}>Xác nhận mật khẩu mới</label>
              <Input.Password style={fieldStyle} placeholder="••••••••"
                value={pwForm.confirm} onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))} />
            </div>
            <div>
              <Button type="primary" htmlType="submit" icon={<LockOutlined />} loading={pwLoading}>Đổi mật khẩu</Button>
            </div>
          </form>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={cardHeaderStyle}>
          <h3 style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>Phiên Đăng Nhập</h3>
        </div>
        <div style={cardBodyStyle}>
          <div style={{ color: TEXT_MUTED, fontSize: 14 }}>
            Quản lý phiên đăng nhập thông qua tab Hoạt động.
          </div>
        </div>
      </div>
    </div>
  );

  // ===== TAB ACTIVITY =====
  const activityTab = (
    <div style={cardStyle}>
      <div style={cardHeaderStyle}>
        <h3 style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>Lịch Sử Đăng Nhập</h3>
      </div>
      <div style={cardBodyStyle}>
        {activities.length === 0 ? (
          <div style={{ color: TEXT_MUTED, textAlign: 'center', padding: '32px 0' }}>Chưa có dữ liệu hoạt động.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {activities.map((a, i) => (
              <div key={i} style={{ display: 'flex', gap: 16, paddingBottom: 20, position: 'relative' }}>
                {i < activities.length - 1 && (
                  <div style={{ position: 'absolute', left: 19, top: 42, width: 2, bottom: 0, background: BORDER }} />
                )}
                <div style={{ width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 14, ...ACTIVITY_ICON_STYLES.info }}>
                  <HistoryOutlined />
                </div>
                <div style={{ paddingTop: 4 }}>
                  <strong style={{ display: 'block', marginBottom: 4, fontSize: 14 }}>{a.device || 'Unknown device'}</strong>
                  <div style={{ fontSize: 14, color: '#5a6170', marginBottom: 4 }}>IP: {a.ip}</div>
                  <small style={{ fontSize: 13, color: TEXT_MUTED }}>{new Date(a.created_at).toLocaleString('vi-VN')}</small>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // ===== TAB NOTIFICATIONS =====
  const notifTab = (
    <div style={cardStyle}>
      <div style={cardHeaderStyle}>
        <h3 style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>Cài Đặt Thông Báo</h3>
      </div>
      <div style={cardBodyStyle}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {NOTIFS.map(n => (
            <div key={n.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 16, background: SURFACE_ALT, borderRadius: 8 }}>
              <div>
                <strong style={{ display: 'block', marginBottom: 4, fontSize: 14 }}>{n.label}</strong>
                <div style={{ fontSize: 14, color: '#5a6170', margin: 0 }}>{n.desc}</div>
              </div>
              <Switch checked={notifs[n.key]} onChange={v => setNotifs(p => ({ ...p, [n.key]: v }))} />
            </div>
          ))}
        </div>
        <div style={{ paddingTop: 20 }}>
          <Button type="primary" icon={<SaveOutlined />} onClick={saveNotifSettings}>Lưu cài đặt</Button>
        </div>
      </div>
    </div>
  );

  return (
    <div>
      {/* Profile Banner */}
      <div style={{ height: 200, background: `linear-gradient(135deg, ${PRIMARY} 0%, #0f5840 100%)`, borderRadius: 12, marginBottom: 0, position: 'relative', overflow: 'hidden' }}>
        <style>{`@keyframes slide-banner { from { transform: translateX(0); } to { transform: translateX(100px); } }`}</style>
        <div style={{ position: 'absolute', inset: 0, opacity: 0.08, backgroundImage: 'radial-gradient(circle at 20% 50%, white 0%, transparent 50%), radial-gradient(circle at 80% 20%, white 0%, transparent 40%)', animation: 'slide-banner 20s linear infinite' }} />
      </div>

      {/* Profile Header Content */}
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-end', padding: '0 24px 24px', marginTop: -60, position: 'relative' }}>
        {/* Avatar */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <div style={{ width: 120, height: 120, borderRadius: '50%', background: '#fff', padding: 4, boxShadow: '0 4px 16px rgba(0,0,0,0.15)' }}>
            <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: PRIMARY, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, fontWeight: 700, color: '#fff' }}>
              {getAvatarInitials(user?.name || 'User')}
            </div>
          </div>
          <Button
            onClick={() => message.info('Chức năng thay đổi ảnh đại diện')}
            style={{ position: 'absolute', bottom: 4, right: 4, width: 32, height: 32, borderRadius: '50%', background: '#fff', border: `1px solid ${BORDER}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px rgba(0,0,0,0.15)', fontSize: 14, color: '#5a6170', padding: 0 }}
            title="Thay đổi ảnh đại diện"
          >
            <EditOutlined />
          </Button>
        </div>

        {/* Name + stats */}
        <div style={{ flex: 1, paddingTop: 72 }}>
          <h1 style={{ margin: '0 0 4px', fontSize: 26, fontWeight: 700 }}>{user?.name || 'Admin System'}</h1>
          <p style={{ margin: '0 0 16px', color: TEXT_MUTED, fontSize: 14 }}>{user?.username || 'admin@photopro.vn'}</p>
          <div style={{ display: 'flex', gap: 32 }}>
            {stats.map(s => (
              <div key={s.label}>
                <strong style={{ display: 'block', fontSize: 22, fontWeight: 800, color: s.color }}>{s.val}</strong>
                <span style={{ fontSize: 14, color: TEXT_MUTED }}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Tabs items={[
        { key: 'info',          label: <><UserOutlined /> Thông tin</>,  children: infoTab },
        { key: 'security',      label: <><LockOutlined /> Bảo mật</>,    children: securityTab },
        { key: 'activity',      label: <><HistoryOutlined /> Hoạt động</>, children: activityTab },
        { key: 'notifications', label: <><BellOutlined /> Thông báo</>,  children: notifTab },
      ]} />
    </div>
  );
}
