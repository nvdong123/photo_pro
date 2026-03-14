import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

function write(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf8');
  console.log('Written:', path);
}

const base = 'c:/Users/datth/Downloads/photopro-react/src';

// ============ LOGIN ============
write(`${base}/pages/Login.tsx`, `
import { useState, useEffect } from 'react';
import { Form, Input, Button, Checkbox, Typography, message } from 'antd';
import { UserOutlined, LockOutlined, EyeOutlined, EyeInvisibleOutlined, CameraOutlined, SafetyCertificateOutlined, BriefcaseOutlined, TeamOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';

const { Title, Text, Link } = Typography;
type Role = 'admin-system' | 'admin-sales' | 'manager';

const VALID_ACCOUNTS: Record<string, { password: string; role: Role; name: string }> = {
  'admin@photopro.vn': { password: 'admin123', role: 'admin-system', name: 'Admin System' },
  'sales@photopro.vn': { password: 'sales123', role: 'admin-sales', name: 'Admin Sales' },
  'manager@photopro.vn': { password: 'manager123', role: 'manager', name: 'Manager' },
};

const DEMO_ACCOUNTS = [
  { role: 'admin-system' as Role, label: 'Admin System', desc: 'Toàn quyền hệ thống', icon: <SafetyCertificateOutlined />, username: 'admin@photopro.vn', password: 'admin123' },
  { role: 'admin-sales' as Role, label: 'Admin Sales', desc: 'Quản lý bán hàng', icon: <BriefcaseOutlined />, username: 'sales@photopro.vn', password: 'sales123' },
  { role: 'manager' as Role, label: 'Manager', desc: 'Quản lý vận hành', icon: <TeamOutlined />, username: 'manager@photopro.vn', password: 'manager123' },
];

export default function Login() {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('photopro_user');
      if (raw) { const u = JSON.parse(raw); if (u.rememberMe) navigate('/dashboard'); }
    } catch { /* empty */ }
  }, [navigate]);

  const onFinish = async (values: { username: string; password: string; remember: boolean }) => {
    setLoading(true);
    await new Promise((r) => setTimeout(r, 600));
    const acc = VALID_ACCOUNTS[values.username];
    if (acc && acc.password === values.password) {
      localStorage.setItem('photopro_user', JSON.stringify({ username: values.username, role: acc.role, name: acc.name, loginTime: new Date().toISOString(), rememberMe: values.remember ?? false }));
      message.success('Đăng nhập thành công!');
      navigate('/dashboard');
    } else {
      message.error('Tên đăng nhập hoặc mật khẩu không đúng!');
    }
    setLoading(false);
  };

  const fillDemo = (a: typeof DEMO_ACCOUNTS[0]) => form.setFieldsValue({ username: a.username, password: a.password });

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 480, background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 25px 50px rgba(0,0,0,0.25)' }}>
        <div style={{ textAlign: 'center', padding: '40px 40px 32px', background: 'linear-gradient(135deg, #1a6b4e 0%, #0f5840 100%)' }}>
          <div style={{ width: 80, height: 80, margin: '0 auto 16px', background: 'rgba(255,255,255,0.2)', borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CameraOutlined style={{ fontSize: 40, color: 'white' }} />
          </div>
          <Title level={2} style={{ margin: '0 0 8px', color: 'white', fontSize: 28 }}>PhotoPro Dashboard</Title>
          <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 15 }}>Đăng nhập để quản lý hệ thống</Text>
        </div>
        <div style={{ padding: '32px 40px' }}>
          <Form form={form} layout="vertical" onFinish={onFinish} requiredMark={false}>
            <Form.Item label={<span style={{ fontWeight: 600 }}>Tên đăng nhập hoặc Email</span>} name="username" rules={[{ required: true, message: 'Vui lòng nhập email' }]}>
              <Input prefix={<UserOutlined style={{ color: '#8b91a0' }} />} placeholder="admin@photopro.vn" size="large" />
            </Form.Item>
            <Form.Item label={<span style={{ fontWeight: 600 }}>Mật khẩu</span>} name="password" rules={[{ required: true, message: 'Vui lòng nhập mật khẩu' }]}>
              <Input.Password prefix={<LockOutlined style={{ color: '#8b91a0' }} />} placeholder="••••••••" size="large" iconRender={(v) => v ? <EyeOutlined /> : <EyeInvisibleOutlined />} />
            </Form.Item>
            <Form.Item style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Form.Item name="remember" valuePropName="checked" noStyle><Checkbox>Ghi nhớ đăng nhập</Checkbox></Form.Item>
                <Link href="#" style={{ color: '#1a6b4e' }}>Quên mật khẩu?</Link>
              </div>
            </Form.Item>
            <Form.Item style={{ marginBottom: 0 }}>
              <Button type="primary" htmlType="submit" block loading={loading} size="large" style={{ height: 48, fontSize: 16, fontWeight: 600 }}>Đăng Nhập</Button>
            </Form.Item>
          </Form>
          <div style={{ marginTop: 24, paddingTop: 24, borderTop: '1px solid #e2e5ea' }}>
            <Text type="secondary" style={{ display: 'block', textAlign: 'center', marginBottom: 12, fontSize: 13 }}>Tài khoản demo</Text>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {DEMO_ACCOUNTS.map((a) => (
                <button key={a.role} onClick={() => fillDemo(a)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: '#f6f7f9', border: '1px solid #e2e5ea', borderRadius: 8, cursor: 'pointer', textAlign: 'left', width: '100%' }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#1a6b4e'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e2e5ea'; }}>
                  <span style={{ color: '#1a6b4e', fontSize: 16 }}>{a.icon}</span>
                  <div><div style={{ fontWeight: 600, color: '#1a1d23', fontSize: 13 }}>{a.label}</div><div style={{ color: '#8b91a0', fontSize: 12 }}>{a.desc}</div></div>
                </button>
              ))}
            </div>
          </div>
        </div>
        <div style={{ padding: '20px 40px', textAlign: 'center', background: '#f6f7f9', borderTop: '1px solid #e2e5ea', fontSize: 13, color: '#8b91a0' }}>
          <p style={{ margin: '0 0 8px' }}>© 2026 PhotoPro. All rights reserved.</p>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
            <Link href="#" style={{ color: '#5a6170', fontSize: 13 }}>Điều khoản</Link>
            <Link href="#" style={{ color: '#5a6170', fontSize: 13 }}>Chính sách</Link>
            <Link href="#" style={{ color: '#5a6170', fontSize: 13 }}>Hỗ trợ</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
`.trimStart());

