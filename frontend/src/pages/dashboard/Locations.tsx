import { useState } from 'react';
import { Button, Tag, message, Input, Select, Checkbox, DatePicker, Modal, Divider } from 'antd';
import dayjs from 'dayjs';
import {
  PlusOutlined,
  EyeOutlined,
  EditOutlined,
  DeleteOutlined,
  EnvironmentOutlined,
} from '@ant-design/icons';
import { hasRole } from '../../hooks/useAuth';
import { useAdminLocations, type LocationStaffAssignment } from '../../hooks/useAdminLocations';
import { useAdminStaff } from '../../hooks/useAdminStaff';

interface Staff {
  id: string;
  initials: string;
  name: string;
  code: string;
  bgColor: string;
  textColor: string;
  uploadCount: number;
}

interface Location {
  id: string;
  name: string;
  address: string;
  date: string;
  description: string;
  status: 'published' | 'ready' | 'processing' | 'draft';
  photos: number;
  orders: number;
  revenue: string;
  gradient: string;
  thumbnailUrl: string | null;
  assignedStaff: string[];
}

const ALL_STAFF: Staff[] = [];
const MOCK_LOCATIONS: Location[] = [];

const COLORS = [
  { bg: '#fef3e8', text: '#d4870e' },
  { bg: '#e8f5f0', text: '#1a6b4e' },
  { bg: '#eff6ff', text: '#2563eb' },
  { bg: '#fee2e2', text: '#dc2626' },
  { bg: '#f5f5f5', text: '#888' },
];

const STATUS_BADGE: Record<string, { color: string; label: string }> = {
  published:  { color: 'success', label: 'Published' },
  ready:      { color: 'blue',    label: 'Ready' },
  processing: { color: 'warning', label: 'Processing' },
  draft:      { color: 'default', label: 'Draft' },
};

type ModalMode = 'create' | 'edit' | 'view' | 'delete' | null;

