import { useState } from 'react';
import { Button, Tag, message, Input, Select, Modal, Table, Progress } from 'antd';
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
import { useRevenue } from '../../hooks/useRevenue';
import { useMediaStats } from '../../hooks/useMediaStats';

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

const MOCK_STATS: StaffStat[] = [];

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

const PERIOD_CHART: Record<string, { labels: string[]; data: number[] }> = {
  day: {
    labels: ['07:00', '09:00', '11:00', '13:00', '15:00', '17:00', '19:00', '21:00'],
    data:   [120000, 450000, 280000, 520000, 390000, 610000, 750000, 850000],
  },
  month: {
    labels: ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12', 'T13', 'T14', 'T15',
             'T16', 'T17', 'T18', 'T19', 'T20', 'T21', 'T22', 'T23', 'T24', 'T25', 'T26', 'T27', 'T28'],
    data:   [350000,520000,410000,680000,450000,720000,530000,660000,490000,780000,
             420000,560000,640000,390000,720000,510000,830000,480000,760000,590000,
             440000,690000,510000,770000,620000,450000,810000,480000],
  },
  year: {
    labels: ['Th.1','Th.2','Th.3','Th.4','Th.5','Th.6','Th.7','Th.8','Th.9','Th.10','Th.11','Th.12'],
    data:   [4200000,5800000,7200000,6500000,8100000,7400000,9200000,8600000,7800000,9500000,10200000,12000000],
  },
};

