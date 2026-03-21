import { useState, useRef } from 'react';
import { Button, Tag, Select, Modal, Table, Progress, Spin } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
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
import { useAllStaffStats, useMyStats, useStaffRevenue, StaffStat } from '../../hooks/useStaffStats';
import { useMyLocations } from '../../hooks/useMyLocations';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, ChartTooltip, Legend);

// ─── helpers ───
function fmtMoney(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return Math.round(n / 1_000) + 'K';
  return n.toLocaleString('vi-VN') + 'đ';
}
function getInitials(name: string | null): string {
  if (!name) return '??';
  return name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
}
function fmtDate(d: string | null): string {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('vi-VN');
}
function chartLabels(points: { date: string }[], period: 'day' | 'month' | 'year'): string[] {
  return points.map(p => {
    const d = new Date(p.date);
    if (period === 'year') return `T${d.getMonth() + 1}`;
    if (period === 'month') return `${d.getDate()}/${d.getMonth() + 1}`;
    return `${d.getHours()}h`;
  });
}

const CHART_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    y: {
      beginAtZero: true,
      grid: { color: '#e2e5ea' },
      ticks: { color: '#5a6170', fontSize: 11 },
    },
    x: { grid: { display: false }, ticks: { color: '#5a6170', fontSize: 11 } },
  },
} as const;

const COLORS = [
  { bg: '#e8f5f0', color: '#1a6b4e' },
  { bg: '#eff6ff', color: '#2563eb' },
  { bg: '#fef3e8', color: '#d4870e' },
  { bg: '#fee2e2', color: '#dc2626' },
  { bg: '#f5f5f5', color: '#888' },
];

