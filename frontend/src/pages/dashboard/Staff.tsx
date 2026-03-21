import { useState } from 'react';
import { Input, Select, Button, Tag, message, Modal, Table, Tooltip } from 'antd';
import { SearchOutlined, PlusOutlined, EditOutlined, LockOutlined, UnlockOutlined, DeleteOutlined, SaveOutlined, ReloadOutlined } from '@ant-design/icons';
import { hasRole, getAvatarInitials } from '../../hooks/useAuth';
import { useAdminStaff } from '../../hooks/useAdminStaff';

const BORDER = '#e2e5ea';
const PRIMARY = '#1a6b4e';
const DANGER = '#d63b3b';
const SURFACE_ALT = '#f6f7f9';
const TEXT_MUTED = '#8b91a0';

type StaffRole = 'admin-system' | 'admin-sales' | 'manager' | 'staff';
type StaffStatus = 'active' | 'locked';

interface StaffMember {
  id: string; name: string; email: string; phone: string; role: StaffRole;
  uploads: string; joinDate: string; status: StaffStatus;
  employeeCode: string | null; venoPasswordHint: string | null;
}

const ROLE_REMAP: Record<string, StaffRole> = {
  SYSTEM: 'admin-system', SALES: 'admin-sales', MANAGER: 'manager', STAFF: 'staff',
};
const ROLE_MAP: Record<StaffRole, { color: string; label: string }> = {
  'admin-system': { color: 'red', label: 'Admin System' },
  'admin-sales': { color: 'blue', label: 'Admin Sales' },
  'manager': { color: 'green', label: 'Manager' },
  'staff': { color: 'default', label: 'Nhân viên' },
};
const ROLE_TO_BACKEND: Record<string, string> = {
  'admin-system': 'SYSTEM', 'admin-sales': 'SALES', 'manager': 'MANAGER', 'staff': 'STAFF',
};
const AVATAR_COLORS = [
  { bg: '#fee2e2', color: '#dc2626' }, { bg: '#eff6ff', color: '#2563eb' },
  { bg: '#fef3e8', color: '#d4870e' }, { bg: '#e8f5f0', color: '#1a854a' },
  { bg: SURFACE_ALT, color: TEXT_MUTED },
];

interface ModalState { open: boolean; item: StaffMember | null; }
interface StaffFormData { name: string; email: string; phone: string; role: string; password: string; }

