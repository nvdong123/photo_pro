  import { useState } from 'react';
import { Row, Col, Card, Tag, Badge, Button, Select, Table, Alert } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined, PictureOutlined, ShoppingCartOutlined, DollarOutlined, TeamOutlined, EyeOutlined } from '@ant-design/icons';
import { Line, Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Tooltip, Legend, Filler } from 'chart.js';
import { useNavigate } from 'react-router-dom';
import { hasRole } from '../../hooks/useAuth';
import { useRevenue } from '../../hooks/useRevenue';
import { useMediaStats } from '../../hooks/useMediaStats';
import { useOrders } from '../../hooks/useOrders';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Tooltip, Legend, Filler);

const PRIMARY = '#1a6b4e';
const WARNING = '#d4870e';
const INFO = '#2563eb';
const SUCCESS = '#1a854a';
const DANGER = '#d63b3b';
const SURFACE_ALT = '#f6f7f9';
const BORDER = '#e2e5ea';
const TEXT_MUTED = '#8b91a0';

const statStyle = {
  card: { borderRadius: 12, border: `1px solid ${BORDER}`, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' },
  icon: (bg: string, color: string) => ({ width: 48, height: 48, borderRadius: 8, background: bg, color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }),
};

export default function DashboardHome() {
  const navigate = useNavigate();
  const { data: revenue } = useRevenue({ period: 'month' });
  const { data: mediaStats } = useMediaStats();
  const { data: ordersData } = useOrders({ page: 1 });

  const STATUS_LABEL: Record<string, { color: string; label: string }> = {
    PAID:     { color: 'green',   label: 'Hoàn thành' },
    CREATED:  { color: 'orange',  label: 'Đang xử lý' },
    FAILED:   { color: 'default', label: 'Hết hạn' },
    REFUNDED: { color: 'red',     label: 'Đã hoàn tiền' },
  };

  const dailyStats = revenue?.by_date ?? [];
  const revenueChart = {
    labels: dailyStats.slice(-7).map((d) => d.date),
    datasets: [{ label: 'Doanh thu', data: dailyStats.slice(-7).map((d) => d.revenue), borderColor: PRIMARY, backgroundColor: 'rgba(26,107,78,0.1)', tension: 0.4, fill: true }],
  };

  const bundleData = revenue?.by_bundle ?? [];
  const packageChart = {
    labels: bundleData.length ? bundleData.map(b => b.bundle_name) : ['Không có dữ liệu'],
    datasets: [{ data: bundleData.length ? bundleData.map(b => b.count) : [1], backgroundColor: [PRIMARY, WARNING, INFO, SUCCESS, DANGER] }],
  };

  const chartOptions = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { callback: (v: any) => (v / 1000000).toFixed(1) + 'M' } } } };
  const doughnutOptions = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' as const } } };

  const stats = [
    { label: 'Tổng ảnh', value: (mediaStats?.total ?? 0).toLocaleString(), change: '+0%', positive: true, icon: <PictureOutlined />, iconBg: '#e8f5f0', iconColor: PRIMARY },
    { label: 'Đơn hàng', value: (revenue?.summary.total_orders ?? 0).toLocaleString(), change: '+0%', positive: true, icon: <ShoppingCartOutlined />, iconBg: '#e8f5f0', iconColor: SUCCESS },
    { label: 'Doanh thu tháng này', value: ((revenue?.summary.total_revenue ?? 0) / 1000000).toFixed(1) + 'M', change: '+0%', positive: true, icon: <DollarOutlined />, iconBg: '#fef3e8', iconColor: WARNING },
    { label: 'Khách hàng', value: (ordersData?.total ?? 0).toLocaleString(), change: '+0%', positive: true, icon: <TeamOutlined />, iconBg: '#eff6ff', iconColor: INFO },
  ];

  const recentOrders = (ordersData?.items ?? []).slice(0, 5).map((o) => ({
    code: o.order_code,
    photos: `${o.photo_count} ảnh`,
    price: o.amount.toLocaleString('vi-VN') + 'đ',
    status: o.status,
  }));

  const topAlbums = (revenue?.by_photographer ?? []).slice(0, 4).map((p) => ({
    name: p.photographer_code,
    photos: `${p.photos_sold} ảnh`,
    orders: `${p.orders} đơn`,
    revenue: (p.revenue / 1000000).toFixed(1) + 'M',
  }));

  const statusMap = STATUS_LABEL;

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 24 }}>Dashboard</h1>

      {/* Stats */}
      <Row gutter={[20, 20]} style={{ marginBottom: 24 }}>
        {stats.map((s, i) => (
          <Col key={i} xs={24} sm={12} xl={6}>
            <Card style={statStyle.card} bodyStyle={{ padding: 20, display: 'flex', alignItems: 'flex-start', gap: 16 }}>
              <div style={statStyle.icon(s.iconBg, s.iconColor)}>{s.icon}</div>
              <div>
                <div style={{ fontSize: 13, color: TEXT_MUTED, marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: '#1a1d23', marginBottom: 4 }}>{s.value}</div>
                <div style={{ fontSize: 12, color: s.positive ? SUCCESS : DANGER, display: 'flex', alignItems: 'center', gap: 4 }}>
                  {s.positive ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                  <span>{s.change} so với tháng trước</span>
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      {/* Charts */}
      <Row gutter={[20, 20]} style={{ marginBottom: 24 }}>
        <Col xs={24} lg={16}>
          <Card title="Doanh thu 7 ngày qua" style={statStyle.card}
            extra={<Select size="small" defaultValue="7" style={{ width: 100 }}><Select.Option value="7">7 ngày</Select.Option><Select.Option value="14">14 ngày</Select.Option><Select.Option value="30">30 ngày</Select.Option></Select>}>
            <div style={{ height: 280 }}><Line data={revenueChart} options={chartOptions} /></div>
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="Gói bán chạy" style={statStyle.card}>
            <div style={{ height: 280 }}><Doughnut data={packageChart} options={doughnutOptions} /></div>
          </Card>
        </Col>
      </Row>

      {/* Tables */}
      <Row gutter={[20, 20]}>
        <Col xs={24} lg={12}>
          <Card title="Đơn hàng gần đây" style={statStyle.card}
            extra={<Button size="small" onClick={() => navigate('/dashboard/orders')}>Xem tất cả</Button>}>
            <Table
              size="small"
              dataSource={recentOrders}
              rowKey="code"
              pagination={false}
              columns={[
                { title: 'Mã đơn', dataIndex: 'code', key: 'code', render: (v: string) => <span style={{ fontWeight: 600 }}>{v}</span> },
                { title: 'Số ảnh', dataIndex: 'photos', key: 'photos' },
                { title: 'Giá', dataIndex: 'price', key: 'price', render: (v: string) => <span style={{ fontWeight: 600 }}>{v}</span> },
                { title: 'Trạng thái', dataIndex: 'status', key: 'status', render: (s: string) => <Tag color={statusMap[s]?.color}>{statusMap[s]?.label}</Tag> },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Địa điểm bán chạy" style={statStyle.card}
            extra={<Button size="small" onClick={() => navigate('/dashboard/locations')}>Xem tất cả</Button>}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {topAlbums.map((a, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, background: SURFACE_ALT, borderRadius: 8 }}>
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>{a.name}</div>
                    <div style={{ fontSize: 12, color: TEXT_MUTED }}>{a.photos}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, color: PRIMARY }}>{a.orders}</div>
                    <div style={{ fontSize: 12, color: TEXT_MUTED }}>{a.revenue}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </Col>
      </Row>

      {/* Alert for admin-system */}
      {hasRole(['admin-system']) && (
        <Alert
          type="warning"
          showIcon
          style={{ marginTop: 24 }}
          message={<strong>Cảnh báo tự động xóa</strong>}
          description={
            <>Có <strong>{mediaStats?.expiring_soon ?? 0} ảnh</strong> sẽ bị xóa trong 7 ngày tới do hết hạn lưu trữ.{' '}
            <Button type="link" onClick={() => navigate('/dashboard/settings')} style={{ padding: 0, color: WARNING, fontWeight: 600, textDecoration: 'underline', height: 'auto' }}>Xem cài đặt</Button></>
          }
        />
      )}
    </div>
  );
}
