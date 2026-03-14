import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
const out = 'c:/Users/datth/Downloads/photopro-react/src/pages/dashboard/Profile.tsx';
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `
import { useState } from 'react';
import { Tabs, Button, Switch, Tag, message } from 'antd';
import { UserOutlined, LockOutlined, BellOutlined, HistoryOutlined, EditOutlined, SaveOutlined, CloseOutlined, CheckOutlined, InfoCircleOutlined, WarningOutlined, DeleteOutlined, UserAddOutlined } from '@ant-design/icons';
import { getUser, getAvatarInitials, ROLE_LABELS } from '../../hooks/useAuth';

const BORDER = '#e2e5ea';
const PRIMARY = '#1a6b4e';
const SURFACE_ALT = '#f6f7f9';
const TEXT_MUTED = '#8b91a0';
const DANGER = '#d63b3b';

const fieldStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', border: \`1px solid \${BORDER}\`,
  borderRadius: 6, fontSize: 14, outline: 'none', boxSizing: 'border-box', background: '#fff',
};
const fieldDisabledStyle: React.CSSProperties = {
  ...fieldStyle, background: SURFACE_ALT, color: '#5a6170', cursor: 'not-allowed',
};
const labelStyle: React.CSSProperties = { display: 'block', fontWeight: 600, marginBottom: 6, fontSize: 14 };
const cardStyle: React.CSSProperties = { background: '#fff', border: \`1px solid \${BORDER}\`, borderRadius: 12, overflow: 'hidden', marginBottom: 20 };
const cardHeaderStyle: React.CSSProperties = { padding: '16px 20px', borderBottom: \`1px solid \${BORDER}\`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
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

const SESSIONS = [
  { id: 1, device: 'Windows - Chrome', location: 'TP.HCM, Việt Nam', time: 'Đăng nhập lúc 14:30, 27/02/2026', current: true },
  { id: 2, device: 'iPhone - Safari', location: 'Hà Nội, Việt Nam', time: 'Đăng nhập lúc 09:15, 26/02/2026', current: false },
];

const NOTIFS = [
  { key: 'newOrder',     label: 'Đơn hàng mới',         desc: 'Nhận thông báo khi có đơn hàng mới',        default: true },
  { key: 'payment',      label: 'Thanh toán thành công', desc: 'Thông báo khi khách hàng thanh toán',       default: true },
  { key: 'albumExpiry',  label: 'Album sắp hết hạn',     desc: 'Cảnh báo trước 3 ngày khi album hết hạn',  default: true },
  { key: 'weeklyReport', label: 'Báo cáo doanh thu',     desc: 'Gửi báo cáo hàng tuần qua email',          default: false },
  { key: 'system',       label: 'Cập nhật hệ thống',     desc: 'Thông báo về tính năng và bảo trì',        default: true },
];

export default function Profile() {
  const user = getUser();

  // Info form
  const [editMode, setEditMode] = useState(false);
  const [fullName, setFullName] = useState(user?.name || 'Admin System');
  const [email, setEmail] = useState(user?.username || 'admin@photopro.vn');
  const [phone, setPhone] = useState('0901234567');
  const [address, setAddress] = useState('123 Đường ABC, Quận 1, TP.HCM');
  const [bio, setBio] = useState('Quản trị viên hệ thống với kinh nghiệm 5+ năm trong lĩnh vực nhiếp ảnh và quản lý doanh nghiệp.');
  // Temp values while editing
  const [draft, setDraft] = useState({ fullName, email, phone, address, bio });

  const startEdit = () => {
    setDraft({ fullName, email, phone, address, bio });
    setEditMode(true);
  };
  const cancelEdit = () => setEditMode(false);
  const saveInfo = () => {
    setFullName(draft.fullName); setEmail(draft.email); setPhone(draft.phone);
    setAddress(draft.address); setBio(draft.bio);
    setEditMode(false);
    message.success('Thông tin đã được cập nhật!');
  };

  // Password form
  const [pwForm, setPwForm] = useState({ current: '', newPw: '', confirm: '' });
  const handlePwSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pwForm.newPw !== pwForm.confirm) { message.error('Mật khẩu xác nhận không khớp!'); return; }
    if (pwForm.newPw.length < 8) { message.error('Mật khẩu phải có ít nhất 8 ký tự!'); return; }
    message.success('Mật khẩu đã được đổi thành công!');
    setPwForm({ current: '', newPw: '', confirm: '' });
  };

  // Notifications
  const initNotifs = Object.fromEntries(NOTIFS.map(n => [n.key, n.default]));
  const [notifs, setNotifs] = useState<Record<string, boolean>>(initNotifs);

  const stats = [
    { label: 'Ảnh đã chụp', val: '8,450', color: PRIMARY },
    { label: 'Đơn hàng', val: '156', color: '#2563eb' },
    { label: 'Doanh thu', val: '42.5M', color: '#d4870e' },
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
        <form onSubmit={e => { e.preventDefault(); saveInfo(); }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Họ và tên</label>
              <input style={editMode ? fieldStyle : fieldDisabledStyle} value={editMode ? draft.fullName : fullName}
                onChange={e => setDraft(d => ({ ...d, fullName: e.target.value }))} disabled={!editMode} />
            </div>
            <div>
              <label style={labelStyle}>Vai trò</label>
              <input style={fieldDisabledStyle} value={ROLE_LABELS[user?.role || 'manager']} disabled />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Email</label>
              <input style={editMode ? fieldStyle : fieldDisabledStyle} type="email" value={editMode ? draft.email : email}
                onChange={e => setDraft(d => ({ ...d, email: e.target.value }))} disabled={!editMode} />
            </div>
            <div>
              <label style={labelStyle}>Số điện thoại</label>
              <input style={editMode ? fieldStyle : fieldDisabledStyle} type="tel" value={editMode ? draft.phone : phone}
                onChange={e => setDraft(d => ({ ...d, phone: e.target.value }))} disabled={!editMode} />
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Địa chỉ</label>
            <input style={editMode ? fieldStyle : fieldDisabledStyle} value={editMode ? draft.address : address}
              onChange={e => setDraft(d => ({ ...d, address: e.target.value }))} disabled={!editMode} />
          </div>
          <div style={{ marginBottom: editMode ? 20 : 0 }}>
            <label style={labelStyle}>Giới thiệu</label>
            <textarea style={{ ...(editMode ? fieldStyle : fieldDisabledStyle), resize: 'vertical' }} rows={4}
              value={editMode ? draft.bio : bio}
              onChange={e => setDraft(d => ({ ...d, bio: e.target.value }))} disabled={!editMode} />
          </div>
          {editMode && (
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', paddingTop: 16, borderTop: \`1px solid \${BORDER}\` }}>
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
              <input style={fieldStyle} type="password" placeholder="••••••••" required
                value={pwForm.current} onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Mật khẩu mới</label>
              <input style={fieldStyle} type="password" placeholder="••••••••" required
                value={pwForm.newPw} onChange={e => setPwForm(f => ({ ...f, newPw: e.target.value }))} />
              <small style={{ fontSize: 12, color: TEXT_MUTED, display: 'block', marginTop: 6 }}>
                Tối thiểu 8 ký tự, bao gồm chữ hoa, chữ thường và số
              </small>
            </div>
            <div>
              <label style={labelStyle}>Xác nhận mật khẩu mới</label>
              <input style={fieldStyle} type="password" placeholder="••••••••" required
                value={pwForm.confirm} onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))} />
            </div>
            <div>
              <Button type="primary" danger htmlType="submit" icon={<LockOutlined />}>Đổi mật khẩu</Button>
            </div>
          </form>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={cardHeaderStyle}>
          <h3 style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>Phiên Đăng Nhập</h3>
        </div>
        <div style={cardBodyStyle}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {SESSIONS.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 16, background: SURFACE_ALT, borderRadius: 8, border: \`1px solid \${BORDER}\` }}>
                <div style={{ width: 48, height: 48, background: '#fff', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: PRIMARY, flexShrink: 0, border: \`1px solid \${BORDER}\`, fontSize: 20 }}>
                  {s.device.includes('iPhone') ? '📱' : '🖥️'}
                </div>
                <div style={{ flex: 1 }}>
                  <strong style={{ display: 'block', marginBottom: 4 }}>{s.device}</strong>
                  <div style={{ fontSize: 14, color: '#5a6170', marginBottom: 2 }}>{s.location} {s.current ? '• Phiên hiện tại' : ''}</div>
                  <small style={{ fontSize: 13, color: TEXT_MUTED }}>{s.time}</small>
                </div>
                {s.current
                  ? <Tag color="green">Đang hoạt động</Tag>
                  : <Button size="small" danger>Đăng xuất</Button>
                }
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  // ===== TAB ACTIVITY =====
  const activityTab = (
    <div style={cardStyle}>
      <div style={cardHeaderStyle}>
        <h3 style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>Lịch Sử Hoạt Động</h3>
      </div>
      <div style={cardBodyStyle}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {ACTIVITIES.map((a, i) => (
            <div key={i} style={{ display: 'flex', gap: 16, paddingBottom: 20, position: 'relative' }}>
              {i < ACTIVITIES.length - 1 && (
                <div style={{ position: 'absolute', left: 19, top: 42, width: 2, bottom: 0, background: BORDER }} />
              )}
              <div style={{ width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 14, ...ACTIVITY_ICON_STYLES[a.type] }}>
                {a.icon}
              </div>
              <div style={{ paddingTop: 4 }}>
                <strong style={{ display: 'block', marginBottom: 4, fontSize: 14 }}>{a.title}</strong>
                <div style={{ fontSize: 14, color: '#5a6170', marginBottom: 4 }}>{a.desc}</div>
                <small style={{ fontSize: 13, color: TEXT_MUTED }}>{a.time}</small>
              </div>
            </div>
          ))}
        </div>
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
          <Button type="primary" icon={<SaveOutlined />} onClick={() => message.success('Đã lưu cài đặt thông báo!')}>Lưu cài đặt</Button>
        </div>
      </div>
    </div>
  );

  return (
    <div>
      {/* Profile Banner */}
      <div style={{ height: 200, background: \`linear-gradient(135deg, \${PRIMARY} 0%, #0f5840 100%)\`, borderRadius: 12, marginBottom: 0, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, opacity: 0.08, backgroundImage: 'radial-gradient(circle at 20% 50%, white 0%, transparent 50%), radial-gradient(circle at 80% 20%, white 0%, transparent 40%)' }} />
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
`.trimStart(), 'utf8');
console.log('Profile.tsx written');