// ───── ADMIN VIEW ─────
function AdminView({ staffData }: { staffData: StaffStat[] }) {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [sortBy, setSortBy] = useState('revenue-desc');
  const [selectedStat, setSelectedStat] = useState<StaffStat | null>(null);
  const [modalPeriod, setModalPeriod] = useState<'day'|'month'|'year'>('day');

  const inputStyle: React.CSSProperties = {
    padding: '10px 12px', border: '1px solid #e2e5ea', borderRadius: 8,
    fontSize: 14, outline: 'none',
  };

  const filtered = staffData
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

  const totalPhotos = staffData.reduce((s, x) => s + x.photosUploaded, 0).toLocaleString();
  const totalSold = staffData.reduce((s, x) => s + x.photosSold, 0).toLocaleString();
  const avgRate = (staffData.reduce((s, x) => s + x.conversionRate, 0) / (staffData.filter(x => x.status === 'active').length || 1)).toFixed(1) + '%';

  return (
    <div>
      {/* Summary Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Tổng nhân viên', value: staffData.length, icon: '👥', color: '#1a6b4e' },
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
          <Input
            placeholder="Tìm theo tên, mã NV..." value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ ...inputStyle, flex: 1, minWidth: 250 }}
          />
          <Select value={filterStatus || undefined} placeholder="Tất cả trạng thái" onChange={v => setFilterStatus(v || '')} allowClear style={inputStyle}>
            <Select.Option value="active">Đang hoạt động</Select.Option>
            <Select.Option value="inactive">Đã khóa</Select.Option>
          </Select>
          <Select value={sortBy} onChange={v => setSortBy(v)} style={inputStyle}>
            <Select.Option value="revenue-desc">Doanh thu cao → thấp</Select.Option>
            <Select.Option value="revenue-asc">Doanh thu thấp → cao</Select.Option>
            <Select.Option value="photos-desc">Ảnh upload nhiều → ít</Select.Option>
            <Select.Option value="sold-desc">Ảnh bán nhiều → ít</Select.Option>
            <Select.Option value="rate-desc">Tỉ lệ chuyển đổi cao → thấp</Select.Option>
          </Select>
        </div>
      </div>

      {/* Table */}
      <Table
        size="small"
        dataSource={filtered}
        rowKey="id"
        scroll={{ x: 'max-content' }}
        style={{ border: '1px solid #e2e5ea', borderRadius: 12, overflow: 'hidden' }}
        onRow={(s: StaffStat) => ({
          style: { cursor: 'pointer', opacity: s.status === 'inactive' ? 0.6 : 1 },
          onClick: () => setSelectedStat(s),
        })}
        pagination={false}
        columns={[
          {
            title: '#',
            key: 'index',
            render: (_: unknown, __: unknown, i: number) => i + 1,
          },
          {
            title: 'Nhân viên',
            key: 'staff',
            render: (s: StaffStat) => (
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
            ),
          },
          {
            title: 'Mã NV',
            key: 'code',
            render: (s: StaffStat) => <code style={{ background: '#f6f7f9', padding: '2px 8px', borderRadius: 4, fontSize: 13 }}>{s.code}</code>,
          },
          {
            title: 'Ảnh upload',
            key: 'photosUploaded',
            render: (s: StaffStat) => <span style={{ fontWeight: 600 }}>{s.photosUploaded.toLocaleString()}</span>,
          },
          {
            title: 'Ảnh bán',
            key: 'photosSold',
            render: (s: StaffStat) => <span style={{ fontWeight: 600 }}>{s.photosSold.toLocaleString()}</span>,
          },
          {
            title: 'Tỉ lệ',
            key: 'conversionRate',
            render: (s: StaffStat) => (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Progress percent={s.conversionRate} size="small" showInfo={false} style={{ width: 40, marginBottom: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 500 }}>{s.conversionRate}%</span>
              </div>
            ),
          },
          {
            title: 'DT tháng',
            key: 'revenueMonth',
            render: (s: StaffStat) => <span style={{ fontWeight: 600, color: '#1a6b4e' }}>{s.revenueMonth}</span>,
          },
          {
            title: 'Tổng DT',
            key: 'revenueTotal',
            render: (s: StaffStat) => <span style={{ fontWeight: 600 }}>{s.revenueTotal}</span>,
          },
          {
            title: 'Địa điểm',
            key: 'locations',
            render: (s: StaffStat) => s.locations.length > 0 ? (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {s.locations.map(l => <Tag key={l} color="blue" style={{ fontSize: 10, padding: '1px 6px' }}>{l}</Tag>)}
              </div>
            ) : (
              <Tag color="default" style={{ fontSize: 10 }}>Đã khóa</Tag>
            ),
          },
          {
            title: 'Thao tác',
            key: 'action',
            render: (s: StaffStat) => (
              <span onClick={e => e.stopPropagation()}>
                <Button icon={<EyeOutlined />} size="small" onClick={() => setSelectedStat(s)} title="Xem chi tiết" />
              </span>
            ),
          },
        ]}
      />

      {/* Detail Modal */}
      <Modal
        open={!!selectedStat}
        onCancel={() => setSelectedStat(null)}
        title={selectedStat ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: '50%', background: selectedStat.bgColor, color: selectedStat.textColor,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 15,
            }}>
              {selectedStat.initials}
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>Thống kê: {selectedStat.name}</div>
              <div style={{ fontSize: 12, color: '#8b91a0', fontWeight: 400 }}>Mã NV: {selectedStat.code} · Staff</div>
            </div>
          </div>
        ) : ''}
        footer={[<Button key="close" onClick={() => setSelectedStat(null)}>Đóng</Button>]}
        width={750}
      >
        {selectedStat && (
          <div style={{ padding: '4px 0' }}>
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
                {/* Period Tabs */}
                <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
                  {(['day','month','year'] as const).map((p, i) => (
                  <Button
                    key={p}
                    onClick={() => setModalPeriod(p)}
                    type={modalPeriod === p ? 'primary' : 'default'}
                    style={{ borderRadius: 6, fontSize: 13, fontWeight: 500 }}
                  >{['Ngày','Tháng','Năm'][i]}</Button>
                  ))}
                </div>
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
                  <Bar data={{
                    labels: PERIOD_CHART[modalPeriod].labels,
                    datasets: [{ ...ADMIN_CHART_DATA.datasets[0], data: PERIOD_CHART[modalPeriod].data }],
                  }} options={CHART_OPTIONS} />
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
        )}
      </Modal>

    </div>
  );
}

