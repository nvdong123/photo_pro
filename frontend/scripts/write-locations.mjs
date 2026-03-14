import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const content = `import { useState } from 'react';
import { Button, Tag, message } from 'antd';
import {
  PlusOutlined,
  EyeOutlined,
  EditOutlined,
  DeleteOutlined,
  EnvironmentOutlined,
} from '@ant-design/icons';
import { hasRole } from '../../hooks/useAuth';

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
  assignedStaff: string[];
}

const ALL_STAFF: Staff[] = [
  { id: 'staff-1', initials: 'LC', name: 'Lê Văn C', code: 'NV001', bgColor: '#fef3e8', textColor: '#d4870e', uploadCount: 80 },
  { id: 'staff-2', initials: 'PD', name: 'Phạm Thị D', code: 'NV002', bgColor: '#e8f5f0', textColor: '#1a854a', uploadCount: 70 },
  { id: 'staff-3', initials: 'HE', name: 'Hoàng Văn E', code: 'NV003', bgColor: '#f5f5f5', textColor: '#888', uploadCount: 0 },
];

const MOCK_LOCATIONS: Location[] = [
  {
    id: 'loc-1',
    name: 'Bà Nà Hills 20/02',
    address: 'Bà Nà Hills, Đà Nẵng',
    date: '20/02/2026',
    description: 'Bộ ảnh chụp tại Bà Nà Hills ngày 20/02/2026. Thời tiết đẹp, ánh sáng tốt. Chủ yếu chụp khách du lịch khu vực Cầu Vàng và khu vui chơi.',
    status: 'published',
    photos: 150,
    orders: 120,
    revenue: '6M',
    gradient: 'linear-gradient(135deg, #1a6b4e 0%, #134a36 100%)',
    assignedStaff: ['staff-1', 'staff-2'],
  },
  {
    id: 'loc-2',
    name: 'Hội An 19/02',
    address: 'Hội An, Quảng Nam',
    date: '19/02/2026',
    description: 'Bộ ảnh chụp tại phố cổ Hội An ngày 19/02/2026.',
    status: 'published',
    photos: 200,
    orders: 98,
    revenue: '4.9M',
    gradient: 'linear-gradient(135deg, #2563eb 0%, #1e40af 100%)',
    assignedStaff: ['staff-1'],
  },
  {
    id: 'loc-3',
    name: 'Cầu Rồng 18/02',
    address: 'Cầu Rồng, Đà Nẵng',
    date: '18/02/2026',
    description: 'Bộ ảnh đêm tại Cầu Rồng ngày 18/02/2026.',
    status: 'processing',
    photos: 120,
    orders: 75,
    revenue: '3.75M',
    gradient: 'linear-gradient(135deg, #d4870e 0%, #92400e 100%)',
    assignedStaff: ['staff-2'],
  },
];

const STATUS_BADGE: Record<string, { color: string; label: string }> = {
  published:  { color: 'success', label: 'Published' },
  ready:      { color: 'blue',    label: 'Ready' },
  processing: { color: 'warning', label: 'Processing' },
  draft:      { color: 'default', label: 'Draft' },
};

type ModalMode = 'create' | 'edit' | 'view' | 'delete' | null;

function OverlayModal({ visible, onClose, children, maxWidth = 600 }: {
  visible: boolean; onClose: () => void; children: React.ReactNode; maxWidth?: number;
}) {
  if (!visible) return null;
  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div style={{
        background: '#fff', borderRadius: 12, width: '100%', maxWidth,
        maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}>
        {children}
      </div>
    </div>
  );
}

export default function Locations() {
  const [locations] = useState<Location[]>(MOCK_LOCATIONS);
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

  function openEdit(loc: Location) {
    setSelectedLoc(loc);
    setFormName(loc.name); setFormAddress(loc.address);
    setFormDate(loc.date.split('/').reverse().join('-'));
    setFormDescription(loc.description);
    setFormStaff([...loc.assignedStaff]);
    setModalMode('edit');
  }

  function openView(loc: Location) { setSelectedLoc(loc); setModalMode('view'); }

  function openDelete(loc: Location) { setLocToDelete(loc); setModalMode('delete'); }

  function closeModal() { setModalMode(null); setSelectedLoc(null); setLocToDelete(null); }

  function toggleStaff(id: string) {
    setFormStaff(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  }

  function handleCreate() {
    if (!formName || !formDate) { message.error('Vui lòng nhập tên địa điểm và ngày chụp'); return; }
    message.success('Địa điểm đã được tạo thành công!');
    closeModal();
  }

  function handleSaveEdit() {
    if (!formName) { message.error('Vui lòng nhập tên địa điểm'); return; }
    message.success('Đã lưu thay đổi!');
    closeModal();
  }

  function handleConfirmDelete() {
    message.success(\`Đã xóa địa điểm \${locToDelete?.name}!\`);
    closeModal();
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
          {ALL_STAFF.map(s => (
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
                <input
                  type="checkbox"
                  checked={formStaff.includes(s.id)}
                  onChange={() => toggleStaff(s.id)}
                  style={{ width: 18, height: 18 }}
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
          <input
            type="text"
            placeholder="Tìm địa điểm..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ ...inputStyle, flex: 1, minWidth: 250 }}
          />
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            style={{ ...inputStyle, width: 'auto' }}
          >
            <option value="">Tất cả trạng thái</option>
            <option value="published">Published</option>
            <option value="ready">Ready</option>
            <option value="processing">Processing</option>
            <option value="draft">Draft</option>
          </select>
          <select
            value={filterStaff}
            onChange={e => setFilterStaff(e.target.value)}
            style={{ ...inputStyle, width: 'auto' }}
          >
            <option value="">Tất cả nhân viên</option>
            {ALL_STAFF.map(s => (
              <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
            ))}
          </select>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            style={{ ...inputStyle, width: 'auto' }}
          >
            <option value="date-desc">Mới nhất</option>
            <option value="date-asc">Cũ nhất</option>
            <option value="name-asc">Tên A-Z</option>
            <option value="photos-desc">Nhiều ảnh nhất</option>
          </select>
        </div>
      </div>

      {/* Locations Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 24 }}>
        {filtered.map(loc => {
          const badge = STATUS_BADGE[loc.status];
          const assignedStaffData = ALL_STAFF.filter(s => loc.assignedStaff.includes(s.id));
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
              <div style={{ height: 200, background: loc.gradient, position: 'relative' }}>
                <div style={{ position: 'absolute', top: 12, right: 12 }}>
                  <Tag color={badge.color}>{badge.label}</Tag>
                </div>
                <div style={{ position: 'absolute', bottom: 12, left: 12, color: '#fff' }}>
                  <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 4 }}>
                    📅 {loc.date}
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
                  <span>🖼️ {loc.photos} ảnh</span>
                  <span>🛒 {loc.orders} đơn</span>
                  <span>💰 {loc.revenue}</span>
                </div>

                {/* Assigned staff */}
                <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
                  {assignedStaffData.map(s => (
                    <span key={s.id} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '2px 8px', background: '#e8f5f0', color: '#1a6b4e',
                      borderRadius: 12, fontSize: 11, fontWeight: 500,
                    }}>
                      👤 {s.name}
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
      <OverlayModal visible={modalMode === 'create'} onClose={closeModal}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e5ea', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Tạo Địa Điểm mới</h3>
          <button onClick={closeModal} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#5a6170' }}>✕</button>
        </div>
        <div style={{ padding: '20px 24px' }}>
          <div style={formGroupStyle}>
            <label style={labelStyle}>Tên Địa Điểm *</label>
            <input style={inputStyle} placeholder="VD: Bà Nà Hills 20/02/2026" value={formName} onChange={e => setFormName(e.target.value)} />
          </div>
          <div style={formGroupStyle}>
            <label style={labelStyle}>Vị trí / Địa chỉ</label>
            <input style={inputStyle} placeholder="VD: Bà Nà Hills, Đà Nẵng" value={formAddress} onChange={e => setFormAddress(e.target.value)} />
          </div>
          <div style={formGroupStyle}>
            <label style={labelStyle}>Ngày chụp *</label>
            <input type="date" style={inputStyle} value={formDate} onChange={e => setFormDate(e.target.value)} />
          </div>
          <div style={formGroupStyle}>
            <label style={labelStyle}>Mô tả</label>
            <textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} placeholder="Mô tả về địa điểm chụp..." value={formDescription} onChange={e => setFormDescription(e.target.value)} />
          </div>
          <hr style={{ margin: '20px 0', border: 'none', borderTop: '1px solid #e2e5ea' }} />
          <div style={formGroupStyle}>
            <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6 }}>
              <EnvironmentOutlined /> Phân quyền nhân viên
            </label>
            <p style={{ fontSize: 13, color: '#8b91a0', marginBottom: 12 }}>
              Chọn nhân viên được quyền upload ảnh vào địa điểm này.
            </p>
            <StaffTable />
          </div>
        </div>
        <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e5ea', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button onClick={closeModal}>Hủy</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>Tạo Địa Điểm</Button>
        </div>
      </OverlayModal>

      {/* ─────── MODAL: SỬA ĐỊA ĐIỂM ─────── */}
      <OverlayModal visible={modalMode === 'edit'} onClose={closeModal}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e5ea', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Sửa Địa Điểm</h3>
          <button onClick={closeModal} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#5a6170' }}>✕</button>
        </div>
        <div style={{ padding: '20px 24px' }}>
          <div style={formGroupStyle}>
            <label style={labelStyle}>Tên Địa Điểm *</label>
            <input style={inputStyle} value={formName} onChange={e => setFormName(e.target.value)} />
          </div>
          <div style={formGroupStyle}>
            <label style={labelStyle}>Vị trí / Địa chỉ</label>
            <input style={inputStyle} value={formAddress} onChange={e => setFormAddress(e.target.value)} />
          </div>
          <div style={formGroupStyle}>
            <label style={labelStyle}>Ngày chụp *</label>
            <input type="date" style={inputStyle} value={formDate} onChange={e => setFormDate(e.target.value)} />
          </div>
          <div style={formGroupStyle}>
            <label style={labelStyle}>Mô tả</label>
            <textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} value={formDescription} onChange={e => setFormDescription(e.target.value)} />
          </div>
          <hr style={{ margin: '20px 0', border: 'none', borderTop: '1px solid #e2e5ea' }} />
          <div style={formGroupStyle}>
            <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6 }}>
              <EnvironmentOutlined /> Phân quyền nhân viên
            </label>
            <StaffTable />
            <p style={{ fontSize: 12, color: '#8b91a0', marginTop: 8 }}>
              Staff chỉ xem được ảnh do chính mình upload. Không xem được ảnh của staff khác.
            </p>
          </div>
        </div>
        <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e5ea', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button onClick={closeModal}>Hủy</Button>
          <Button type="primary" onClick={handleSaveEdit}>💾 Lưu thay đổi</Button>
        </div>
      </OverlayModal>

      {/* ─────── MODAL: XEM CHI TIẾT ─────── */}
      <OverlayModal visible={modalMode === 'view' && !!selectedLoc} onClose={closeModal} maxWidth={650}>
        {selectedLoc && (
          <>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e5ea', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Chi tiết: {selectedLoc.name}</h3>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ padding: '20px 24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Tag color={STATUS_BADGE[selectedLoc.status].color} style={{ fontSize: 13, padding: '3px 12px' }}>
                    {STATUS_BADGE[selectedLoc.status].label}
                  </Tag>
                  <span style={{ fontSize: 13, color: '#8b91a0' }}>📅 Ngày chụp: {selectedLoc.date}</span>
                </div>
              </div>
              <div style={{ fontSize: 14, color: '#5a6170', marginBottom: 20 }}>
                📍 {selectedLoc.address}
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
                <h4 style={{ marginBottom: 12, fontSize: 14, fontWeight: 600 }}>👥 Nhân viên được phân công</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {ALL_STAFF.filter(s => selectedLoc.assignedStaff.includes(s.id)).map(s => (
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
                      <Tag color="success" style={{ fontSize: 11 }}>Upload ✓</Tag>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: 12, color: '#8b91a0', marginTop: 8 }}>
                  ℹ️ Staff chỉ xem được ảnh do chính mình upload.
                </p>
              </div>

              {/* Description */}
              <div>
                <h4 style={{ marginBottom: 8, fontSize: 14, fontWeight: 600 }}>Mô tả</h4>
                <p style={{ fontSize: 14, color: '#5a6170', lineHeight: 1.6, margin: 0 }}>{selectedLoc.description}</p>
              </div>
            </div>
            <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e5ea', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button onClick={closeModal}>Đóng</Button>
              {canCreateEdit && (
                <Button icon={<EditOutlined />} onClick={() => openEdit(selectedLoc)}>Sửa</Button>
              )}
              {canDelete && (
                <Button danger icon={<DeleteOutlined />} onClick={() => openDelete(selectedLoc)}>Xóa</Button>
              )}
            </div>
          </>
        )}
      </OverlayModal>

      {/* ─────── MODAL: XÁC NHẬN XÓA ─────── */}
      <OverlayModal visible={modalMode === 'delete' && !!locToDelete} onClose={closeModal} maxWidth={450}>
        {locToDelete && (
          <>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e5ea', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, color: '#d63b3b' }}>⚠️ Xác nhận xóa</h3>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ padding: '20px 24px' }}>
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
            <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e5ea', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button onClick={closeModal}>Hủy</Button>
              <Button danger icon={<DeleteOutlined />} onClick={handleConfirmDelete}>Xóa vĩnh viễn</Button>
            </div>
          </>
        )}
      </OverlayModal>
    </div>
  );
}
`;

const outPath = join(__dirname, '..', 'src', 'pages', 'dashboard', 'Locations.tsx');
writeFileSync(outPath, content, 'utf8');
console.log('✅ Written Locations.tsx');