// ============ DASHBOARD HOME ============
write(`${base}/pages/dashboard/DashboardHome.tsx`, `
import { Row, Col, Card, Tag, Badge } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined, PictureOutlined, ShoppingCartOutlined, DollarOutlined, TeamOutlined, EyeOutlined } from '@ant-design/icons';
import { Line, Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Tooltip, Legend, Filler } from 'chart.js';
import { useNavigate } from 'react-router-dom';
import { hasRole } from '../../hooks/useAuth';

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
  card: { borderRadius: 12, border: \`1px solid \${BORDER}\`, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' },
  icon: (bg: string, color: string) => ({ width: 48, height: 48, borderRadius: 8, background: bg, color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }),
};

export default function DashboardHome() {
  const navigate = useNavigate();

  const revenueChart = {
    labels: ['21/02', '22/02', '23/02', '24/02', '25/02', '26/02', '27/02'],
    datasets: [{ label: 'Doanh thu', data: [1200000, 1900000, 1500000, 2100000, 1800000, 2400000, 2200000], borderColor: PRIMARY, backgroundColor: 'rgba(26,107,78,0.1)', tension: 0.4, fill: true }],
  };

  const packageChart = {
    labels: ['Gói 8 ảnh', 'Gói 3 ảnh', 'Gói 1 ảnh'],
    datasets: [{ data: [420, 280, 150], backgroundColor: [PRIMARY, WARNING, INFO] }],
  };

  const chartOptions = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { callback: (v: any) => (v / 1000000).toFixed(1) + 'M' } } } };
  const doughnutOptions = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' as const } } };

  const stats = [
    { label: 'Tổng ảnh', value: '12,500', change: '+15%', positive: true, icon: <PictureOutlined />, iconBg: '#e8f5f0', iconColor: PRIMARY },
    { label: 'Đơn hàng', value: '850', change: '+22%', positive: true, icon: <ShoppingCartOutlined />, iconBg: '#e8f5f0', iconColor: SUCCESS },
    { label: 'Doanh thu tháng này', value: '42,5M', change: '+18%', positive: true, icon: <DollarOutlined />, iconBg: '#fef3e8', iconColor: WARNING },
    { label: 'Khách hàng', value: '645', change: '+12%', positive: true, icon: <TeamOutlined />, iconBg: '#eff6ff', iconColor: INFO },
  ];

  const recentOrders = [
    { code: '#ORD-001', photos: '3 ảnh', price: '50,000đ', status: 'completed' },
    { code: '#ORD-002', photos: '8 ảnh', price: '100,000đ', status: 'completed' },
    { code: '#ORD-003', photos: '1 ảnh', price: '20,000đ', status: 'processing' },
    { code: '#ORD-004', photos: '3 ảnh', price: '50,000đ', status: 'completed' },
    { code: '#ORD-005', photos: '8 ảnh', price: '100,000đ', status: 'completed' },
  ];

  const topAlbums = [
    { name: 'Bà Nà Hills 20/02', photos: '150 ảnh', orders: '120 đơn', revenue: '6,000,000đ' },
    { name: 'Hội An 19/02', photos: '200 ảnh', orders: '98 đơn', revenue: '4,900,000đ' },
    { name: 'Cầu Rồng 18/02', photos: '120 ảnh', orders: '75 đơn', revenue: '3,750,000đ' },
    { name: 'Mỹ Khê 17/02', photos: '180 ảnh', orders: '68 đơn', revenue: '3,400,000đ' },
  ];

  const statusMap: Record<string, { color: string; label: string }> = {
    completed: { color: 'green', label: 'Hoàn thành' },
    processing: { color: 'orange', label: 'Đang xử lý' },
    refunded: { color: 'red', label: 'Đã hoàn tiền' },
    expired: { color: 'default', label: 'Hết hạn' },
  };

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
            extra={<select style={{ padding: '4px 8px', border: \`1px solid \${BORDER}\`, borderRadius: 6 }}><option>7 ngày</option><option>14 ngày</option><option>30 ngày</option></select>}>
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
            extra={<button onClick={() => navigate('/dashboard/orders')} style={{ padding: '4px 12px', border: \`1px solid \${BORDER}\`, borderRadius: 6, cursor: 'pointer', background: 'transparent', color: PRIMARY, fontWeight: 600, fontSize: 12 }}>Xem tất cả</button>}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: SURFACE_ALT }}>{['Mã đơn', 'Số ảnh', 'Giá', 'Trạng thái'].map(h => <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#5a6170', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>)}</tr></thead>
              <tbody>
                {recentOrders.map((o, i) => (
                  <tr key={i} style={{ borderTop: \`1px solid \${BORDER}\` }}>
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>{o.code}</td>
                    <td style={{ padding: '10px 12px' }}>{o.photos}</td>
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>{o.price}</td>
                    <td style={{ padding: '10px 12px' }}><Tag color={statusMap[o.status]?.color}>{statusMap[o.status]?.label}</Tag></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Album bán chạy" style={statStyle.card}
            extra={<button onClick={() => navigate('/dashboard/albums')} style={{ padding: '4px 12px', border: \`1px solid \${BORDER}\`, borderRadius: 6, cursor: 'pointer', background: 'transparent', color: PRIMARY, fontWeight: 600, fontSize: 12 }}>Xem tất cả</button>}>
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
        <div style={{ marginTop: 24, padding: 16, background: '#fef3e8', border: '2px solid #d4870e', borderRadius: 8, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <span style={{ fontSize: 18, color: WARNING }}>⚠️</span>
          <div>
            <strong style={{ display: 'block', marginBottom: 4 }}>Cảnh báo tự động xóa</strong>
            Có <strong>250 ảnh</strong> sẽ bị xóa trong 7 ngày tới do hết hạn lưu trữ.{' '}
            <button onClick={() => navigate('/dashboard/settings')} style={{ background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', color: WARNING, fontWeight: 600 }}>Xem cài đặt</button>
          </div>
        </div>
      )}
    </div>
  );
}
`.trimStart());

console.log('All files written!');
