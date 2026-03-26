import { Layout, Menu, Dropdown, Avatar, Typography, Modal } from 'antd';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  DashboardOutlined,
  EnvironmentOutlined,
  ShoppingOutlined,
  LineChartOutlined,
  SettingOutlined,
  UserOutlined,
  TeamOutlined,
  TagsOutlined,
  LogoutOutlined,
  CameraOutlined,
  DownOutlined,
  BarChartOutlined,
  CloudUploadOutlined,
  DollarOutlined,
} from '@ant-design/icons';
import { useEffect } from 'react';
import { getUser, logout, hasRole, getAvatarInitials, ROLE_LABELS } from '../../hooks/useAuth';
import '../styles/dashboard.css';

const { Sider, Content, Header } = Layout;
const { Text } = Typography;

export default function DashboardLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const user = getUser();

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!user) {
      navigate('/login');
    }
  }, [user, navigate]);

  if (!user) return null;

  const roleName = ROLE_LABELS[user.role] || user.role;
  const initials = getAvatarInitials(user.name);

  const isStaff = hasRole(['staff']);

  // Staff portal nav (for staff role only)
  const staffNavItems = [
    {
      type: 'group' as const,
      label: 'Công việc',
      children: [
        {
          key: '/dashboard/staff-upload',
          icon: <CloudUploadOutlined />,
          label: 'Upload Ảnh',
          onClick: () => navigate('/dashboard/staff-upload'),
        },
        {
          key: '/dashboard/staff-stats',
          icon: <BarChartOutlined />,
          label: 'Thống kê của tôi',
          onClick: () => navigate('/dashboard/staff-stats'),
        },
      ],
    },
    {
      type: 'group' as const,
      label: 'Tài khoản',
      children: [
        {
          key: '/dashboard/profile',
          icon: <UserOutlined />,
          label: 'Hồ sơ',
          onClick: () => navigate('/dashboard/profile'),
        },
      ],
    },
  ];

  // Admin nav items with role-based visibility
  const allNavItems = [
    {
      type: 'group' as const,
      label: 'Tổng quan',
      children: [
        {
          key: '/dashboard',
          icon: <DashboardOutlined />,
          label: 'Dashboard',
          onClick: () => navigate('/dashboard'),
        },
      ],
    },
    {
      type: 'group' as const,
      label: 'Quản lý',
      children: [
        {
          key: '/dashboard/locations',
          icon: <EnvironmentOutlined />,
          label: 'Địa Điểm',
          onClick: () => navigate('/dashboard/locations'),
        },
        {
          key: '/dashboard/orders',
          icon: <ShoppingOutlined />,
          label: 'Đơn hàng',
          onClick: () => navigate('/dashboard/orders'),
        },
        ...(hasRole(['admin-system'])
          ? [{
              key: '/dashboard/staff',
              icon: <TeamOutlined />,
              label: 'Nhân viên',
              onClick: () => navigate('/dashboard/staff'),
            }]
          : []),
      ],
    },
    {
      type: 'group' as const,
      label: 'Kinh doanh',
      children: [
        ...(hasRole(['admin-system', 'admin-sales'])
          ? [{
              key: '/dashboard/pricing',
              icon: <TagsOutlined />,
              label: 'Bảng giá',
              onClick: () => navigate('/dashboard/pricing'),
            }]
          : []),
        {
          key: '/dashboard/revenue',
          icon: <LineChartOutlined />,
          label: 'Doanh thu',
          onClick: () => navigate('/dashboard/revenue'),
        },
        {
          key: '/dashboard/staff-stats',
          icon: <BarChartOutlined />,
          label: 'Thống kê NV',
          onClick: () => navigate('/dashboard/staff-stats'),
        },
        ...(hasRole(['admin-system', 'admin-sales'])
          ? [{
              key: '/dashboard/payroll',
              icon: <DollarOutlined />,
              label: 'Lương NV',
              onClick: () => navigate('/dashboard/payroll'),
            }]
          : []),
      ],
    },
    ...(hasRole(['admin-system'])
      ? [{
          type: 'group' as const,
          label: 'Hệ thống',
          children: [
            {
              key: '/dashboard/settings',
              icon: <SettingOutlined />,
              label: 'Cài đặt',
              onClick: () => navigate('/dashboard/settings'),
            },
          ],
        }]
      : []),
  ];

  const userMenuItems: any[] = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: 'Hồ sơ',
      onClick: () => navigate('/dashboard/profile'),
    },
    ...(hasRole(['admin-system'])
      ? [{
          key: 'settings',
          icon: <SettingOutlined />,
          label: 'Cài đặt',
          onClick: () => navigate('/dashboard/settings'),
        }]
      : []),
    { type: 'divider' as const },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Đăng xuất',
      danger: true,
      onClick: () => {
        Modal.confirm({
          title: 'Xác nhận đăng xuất',
          content: 'Bạn có chắc muốn đăng xuất?',
          okText: 'Đăng xuất',
          cancelText: 'Hủy',
          okButtonProps: { danger: true },
          onOk: () => {
            logout();
            navigate('/login');
          },
        });
      },
    },
  ];

  const currentPath = location.pathname;

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* Sidebar */}
      <Sider
        width={240}
        theme="light"
        style={{
          position: 'fixed',
          left: 0,
          top: 0,
          height: '100vh',
          overflow: 'auto',
          borderRight: '1px solid #e2e5ea',
          zIndex: 100,
        }}
      >
        {/* Logo */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid #e2e5ea',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            cursor: 'pointer',
          }}
          onClick={() => navigate(isStaff ? '/dashboard/staff-upload' : '/dashboard')}
        >
          <CameraOutlined style={{ fontSize: 20, color: '#1a6b4e' }} />
          <Text strong style={{ fontSize: 16, color: '#1a6b4e' }}>
            {isStaff ? 'PhotoPro Staff' : 'PhotoPro Admin'}
          </Text>
        </div>

        {/* Navigation */}
        <Menu
          theme="light"
          mode="inline"
          selectedKeys={[currentPath]}
          style={{ border: 'none', marginTop: 8 }}
          items={isStaff ? staffNavItems : allNavItems}
        />
      </Sider>

      {/* Main Layout */}
      <Layout style={{ marginLeft: 240 }}>
        {/* Header */}
        <Header
          style={{
            background: '#fff',
            padding: '0 32px',
            borderBottom: '1px solid #e2e5ea',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            height: 64,
            position: 'sticky',
            top: 0,
            zIndex: 50,
          }}
        >
          <Dropdown menu={{ items: userMenuItems }} trigger={['click']}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 12px',
                border: '1px solid #e2e5ea',
                borderRadius: 8,
                cursor: 'pointer',
              }}
            >
              <Avatar
                style={{ background: '#e8f5f0', color: '#1a6b4e', fontWeight: 600 }}
                size={32}
              >
                {initials}
              </Avatar>
              <div style={{ lineHeight: 1.3 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{user.name}</div>
                <div style={{ fontSize: 11, color: '#8b91a0' }}>{roleName}</div>
              </div>
              <DownOutlined style={{ fontSize: 12, color: '#8b91a0' }} />
            </div>
          </Dropdown>
        </Header>

        {/* Content */}
        <Content style={{ padding: 32, background: '#f6f7f9', minHeight: 'calc(100vh - 64px)' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