// ───── STAFF VIEW ─────
function StaffView() {
  const user = getUser();
  const name = user?.name || 'Nhân viên';
  const initials = name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase();
  const [revenuePeriod, setRevenuePeriod] = useState<'day'|'month'|'year'>('day');
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
              Mã NV: NV001 · {myLocations.length} địa điểm
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
          {/* Period Tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
            {(['day','month','year'] as const).map((p, i) => (
              <Button
                key={p}
                onClick={() => setRevenuePeriod(p)}
                type={revenuePeriod === p ? 'primary' : 'default'}
                style={{ borderRadius: 6, fontSize: 13, fontWeight: 500 }}
              >{['Ngày','Tháng','Năm'][i]}</Button>
            ))}
          </div>
          {/* Period boxes */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
            {[
              { label: 'Hôm nay', value: '850K', sub: '17 ảnh bán', period: 'day' },
              { label: 'Tháng này', value: '7.2M', sub: '144 ảnh bán', period: 'month' },
              { label: 'Năm nay', value: '36M', sub: '720 ảnh bán', period: 'year' },
            ].map(p => (
              <div key={p.label}
                onClick={() => setRevenuePeriod(p.period as 'day'|'month'|'year')}
                style={{
                  padding: '16px 20px', background: revenuePeriod === p.period ? '#f0fdf4' : '#f6f7f9',
                  borderRadius: 12, textAlign: 'center', cursor: 'pointer',
                  border: revenuePeriod === p.period ? '2px solid #1a6b4e' : '2px solid transparent',
                  transition: 'all 0.15s',
              }}>
                <div style={{ fontSize: 13, color: '#8b91a0', marginBottom: 4 }}>{p.label}</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: '#1a6b4e', lineHeight: 1.2 }}>{p.value}</div>
                <div style={{ fontSize: 12, color: '#5a6170', marginTop: 2 }}>{p.sub}</div>
              </div>
            ))}
          </div>
          {/* Chart */}
          <div style={{ background: '#f6f7f9', borderRadius: 12, padding: 20, height: 260 }}>
            <Bar data={{
              labels: PERIOD_CHART[revenuePeriod].labels,
              datasets: [{ ...STAFF_CHART_DATA.datasets[0], data: PERIOD_CHART[revenuePeriod].data }],
            }} options={CHART_OPTIONS} />
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
const STAT_COLORS = [
  { bg: '#e8f5f0', color: '#1a6b4e' },
  { bg: '#eff6ff', color: '#2563eb' },
  { bg: '#fef3e8', color: '#d4870e' },
  { bg: '#fee2e2', color: '#dc2626' },
  { bg: '#f5f5f5', color: '#888' },
];

export default function StaffStats() {
  const [period, setPeriod] = useState<'today' | 'week' | 'month' | 'quarter' | 'year'>('month');
  const isStaff = hasRole(['staff']);
  const isAdmin = hasRole(['admin-system', 'admin-sales', 'manager']);

  const { data: revenue } = useRevenue({ period });
  const { data: mediaStats } = useMediaStats();

  const photographerSales = revenue?.by_photographer ?? [];
  const photographerUploads = mediaStats?.by_photographer ?? [];

  const staffData: StaffStat[] = photographerSales.map((p, i) => {
    const uploadEntry = photographerUploads.find(u => u.photographer_code === p.photographer_code);
    const uploadCount = uploadEntry?.count ?? p.photos_sold;
    const conversionRate = uploadCount > 0 ? Math.round((p.photos_sold / uploadCount) * 100) : 0;
    const c = STAT_COLORS[i % STAT_COLORS.length];
    return {
      id: p.photographer_code,
      initials: p.photographer_code.substring(0, 2).toUpperCase(),
      name: p.photographer_code,
      email: '',
      code: p.photographer_code,
      bgColor: c.bg,
      textColor: c.color,
      photosUploaded: uploadCount,
      photosSold: p.photos_sold,
      conversionRate,
      revenueMonth: (p.revenue / 1000000).toFixed(1) + 'M',
      revenueTotal: (p.revenue / 1000000).toFixed(1) + 'M',
      locations: [],
      status: 'active' as const,
      lastUpload: '-',
      joinDate: '-',
      avgRevPerPhoto: p.photos_sold > 0 ? Math.round(p.revenue / p.photos_sold).toLocaleString() + 'đ' : '-',
      pendingPhotos: 0,
    };
  });

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
          <Select value={period} onChange={v => setPeriod(v)} style={inputStyle}>
            <Select.Option value="today">Hôm nay</Select.Option>
            <Select.Option value="week">Tuần này</Select.Option>
            <Select.Option value="month">Tháng này</Select.Option>
            <Select.Option value="year">Năm nay</Select.Option>
          </Select>
            <Button icon={<DownloadOutlined />} onClick={() => message.info('Đang xuất file Excel...')}>
              Xuất Excel
            </Button>
          </div>
        )}
      </div>

      {isStaff ? <StaffView /> : <AdminView staffData={staffData} />}
    </div>
  );
}
