import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Tag, Alert, message, Spin } from 'antd';
import { CheckCircleOutlined, InboxOutlined, LinkOutlined, MobileOutlined, CopyOutlined, DownloadOutlined, ClockCircleOutlined, MessageOutlined, PhoneOutlined, SendOutlined, SearchOutlined, HomeOutlined, ReloadOutlined } from '@ant-design/icons';
import { AlertTriangle } from 'lucide-react';
import { apiClient } from '../../lib/api-client';
import '../styles/frontend.css';

interface PublicOrderStatus {
  order_code: string;
  customer_phone: string;
  photo_count: number;
  amount: number;
  payment_method: string | null;
  status: string;
  download_url: string | null;
  expires_at: string | null;
}

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  vnpay: 'VNPay', momo: 'Ví MoMo', payos: 'PayOS', bank: 'Chuyển khoản',
};

export default function Success() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const orderCode = searchParams.get('order') ?? '';

  const [order, setOrder] = useState<PublicOrderStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const [countdown, setCountdown] = useState({ hours: 0, minutes: 0, seconds: 0 });

  const fetchOrder = async () => {
    if (!orderCode) { setLoading(false); return; }
    try {
      const data = await apiClient.get<PublicOrderStatus>(`/api/v1/checkout/status/${orderCode}`);
      setOrder(data);
      if (data.expires_at) {
        const expiresAt = new Date(data.expires_at).getTime();
        const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
        setCountdown({
          hours: Math.floor(remaining / 3600),
          minutes: Math.floor((remaining % 3600) / 60),
          seconds: remaining % 60,
        });
      }
      // If already PAID and has download link, redirect immediately
      if (data.status === 'PAID' && data.download_url) {
        navigate(new URL(data.download_url).pathname, { replace: true });
      }
    } catch {
      setOrder(null);
    } finally {
      setLoading(false);
      setPolling(false);
    }
  };

  useEffect(() => { fetchOrder(); }, [orderCode]);

  // Countdown timer
  useEffect(() => {
    if (!order?.expires_at) return;
    const iv = setInterval(() => {
      setCountdown(prev => {
        let { hours, minutes, seconds } = prev;
        if (seconds > 0) return { hours, minutes, seconds: seconds - 1 };
        if (minutes > 0) return { hours, minutes: minutes - 1, seconds: 59 };
        if (hours > 0) return { hours: hours - 1, minutes: 59, seconds: 59 };
        clearInterval(iv);
        return prev;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [order?.expires_at]);

  const pad = (n: number) => String(n).padStart(2, '0');
  const formatPrice = (p: number) => p.toLocaleString('vi-VN') + 'đ';
  const handleCopyLink = () => {
    if (order?.download_url) {
      navigator.clipboard.writeText(order.download_url);
      message.success('Đã sao chép link!');
    }
  };

  if (loading) {
    return (
      <div style={{ paddingTop: '140px', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" tip="Đang tải thông tin đơn hàng..." />
      </div>
    );
  }

  if (!order) {
    return (
      <div style={{ paddingTop: '120px', minHeight: '100vh', padding: '120px 24px 40px' }}>
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <Alert
            type="error"
            showIcon
            message="Không tìm thấy đơn hàng"
            description={`Mã đơn "${orderCode}" không tồn tại. Vui lòng kiểm tra lại.`}
            action={<Button onClick={() => navigate('/lookup')}>Tra cứu đơn</Button>}
          />
        </div>
      </div>
    );
  }

  return (
    <div style={{ paddingTop: '120px', paddingBottom: '40px', minHeight: '100vh' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 20px' }}>

        {/* Success animation */}
        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ fontSize: '80px', marginBottom: '12px', animation: 'scaleIn 0.5s ease-out' }}><CheckCircleOutlined style={{ color: '#1a6b4e' }} /></div>
          <h1 style={{ fontSize: '32px', margin: '24px 0 12px', fontWeight: 700 }}>Đặt Hàng Thành Công!</h1>
          <p style={{ color: '#999', fontSize: '18px', margin: 0 }}>Cảm ơn bạn đã sử dụng dịch vụ của chúng tôi</p>
        </div>

        {/* Order info */}
        <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #e0e0e0', padding: '16px', marginBottom: '16px', maxWidth: '600px', marginLeft: 'auto', marginRight: 'auto' }}>
          <h3 style={{ marginBottom: '12px', fontSize: '1rem', fontWeight: 700 }}><InboxOutlined /> Thông Tin Đơn Hàng</h3>
          <div style={{ display: 'grid', gap: '12px' }}>
            {[
              ['Mã đơn hàng', order.order_code],
              ['Số điện thoại', order.customer_phone],
              ['Số lượng ảnh', `${order.photo_count} ảnh`],
              ['Tổng tiền', formatPrice(order.amount)],
              ['Phương thức', PAYMENT_METHOD_LABEL[order.payment_method ?? ''] ?? order.payment_method ?? '—'],
            ].map(([label, val]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: '#f9f9f9', borderRadius: '8px' }}>
                <span style={{ color: '#999' }}>{label}:</span>
                <strong>{val}</strong>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: '#f9f9f9', borderRadius: '8px' }}>
              <span style={{ color: '#999' }}>Trạng thái:</span>
              <Tag color={order.status === 'PAID' ? 'green' : 'orange'} style={{ fontSize: '12px', fontWeight: 600, padding: '4px 12px' }}>
                {order.status === 'PAID' ? 'Đã thanh toán' : 'Đang xử lý'}
              </Tag>
            </div>
          </div>
        </div>

        {/* Download link (only if PAID) */}
        {order.status === 'PAID' && order.download_url ? (
          <div style={{ maxWidth: '600px', marginLeft: 'auto', marginRight: 'auto', background: '#1a6b4e', color: 'white', padding: '24px', borderRadius: '8px', marginBottom: '16px' }}>
            <div style={{ textAlign: 'center' }}>
              <h3 style={{ color: 'white', marginBottom: '16px', fontSize: '1.1rem', fontWeight: 700 }}><LinkOutlined /> Link Tải Ảnh</h3>
              <div style={{ background: 'white', padding: '20px', borderRadius: '12px', display: 'inline-block', marginBottom: '16px' }}>
                <div style={{ width: '160px', height: '160px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '60px', color: '#1a6b4e' }}>
                  <MobileOutlined />
                </div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.15)', padding: '16px', borderRadius: '12px', marginBottom: '16px' }}>
                <p style={{ fontSize: '14px', opacity: 0.9, marginBottom: '8px' }}>Link tải ảnh của bạn:</p>
                <div style={{ background: 'white', padding: '12px', borderRadius: '8px', wordBreak: 'break-all' }}>
                  <code style={{ color: '#1a6b4e', fontWeight: 600, fontSize: '12px' }}>{order.download_url}</code>
                </div>
              </div>
              <Button block onClick={handleCopyLink} icon={<CopyOutlined />} style={{ background: 'white', color: '#1a6b4e', fontWeight: 600, marginBottom: '12px', height: 'auto', padding: '12px 24px' }}>Sao Chép Link</Button>
              <Button block onClick={() => { const p = new URL(order.download_url!).pathname; navigate(p); }} icon={<DownloadOutlined />} style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none', fontWeight: 600, height: 'auto', padding: '12px 24px' }}>Tải Ảnh Ngay</Button>
            </div>
          </div>
        ) : (
          <div style={{ maxWidth: '600px', marginLeft: 'auto', marginRight: 'auto', background: '#fff8e1', border: '1px solid #ffd54f', borderRadius: '8px', padding: '24px', marginBottom: '16px', textAlign: 'center' }}>
            <h3 style={{ color: '#f57c00', marginBottom: '12px' }}>Đang xác nhận thanh toán...</h3>
            <p style={{ color: '#666', marginBottom: '16px' }}>Link tải ảnh sẽ xuất hiện sau khi hệ thống xác nhận thanh toán của bạn.</p>
            <Button icon={<ReloadOutlined spin={polling} />} onClick={() => { setPolling(true); fetchOrder(); }} loading={polling}>Kiểm tra lại</Button>
          </div>
        )}

        {/* Countdown (only when PAID + has expiry) */}
        {order.status === 'PAID' && order.expires_at && (
          <div style={{ maxWidth: '600px', marginLeft: 'auto', marginRight: 'auto', background: '#fff', borderRadius: '8px', border: '2px solid #1a6b4e', padding: '24px', marginBottom: '16px' }}>
            <div style={{ textAlign: 'center' }}>
              <h3 style={{ color: '#1a6b4e', marginBottom: '16px', fontSize: '1.1rem', fontWeight: 700 }}><ClockCircleOutlined /> Thời Gian Còn Lại</h3>
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                {[['hours', 'Giờ'], ['minutes', 'Phút'], ['seconds', 'Giây']].map(([k, label], i) => (
                  <>
                    {i > 0 && <div key={`sep-${k}`} style={{ fontSize: '24px', fontWeight: 700, color: '#1a6b4e' }}>:</div>}
                    <div key={k} style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '36px', fontWeight: 700, color: '#1a6b4e', lineHeight: 1 }}>{pad(countdown[k as keyof typeof countdown])}</div>
                      <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>{label}</div>
                    </div>
                  </>
                ))}
              </div>
              <Alert type="warning" showIcon message={<><AlertTriangle className="w-4 h-4" style={{ display: 'inline', marginRight: 4 }} />Link hết hạn vào <strong>{new Date(order.expires_at).toLocaleString('vi-VN')}</strong>. Tải ảnh trước khi hết hạn!</>} />
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div style={{ maxWidth: '700px', margin: '0 auto', display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
          {order.status === 'PAID' && order.download_url && (
            <Button type="primary" style={{ flex: '1', minWidth: '140px' }} icon={<DownloadOutlined />} onClick={() => navigate(new URL(order.download_url!).pathname)}>Tải Ảnh Ngay</Button>
          )}
          <Button style={{ flex: '1', minWidth: '140px' }} icon={<SearchOutlined />} onClick={() => navigate('/lookup')}>Tra Cứu Đơn Hàng</Button>
          <Button style={{ flex: '1', minWidth: '140px' }} icon={<HomeOutlined />} onClick={() => navigate('/')}>Về Trang Chủ</Button>
        </div>

        {/* Contact */}
        <div style={{ maxWidth: '600px', margin: '20px auto 0', background: '#fff', borderRadius: '8px', border: '1px solid #e0e0e0', padding: '16px', textAlign: 'center' }}>
          <h3 style={{ marginBottom: '12px', fontSize: '1rem', fontWeight: 700 }}><MessageOutlined /> Cần Hỗ Trợ?</h3>
          <p style={{ color: '#999', marginBottom: '16px', fontSize: '14px' }}>Link đã được gửi qua SMS. Nếu không nhận được, vui lòng liên hệ:</p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button href="tel:0987654321" icon={<PhoneOutlined />}>0987 654 321</Button>
            <Button icon={<MessageOutlined />}>Chat Zalo</Button>
            <Button icon={<SendOutlined />}>Messenger</Button>
          </div>
        </div>
      </div>

      <style>{`@keyframes scaleIn { from { transform: scale(0); } to { transform: scale(1); } }`}</style>
    </div>
  );
}

interface OrderInfo {
  code: string;
  phone: string;
  photoCount: number;
  total: number;
  paymentMethod: string;
  downloadLink: string;
  expiryHours: number;
}

export default function Success() {
  const navigate = useNavigate();
  
  // Order data state - reads from localStorage set by Checkout
  const [order, setOrder] = useState<OrderInfo>(() => {
    try {
      const saved = localStorage.getItem('photopro_order');
      if (saved) return JSON.parse(saved);
    } catch { /* ignore */ }
    return {
      code: 'WL1541',
      phone: '0933282050',
      photoCount: 1,
      total: 20000,
      paymentMethod: 'Ví MoMo',
      downloadLink: 'https://studio-abc.photopro.vn/d/CG9A88U963NN',
      expiryHours: 24
    };
  });

  const [countdown, setCountdown] = useState(() => {
    try {
      const saved = localStorage.getItem('photopro_order');
      if (saved) {
        const parsed = JSON.parse(saved);
        return { hours: parsed.expiryHours ?? 24, minutes: 0, seconds: 0 };
      }
    } catch { /* ignore */ }
    return { hours: 24, minutes: 0, seconds: 0 };
  });

  // Countdown timer effect
  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown((prev) => {
        let { hours, minutes, seconds } = prev;
        
        if (seconds > 0) {
          seconds -= 1;
        } else if (minutes > 0) {
          minutes -= 1;
          seconds = 59;
        } else if (hours > 0) {
          hours -= 1;
          minutes = 59;
          seconds = 59;
        } else {
          clearInterval(interval);
          return prev;
        }
        
        return { hours, minutes, seconds };
      });
    }, 1000);
    
    return () => clearInterval(interval);
  }, []);

  // Format countdown numbers with leading zeros
  const pad = (num: number): string => String(num).padStart(2, '0');

  // Copy download link to clipboard
  const handleCopyLink = () => {
    navigator.clipboard.writeText(order.downloadLink);
    message.success('Đã sao chép link!');
  };

  // Format currency
  const formatPrice = (price: number): string => {
    return price.toLocaleString('vi-VN') + 'đ';
  };

  return (
    <div style={{ paddingTop: '120px', paddingBottom: '40px', minHeight: '100vh' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 20px' }}>
        
        {/* ========== Success Animation ========== */}
        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ fontSize: '80px', marginBottom: '12px', animation: 'scaleIn 0.5s ease-out' }}><CheckCircleOutlined /></div>
          <h1 style={{ fontSize: '32px', margin: '24px 0 12px', fontWeight: 700 }}>Đặt Hàng Thành Công!</h1>
          <p style={{ color: '#999', fontSize: '18px', margin: 0 }}>
            Cảm ơn bạn đã sử dụng dịch vụ của chúng tôi
          </p>
        </div>

        {/* ========== Order Info ========== */}
        <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #e0e0e0', padding: '16px', marginBottom: '16px', maxWidth: '600px', marginLeft: 'auto', marginRight: 'auto' }}>
          <h3 style={{ marginBottom: '12px', fontSize: '1rem', fontWeight: 700 }}><InboxOutlined /> Thông Tin Đơn Hàng</h3>
          
          <div style={{ display: 'grid', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: '#f9f9f9', borderRadius: '8px' }}>
              <span style={{ color: '#999' }}>Mã đơn hàng:</span>
              <strong>{order.code}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: '#f9f9f9', borderRadius: '8px' }}>
              <span style={{ color: '#999' }}>Số điện thoại:</span>
              <strong>{order.phone}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: '#f9f9f9', borderRadius: '8px' }}>
              <span style={{ color: '#999' }}>Số lượng ảnh:</span>
              <strong>{order.photoCount} ảnh</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: '#f9f9f9', borderRadius: '8px' }}>
              <span style={{ color: '#999' }}>Tổng tiền:</span>
              <strong style={{ color: 'var(--primary)' }}>{formatPrice(order.total)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: '#f9f9f9', borderRadius: '8px' }}>
              <span style={{ color: '#999' }}>Phương thức:</span>
              <strong>{order.paymentMethod}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: '#f9f9f9', borderRadius: '8px' }}>
              <span style={{ color: '#999' }}>Trạng thái:</span>
              <Tag color="green" style={{ fontSize: '12px', fontWeight: 600, padding: '4px 12px' }}>Đã thanh toán</Tag>
            </div>
          </div>
        </div>

        {/* ========== Download Link ========== */}
        <div style={{ maxWidth: '600px', marginLeft: 'auto', marginRight: 'auto', background: '#1a6b4e', color: 'white', padding: '24px', borderRadius: '8px', marginBottom: '16px' }}>
          <div style={{ textAlign: 'center' }}>
            <h3 style={{ color: 'white', marginBottom: '16px', fontSize: '1.1rem', fontWeight: 700 }}><LinkOutlined /> Link Tải Ảnh</h3>
            
            {/* QR Code */}
            <div style={{ background: 'white', padding: '20px', borderRadius: '12px', display: 'inline-block', marginBottom: '16px' }}>
              <div style={{ width: '160px', height: '160px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '60px', color: '#1a6b4e' }}>
                <MobileOutlined />
              </div>
            </div>
            
            {/* Download Link Display */}
            <div style={{ background: 'rgba(255,255,255,0.15)', padding: '16px', borderRadius: '12px', marginBottom: '16px' }}>
              <p style={{ fontSize: '14px', opacity: 0.9, marginBottom: '8px' }}>Link tải ảnh của bạn:</p>
              <div style={{ background: 'white', padding: '12px', borderRadius: '8px', wordBreak: 'break-all' }}>
                <code style={{ color: '#1a6b4e', fontWeight: 600, fontSize: '12px' }}>
                  {order.downloadLink}
                </code>
              </div>
            </div>

            {/* Copy Button */}
            <Button
              block
              onClick={handleCopyLink}
              icon={<CopyOutlined />}
              style={{ background: 'white', color: '#1a6b4e', fontWeight: 600, marginBottom: '12px', height: 'auto', padding: '12px 24px' }}
            >
              Sao Chép Link
            </Button>
            
            {/* Download Button */}
            <Button
              block
              onClick={() => navigate('/delivery')}
              icon={<DownloadOutlined />}
              style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none', fontWeight: 600, height: 'auto', padding: '12px 24px' }}
            >
              Tải Ảnh Ngay
            </Button>
          </div>
        </div>

        {/* ========== Countdown & Warning ========== */}
        <div style={{ maxWidth: '600px', marginLeft: 'auto', marginRight: 'auto', background: '#fff', borderRadius: '8px', border: '2px solid #1a6b4e', padding: '24px', marginBottom: '16px' }}>
          <div style={{ textAlign: 'center' }}>
            <h3 style={{ color: '#1a6b4e', marginBottom: '16px', fontSize: '1.1rem', fontWeight: 700 }}><ClockCircleOutlined /> Thời Gian Còn Lại</h3>
            
            {/* Countdown Timer */}
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '36px', fontWeight: 700, color: '#1a6b4e', lineHeight: 1 }}>{pad(countdown.hours)}</div>
                <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>Giờ</div>
              </div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: '#1a6b4e' }}>:</div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '36px', fontWeight: 700, color: '#1a6b4e', lineHeight: 1 }}>{pad(countdown.minutes)}</div>
                <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>Phút</div>
              </div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: '#1a6b4e' }}>:</div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '36px', fontWeight: 700, color: '#1a6b4e', lineHeight: 1 }}>{pad(countdown.seconds)}</div>
                <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>Giây</div>
              </div>
            </div>

            <div style={{ background: 'rgba(26, 107, 78, 0.08)', border: '1px solid rgba(26, 107, 78, 0.2)', borderRadius: '8px', padding: '16px', marginTop: '16px', textAlign: 'left' }}>
              <strong style={{ display: 'flex', alignItems: 'center', gap: 6 }}><AlertTriangle className="w-4 h-4" style={{ flexShrink: 0 }} /> Lưu ý quan trọng:</strong>
              <ul style={{ margin: '8px 0 0 20px', padding: 0 }}>
                <li>Link chỉ có hiệu lực trong <strong>{order.expiryHours} giờ</strong></li>
                <li>Vui lòng tải ảnh về trước khi hết hạn</li>
                <li>Sau khi hết hạn, link sẽ không thể truy cập</li>
                <li>Liên hệ hotline nếu cần hỗ trợ</li>
              </ul>
            </div>
          </div>
        </div>

        {/* ========== Contact Support ========== */}
        <div style={{ maxWidth: '600px', marginLeft: 'auto', marginRight: 'auto', background: '#fff', borderRadius: '8px', border: '1px solid #e0e0e0', padding: '16px', marginBottom: '24px', textAlign: 'center' }}>
          <h3 style={{ marginBottom: '12px', fontSize: '1rem', fontWeight: 700 }}><MessageOutlined /> Cần Hỗ Trợ?</h3>
          <p style={{ color: '#999', marginBottom: '16px', fontSize: '14px' }}>
            Link đã được gửi qua SMS. Nếu không nhận được, vui lòng liên hệ:
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button href="tel:0987654321" icon={<PhoneOutlined />}>0987 654 321</Button>
            <Button href="https://zalo.me/wonderlandphoto" target="_blank" rel="noopener noreferrer" icon={<MessageOutlined />}>Chat Zalo</Button>
            <Button href="https://m.me/wonderlandphoto" target="_blank" rel="noopener noreferrer" icon={<SendOutlined />}>Messenger</Button>
          </div>
        </div>

        {/* ========== Action Buttons ========== */}
        <div style={{ maxWidth: '700px', margin: '0 auto', display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <Button
            type="primary"
            style={{ flex: '1', minWidth: '140px' }}
            icon={<DownloadOutlined />}
            onClick={() => navigate('/delivery')}
          >
            Tải Ảnh Ngay
          </Button>
          <Button
            style={{ flex: '1', minWidth: '140px' }}
            icon={<SearchOutlined />}
            onClick={() => navigate('/lookup')}
          >
            Tra Cứu Đơn Hàng
          </Button>
          <Button
            style={{ flex: '1', minWidth: '140px' }}
            icon={<HomeOutlined />}
            onClick={() => navigate('/')}
          >
            Về Trang Chủ
          </Button>
        </div>

      </div>
      
      <style>{`
        @keyframes scaleIn {
          from {
            transform: scale(0);
          }
          to {
            transform: scale(1);
          }
        }
      `}</style>
    </div>
  );
}
