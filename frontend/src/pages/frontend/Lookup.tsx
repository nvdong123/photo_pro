import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, Radio, message, Card, Tag, Empty } from 'antd';
import { SearchOutlined, BulbOutlined, QuestionCircleOutlined, PhoneOutlined, MessageOutlined, MailOutlined, DownloadOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { apiClient } from '../../lib/api-client';
import { usePublicSettings } from '../../hooks/useSettings';
import '../styles/frontend.css';

interface OrderResult {
  order_code: string;
  customer_phone: string;
  photo_count: number;
  amount: number;
  payment_method: string | null;
  status: string;
  download_url: string | null;
  expires_at: string | null;
}

export default function Lookup() {
  const navigate = useNavigate();
  const [searchType, setSearchType] = useState<'code' | 'phone'>('code');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<OrderResult[]>([]);
  const [searched, setSearched] = useState(false);
  const { hotline, zaloLink } = usePublicSettings();

  const handleSearch = async (values: { searchInput: string }) => {
    const input = values.searchInput?.trim();
    if (!input) return;
    setIsSearching(true);
    setResults([]);
    setSearched(false);
    try {
      if (searchType === 'code') {
        const data: any = await apiClient.get(`/api/v1/checkout/status/${encodeURIComponent(input)}`);
        if (data) {
          setResults([data]);
        }
      } else {
        const data: any = await apiClient.get(`/api/v1/checkout/by-phone/${encodeURIComponent(input)}`);
        const orders: OrderResult[] = Array.isArray(data) ? data : [];
        setResults(orders);
      }
      setSearched(true);
    } catch (err: any) {
      if (err?.code === 'ORDER_NOT_FOUND' || err?.code === 'INVALID_PHONE' || err?.status === 404) {
        setSearched(true);
        setResults([]);
      } else {
        message.error('Không thể tìm kiếm, vui lòng thử lại.');
      }
    } finally {
      setIsSearching(false);
    }
  };

  const STATUS_MAP: Record<string, { label: string; color: string }> = {
    PAID: { label: 'Đã thanh toán', color: 'success' },
    CREATED: { label: 'Chờ thanh toán', color: 'warning' },
    FAILED: { label: 'Thất bại', color: 'error' },
    REFUNDED: { label: 'Đã hoàn tiền', color: 'default' },
  };

  const handleDownload = (order: OrderResult) => {
    if (!order.download_url) return;
    const token = order.download_url.split('/d/').pop();
    if (token) navigate(`/d/${token}`);
  };

  return (
    <div className="page-section active" style={{ paddingTop: '120px', paddingBottom: '40px', minHeight: '100vh' }}>
      <div className="container" style={{ maxWidth: '1200px' }}>
        {/* Page Header */}
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 700, marginBottom: '8px' }}><SearchOutlined /> Tra Cứu Đơn Hàng</h1>
          <p style={{ color: '#666', margin: 0 }}>Tìm kiếm đơn hàng bằng mã đơn hoặc số điện thoại</p>
        </div>

        {/* Search Form */}
        <div style={{ background: '#fff', padding: '16px', borderRadius: '8px', border: '1px solid #e0e0e0', marginBottom: '24px' }}>
          <Form layout="vertical" onFinish={handleSearch} requiredMark={false}>

            {/* Radio Buttons */}
            <Form.Item label={<span style={{ fontWeight: 600 }}>Tìm kiếm bằng:</span>}>
              <Radio.Group
                value={searchType}
                onChange={(e) => setSearchType(e.target.value)}
              >
                <Radio value="code">Mã đơn hàng</Radio>
                <Radio value="phone">Số điện thoại</Radio>
              </Radio.Group>
            </Form.Item>

            {/* Search Input */}
            <Form.Item
              name="searchInput"
              extra={<span style={{ color: '#999' }}><BulbOutlined /> Mã demo: <strong>WL2024ABC</strong> | SĐT: <strong>0901234567</strong></span>}
              rules={[{ required: true, message: 'Vui lòng nhập thông tin tìm kiếm' }]}
            >
              <Input
                type={searchType === 'phone' ? 'tel' : 'text'}
                placeholder={searchType === 'code' ? 'Nhập mã đơn hàng (VD: WL2024ABC)...' : 'Nhập số điện thoại (VD: 0901234567)...'}
                size="large"
              />
            </Form.Item>

            <Form.Item style={{ marginBottom: 0 }}>
              <Button
                type="primary"
                htmlType="submit"
                block
                size="large"
                icon={<SearchOutlined />}
                loading={isSearching}
              >
                {isSearching ? 'Đang tìm...' : 'Tìm Kiếm'}
              </Button>
            </Form.Item>
          </Form>
        </div>

        {/* Search Results */}
        {searched && (
          <div style={{ background: '#fff', padding: '16px', borderRadius: '8px', border: '1px solid #e0e0e0', marginBottom: '24px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '16px' }}>
              <SearchOutlined /> Kết quả ({results.length} đơn hàng)
            </h3>
            {results.length === 0 ? (
              <Empty description="Không tìm thấy đơn hàng nào" />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {results.map((order) => {
                  const st = STATUS_MAP[order.status] ?? { label: order.status, color: 'default' };
                  const isExpired = order.expires_at && new Date(order.expires_at) < new Date();
                  return (
                    <Card
                      key={order.order_code}
                      size="small"
                      style={{ borderRadius: '8px' }}
                      styles={{ body: { padding: '12px 16px' } }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                        <div>
                          <div style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: '15px', marginBottom: '4px' }}>
                            {order.order_code}
                          </div>
                          <div style={{ fontSize: '13px', color: '#666' }}>
                            {order.customer_phone} &middot; {order.photo_count} ảnh &middot; {order.amount.toLocaleString('vi-VN')}đ
                          </div>
                          <div style={{ marginTop: '4px', display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <Tag color={st.color}>{st.label}</Tag>
                            {order.expires_at && (
                              <span style={{ fontSize: '12px', color: isExpired ? '#d63b3b' : '#666' }}>
                                <ClockCircleOutlined /> {isExpired ? 'Hết hạn' : `Hạn: ${new Date(order.expires_at).toLocaleString('vi-VN')}`}
                              </span>
                            )}
                          </div>
                        </div>
                        <div>
                          {order.download_url && !isExpired ? (
                            <Button
                              type="primary"
                              icon={<DownloadOutlined />}
                              onClick={() => handleDownload(order)}
                            >
                              Tải ảnh
                            </Button>
                          ) : order.status === 'PAID' && !order.download_url ? (
                            <Tag icon={<ClockCircleOutlined />} color="processing">Đang chuẩn bị</Tag>
                          ) : null}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Help Section */}
        <div style={{ background: '#fff', padding: '16px', borderRadius: '8px', border: '1px solid #e0e0e0', textAlign: 'center' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '12px' }}><QuestionCircleOutlined /> Cần Hỗ Trợ?</h3>
          <p style={{ color: '#666', marginBottom: '16px', fontSize: '14px' }}>
            Không tìm thấy đơn hàng hoặc gặp vấn đề?
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            {hotline && <Button href={`tel:${hotline}`} icon={<PhoneOutlined />}>{hotline}</Button>}
            {zaloLink && <Button href={zaloLink.startsWith('http') ? zaloLink : `https://zalo.me/${zaloLink}`} target="_blank" rel="noopener noreferrer" icon={<MessageOutlined />}>Chat Zalo</Button>}
            {!hotline && <Button href="tel:0987654321" icon={<PhoneOutlined />}>0987 654 321</Button>}
            {!zaloLink && <Button href="https://zalo.me/wonderlandphoto" target="_blank" rel="noopener noreferrer" icon={<MessageOutlined />}>Chat Zalo</Button>}
        
          </div>
        </div>
      </div>
    </div>
  );
}
