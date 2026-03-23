import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Form, Input, Button, Checkbox,
  Typography, Alert, ConfigProvider,
} from 'antd';
import { MailOutlined, LockOutlined } from '@ant-design/icons';
import { Camera, UploadCloud, BarChart2, MapPin } from 'lucide-react';
import { useAdminAuth } from '../hooks/useAdminAuth';

const { Title, Text, Link } = Typography;

export default function Login() {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');
  const { login } = useAdminAuth();

  useEffect(() => {
    try {
      const raw = localStorage.getItem('photopro_user');
      if (raw) {
        const u = JSON.parse(raw);
        if (u.rememberMe) navigate(u.role === 'staff' ? '/dashboard/staff-upload' : '/dashboard');
      }
    } catch { /* empty */ }
  }, [navigate]);

  const onFinish = async (values: { username: string; password: string; remember: boolean }) => {
    setError('');
    setLoading(true);
    try {
      const result = await login(values.username.trim(), values.password);
      // useAdminAuth.login also stores photopro_user with rememberMe injected
      if (values.remember) {
        try {
          const raw = localStorage.getItem('photopro_user');
          if (raw) {
            const u = JSON.parse(raw);
            u.rememberMe = true;
            localStorage.setItem('photopro_user', JSON.stringify(u));
          }
        } catch { /* ignore */ }
      }
      navigate(result.role === 'MANAGER' ? '/dashboard/staff-upload' : '/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tên đăng nhập hoặc mật khẩu không đúng!');
    }
    setLoading(false);
  };

  return (
    <ConfigProvider theme={{ token: { colorPrimary: '#1a6b4e' } }}>
    <div style={{
      display: 'flex', minHeight: '100vh',
      fontFamily: "'Be Vietnam Pro', -apple-system, sans-serif",
      background: '#f0f2f5',
    }}>

      {/* ====== LEFT PANEL: BRANDING ====== */}
      <div className="login-brand-panel" style={{
        flex: 1,
        background: 'linear-gradient(160deg, #0a4d36 0%, #1a6b4e 40%, #145a3e 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative', overflow: 'hidden', padding: 48,
      }}>
        {/* Floating shapes */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {[
            { w: 420, h: 420, top: -120, right: -80, left: 'auto', bottom: 'auto', anim: 'floatA 20s ease-in-out infinite' },
            { w: 320, h: 320, bottom: -60, left: -80, top: 'auto', right: 'auto', anim: 'floatA 25s ease-in-out infinite reverse' },
            { w: 200, h: 200, top: '45%', left: '55%', right: 'auto', bottom: 'auto', anim: 'floatA 18s ease-in-out 3s infinite' },
          ].map((s, i) => (
            <div key={i} style={{
              position: 'absolute', borderRadius: '50%', opacity: 0.07, background: '#fff',
              width: s.w, height: s.h,
              top: s.top as any, right: s.right as any, bottom: s.bottom as any, left: s.left as any,
              animation: s.anim,
            }} />
          ))}
        </div>

        {/* Content */}
        <div style={{ position: 'relative', zIndex: 1, color: '#fff', maxWidth: 460, width: '100%' }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 56 }}>
            <div style={{
              width: 52, height: 52, borderRadius: 14,
              background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            ><Camera className="w-7 h-7" /></div>
            <span style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.5px' }}>PhotoPro</span>
          </div>

          {/* Hero */}
          <div style={{ marginBottom: 48 }}>
            <h1 style={{ fontFamily: "'Be Vietnam Pro', sans-serif", fontSize: 34, fontWeight: 800, lineHeight: 1.25, margin: '0 0 16px', letterSpacing: '-0.5px', color: '#fff' }}>
              Quản lý ảnh chuyên nghiệp
            </h1>
            <p style={{ fontSize: 15, lineHeight: 1.7, opacity: 0.78, margin: 0 }}>
              Nền tảng quản lý và bán ảnh du lịch chuyên nghiệp cho các doanh nghiệp du lịch, khu vui chơi giải trí.<br />
              Upload, quản lý đơn hàng, theo dõi doanh thu — tất cả trong một hệ thống.
            </p>
          </div>

          {/* Features */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 56 }}>
            {([
              { icon: <UploadCloud className="w-5 h-5" />, title: 'Upload nhanh chóng',  sub: 'Tải lên hàng nghìn ảnh mỗi ngày' },
              { icon: <BarChart2 className="w-5 h-5" />,   title: 'Thống kê chi tiết',    sub: 'Doanh thu, hiệu suất theo thời gian thực' },
              { icon: <MapPin className="w-5 h-5" />,      title: 'Đa địa điểm',          sub: 'Quản lý nhiều điểm chụp cùng lúc' },
            ] as { icon: React.ReactNode; title: string; sub: string }[]).map((f) => (
              <div key={f.title} style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                  background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(6px)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>{f.icon}</div>
                <div>
                  <strong style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{f.title}</strong>
                  <span style={{ fontSize: 13, opacity: 0.65 }}>{f.sub}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{ paddingTop: 32, borderTop: '1px solid rgba(255,255,255,0.12)' }}>
            <p style={{ margin: 0, fontSize: 13, opacity: 0.45 }}>© 2026 PhotoPro · Hồ Chí Minh, Việt Nam</p>
          </div>
        </div>
      </div>

      {/* ====== RIGHT PANEL: FORM ====== */}
      <div style={{
        width: 520, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#fff', padding: 48, overflowY: 'auto',
      }}>
        <div style={{ width: '100%', maxWidth: 380 }}>

          {/* Header */}
          <div style={{ marginBottom: 32 }}>
            <Title level={2} style={{ margin: '0 0 8px', color: '#1a1d23', letterSpacing: '-0.3px' }}>
              Đăng nhập
            </Title>
            <Text type="secondary">Chào mừng bạn quay lại! Vui lòng nhập thông tin.</Text>
          </div>

          {/* Error */}
          {error && (
            <Alert
              message={error}
              type="error"
              showIcon
              style={{ marginBottom: 16, borderRadius: 8 }}
            />
          )}

          {/* Antd Form */}
          <Form form={form} layout="vertical" onFinish={onFinish} requiredMark={false} autoComplete="on">
            <Form.Item
              label={<span style={{ fontWeight: 600 }}>Email</span>}
              name="username"
              rules={[{ required: true, message: 'Vui lòng nhập email' }]}
            >
              <Input
                prefix={<MailOutlined style={{ color: '#8b91a0' }} />}
                placeholder="admin@photopro.vn"
                size="large"
                autoComplete="username"
              />
            </Form.Item>

            <Form.Item
              label={<span style={{ fontWeight: 600 }}>Mật khẩu</span>}
              name="password"
              rules={[{ required: true, message: 'Vui lòng nhập mật khẩu' }]}
            >
              <Input.Password
                prefix={<LockOutlined style={{ color: '#8b91a0' }} />}
                placeholder="••••••••"
                size="large"
                autoComplete="current-password"
              />
            </Form.Item>

            <Form.Item style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Form.Item name="remember" valuePropName="checked" noStyle>
                  <Checkbox>Ghi nhớ đăng nhập</Checkbox>
                </Form.Item>
                <Link href="#" style={{ fontSize: 13 }}>Quên mật khẩu?</Link>
              </div>
            </Form.Item>

            <Form.Item style={{ marginBottom: 0 }}>
              <Button
                type="primary"
                htmlType="submit"
                block
                loading={loading}
                size="large"
                style={{ height: 46, fontSize: 15, fontWeight: 600, borderRadius: 10 }}
              >
                Đăng Nhập
              </Button>
            </Form.Item>
          </Form>

          {/* Footer */}
          <div style={{ marginTop: 32, textAlign: 'center', fontSize: 12, color: '#8b91a0' }}>
            {['Điều khoản', 'Chính sách', 'Hỗ trợ'].map((t, i) => (
              <span key={t}>
                {i > 0 && <span style={{ margin: '0 6px' }}>·</span>}
                <Link href="#" style={{ color: '#5a6170', fontSize: 12 }}>{t}</Link>
              </span>
            ))}
          </div>

        </div>
      </div>

      {/* Keyframe CSS */}
      <style>{`
        @keyframes floatA {
          0%, 100% { transform: translate(0,0) scale(1); }
          33%       { transform: translate(25px,-18px) scale(1.04); }
          66%       { transform: translate(-18px,12px) scale(0.96); }
        }
        @media (max-width: 1024px) {
          .login-brand-panel { display: none !important; }
        }
      `}</style>
    </div>
    </ConfigProvider>
  );
}

