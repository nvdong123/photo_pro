import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const content = `import { useState } from 'react';
import { Button, Tag, message } from 'antd';
import {
  EyeOutlined,
  DownloadOutlined,
  BarChartOutlined,
} from '@ant-design/icons';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip as ChartTooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { hasRole, getUser } from '../../hooks/useAuth';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, ChartTooltip, Legend);

interface StaffStat {
  id: string;
  initials: string;
  name: string;
  email: string;
  code: string;
  bgColor: string;
  textColor: string;
  photosUploaded: number;
  photosSold: number;
  conversionRate: number;
  revenueMonth: string;
  revenueTotal: string;
  locations: string[];
  status: 'active' | 'inactive';
  lastUpload: string;
  joinDate: string;
  avgRevPerPhoto: string;
  pendingPhotos: number;
}

const MOCK_STATS: StaffStat[] = [
  {
    id: 'staff-1', initials: 'LC', name: 'Lê Văn C', email: 'staff1@photopro.vn',
    code: 'NV001', bgColor: '#fef3e8', textColor: '#d4870e',
    photosUploaded: 2800, photosSold: 1200, conversionRate: 42.8,
    revenueMonth: '12M', revenueTotal: '60M',
    locations: ['Bà Nà', 'Hội An'], status: 'active',
    lastUpload: '03/03/2026', joinDate: '01/01/2025',
    avgRevPerPhoto: '50,000đ', pendingPhotos: 3,
  },
  {
    id: 'staff-2', initials: 'PD', name: 'Phạm Thị D', email: 'staff2@photopro.vn',
    code: 'NV002', bgColor: '#e8f5f0', textColor: '#1a854a',
    photosUploaded: 2450, photosSold: 980, conversionRate: 40.0,
    revenueMonth: '9.8M', revenueTotal: '49M',
    locations: ['Bà Nà', 'Cầu Rồng'], status: 'active',
    lastUpload: '02/03/2026', joinDate: '15/02/2025',
    avgRevPerPhoto: '50,000đ', pendingPhotos: 0,
  },
  {
    id: 'staff-3', initials: 'NA', name: 'Nguyễn Văn A', email: 'staff3@photopro.vn',
    code: 'NV003', bgColor: '#eff6ff', textColor: '#2563eb',
    photosUploaded: 1800, photosSold: 720, conversionRate: 40.0,
    revenueMonth: '7.2M', revenueTotal: '36M',
    locations: ['Hội An'], status: 'active',
    lastUpload: '01/03/2026', joinDate: '01/03/2025',
    avgRevPerPhoto: '50,000đ', pendingPhotos: 0,
  },
  {
    id: 'staff-4', initials: 'HE', name: 'Hoàng Văn E', email: 'staff4@photopro.vn',
    code: 'NV004', bgColor: '#f5f5f5', textColor: '#888',
    photosUploaded: 0, photosSold: 0, conversionRate: 0,
    revenueMonth: '0', revenueTotal: '0',
    locations: [], status: 'inactive',
    lastUpload: '—', joinDate: '10/03/2025',
    avgRevPerPhoto: '—', pendingPhotos: 0,
  },
];

const CHART_LABELS = ['01/03', '02/03', '03/03', '04/03', '05/03', '06/03', '07/03'];

const ADMIN_CHART_DATA = {
  labels: CHART_LABELS,
  datasets: [{
    label: 'Doanh thu (VNĐ)',
    data: [1200000, 850000, 1500000, 900000, 1100000, 750000, 850000],
    backgroundColor: 'rgba(26, 107, 78, 0.7)',
    borderColor: '#1a6b4e',
    borderWidth: 1,
    borderRadius: 4,
  }],
};

const STAFF_CHART_DATA = {
  labels: CHART_LABELS,
  datasets: [{
    label: 'Doanh thu (VNĐ)',
    data: [650000, 480000, 920000, 750000, 850000, 600000, 850000],
    backgroundColor: 'rgba(26, 107, 78, 0.15)',
    borderColor: '#1a6b4e',
    borderWidth: 2,
    borderRadius: 6,
    hoverBackgroundColor: 'rgba(26, 107, 78, 0.35)',
  }],
};

const CHART_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    y: {
      beginAtZero: true,
      ticks: {
        callback: (value: string | number) => {
          return (Number(value) / 1000000).toFixed(1) + 'M';
        },
      },
    },
    x: { grid: { display: false } },
  },
} as const;

function OverlayModal({ visible, onClose, children, maxWidth = 750 }: {
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

// ───── ADMIN VIEW ─────
function AdminView() {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [sortBy, setSortBy] = useState('revenue-desc');
  const [selectedStat, setSelectedStat] = useState<StaffStat | null>(null);

  const inputStyle: React.CSSProperties = {
    padding: '10px 12px', border: '1px solid #e2e5ea', borderRadius: 8,
    fontSize: 14, outline: 'none',
  };

  const filtered = MOCK_STATS
    .filter(s => {
      if (search && !s.name.toLowerCase().includes(search.toLowerCase()) && !s.code.includes(search)) return false;
      if (filterStatus && s.status !== filterStatus) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'revenue-asc') return parseFloat(a.revenueTotal) - parseFloat(b.revenueTotal);
      if (sortBy === 'photos-desc') return b.photosUploaded - a.photosUploaded;
      if (sortBy === 'sold-desc') return b.photosSold - a.photosSold;
      if (sortBy === 'rate-desc') return b.conversionRate - a.conversionRate;
      return parseFloat(b.revenueTotal) - parseFloat(a.revenueTotal);
    });

  const totalPhotos = MOCK_STATS.reduce((s, x) => s + x.photosUploaded, 0).toLocaleString();
  const totalSold = MOCK_STATS.reduce((s, x) => s + x.photosSold, 0).toLocaleString();
  const avgRate = (MOCK_STATS.reduce((s, x) => s + x.conversionRate, 0) / MOCK_STATS.filter(x => x.status === 'active').length).toFixed(1) + '%';

  return (
    <div>
      {/* Summary Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Tổng nhân viên', value: MOCK_STATS.length, icon: '👥', color: '#1a6b4e' },
          { label: 'Tổng ảnh upload', value: totalPhotos, icon: '🖼️', sub: '+320 tháng này', color: '#1a854a' },
          { label: 'Tổng ảnh bán', value: totalSold, icon: '🛒', sub: '+15% so với kỳ trước', color: '#d4870e' },
          { label: 'Tỉ lệ chuyển đổi TB', value: avgRate, icon: '📊', color: '#2563eb' },
        ].map(item => (
          <div key={item.label} style={{
            background: '#fff', borderRadius: 12, padding: 20,
            border: '1px solid #e2e5ea', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>{item.icon}</div>
            <div style={{ fontSize: 12, color: '#5a6170', marginBottom: 4 }}>{item.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: item.color }}>{item.value}</div>
            {item.sub && <div style={{ fontSize: 12, color: '#1a854a', marginTop: 4 }}>↑ {item.sub}</div>}
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #e2e5ea', marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <input
            type="text" placeholder="Tìm theo tên, mã NV..." value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ ...inputStyle, flex: 1, minWidth: 250 }}
          />
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={inputStyle}>
            <option value="">Tất cả trạng thái</option>
            <option value="active">Đang hoạt động</option>
            <option value="inactive">Đã khóa</option>
          </select>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={inputStyle}>
            <option value="revenue-desc">Doanh thu cao → thấp</option>
            <option value="revenue-asc">Doanh thu thấp → cao</option>
            <option value="photos-desc">Ảnh upload nhiều → ít</option>
            <option value="sold-desc">Ảnh bán nhiều → ít</option>
            <option value="rate-desc">Tỉ lệ chuyển đổi cao → thấp</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e5ea', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f6f7f9' }}>
                {['#', 'Nhân viên', 'Mã NV', 'Ảnh upload', 'Ảnh bán', 'Tỉ lệ', 'DT tháng', 'Tổng DT', 'Địa điểm', 'Thao tác']
                  .map(h => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#5a6170', whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, i) => (
                <tr
                  key={s.id}
                  style={{ borderTop: '1px solid #e2e5ea', cursor: 'pointer', opacity: s.status === 'inactive' ? 0.6 : 1 }}
                  onClick={() => setSelectedStat(s)}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f6f7f9')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ padding: '12px 16px', fontSize: 14 }}>{i + 1}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: '50%', background: s.bgColor, color: s.textColor,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 13, flexShrink: 0,
                      }}>
                        {s.initials}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{s.name}</div>
                        <div style={{ fontSize: 11, color: '#8b91a0' }}>{s.email}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <code style={{ background: '#f6f7f9', padding: '2px 8px', borderRadius: 4, fontSize: 13 }}>{s.code}</code>
                  </td>
                  <td style={{ padding: '12px 16px', fontWeight: 600 }}>{s.photosUploaded.toLocaleString()}</td>
                  <td style={{ padding: '12px 16px', fontWeight: 600 }}>{s.photosSold.toLocaleString()}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 40, height: 6, background: '#e2e5ea', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: \`\${s.conversionRate}%\`, height: '100%', background: '#1a854a', borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{s.conversionRate}%</span>
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', fontWeight: 600, color: '#1a6b4e' }}>{s.revenueMonth}</td>
                  <td style={{ padding: '12px 16px', fontWeight: 600 }}>{s.revenueTotal}</td>
                  <td style={{ padding: '12px 16px' }}>
                    {s.locations.length > 0 ? (
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {s.locations.map(l => (
                          <Tag key={l} color="blue" style={{ fontSize: 10, padding: '1px 6px' }}>{l}</Tag>
                        ))}
                      </div>
                    ) : (
                      <Tag color="default" style={{ fontSize: 10 }}>Đã khóa</Tag>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px' }} onClick={e => e.stopPropagation()}>
                    <Button
                      icon={<EyeOutlined />}
                      size="small"
                      onClick={() => setSelectedStat(s)}
                      title="Xem chi tiết"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Modal */}
      <OverlayModal visible={!!selectedStat} onClose={() => setSelectedStat(null)}>
        {selectedStat && (
          <>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e5ea', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%', background: selectedStat.bgColor, color: selectedStat.textColor,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 15,
                }}>
                  {selectedStat.initials}
                </div>
                <div>
                  <h3 style={{ margin: 0 }}>Thống kê: {selectedStat.name}</h3>
                  <div style={{ fontSize: 12, color: '#8b91a0' }}>Mã NV: {selectedStat.code} · Staff</div>
                </div>
              </div>
              <button onClick={() => setSelectedStat(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ padding: '20px 24px' }}>
              {/* Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
                {[
                  { label: 'Ảnh upload', value: selectedStat.photosUploaded.toLocaleString(), color: '#1a6b4e' },
                  { label: 'Ảnh đã bán', value: selectedStat.photosSold.toLocaleString(), color: '#1a854a' },
                  { label: 'Tỉ lệ chuyển đổi', value: selectedStat.conversionRate + '%', color: '#1a1d23' },
                  { label: 'Tổng doanh thu', value: selectedStat.revenueTotal, color: '#d4870e' },
                ].map(item => (
                  <div key={item.label} style={{ padding: 16, background: '#f6f7f9', borderRadius: 10, textAlign: 'center' }}>
                    <div style={{ fontSize: 12, color: '#5a6170', marginBottom: 4 }}>{item.label}</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: item.color }}>{item.value}</div>
                  </div>
                ))}
              </div>

              {/* Revenue chart */}
              <div style={{ marginBottom: 20 }}>
                <h4 style={{ marginBottom: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <BarChartOutlined /> Doanh thu theo khoảng thời gian
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
                  {[
                    { label: 'Hôm nay', value: '850K' },
                    { label: 'Tháng này', value: selectedStat.revenueMonth },
                    { label: 'Năm nay', value: selectedStat.revenueTotal },
                  ].map(p => (
                    <div key={p.label} style={{ padding: 12, background: '#f6f7f9', borderRadius: 8, textAlign: 'center' }}>
                      <div style={{ fontSize: 12, color: '#8b91a0', marginBottom: 4 }}>{p.label}</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: '#1a6b4e' }}>{p.value}</div>
                    </div>
                  ))}
                </div>
                <div style={{ background: '#f6f7f9', borderRadius: 8, padding: 16, height: 220 }}>
                  <Bar data={ADMIN_CHART_DATA} options={CHART_OPTIONS} />
                </div>
              </div>

              {/* Locations + Quick Info */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <h4 style={{ marginBottom: 12, fontWeight: 600 }}>📍 Địa điểm phân công</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {selectedStat.locations.map(l => (
                      <div key={l} style={{ padding: '10px 12px', background: '#f6f7f9', borderRadius: 8, display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontWeight: 500 }}>{l}</span>
                      </div>
                    ))}
                    {selectedStat.locations.length === 0 && (
                      <div style={{ padding: '10px 12px', background: '#f6f7f9', borderRadius: 8, color: '#8b91a0', fontSize: 13 }}>Chưa có địa điểm</div>
                    )}
                  </div>
                </div>
                <div>
                  <h4 style={{ marginBottom: 12, fontWeight: 600 }}>ℹ️ Thông tin nhanh</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {[
                      { label: 'DT trung bình/ảnh', value: selectedStat.avgRevPerPhoto },
                      { label: 'Upload gần nhất', value: selectedStat.lastUpload },
                      { label: 'Trạng thái', value: selectedStat.status === 'active' ? '✅ Hoạt động' : '🔒 Đã khóa' },
                    ].map(item => (
                      <div key={item.label} style={{ padding: '10px 12px', background: '#f6f7f9', borderRadius: 8, display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#5a6170', fontSize: 13 }}>{item.label}</span>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e5ea', display: 'flex', justifyContent: 'flex-end' }}>
              <Button onClick={() => setSelectedStat(null)}>Đóng</Button>
            </div>
          </>
        )}
      </OverlayModal>
    </div>
  );
}

// ───── STAFF VIEW ─────
function StaffView() {
  const user = getUser();
  const name = user?.name || 'Nhân viên';
  const initials = name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase();
  const myLocations = [
    { name: 'Bà Nà Hills', photos: 80, sold: 34, revenue: '4.2M', bg: '#e8f5f0', color: '#1a6b4e' },
    { name: 'Hội An', photos: 55, sold: 22, revenue: '3.0M', bg: '#eff6ff', color: '#2563eb' },
  ];

  return (
    <div>
      {/* Profile Banner */}
      <div style={{ borderRadius: 12, overflow: 'hidden', marginBottom: 24, border: '1px solid #e2e5ea' }}>
        <div style={{
          background: 'linear-gradient(135deg, #1a6b4e 0%, #145a3e 100%)',
          padding: '28px 32px', color: '#fff',
          display: 'flex', alignItems: 'center', gap: 20,
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: 'rgba(255,255,255,0.2)', border: '3px solid rgba(255,255,255,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 22, color: '#fff', flexShrink: 0,
          }}>
            {initials}
          </div>
          <div>
            <h2 style={{ margin: 0, fontWeight: 700, fontSize: 22 }}>Xin chào, {name}</h2>
            <div style={{ opacity: 0.85, marginTop: 4, fontSize: 14 }}>
              Mã NV: {user?.employee_code || 'NV001'} · {myLocations.length} địa điểm
            </div>
          </div>
        </div>
      </div>

      {/* Personal Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Ảnh đã upload', value: '1,800', sub: '+45 tháng này', color: '#1a6b4e', icon: '🖼️' },
          { label: 'Ảnh đã bán', value: '720', sub: '+18 tháng này', color: '#1a854a', icon: '🛒' },
          { label: 'Tỉ lệ chuyển đổi', value: '40.0%', sub: '+2.1% so với kỳ trước', color: '#d4870e', icon: '🎯' },
          { label: 'Tổng doanh thu', value: '36M', sub: '+12% so với kỳ trước', color: '#2563eb', icon: '💰' },
        ].map(item => (
          <div key={item.label} style={{
            background: '#fff', borderRadius: 12, padding: 20,
            border: '1px solid #e2e5ea', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}>
            <div style={{ fontSize: 22, marginBottom: 8 }}>{item.icon}</div>
            <div style={{ fontSize: 12, color: '#5a6170', marginBottom: 4 }}>{item.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: item.color }}>{item.value}</div>
            <div style={{ fontSize: 12, color: '#1a854a', marginTop: 4 }}>↑ {item.sub}</div>
          </div>
        ))}
      </div>

      {/* Revenue Chart */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e5ea', marginBottom: 24, overflow: 'hidden' }}>
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid #e2e5ea',
          display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 16,
        }}>
          📈 Doanh thu theo khoảng thời gian
        </div>
        <div style={{ padding: '20px 24px' }}>
          {/* Period boxes */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
            {[
              { label: 'Hôm nay', value: '850K', sub: '17 ảnh bán', active: false },
              { label: 'Tháng này', value: '7.2M', sub: '144 ảnh bán', active: true },
              { label: 'Năm nay', value: '36M', sub: '720 ảnh bán', active: false },
            ].map(p => (
              <div key={p.label} style={{
                padding: '16px 20px', background: p.active ? '#f0fdf4' : '#f6f7f9',
                borderRadius: 12, textAlign: 'center',
                border: p.active ? '2px solid #1a6b4e' : '2px solid transparent',
              }}>
                <div style={{ fontSize: 13, color: '#8b91a0', marginBottom: 4 }}>{p.label}</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: '#1a6b4e', lineHeight: 1.2 }}>{p.value}</div>
                <div style={{ fontSize: 12, color: '#5a6170', marginTop: 2 }}>{p.sub}</div>
              </div>
            ))}
          </div>
          {/* Chart */}
          <div style={{ background: '#f6f7f9', borderRadius: 12, padding: 20, height: 260 }}>
            <Bar data={STAFF_CHART_DATA} options={CHART_OPTIONS} />
          </div>
        </div>
      </div>

      {/* Locations + Quick Info */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Locations */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e5ea', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e5ea', fontWeight: 600, fontSize: 15 }}>
            📍 Địa điểm được phân công
          </div>
          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {myLocations.map(l => (
              <div key={l.name} style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '14px 16px', background: '#f6f7f9', borderRadius: 10,
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10, background: l.bg, color: l.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  📍
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{l.name}</div>
                  <div style={{ fontSize: 12, color: '#8b91a0' }}>{l.photos} ảnh upload · {l.sold} đã bán</div>
                </div>
                <div style={{ fontWeight: 700, fontSize: 16, color: '#1a6b4e' }}>{l.revenue}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Info */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e5ea', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e5ea', fontWeight: 600, fontSize: 15 }}>
            ℹ️ Thông tin nhanh
          </div>
          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { label: 'DT trung bình/ảnh', value: '50,000đ' },
              { label: 'Upload gần nhất', value: '03/03/2026' },
              { label: 'Ảnh chờ duyệt', value: <Tag color="warning" style={{ fontSize: 11 }}>3 ảnh</Tag> },
              { label: 'Trạng thái', value: <Tag color="success" style={{ fontSize: 11 }}>Hoạt động</Tag> },
              { label: 'Ngày vào làm', value: '01/01/2025' },
            ].map(item => (
              <div key={item.label} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 16px', background: '#f6f7f9', borderRadius: 10,
              }}>
                <span style={{ color: '#5a6170', fontSize: 13 }}>{item.label}</span>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ───── MAIN COMPONENT ─────
export default function StaffStats() {
  const [period, setPeriod] = useState('month');
  const isStaff = hasRole(['staff']);
  const isAdmin = hasRole(['admin-system', 'admin-sales', 'manager']);

  const inputStyle: React.CSSProperties = {
    padding: '8px 12px', border: '1px solid #e2e5ea', borderRadius: 8, fontSize: 14, outline: 'none',
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>
          {isStaff ? 'Thống kê của tôi' : 'Thống kê Nhân viên'}
        </h1>
        {isAdmin && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <select value={period} onChange={e => setPeriod(e.target.value)} style={inputStyle}>
              <option value="today">Hôm nay</option>
              <option value="week">Tuần này</option>
              <option value="month">Tháng này</option>
              <option value="year">Năm nay</option>
            </select>
            <Button icon={<DownloadOutlined />} onClick={() => message.info('Đang xuất file Excel...')}>
              Xuất Excel
            </Button>
          </div>
        )}
      </div>

      {isStaff ? <StaffView /> : <AdminView />}
    </div>
  );
}
`;

const outPath = join(__dirname, '..', 'src', 'pages', 'dashboard', 'StaffStats.tsx');
writeFileSync(outPath, content, 'utf8');
console.log('✅ Written StaffStats.tsx');
