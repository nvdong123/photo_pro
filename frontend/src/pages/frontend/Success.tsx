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
  vnpay: 'VNPay', momo: 'VÃ­ MoMo', payos: 'PayOS', bank: 'Chuyá»ƒn khoáº£n',
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
  const formatPrice = (p: number) => p.toLocaleString('vi-VN') + 'Ä‘';
  const handleCopyLink = () => {
    if (order?.download_url) {
      navigator.clipboard.writeText(order.download_url);
      message.success('ÄÃ£ sao chÃ©p link!');
    }
  };

  if (loading) {
    return (
      <div style={{ paddingTop: '140px', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" tip="Äang táº£i thÃ´ng tin Ä‘Æ¡n hÃ ng..." />
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
            message="KhÃ´ng tÃ¬m tháº¥y Ä‘Æ¡n hÃ ng"
            description={`MÃ£ Ä‘Æ¡n "${orderCode}" khÃ´ng tá»“n táº¡i. Vui lÃ²ng kiá»ƒm tra láº¡i.`}
            action={<Button onClick={() => navigate('/lookup')}>Tra cá»©u Ä‘Æ¡n</Button>}
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
          <h1 style={{ fontSize: '32px', margin: '24px 0 12px', fontWeight: 700 }}>Äáº·t HÃ ng ThÃ nh CÃ´ng!</h1>
          <p style={{ color: '#999', fontSize: '18px', margin: 0 }}>Cáº£m Æ¡n báº¡n Ä‘Ã£ sá»­ dá»¥ng dá»‹ch vá»¥ cá»§a chÃºng tÃ´i</p>
        </div>

        {/* Order info */}
        <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #e0e0e0', padding: '16px', marginBottom: '16px', maxWidth: '600px', marginLeft: 'auto', marginRight: 'auto' }}>
          <h3 style={{ marginBottom: '12px', fontSize: '1rem', fontWeight: 700 }}><InboxOutlined /> ThÃ´ng Tin ÄÆ¡n HÃ ng</h3>
          <div style={{ display: 'grid', gap: '12px' }}>
            {[
              ['MÃ£ Ä‘Æ¡n hÃ ng', order.order_code],
              ['Sá»‘ Ä‘iá»‡n thoáº¡i', order.customer_phone],
              ['Sá»‘ lÆ°á»£ng áº£nh', `${order.photo_count} áº£nh`],
              ['Tá»•ng tiá»n', formatPrice(order.amount)],
              ['PhÆ°Æ¡ng thá»©c', PAYMENT_METHOD_LABEL[order.payment_method ?? ''] ?? order.payment_method ?? 'â€”'],
            ].map(([label, val]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: '#f9f9f9', borderRadius: '8px' }}>
                <span style={{ color: '#999' }}>{label}:</span>
                <strong>{val}</strong>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: '#f9f9f9', borderRadius: '8px' }}>
              <span style={{ color: '#999' }}>Tráº¡ng thÃ¡i:</span>
              <Tag color={order.status === 'PAID' ? 'green' : 'orange'} style={{ fontSize: '12px', fontWeight: 600, padding: '4px 12px' }}>
                {order.status === 'PAID' ? 'ÄÃ£ thanh toÃ¡n' : 'Äang xá»­ lÃ½'}
              </Tag>
            </div>
          </div>
        </div>

        {/* Download link (only if PAID) */}
        {order.status === 'PAID' && order.download_url ? (
          <div style={{ maxWidth: '600px', marginLeft: 'auto', marginRight: 'auto', background: '#1a6b4e', color: 'white', padding: '24px', borderRadius: '8px', marginBottom: '16px' }}>
            <div style={{ textAlign: 'center' }}>
              <h3 style={{ color: 'white', marginBottom: '16px', fontSize: '1.1rem', fontWeight: 700 }}><LinkOutlined /> Link Táº£i áº¢nh</h3>
              <div style={{ background: 'white', padding: '20px', borderRadius: '12px', display: 'inline-block', marginBottom: '16px' }}>
                <div style={{ width: '160px', height: '160px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '60px', color: '#1a6b4e' }}>
                  <MobileOutlined />
                </div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.15)', padding: '16px', borderRadius: '12px', marginBottom: '16px' }}>
                <p style={{ fontSize: '14px', opacity: 0.9, marginBottom: '8px' }}>Link táº£i áº£nh cá»§a báº¡n:</p>
                <div style={{ background: 'white', padding: '12px', borderRadius: '8px', wordBreak: 'break-all' }}>
                  <code style={{ color: '#1a6b4e', fontWeight: 600, fontSize: '12px' }}>{order.download_url}</code>
                </div>
              </div>
              <Button block onClick={handleCopyLink} icon={<CopyOutlined />} style={{ background: 'white', color: '#1a6b4e', fontWeight: 600, marginBottom: '12px', height: 'auto', padding: '12px 24px' }}>Sao ChÃ©p Link</Button>
              <Button block onClick={() => { const p = new URL(order.download_url!).pathname; navigate(p); }} icon={<DownloadOutlined />} style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none', fontWeight: 600, height: 'auto', padding: '12px 24px' }}>Táº£i áº¢nh Ngay</Button>
            </div>
          </div>
        ) : (
          <div style={{ maxWidth: '600px', marginLeft: 'auto', marginRight: 'auto', background: '#fff8e1', border: '1px solid #ffd54f', borderRadius: '8px', padding: '24px', marginBottom: '16px', textAlign: 'center' }}>
            <h3 style={{ color: '#f57c00', marginBottom: '12px' }}>Äang xÃ¡c nháº­n thanh toÃ¡n...</h3>
            <p style={{ color: '#666', marginBottom: '16px' }}>Link táº£i áº£nh sáº½ xuáº¥t hiá»‡n sau khi há»‡ thá»‘ng xÃ¡c nháº­n thanh toÃ¡n cá»§a báº¡n.</p>
            <Button icon={<ReloadOutlined spin={polling} />} onClick={() => { setPolling(true); fetchOrder(); }} loading={polling}>Kiá»ƒm tra láº¡i</Button>
          </div>
        )}

        {/* Countdown (only when PAID + has expiry) */}
        {order.status === 'PAID' && order.expires_at && (
          <div style={{ maxWidth: '600px', marginLeft: 'auto', marginRight: 'auto', background: '#fff', borderRadius: '8px', border: '2px solid #1a6b4e', padding: '24px', marginBottom: '16px' }}>
            <div style={{ textAlign: 'center' }}>
              <h3 style={{ color: '#1a6b4e', marginBottom: '16px', fontSize: '1.1rem', fontWeight: 700 }}><ClockCircleOutlined /> Thá»i Gian CÃ²n Láº¡i</h3>
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                {[['hours', 'Giá»'], ['minutes', 'PhÃºt'], ['seconds', 'GiÃ¢y']].map(([k, label], i) => (
                  <>
                    {i > 0 && <div key={`sep-${k}`} style={{ fontSize: '24px', fontWeight: 700, color: '#1a6b4e' }}>:</div>}
                    <div key={k} style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '36px', fontWeight: 700, color: '#1a6b4e', lineHeight: 1 }}>{pad(countdown[k as keyof typeof countdown])}</div>
                      <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>{label}</div>
                    </div>
                  </>
                ))}
              </div>
              <Alert type="warning" showIcon message={<><AlertTriangle className="w-4 h-4" style={{ display: 'inline', marginRight: 4 }} />Link háº¿t háº¡n vÃ o <strong>{new Date(order.expires_at).toLocaleString('vi-VN')}</strong>. Táº£i áº£nh trÆ°á»›c khi háº¿t háº¡n!</>} />
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div style={{ maxWidth: '700px', margin: '0 auto', display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
          {order.status === 'PAID' && order.download_url && (
            <Button type="primary" style={{ flex: '1', minWidth: '140px' }} icon={<DownloadOutlined />} onClick={() => navigate(new URL(order.download_url!).pathname)}>Táº£i áº¢nh Ngay</Button>
          )}
          <Button style={{ flex: '1', minWidth: '140px' }} icon={<SearchOutlined />} onClick={() => navigate('/lookup')}>Tra Cá»©u ÄÆ¡n HÃ ng</Button>
          <Button style={{ flex: '1', minWidth: '140px' }} icon={<HomeOutlined />} onClick={() => navigate('/')}>Vá» Trang Chá»§</Button>
        </div>

        {/* Contact */}
        <div style={{ maxWidth: '600px', margin: '20px auto 0', background: '#fff', borderRadius: '8px', border: '1px solid #e0e0e0', padding: '16px', textAlign: 'center' }}>
          <h3 style={{ marginBottom: '12px', fontSize: '1rem', fontWeight: 700 }}><MessageOutlined /> Cáº§n Há»— Trá»£?</h3>
          <p style={{ color: '#999', marginBottom: '16px', fontSize: '14px' }}>Link Ä‘Ã£ Ä‘Æ°á»£c gá»­i qua SMS. Náº¿u khÃ´ng nháº­n Ä‘Æ°á»£c, vui lÃ²ng liÃªn há»‡:</p>
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