export default function Locations() {
  const { locations: apiLocations, create: createLocation, remove: deleteLocation, update: patchLocation, getLocationStaff, assignStaff, removeStaff } = useAdminLocations();
  const { staff: apiUsers } = useAdminStaff();

  const locations: Location[] = apiLocations.map(a => ({
    id: a.id,
    name: a.name,
    address: a.address ?? '',
    date: a.shoot_date ?? '',
    description: a.description ?? '',
    status: 'published' as const,
    photos: a.media_count,
    orders: 0,
    revenue: '-',
    gradient: 'linear-gradient(135deg, #1a6b4e 0%, #0f5840 100%)',
    thumbnailUrl: a.thumbnail_url ?? null,
    assignedStaff: (a.assigned_staff ?? []).map(s => s.id),
  }));

  const allStaff: Staff[] = apiUsers.map((u, i) => ({
    id: u.id,
    initials: (u.full_name ?? u.email).split(' ').map((w: string) => w[0]).slice(-2).join('').toUpperCase(),
    name: u.full_name ?? u.email,
    code: u.email.split('@')[0].toUpperCase().substring(0, 6),
    bgColor: COLORS[i % COLORS.length].bg,
    textColor: COLORS[i % COLORS.length].text,
    uploadCount: 0,
  }));

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterStaff, setFilterStaff] = useState('');
  const [sortBy, setSortBy] = useState('date-desc');
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [selectedLoc, setSelectedLoc] = useState<Location | null>(null);
  const [locToDelete, setLocToDelete] = useState<Location | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formDate, setFormDate] = useState('2026-03-04');
  const [formDescription, setFormDescription] = useState('');
  const [formStaff, setFormStaff] = useState<string[]>([]);
  const [originalStaff, setOriginalStaff] = useState<string[]>([]);

  const canCreateEdit = hasRole(['admin-system', 'admin-sales']);
  const canDelete = hasRole(['admin-system']);

  const filtered = locations
    .filter(l => {
      if (search && !l.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterStatus && l.status !== filterStatus) return false;
      if (filterStaff && !l.assignedStaff.includes(filterStaff)) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'name-asc') return a.name.localeCompare(b.name);
      if (sortBy === 'photos-desc') return b.photos - a.photos;
      if (sortBy === 'date-asc') return a.date.localeCompare(b.date);
      return b.date.localeCompare(a.date); // date-desc
    });

  function openCreate() {
    setFormName(''); setFormAddress(''); setFormDate('2026-03-04');
    setFormDescription(''); setFormStaff([]);
    setModalMode('create');
  }

  async function openEdit(loc: Location) {
    setSelectedLoc(loc);
    setFormName(loc.name); setFormAddress(loc.address);
    setFormDate(loc.date.split('/').reverse().join('-'));
    setFormDescription(loc.description);
    setFormStaff([]);
    setOriginalStaff([]);
    setModalMode('edit');
    try {
      const assignments = await getLocationStaff(loc.id);
      const staffIds = assignments.map((a: LocationStaffAssignment) => a.staff_id);
      setFormStaff(staffIds);
      setOriginalStaff(staffIds);
    } catch { /* ignore */ }
  }

  function openView(loc: Location) { setSelectedLoc(loc); setModalMode('view'); }

  function openDelete(loc: Location) { setLocToDelete(loc); setModalMode('delete'); }

  function closeModal() { setModalMode(null); setSelectedLoc(null); setLocToDelete(null); }

  function toggleStaff(id: string) {
    setFormStaff(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  }

  async function handleCreate() {
    if (!formName) { message.error('Vui lòng nhập tên địa điểm'); return; }
    try {
      const newLoc = await createLocation({ name: formName, description: formDescription || undefined, address: formAddress || undefined, shoot_date: formDate || undefined });
      // Assign selected staff
      for (const staffId of formStaff) {
        await assignStaff(newLoc.id, staffId, true);
      }
      message.success('Địa điểm đã được tạo thành công!');
      closeModal();
    } catch (err) { message.error(err instanceof Error ? err.message : 'Tạo thất bại'); }
  }

  async function handleSaveEdit() {
    if (!formName) { message.error('Vui lòng nhập tên địa điểm'); return; }
    try {
      if (selectedLoc) {
        await patchLocation(selectedLoc.id, { name: formName, description: formDescription || undefined, address: formAddress || undefined });
        // Update staff assignments: add new, remove old
        const toAdd = formStaff.filter(id => !originalStaff.includes(id));
        const toRemove = originalStaff.filter(id => !formStaff.includes(id));
        for (const staffId of toAdd) {
          await assignStaff(selectedLoc.id, staffId, true);
        }
        for (const staffId of toRemove) {
          await removeStaff(selectedLoc.id, staffId);
        }
      }
      message.success('Đã lưu thay đổi!');
      closeModal();
    } catch (err) { message.error(err instanceof Error ? err.message : 'Lưu thất bại'); }
  }

  async function handleConfirmDelete() {
    try {
      if (locToDelete) await deleteLocation(locToDelete.id);
      message.success(`Đã xóa địa điểm ${locToDelete?.name}!`);
      closeModal();
    } catch (err) { message.error(err instanceof Error ? err.message : 'Xóa thất bại'); }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', border: '1px solid #e2e5ea',
    borderRadius: 8, fontSize: 14, outline: 'none',
  };
  const formGroupStyle: React.CSSProperties = { marginBottom: 16 };
  const labelStyle: React.CSSProperties = { display: 'block', marginBottom: 6, fontWeight: 500, fontSize: 14 };

  function StaffTable() {
    return (
      <div>
        <div style={{ border: '1px solid #e2e5ea', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 90px', padding: '10px 16px',
            background: '#f6f7f9', fontSize: 12, fontWeight: 600, color: '#5a6170', textTransform: 'uppercase',
          }}>
            <span>Nhân viên</span>
            <span style={{ textAlign: 'center' }}>Được upload</span>
          </div>
          {allStaff.map(s => (
            <label key={s.id} style={{
              display: 'grid', gridTemplateColumns: '1fr 90px', padding: '12px 16px',
              borderTop: '1px solid #e2e5ea', cursor: 'pointer', alignItems: 'center',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', background: s.bgColor, color: s.textColor,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 12,
                }}>
                  {s.initials}
                </div>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{s.name}</div>
                  <div style={{ fontSize: 11, color: '#8b91a0' }}>{s.code} · Staff</div>
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <Checkbox
                  checked={formStaff.includes(s.id)}
                  onChange={() => toggleStaff(s.id)}
                />
              </div>
            </label>
          ))}
        </div>
        <div style={{
          marginTop: 12, padding: '10px 14px', background: '#eff6ff', borderRadius: 8,
          fontSize: 13, color: '#1e40af', border: '1px solid #bfdbfe',
        }}>
          <strong>Lưu ý:</strong> Staff chỉ xem được ảnh do chính mình upload tại địa điểm này. Không xem được ảnh của staff khác.
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Quản lý Địa Điểm</h1>
        {canCreateEdit && (
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Tạo Địa Điểm mới
          </Button>
        )}
      </div>

      {/* Filters */}
      <div style={{
        background: '#fff', borderRadius: 12, padding: 20,
        border: '1px solid #e2e5ea', marginBottom: 24,
      }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Input
            placeholder="Tìm địa điểm..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: 250 }}
          />
          <Select
            value={filterStatus || undefined}
            placeholder="Tất cả trạng thái"
            onChange={v => setFilterStatus(v || '')}
            allowClear
            style={{ width: 180 }}
          >
            <Select.Option value="published">Published</Select.Option>
            <Select.Option value="ready">Ready</Select.Option>
            <Select.Option value="processing">Processing</Select.Option>
            <Select.Option value="draft">Draft</Select.Option>
          </Select>
          <Select
            value={filterStaff || undefined}
            placeholder="Tất cả nhân viên"
            onChange={v => setFilterStaff(v || '')}
            allowClear
            style={{ width: 200 }}
          >
            {allStaff.map(s => (
              <Select.Option key={s.id} value={s.id}>{s.name} ({s.code})</Select.Option>
            ))}
          </Select>
          <Select value={sortBy} onChange={v => setSortBy(v)} style={{ width: 180 }}>
            <Select.Option value="date-desc">Mới nhất</Select.Option>
            <Select.Option value="date-asc">Cũ nhất</Select.Option>
            <Select.Option value="name-asc">Tên A-Z</Select.Option>
            <Select.Option value="photos-desc">Nhiều ảnh nhất</Select.Option>
          </Select>
        </div>
      </div>

      {/* Locations Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 24 }}>
        {filtered.map(loc => {
          const badge = STATUS_BADGE[loc.status];
          const assignedStaffData = allStaff.filter(s => loc.assignedStaff.includes(s.id));
          return (
            <div
              key={loc.id}
              style={{
                background: '#fff', borderRadius: 12, border: '1px solid #e2e5ea',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)', cursor: 'pointer', overflow: 'hidden',
                transition: 'box-shadow 0.2s',
              }}
              onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)')}
              onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)')}
              onClick={() => openView(loc)}
            >
              {/* Card header image */}
              <div style={{ height: 200, background: loc.gradient, position: 'relative', overflow: 'hidden' }}>
                {loc.thumbnailUrl && (
                  <img
                    src={loc.thumbnailUrl}
                    alt={loc.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', top: 0, left: 0 }}
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                )}
                <div style={{ position: 'absolute', top: 12, right: 12 }}>
                  <Tag color={badge.color}>{badge.label}</Tag>
                </div>
                <div style={{ position: 'absolute', bottom: 12, left: 12, color: '#fff' }}>
                  <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 4 }}>
                     {loc.date}
                  </div>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#fff' }}>{loc.name}</h3>
                </div>
              </div>

              {/* Card body */}
              <div style={{ padding: 16 }}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between', marginBottom: 12,
                  fontSize: 13, color: '#5a6170',
                }}>
                  <span> {loc.photos} ảnh</span>
                  <span> {loc.orders} đơn</span>
                  <span> {loc.revenue}</span>
                </div>

                {/* Assigned staff */}
                <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
                  {assignedStaffData.map(s => (
                    <span key={s.id} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '2px 8px', background: '#e8f5f0', color: '#1a6b4e',
                      borderRadius: 12, fontSize: 11, fontWeight: 500,
                    }}>
                       {s.name}
                    </span>
                  ))}
                  {assignedStaffData.length === 0 && (
                    <span style={{ fontSize: 12, color: '#8b91a0' }}>Chưa có nhân viên</span>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8 }} onClick={e => e.stopPropagation()}>
                  <Button
                    icon={<EyeOutlined />}
                    style={{ flex: 1 }}
                    onClick={() => openView(loc)}
                  >
                    Xem
                  </Button>
                  {canCreateEdit && (
                    <Button icon={<EditOutlined />} onClick={() => openEdit(loc)} />
                  )}
                  {canDelete && (
                    <Button danger icon={<DeleteOutlined />} onClick={() => openDelete(loc)} />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ─────── MODAL: TẠO ĐỊA ĐIỂM ─────── */}
      <Modal
        open={modalMode === 'create'}
        onCancel={closeModal}
        title="Tạo Địa Điểm mới"
        footer={[
          <Button key="cancel" onClick={closeModal}>Hủy</Button>,
          <Button key="create" type="primary" icon={<PlusOutlined />} onClick={handleCreate}>Tạo Địa Điểm</Button>,
        ]}
        width={600}
      >
        <div style={formGroupStyle}>
          <label style={labelStyle}>Tên Địa Điểm *</label>
          <Input placeholder="VD: Bà Nà Hills 20/02/2026" value={formName} onChange={e => setFormName(e.target.value)} />
        </div>
        <div style={formGroupStyle}>
          <label style={labelStyle}>Vị trí / Địa chỉ</label>
          <Input placeholder="VD: Bà Nà Hills, Đà Nẵng" value={formAddress} onChange={e => setFormAddress(e.target.value)} />
        </div>
        <div style={formGroupStyle}>
          <label style={labelStyle}>Ngày chụp *</label>
          <DatePicker
            value={formDate ? dayjs(formDate) : null}
            onChange={(val) => setFormDate(val ? val.format('YYYY-MM-DD') : '')}
            style={{ width: '100%' }}
            format="DD/MM/YYYY"
            placeholder="Chọn ngày chụp"
          />
        </div>
        <div style={formGroupStyle}>
          <label style={labelStyle}>Mô tả</label>
          <Input.TextArea style={{ minHeight: 80, resize: 'vertical' }} placeholder="Mô tả về địa điểm chụp..." value={formDescription} onChange={e => setFormDescription(e.target.value)} />
        </div>
        <Divider style={{ margin: '20px 0' }} />
        <div style={formGroupStyle}>
          <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6 }}>
            <EnvironmentOutlined /> Phân quyền nhân viên
          </label>
          <p style={{ fontSize: 13, color: '#8b91a0', marginBottom: 12 }}>
            Chọn nhân viên được quyền upload ảnh vào địa điểm này.
          </p>
          <StaffTable />
        </div>
      </Modal>

      {/* ─────── MODAL: SỬA ĐỊA ĐIỂM ─────── */}
      <Modal
        open={modalMode === 'edit'}
        onCancel={closeModal}
        title="Sửa Địa Điểm"
        footer={[
          <Button key="cancel" onClick={closeModal}>Hủy</Button>,
          <Button key="save" type="primary" onClick={handleSaveEdit}> Lưu thay đổi</Button>,
        ]}
        width={600}
      >
        <div style={formGroupStyle}>
          <label style={labelStyle}>Tên Địa Điểm *</label>
          <Input value={formName} onChange={e => setFormName(e.target.value)} />
        </div>
        <div style={formGroupStyle}>
          <label style={labelStyle}>Vị trí / Địa chỉ</label>
          <Input value={formAddress} onChange={e => setFormAddress(e.target.value)} />
        </div>
        <div style={formGroupStyle}>
          <label style={labelStyle}>Ngày chụp *</label>
          <DatePicker
            value={formDate ? dayjs(formDate) : null}
            onChange={(val) => setFormDate(val ? val.format('YYYY-MM-DD') : '')}
            style={{ width: '100%' }}
            format="DD/MM/YYYY"
            placeholder="Chọn ngày chụp"
          />
        </div>
        <div style={formGroupStyle}>
          <label style={labelStyle}>Mô tả</label>
          <Input.TextArea style={{ minHeight: 80, resize: 'vertical' }} value={formDescription} onChange={e => setFormDescription(e.target.value)} />
        </div>
        <Divider style={{ margin: '20px 0' }} />
        <div style={formGroupStyle}>
          <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6 }}>
            <EnvironmentOutlined /> Phân quyền nhân viên
          </label>
          <StaffTable />
          <p style={{ fontSize: 12, color: '#8b91a0', marginTop: 8 }}>
            Staff chỉ xem được ảnh do chính mình upload. Không xem được ảnh của staff khác.
          </p>
        </div>
      </Modal>

      {/* ─────── MODAL: XEM CHI TIẾT ─────── */}
      <Modal
        open={modalMode === 'view' && !!selectedLoc}
        onCancel={closeModal}
        title={selectedLoc ? `Chi tiết: ${selectedLoc.name}` : ''}
        footer={selectedLoc ? [
          <Button key="close" onClick={closeModal}>Đóng</Button>,
          canCreateEdit ? <Button key="edit" icon={<EditOutlined />} onClick={() => openEdit(selectedLoc)}>Sửa</Button> : null,
          canDelete ? <Button key="delete" danger icon={<DeleteOutlined />} onClick={() => openDelete(selectedLoc)}>Xóa</Button> : null,
        ] : []}
        width={650}
      >
        {selectedLoc && (
          <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Tag color={STATUS_BADGE[selectedLoc.status].color} style={{ fontSize: 13, padding: '3px 12px' }}>
                    {STATUS_BADGE[selectedLoc.status].label}
                  </Tag>
                  <span style={{ fontSize: 13, color: '#8b91a0' }}> Ngày chụp: {selectedLoc.date}</span>
                </div>
              </div>
              <div style={{ fontSize: 14, color: '#5a6170', marginBottom: 20 }}>
                 {selectedLoc.address}
              </div>

              {/* Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
                {[
                  { label: 'Tổng ảnh', value: selectedLoc.photos },
                  { label: 'Đơn hàng', value: selectedLoc.orders },
                  { label: 'Doanh thu', value: selectedLoc.revenue },
                  { label: 'Nhân viên', value: selectedLoc.assignedStaff.length },
                ].map(item => (
                  <div key={item.label} style={{
                    padding: 16, background: '#f6f7f9', borderRadius: 10, textAlign: 'center',
                  }}>
                    <div style={{ fontSize: 12, color: '#5a6170', marginBottom: 4 }}>{item.label}</div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#1a1d23' }}>{item.value}</div>
                  </div>
                ))}
              </div>

              {/* Assigned staff */}
              <div style={{ marginBottom: 20 }}>
                <h4 style={{ marginBottom: 12, fontSize: 14, fontWeight: 600 }}> Nhân viên được phân công</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {allStaff.filter(s => selectedLoc.assignedStaff.includes(s.id)).map(s => (
                    <div key={s.id} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: 12, background: '#f6f7f9', borderRadius: 8,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: '50%', background: s.bgColor, color: s.textColor,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 13,
                        }}>
                          {s.initials}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{s.name}</div>
                          <div style={{ fontSize: 12, color: '#8b91a0' }}>{s.code} · {s.uploadCount} ảnh uploaded</div>
                        </div>
                      </div>
                      <Tag color="success" style={{ fontSize: 11 }}>Upload </Tag>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: 12, color: '#8b91a0', marginTop: 8 }}>
                   Staff chỉ xem được ảnh do chính mình upload.
                </p>
              </div>

              {/* Description */}
              <div>
                <h4 style={{ marginBottom: 8, fontSize: 14, fontWeight: 600 }}>Mô tả</h4>
                <p style={{ fontSize: 14, color: '#5a6170', lineHeight: 1.6, margin: 0 }}>{selectedLoc.description}</p>
              </div>
          </div>
        )}
      </Modal>

      {/* ─────── MODAL: XÁC NHẬN XÓA ─────── */}
      <Modal
        open={modalMode === 'delete' && !!locToDelete}
        onCancel={closeModal}
        title={<span style={{ color: '#d63b3b' }}> Xác nhận xóa</span>}
        footer={locToDelete ? [
          <Button key="cancel" onClick={closeModal}>Hủy</Button>,
          <Button key="delete" danger icon={<DeleteOutlined />} onClick={handleConfirmDelete}>Xóa vĩnh viễn</Button>,
        ] : []}
        width={450}
      >
        {locToDelete && (
          <div>
            <div style={{
              padding: '12px 16px', background: '#fee2e2', borderRadius: 8,
              fontSize: 14, color: '#7f1d1d', marginBottom: 16, border: '1px solid #fca5a5',
            }}>
              <strong>Cảnh báo:</strong> Hành động này không thể hoàn tác!
            </div>
            <p style={{ margin: '0 0 12px', fontSize: 14 }}>
              Bạn có chắc muốn xóa địa điểm <strong>{locToDelete.name}</strong>?
            </p>
            <p style={{ margin: 0, fontSize: 13, color: '#8b91a0' }}>
              Tất cả ảnh trong địa điểm sẽ bị xóa vĩnh viễn. Các đơn hàng đã hoàn thành không bị ảnh hưởng.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