// ───── CSV EXPORT ─────
function exportToCSV(rows: StaffStat[]) {
  const headers = [
    'Mã NV', 'Tên nhân viên', 'Ảnh upload', 'Ảnh bán',
    'Tỉ lệ (%)', 'DT hôm nay', 'DT tháng', 'Tổng DT', 'Trạng thái',
  ];
  const escape = (v: string | number) => {
    const s = String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    headers.join(','),
    ...rows.map(r => [
      escape(r.employee_code ?? ''),
      escape(r.staff_name ?? ''),
      r.total_photos_uploaded,
      r.total_photos_sold,
      Number(r.conversion_rate).toFixed(1),
      r.revenue_today,
      r.revenue_this_month,
      r.total_revenue,
      escape(r.is_active ? 'Hoạt động' : 'Tạm khóa'),
    ].join(',')),
  ];
  // UTF-8 BOM so Excel opens Vietnamese correctly
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `thong-ke-nhan-vien-${date}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ───── ADMIN VIEW ─────
function AdminView({ onExportReady }: { onExportReady: (fn: () => void) => void }) {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'revenue' | 'photos' | 'rate'>('revenue');
  const [selectedStat, setSelectedStat] = useState<StaffStat | null>(null);
  const [chartPeriod, setChartPeriod] = useState<'day' | 'month' | 'year'>('month');

  const { data: stats = [], loading } = useAllStaffStats({ search });
  const { data: revenueData } = useStaffRevenue(selectedStat?.staff_id, chartPeriod);

  const sorted = [...stats].sort((a, b) => {
    if (sortBy === 'revenue') return b.total_revenue - a.total_revenue;
    if (sortBy === 'photos') return b.total_photos_uploaded - a.total_photos_uploaded;
    return b.conversion_rate - a.conversion_rate;
  });

  // Register export fn with parent so the header button can trigger it
  // useEffect is intentionally omitted — stable ref via useCallback pattern
  onExportReady(() => exportToCSV(sorted));

  const barLabels = revenueData?.by_date
    ? chartLabels(revenueData.by_date, chartPeriod)
    : [];

  const columns = [
    {
      title: 'Nhân viên',
      key: 'staff',
      render: (_: unknown, stat: StaffStat, idx: number) => {
        const c = COLORS[idx % COLORS.length];
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              background: c.bg, color: c.color, border: `1.5px solid ${c.color}30`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, fontSize: 13, flexShrink: 0,
            }}>{getInitials(stat.staff_name)}</div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{stat.staff_name ?? stat.employee_code ?? '-'}</div>
              <div style={{ fontSize: 12, color: '#8b91a0' }}>{stat.employee_code ?? '-'}</div>
            </div>
          </div>
        );
      },
    },
    {
      title: 'Ảnh upload',
      dataIndex: 'total_photos_uploaded',
      key: 'uploaded',
      sorter: (a: StaffStat, b: StaffStat) => a.total_photos_uploaded - b.total_photos_uploaded,
      render: (v: number) => <span style={{ fontWeight: 600 }}>{v.toLocaleString()}</span>,
    },
    {
      title: 'Ảnh bán',
      dataIndex: 'total_photos_sold',
      key: 'sold',
      sorter: (a: StaffStat, b: StaffStat) => a.total_photos_sold - b.total_photos_sold,
      render: (v: number) => <span style={{ fontWeight: 600, color: '#1a854a' }}>{v.toLocaleString()}</span>,
    },
    {
      title: 'Tỉ lệ',
      dataIndex: 'conversion_rate',
      key: 'rate',
      sorter: (a: StaffStat, b: StaffStat) => a.conversion_rate - b.conversion_rate,
      render: (v: number) => (
        <div style={{ minWidth: 90 }}>
          <Progress percent={Math.round(v)} size="small" strokeColor="#1a6b4e" showInfo={false} />
          <div style={{ fontSize: 11, color: '#5a6170', textAlign: 'right' }}>{Number(v).toFixed(1)}%</div>
        </div>
      ),
    },
    {
      title: 'DT tháng',
      dataIndex: 'revenue_this_month',
      key: 'month_revenue',
      sorter: (a: StaffStat, b: StaffStat) => a.revenue_this_month - b.revenue_this_month,
      render: (v: number) => <span style={{ fontWeight: 700, color: '#1a6b4e' }}>{fmtMoney(v)}</span>,
    },
    {
      title: 'Tổng DT',
      dataIndex: 'total_revenue',
      key: 'total_revenue',
      sorter: (a: StaffStat, b: StaffStat) => a.total_revenue - b.total_revenue,
      render: (v: number) => <span style={{ fontWeight: 700, color: '#2563eb' }}>{fmtMoney(v)}</span>,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'is_active',
      key: 'status',
      render: (v: boolean) => <Tag color={v ? 'success' : 'default'}>{v ? 'Hoạt động' : 'Tạm khóa'}</Tag>,
    },
    {
      title: '',
      key: 'action',
      render: (_: unknown, stat: StaffStat) => (
        <Button
          size="small"
          onClick={() => setSelectedStat(stat)}
          style={{ borderRadius: 6, fontSize: 12, background: '#e8f5f0', borderColor: '#1a6b4e', color: '#1a6b4e' }}
        >Xem</Button>
      ),
    },
  ];

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center' }}>
        <input
          placeholder="Tìm kiếm theo tên, mã NV..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, padding: '8px 14px', border: '1px solid #e2e5ea', borderRadius: 8, fontSize: 14, outline: 'none' }}
        />
        <Select value={sortBy} onChange={v => setSortBy(v)} style={{ width: 200 }}>
          <Select.Option value="revenue">Doanh thu cao nhất</Select.Option>
          <Select.Option value="photos">Upload nhiều nhất</Select.Option>
          <Select.Option value="rate">Tỉ lệ bán cao nhất</Select.Option>
        </Select>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e5ea', overflow: 'hidden' }}>
        <Table
          dataSource={sorted}
          columns={columns}
          rowKey="staff_id"
          loading={loading}
          pagination={{ pageSize: 10, showSizeChanger: false }}
          size="middle"
        />
      </div>

      {/* Detail Modal */}
      <Modal
        open={!!selectedStat}
        onCancel={() => setSelectedStat(null)}
        footer={null}
        width={720}
        title={null}
        styles={{ body: { padding: 0 } }}
      >
        {selectedStat && (
          <div>
            {/* Header */}
            <div style={{
              background: 'linear-gradient(135deg, #1a6b4e 0%, #145a3e 100%)',
              padding: '24px 28px', display: 'flex', alignItems: 'center', gap: 16,
            }}>
              <div style={{
                width: 52, height: 52, borderRadius: '50%',
                background: 'rgba(255,255,255,0.2)', border: '3px solid rgba(255,255,255,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: 18, color: '#fff',
              }}>{getInitials(selectedStat.staff_name)}</div>
              <div style={{ color: '#fff' }}>
                <div style={{ fontSize: 18, fontWeight: 700 }}>
                  {selectedStat.staff_name ?? selectedStat.employee_code ?? '-'}
                </div>
                <div style={{ opacity: 0.85, fontSize: 13, marginTop: 2 }}>
                  Mã NV: {selectedStat.employee_code ?? '-'} ·{' '}
                  <Tag color={selectedStat.is_active ? 'success' : 'default'} style={{ marginLeft: 4 }}>
                    {selectedStat.is_active ? 'Hoạt động' : 'Tạm khóa'}
                  </Tag>
                </div>
              </div>
            </div>

            <div style={{ padding: 24 }}>
              {/* Summary Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
                {[
                  { label: 'Upload', value: selectedStat.total_photos_uploaded.toLocaleString(), color: '#1a6b4e' },
                  { label: 'Đã bán', value: selectedStat.total_photos_sold.toLocaleString(), color: '#1a854a' },
                  { label: 'Tỉ lệ', value: Number(selectedStat.conversion_rate).toFixed(1) + '%', color: '#d4870e' },
                  { label: 'Tổng DT', value: fmtMoney(selectedStat.total_revenue), color: '#2563eb' },
                ].map(item => (
                  <div key={item.label} style={{ background: '#f6f7f9', borderRadius: 10, padding: '14px 16px', textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: '#8b91a0', marginBottom: 4 }}>{item.label}</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: item.color }}>{item.value}</div>
                  </div>
                ))}
              </div>

              {/* Revenue Chart */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h4 style={{ margin: 0, fontWeight: 600 }}>Doanh thu theo kỳ</h4>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {(['day', 'month', 'year'] as const).map((p, i) => (
                      <Button key={p} size="small" type={chartPeriod === p ? 'primary' : 'default'}
                        onClick={() => setChartPeriod(p)} style={{ borderRadius: 6, fontSize: 12 }}>
                        {['Ngày', 'Tháng', 'Năm'][i]}
                      </Button>
                    ))}
                  </div>
                </div>
                <div style={{ background: '#f6f7f9', borderRadius: 10, padding: 16, height: 220 }}>
                  <Bar
                    data={{
                      labels: barLabels,
                      datasets: [{
                        label: 'Doanh thu',
                        data: revenueData?.by_date.map(p => p.revenue) ?? [],
                        backgroundColor: 'rgba(26, 107, 78, 0.7)',
                        borderRadius: 6,
                      }],
                    }}
                    options={CHART_OPTIONS}
                  />
                </div>
              </div>

              {/* Quick Info */}
              <div>
                <h4 style={{ marginBottom: 12, fontWeight: 600 }}>Thông tin nhanh</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    { label: 'DT trung bình/ảnh', value: selectedStat.total_photos_sold > 0 ? fmtMoney(Math.round(selectedStat.total_revenue / selectedStat.total_photos_sold)) : '-' },
                    { label: 'DT hôm nay', value: fmtMoney(selectedStat.revenue_today) },
                    { label: 'DT tháng này', value: fmtMoney(selectedStat.revenue_this_month) },
                    { label: 'Upload gần nhất', value: fmtDate(selectedStat.last_upload_date) },
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
  const [revenuePeriod, setRevenuePeriod] = useState<'day' | 'month' | 'year'>('month');

  const { data: myStats, loading: statsLoading } = useMyStats();
  const { data: myLocations = [] } = useMyLocations();
  const { data: revenueData } = useStaffRevenue(myStats?.staff_id, revenuePeriod);

  const name = myStats?.staff_name || user?.name || 'Nhân viên';
  const initials = getInitials(name);

  const barLabels = revenueData?.by_date ? chartLabels(revenueData.by_date, revenuePeriod) : [];

  const periodBoxes = [
    { label: 'Hôm nay', value: fmtMoney(myStats?.revenue_today ?? 0), period: 'day' as const },
    { label: 'Tháng này', value: fmtMoney(myStats?.revenue_this_month ?? 0), period: 'month' as const },
    { label: 'Năm nay', value: fmtMoney(myStats?.revenue_this_year ?? 0), period: 'year' as const },
  ];

  if (statsLoading) return <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>;

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
          }}>{initials}</div>
          <div>
            <h2 style={{ margin: 0, fontWeight: 700, fontSize: 22 }}>Xin chào, {name}</h2>
            <div style={{ opacity: 0.85, marginTop: 4, fontSize: 14 }}>
              {myStats?.employee_code ? `Mã NV: ${myStats.employee_code} · ` : ''}
              {myLocations.length} địa điểm
            </div>
          </div>
        </div>
      </div>

      {/* Personal Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Ảnh đã upload', value: (myStats?.total_photos_uploaded ?? 0).toLocaleString(), color: '#1a6b4e' },
          { label: 'Ảnh đã bán', value: (myStats?.total_photos_sold ?? 0).toLocaleString(), color: '#1a854a' },
          { label: 'Tỉ lệ chuyển đổi', value: Number(myStats?.conversion_rate ?? 0).toFixed(1) + '%', color: '#d4870e' },
          { label: 'Tổng doanh thu', value: fmtMoney(myStats?.total_revenue ?? 0), color: '#2563eb' },
        ].map(item => (
          <div key={item.label} style={{
            background: '#fff', borderRadius: 12, padding: 20,
            border: '1px solid #e2e5ea', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}>
            <div style={{ fontSize: 12, color: '#5a6170', marginBottom: 4 }}>{item.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: item.color }}>{item.value}</div>
          </div>
        ))}
      </div>

      {/* Revenue Chart */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e5ea', marginBottom: 24, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e5ea', display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 16 }}>
          Doanh thu theo khoảng thời gian
        </div>
        <div style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
            {(['day', 'month', 'year'] as const).map((p, i) => (
              <Button key={p} onClick={() => setRevenuePeriod(p)} type={revenuePeriod === p ? 'primary' : 'default'}
                style={{ borderRadius: 6, fontSize: 13, fontWeight: 500 }}>
                {['Ngày', 'Tháng', 'Năm'][i]}
              </Button>
            ))}
          </div>
          {/* Period boxes */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
            {periodBoxes.map(p => (
              <div key={p.label}
                onClick={() => setRevenuePeriod(p.period)}
                style={{
                  padding: '16px 20px', background: revenuePeriod === p.period ? '#f0fdf4' : '#f6f7f9',
                  borderRadius: 12, textAlign: 'center', cursor: 'pointer',
                  border: revenuePeriod === p.period ? '2px solid #1a6b4e' : '2px solid transparent',
                  transition: 'all 0.15s',
                }}>
                <div style={{ fontSize: 13, color: '#8b91a0', marginBottom: 4 }}>{p.label}</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: '#1a6b4e', lineHeight: 1.2 }}>{p.value}</div>
              </div>
            ))}
          </div>
          {/* Chart */}
          <div style={{ background: '#f6f7f9', borderRadius: 12, padding: 20, height: 260 }}>
            <Bar
              data={{
                labels: barLabels,
                datasets: [{
                  label: 'Doanh thu',
                  data: revenueData?.by_date.map(p => p.revenue) ?? [],
                  backgroundColor: 'rgba(26, 107, 78, 0.7)',
                  borderRadius: 6,
                }],
              }}
              options={CHART_OPTIONS}
            />
          </div>
        </div>
      </div>

      {/* Locations + Quick Info */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Locations */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e5ea', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e5ea', fontWeight: 600, fontSize: 15 }}>
            Địa điểm được phân công
          </div>
          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {myLocations.length === 0 && (
              <div style={{ color: '#8b91a0', fontSize: 13, padding: '8px 0' }}>Chưa có địa điểm nào</div>
            )}
            {myLocations.map((l, i) => {
              const c = COLORS[i % COLORS.length];
              return (
                <div key={l.id} style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '14px 16px', background: '#f6f7f9', borderRadius: 10,
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 10, background: c.bg, color: c.color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 18,
                  }}>📍</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{l.name}</div>
                    {l.shoot_date && <div style={{ fontSize: 12, color: '#8b91a0' }}>{l.shoot_date}</div>}
                  </div>
                  {l.can_upload && <Tag color="success" style={{ fontSize: 11 }}>Upload</Tag>}
                </div>
              );
            })}
          </div>
        </div>

        {/* Quick Info */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e5ea', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e5ea', fontWeight: 600, fontSize: 15 }}>
            Thông tin nhanh
          </div>
          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { label: 'DT trung bình/ảnh', value: myStats && myStats.total_photos_sold > 0 ? fmtMoney(Math.round(myStats.total_revenue / myStats.total_photos_sold)) : '-' },
              { label: 'DT hôm nay', value: fmtMoney(myStats?.revenue_today ?? 0) },
              { label: 'Upload gần nhất', value: fmtDate(myStats?.last_upload_date ?? null) },
              { label: 'Trạng thái', value: myStats?.is_active ? <Tag color="success" style={{ fontSize: 11 }}>Hoạt động</Tag> : <Tag color="default" style={{ fontSize: 11 }}>Tạm khóa</Tag> },
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
  const isStaff = hasRole(['staff']);
  const exportFnRef = useRef<(() => void) | null>(null);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>
          {isStaff ? 'Thống kê của tôi' : 'Thống kê Nhân viên'}
        </h1>
        {!isStaff && (
          <Button icon={<DownloadOutlined />} onClick={() => exportFnRef.current?.()}>Xuất Excel</Button>
        )}
      </div>

      {isStaff ? <StaffView /> : <AdminView onExportReady={fn => { exportFnRef.current = fn; }} />}
    </div>
  );
}
