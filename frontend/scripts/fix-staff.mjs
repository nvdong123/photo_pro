import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
function write(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf8');
  console.log('Written:', path);
}
const base = 'c:/Users/datth/Downloads/photopro-react/src';

// ===== STAFF (fixed form) =====
write(`${base}/pages/dashboard/Staff.tsx`, `
import { useState } from 'react';
import { Input, Select, Button, Tag, message } from 'antd';
import { SearchOutlined, PlusOutlined, EditOutlined, LockOutlined, UnlockOutlined, DeleteOutlined, SaveOutlined } from '@ant-design/icons';
import { hasRole, getAvatarInitials } from '../../hooks/useAuth';

const BORDER = '#e2e5ea';
const PRIMARY = '#1a6b4e';
const DANGER = '#d63b3b';
const SURFACE_ALT = '#f6f7f9';
const TEXT_MUTED = '#8b91a0';

type StaffRole = 'admin-system' | 'admin-sales' | 'manager' | 'staff';
type StaffStatus = 'active' | 'locked';

interface StaffMember {
  id: number; name: string; email: string; phone: string; role: StaffRole;
  uploads: string; joinDate: string; status: StaffStatus;
}

const AVATAR_COLORS: Record<number, { bg: string; color: string }> = {
  1: { bg: '#fee2e2', color: '#dc2626' },
  2: { bg: '#eff6ff', color: '#2563eb' },
  3: { bg: '#fef3e8', color: '#d4870e' },
  4: { bg: '#e8f5f0', color: '#1a854a' },
  5: { bg: SURFACE_ALT, color: TEXT_MUTED },
};

const ROLE_MAP: Record<StaffRole, { color: string; label: string }> = {
  'admin-system': { color: 'red', label: 'Admin System' },
  'admin-sales': { color: 'volcano', label: 'Admin Sales' },
  'manager': { color: 'blue', label: 'Manager' },
  'staff': { color: 'green', label: 'Staff' },
};

const INITIAL_STAFF: StaffMember[] = [
  { id: 1, name: 'Nguyễn Văn A', email: 'admin@photopro.vn', phone: '0901234567', role: 'admin-sales', uploads: '3,200 ảnh', joinDate: '01/01/2026', status: 'active' },
  { id: 2, name: 'Trần Thị B', email: 'manager@photopro.vn', phone: '0912345678', role: 'manager', uploads: '0 ảnh', joinDate: '15/01/2026', status: 'active' },
  { id: 3, name: 'Lê Văn C', email: 'staff1@photopro.vn', phone: '0923456789', role: 'staff', uploads: '2,800 ảnh', joinDate: '20/01/2026', status: 'active' },
  { id: 4, name: 'Phạm Thị D', email: 'staff2@photopro.vn', phone: '0934567890', role: 'staff', uploads: '2,450 ảnh', joinDate: '25/01/2026', status: 'active' },
  { id: 5, name: 'Hoàng Văn E', email: 'staff3@photopro.vn', phone: '0945678901', role: 'staff', uploads: '0 ảnh', joinDate: '10/02/2026', status: 'locked' },
];

interface ModalState { open: boolean; item: StaffMember | null; }
interface FormData { name: string; email: string; phone: string; role: string; password: string; }

export default function Staff() {
  const [staff, setStaff] = useState<StaffMember[]>(INITIAL_STAFF);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [modal, setModal] = useState<ModalState>({ open: false, item: null });
  const [form, setForm] = useState<FormData>({ name: '', email: '', phone: '', role: '', password: '' });
  const [formErr, setFormErr] = useState<Partial<FormData>>({});

  const canManage = hasRole(['admin-system']);

  const stats = [
    { label: 'Tổng nhân viên', val: staff.length, color: PRIMARY },
    { label: 'Đang hoạt động', val: staff.filter(s => s.status === 'active').length, color: '#1a854a' },
    { label: 'Đã khóa', val: staff.filter(s => s.status === 'locked').length, color: DANGER },
    { label: 'Tổng ảnh upload', val: '8,450', color: '#d4870e' },
  ];

  const filtered = staff
    .filter(s => !roleFilter || s.role === roleFilter)
    .filter(s => !statusFilter || s.status === statusFilter)
    .filter(s => !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.email.toLowerCase().includes(search.toLowerCase()) || s.phone.includes(search));

  const openModal = (item: StaffMember | null) => {
    setModal({ open: true, item });
    setFormErr({});
    if (item) setForm({ name: item.name, email: item.email, phone: item.phone, role: item.role, password: '' });
    else setForm({ name: '', email: '', phone: '', role: '', password: '' });
  };

  const closeModal = () => { setModal({ open: false, item: null }); setFormErr({}); };

  const validate = (): boolean => {
    const errors: Partial<FormData> = {};
    if (!form.name.trim()) errors.name = 'Vui lòng nhập họ tên';
    if (!form.email.trim()) errors.email = 'Vui lòng nhập email';
    if (!form.phone.trim()) errors.phone = 'Vui lòng nhập số điện thoại';
    if (!form.role) errors.role = 'Vui lòng chọn vai trò';
    if (!modal.item && !form.password) errors.password = 'Vui lòng nhập mật khẩu';
    if (!modal.item && form.password && form.password.length < 8) errors.password = 'Mật khẩu phải có ít nhất 8 ký tự';
    setFormErr(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;
    if (modal.item) {
      setStaff(p => p.map(s => s.id === modal.item!.id ? { ...s, name: form.name, email: form.email, phone: form.phone, role: form.role as StaffRole } : s));
      message.success('Đã cập nhật nhân viên thành công!');
    } else {
      const newStaff: StaffMember = { id: Date.now(), name: form.name, email: form.email, phone: form.phone, role: form.role as StaffRole, uploads: '0 ảnh', joinDate: new Date().toLocaleDateString('vi-VN'), status: 'active' };
      setStaff(p => [...p, newStaff]);
      message.success('Đã thêm nhân viên thành công!');
    }
    closeModal();
  };

  const toggleLock = (s: StaffMember) => {
    const action = s.status === 'active' ? 'khóa' : 'mở khóa';
    if (window.confirm(\`Bạn có chắc muốn \${action} tài khoản này?\`)) {
      setStaff(p => p.map(x => x.id === s.id ? { ...x, status: x.status === 'active' ? 'locked' : 'active' } : x));
      message.success(\`Đã \${action} tài khoản\`);
    }
  };

  const handleDelete = (s: StaffMember) => {
    if (window.confirm('Bạn có chắc muốn xóa nhân viên này? Hành động này không thể hoàn tác.')) {
      setStaff(p => p.filter(x => x.id !== s.id));
      message.success('Đã xóa nhân viên');
    }
  };

  const fieldStyle = { width: '100%', padding: '8px 12px', border: \`1px solid \${BORDER}\`, borderRadius: 6, fontSize: 14, outline: 'none', boxSizing: 'border-box' as const };
  const errStyle = { color: DANGER, fontSize: 12, marginTop: 4 };
  const labelStyle = { display: 'block' as const, fontWeight: 600, marginBottom: 6, fontSize: 14 };

  const renderModal = () => {
    if (!modal.open) return null;
    const isEdit = !!modal.item;
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={e => { if (e.target === e.currentTarget) closeModal(); }}>
        <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: \`1px solid \${BORDER}\` }}>
            <h3 style={{ margin: 0, fontWeight: 700, fontSize: 16 }}>{isEdit ? 'Sửa thông tin nhân viên' : 'Thêm nhân viên mới'}</h3>
            <button onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#5a6170', lineHeight: 1, padding: 4 }}>×</button>
          </div>
          <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Họ và tên */}
            <div>
              <label style={labelStyle}>Họ và tên <span style={{ color: DANGER }}>*</span></label>
              <input style={{ ...fieldStyle, borderColor: formErr.name ? DANGER : BORDER }} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="VD: Nguyễn Văn A" />
              {formErr.name && <div style={errStyle}>{formErr.name}</div>}
            </div>
            {/* Email */}
            <div>
              <label style={labelStyle}>Email <span style={{ color: DANGER }}>*</span></label>
              <input style={{ ...fieldStyle, borderColor: formErr.email ? DANGER : BORDER }} value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} type="email" placeholder="VD: staff@photopro.vn" />
              {formErr.email && <div style={errStyle}>{formErr.email}</div>}
            </div>
            {/* Số điện thoại */}
            <div>
              <label style={labelStyle}>Số điện thoại <span style={{ color: DANGER }}>*</span></label>
              <input style={{ ...fieldStyle, borderColor: formErr.phone ? DANGER : BORDER }} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} type="tel" placeholder="VD: 0901234567" />
              {formErr.phone && <div style={errStyle}>{formErr.phone}</div>}
            </div>
            {/* Vai trò */}
            <div>
              <label style={labelStyle}>Vai trò <span style={{ color: DANGER }}>*</span></label>
              <select style={{ ...fieldStyle, borderColor: formErr.role ? DANGER : BORDER }} value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                <option value="">Chọn vai trò...</option>
                <option value="admin-sales">Admin Sales - Quản lý kinh doanh</option>
                <option value="manager">Manager - Chỉ xem (Read-only)</option>
                <option value="staff">Staff - Nhân viên upload ảnh</option>
              </select>
              {formErr.role && <div style={errStyle}>{formErr.role}</div>}
            </div>
            {/* Mật khẩu (chỉ khi tạo mới) */}
            {!isEdit && (
              <div>
                <label style={labelStyle}>Mật khẩu <span style={{ color: DANGER }}>*</span></label>
                <input style={{ ...fieldStyle, borderColor: formErr.password ? DANGER : BORDER }} value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} type="password" placeholder="Tối thiểu 8 ký tự" />
                {formErr.password && <div style={errStyle}>{formErr.password}</div>}
              </div>
            )}
            {/* Info alert */}
            <div style={{ padding: '12px 16px', background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: 8, fontSize: 13, color: '#1d4ed8' }}>
              <strong>Phân quyền:</strong>
              <ul style={{ margin: '8px 0 0 20px', paddingLeft: 0, fontSize: 13 }}>
                <li style={{ marginBottom: 4 }}><strong>Admin Sales:</strong> Quản lý albums, đơn hàng, giá, xem doanh thu</li>
                <li style={{ marginBottom: 4 }}><strong>Manager:</strong> Chỉ xem dashboard và doanh thu (không sửa/xóa)</li>
                <li><strong>Staff:</strong> Upload ảnh, gắn tag, xem đơn hàng</li>
              </ul>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '16px 24px', borderTop: \`1px solid \${BORDER}\` }}>
            <Button onClick={closeModal}>Hủy</Button>
            <Button type="primary" icon={<SaveOutlined />} onClick={handleSave}>Lưu</Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Quản lý Nhân viên</h1>
        {canManage && <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal(null)}>Thêm nhân viên</Button>}
      </div>

      <div style={{ padding: '12px 16px', background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: 8, fontSize: 13, color: '#1d4ed8', marginBottom: 20, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <span style={{ fontSize: 16, flexShrink: 0 }}>ℹ️</span>
        <div><strong style={{ display: 'block', marginBottom: 4 }}>Chỉ Admin System mới có quyền quản lý nhân viên</strong>Trang này chỉ hiển thị cho Admin System. Admin Sales và Manager không thể truy cập.</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 24 }}>
        {stats.map(s => (
          <div key={s.label} style={{ background: '#fff', border: \`1px solid \${BORDER}\`, borderRadius: 12, padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: s.color }}>{s.val}</div>
            <div style={{ fontSize: 13, color: TEXT_MUTED, marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ background: '#fff', border: \`1px solid \${BORDER}\`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Input prefix={<SearchOutlined />} placeholder="Tìm theo tên, email, SĐT..." style={{ flex: 1, minWidth: 250 }} value={search} onChange={e => setSearch(e.target.value)} />
          <Select value={roleFilter || undefined} placeholder="Tất cả vai trò" onChange={v => setRoleFilter(v || '')} allowClear style={{ width: 180 }}>
            <Select.Option value="admin-sales">Admin Sales</Select.Option>
            <Select.Option value="manager">Manager</Select.Option>
            <Select.Option value="staff">Staff</Select.Option>
          </Select>
          <Select value={statusFilter || undefined} placeholder="Tất cả trạng thái" onChange={v => setStatusFilter(v || '')} allowClear style={{ width: 180 }}>
            <Select.Option value="active">Hoạt động</Select.Option>
            <Select.Option value="locked">Đã khóa</Select.Option>
          </Select>
        </div>
      </div>

      <div style={{ background: '#fff', border: \`1px solid \${BORDER}\`, borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: SURFACE_ALT }}>
              {['Nhân viên', 'Vai trò', 'Số ảnh upload', 'Ngày tham gia', 'Trạng thái', 'Thao tác'].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#5a6170', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(s => {
              const avatarCol = AVATAR_COLORS[s.id] || { bg: SURFACE_ALT, color: TEXT_MUTED };
              return (
                <tr key={s.id} style={{ borderTop: \`1px solid \${BORDER}\`, opacity: s.status === 'locked' ? 0.7 : 1 }}>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 20, background: avatarCol.bg, color: avatarCol.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13 }}>
                        {getAvatarInitials(s.name)}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600 }}>{s.name}</div>
                        <div style={{ fontSize: 12, color: TEXT_MUTED }}>{s.email}</div>
                        <div style={{ fontSize: 12, color: TEXT_MUTED }}>{s.phone}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px' }}><Tag color={ROLE_MAP[s.role].color}>{ROLE_MAP[s.role].label}</Tag></td>
                  <td style={{ padding: '12px 16px' }}><strong>{s.uploads}</strong></td>
                  <td style={{ padding: '12px 16px', color: '#5a6170' }}>{s.joinDate}</td>
                  <td style={{ padding: '12px 16px' }}><Tag color={s.status === 'active' ? 'green' : 'default'}>{s.status === 'active' ? 'Hoạt động' : 'Đã khóa'}</Tag></td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {canManage && <Button size="small" icon={<EditOutlined />} onClick={() => openModal(s)} title="Sửa" />}
                      {canManage && s.status === 'active' && <Button size="small" danger icon={<LockOutlined />} onClick={() => toggleLock(s)} title="Khóa" />}
                      {canManage && s.status === 'locked' && <Button size="small" type="primary" icon={<UnlockOutlined />} onClick={() => toggleLock(s)} title="Mở khóa" />}
                      {canManage && <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(s)} title="Xóa" />}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: TEXT_MUTED }}>Không tìm thấy nhân viên nào</div>}
      </div>

      {renderModal()}
    </div>
  );
}
`.trimStart());
console.log('Staff.tsx done');