export default function Staff() {
  const { staff: apiStaff, loading, createStaff, updateStaff, deleteStaff, resetVenoPassword } = useAdminStaff();
  const staff: StaffMember[] = apiStaff.map((u, i) => ({
    id: u.id,
    name: u.full_name ?? u.email,
    email: u.email,
    phone: '',
    role: ROLE_REMAP[u.role] ?? 'manager' as StaffRole,
    uploads: '—',
    joinDate: new Date(u.created_at).toLocaleDateString('vi-VN'),
    status: u.is_active ? 'active' : 'locked' as StaffStatus,
    employeeCode: u.employee_code ?? null,
    venoPasswordHint: u.veno_password_hint ?? null,
  }));
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [modal, setModal] = useState<ModalState>({ open: false, item: null });
  const [form, setForm] = useState<StaffFormData>({ name: '', email: '', phone: '', role: '', password: '' });
  const [formErr, setFormErr] = useState<Partial<StaffFormData>>({});

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
    const errors: Partial<StaffFormData> = {};
    if (!form.name.trim()) errors.name = 'Vui lòng nhập họ tên';
    if (!form.email.trim()) errors.email = 'Vui lòng nhập email';
    if (!form.role) errors.role = 'Vui lòng chọn vai trò';
    if (!modal.item && !form.password) errors.password = 'Vui lòng nhập mật khẩu';
    if (!modal.item && form.password && form.password.length < 8) errors.password = 'Mật khẩu phải có ít nhất 8 ký tự';
    setFormErr(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    try {
      if (modal.item) {
        await updateStaff(modal.item.id, {
          full_name: form.name,
          role: ROLE_TO_BACKEND[form.role] || form.role,
        });
        message.success('Đã cập nhật nhân viên thành công!');
      } else {
        await createStaff({
          email: form.email,
          password: form.password,
          full_name: form.name || undefined,
          role: ROLE_TO_BACKEND[form.role] || form.role,
        });
        message.success('Đã thêm nhân viên thành công!');
      }
      closeModal();
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Thao tác thất bại');
    }
  };

  const toggleLock = (s: StaffMember) => {
    const action = s.status === 'active' ? 'khóa' : 'mở khóa';
    Modal.confirm({
      title: `Xác nhận ${action} tài khoản`,
      content: `Bạn có chắc muốn ${action} tài khoản này?`,
      okText: action.charAt(0).toUpperCase() + action.slice(1),
      cancelText: 'Hủy',
      onOk: async () => {
        try {
          await updateStaff(s.id, { is_active: s.status === 'locked' });
          message.success(`Đã ${action} tài khoản`);
        } catch (err) {
          message.error(err instanceof Error ? err.message : 'Thao tác thất bại');
        }
      },
    });
  };

  const handleDelete = (s: StaffMember) => {
    Modal.confirm({
      title: 'Xóa nhân viên',
      content: 'Bạn có chắc muốn xóa nhân viên này? Hành động này không thể hoàn tác.',
      okText: 'Xóa',
      okType: 'danger',
      cancelText: 'Hủy',
      onOk: async () => {
        try {
          await deleteStaff(s.id);
          message.success('Đã xóa nhân viên');
        } catch (err) {
          message.error(err instanceof Error ? err.message : 'Xóa thất bại');
        }
      },
    });
  };

  const handleResetVeno = (s: StaffMember) => {
    Modal.confirm({
      title: 'Reset Veno Password',
      content: `Tạo mật khẩu Veno mới cho ${s.name}? Mật khẩu cũ sẽ không dùng được nữa.`,
      okText: 'Reset',
      cancelText: 'Hủy',
      onOk: async () => {
        try {
          const newPw = await resetVenoPassword(s.id);
          Modal.info({
            title: 'Mật khẩu Veno mới',
            content: (
              <div>
                <p>Mật khẩu mới cho <strong>{s.employeeCode}</strong>:</p>
                <code style={{ display: 'block', padding: '8px 12px', background: '#f5f5f5', borderRadius: 6, fontSize: 16, letterSpacing: 1, userSelect: 'all' }}>{newPw}</code>
                <p style={{ marginTop: 8, fontSize: 13, color: TEXT_MUTED }}>Hãy gửi mật khẩu này cho nhân viên.</p>
              </div>
            ),
          });
        } catch (err) {
          message.error(err instanceof Error ? err.message : 'Reset thất bại');
        }
      },
    });
  };

  const fieldStyle = { width: '100%', padding: '8px 12px', border: `1px solid ${BORDER}`, borderRadius: 6, fontSize: 14, outline: 'none', boxSizing: 'border-box' as const };
  const errStyle = { color: DANGER, fontSize: 12, marginTop: 4 };
  const labelStyle = { display: 'block' as const, fontWeight: 600, marginBottom: 6, fontSize: 14 };

  const renderModal = () => {
    const isEdit = !!modal.item;
    return (
      <Modal
        open={modal.open}
        onCancel={closeModal}
        title={isEdit ? 'Sửa thông tin nhân viên' : 'Thêm nhân viên mới'}
        footer={[<Button key="cancel" onClick={closeModal}>Hủy</Button>, <Button key="save" type="primary" icon={<SaveOutlined />} onClick={handleSave}>Lưu</Button>]}
        width={520}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '8px 0' }}>
          {/* Họ và tên */}
          <div>
            <label style={labelStyle}>Họ và tên <span style={{ color: DANGER }}>*</span></label>
            <Input status={formErr.name ? 'error' : ''} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="VD: Nguyễn Văn A" />
            {formErr.name && <div style={errStyle}>{formErr.name}</div>}
          </div>
          {/* Email */}
          <div>
            <label style={labelStyle}>Email <span style={{ color: DANGER }}>*</span></label>
            <Input status={formErr.email ? 'error' : ''} value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} type="email" placeholder="VD: staff@photopro.vn" />
            {formErr.email && <div style={errStyle}>{formErr.email}</div>}
          </div>
          {/* Số điện thoại */}
          <div>
            <label style={labelStyle}>Số điện thoại <span style={{ color: DANGER }}>*</span></label>
            <Input status={formErr.phone ? 'error' : ''} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} type="tel" placeholder="VD: 0901234567" />
            {formErr.phone && <div style={errStyle}>{formErr.phone}</div>}
          </div>
          {/* Vai trò */}
          <div>
            <label style={labelStyle}>Vai trò <span style={{ color: DANGER }}>*</span></label>
            <Select
              status={formErr.role ? 'error' : ''}
              value={form.role || undefined}
              placeholder="Chọn vai trò..."
              onChange={v => setForm(f => ({ ...f, role: v }))}
              style={{ width: '100%' }}
            >
              <Select.Option value="admin-sales">Admin Sales - Quản lý kinh doanh</Select.Option>
              <Select.Option value="manager">Manager - Chỉ xem (Read-only)</Select.Option>
              <Select.Option value="staff">Staff - Nhân viên upload ảnh</Select.Option>
            </Select>
            {formErr.role && <div style={errStyle}>{formErr.role}</div>}
          </div>
          {/* Mật khẩu */}
          <div>
            <label style={labelStyle}>Mật khẩu {!isEdit && <span style={{ color: DANGER }}>*</span>}{isEdit && <small style={{ color: TEXT_MUTED, fontWeight: 400 }}>(Để trống = không thay đổi)</small>}</label>
            <Input.Password
              status={formErr.password ? 'error' : ''}
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              placeholder={isEdit ? 'Để trống nếu không đổi mật khẩu' : 'Tối thiểu 8 ký tự'}
            />
            {formErr.password && <div style={errStyle}>{formErr.password}</div>}
          </div>
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
      </Modal>
    );
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Quản lý Nhân viên</h1>
        {canManage && <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal(null)}>Thêm nhân viên</Button>}
      </div>

      <div style={{ padding: '12px 16px', background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: 8, fontSize: 13, color: '#1d4ed8', marginBottom: 20, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <span style={{ fontSize: 16, flexShrink: 0 }}></span>
        <div><strong style={{ display: 'block', marginBottom: 4 }}>Chỉ Admin System mới có quyền quản lý nhân viên</strong>Trang này chỉ hiển thị cho Admin System. Admin Sales và Manager không thể truy cập.</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 24 }}>
        {stats.map(s => (
          <div key={s.label} style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: s.color }}>{s.val}</div>
            <div style={{ fontSize: 13, color: TEXT_MUTED, marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
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

      <Table
        size="middle"
        dataSource={filtered}
        rowKey="id"
        pagination={false}
        style={{ border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden' }}
        locale={{ emptyText: <div style={{ textAlign: 'center', padding: 40, color: TEXT_MUTED }}>Không tìm thấy nhân viên nào</div> }}
        onRow={s => ({ style: { opacity: s.status === 'locked' ? 0.7 : 1 } })}
        columns={[
          {
            title: 'Nhân viên', key: 'staff',
            render: (s: StaffMember) => {
              const avatarCol = AVATAR_COLORS[staff.indexOf(s) % AVATAR_COLORS.length] ?? { bg: SURFACE_ALT, color: TEXT_MUTED };
              return (
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
              );
            },
          },
          { title: 'Vai trò', key: 'role', render: (s: StaffMember) => <Tag color={ROLE_MAP[s.role].color}>{ROLE_MAP[s.role].label}</Tag> },
          { title: 'Số ảnh upload', key: 'uploads', render: (s: StaffMember) => <strong>{s.uploads}</strong> },
          { title: 'Ngày tham gia', key: 'joinDate', render: (s: StaffMember) => <span style={{ color: '#5a6170' }}>{s.joinDate}</span> },
          { title: 'Trạng thái', key: 'status', render: (s: StaffMember) => <Tag color={s.status === 'active' ? 'green' : 'default'}>{s.status === 'active' ? 'Hoạt động' : 'Đã khóa'}</Tag> },
          {
            title: 'Veno FM', key: 'veno', width: 180,
            render: (s: StaffMember) => {
              if (!s.employeeCode || !s.venoPasswordHint) return <span style={{ color: TEXT_MUTED, fontSize: 12 }}>—</span>;
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <code style={{ fontSize: 12, letterSpacing: 0.5 }}>
                    {s.venoPasswordHint}
                  </code>
                  <Tooltip title="Reset password">
                    <Button size="small" type="text" icon={<ReloadOutlined />} onClick={() => handleResetVeno(s)} />
                  </Tooltip>
                </div>
              );
            },
          },
          {
            title: 'Thao tác', key: 'actions',
            render: (s: StaffMember) => (
              <div style={{ display: 'flex', gap: 4 }}>
                {canManage && <Button size="small" icon={<EditOutlined />} onClick={() => openModal(s)} title="Sửa" />}
                {canManage && s.status === 'active' && <Button size="small" icon={<UnlockOutlined style={{ color: '#1a854a' }} />} onClick={() => toggleLock(s)} title="Khóa tài khoản" />}
                {canManage && s.status === 'locked' && <Button size="small" danger icon={<LockOutlined />} onClick={() => toggleLock(s)} title="Mở khóa tài khoản" />}
                {canManage && <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(s)} title="Xóa" />}
              </div>
            ),
          },
        ]}
      />

      {renderModal()}
    </div>
  );
}
