import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, Radio, message } from 'antd';
import { SearchOutlined, BulbOutlined, ProfileOutlined, QuestionCircleOutlined, PhoneOutlined, MessageOutlined, MailOutlined } from '@ant-design/icons';
import { apiClient } from '../../lib/api-client';
import '../styles/frontend.css';

export default function Lookup() {
  const navigate = useNavigate();
  const [searchType, setSearchType] = useState<'code' | 'phone'>('code');
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = async (values: { searchInput: string }) => {
    const input = values.searchInput?.trim();
    if (!input) return;
    setIsSearching(true);
    try {
      if (searchType === 'code') {
        // Treat as download token → navigate directly
        navigate(`/d/${input}`);
      } else {
        // Search by phone via admin orders API
        const data: any = await apiClient.get(`/api/v1/admin/orders?search=${encodeURIComponent(input)}&limit=5`);
        const orders = data?.items ?? [];
        if (orders.length === 1 && orders[0].download_token) {
          navigate(`/d/${orders[0].download_token}`);
        } else if (orders.length > 0) {
          message.info(`Tìm thấy ${orders.length} đơn hàng. Vui lòng dùng mã đơn hàng để tải ảnh.`);
        } else {
          message.warning('Không tìm thấy đơn hàng với số điện thoại này.');
        }
      }
    } catch {
      message.error('Không thể tìm kiếm, vui lòng thử lại.');
    } finally {
      setIsSearching(false);
    }
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

        {/* Recent Orders */}
        <div style={{ background: '#fff', padding: '16px', borderRadius: '8px', border: '1px solid #e0e0e0', marginBottom: '24px' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '16px' }}><ProfileOutlined /> Đơn Hàng Gần Đây</h3>
          <div style={{ color: '#999', textAlign: 'center', padding: '20px' }}>
            (Danh sách đơn hàng gần đây sẽ hiển thị tại đây)
          </div>
        </div>

        {/* Help Section */}
        <div style={{ background: '#fff', padding: '16px', borderRadius: '8px', border: '1px solid #e0e0e0', textAlign: 'center' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '12px' }}><QuestionCircleOutlined /> Cần Hỗ Trợ?</h3>
          <p style={{ color: '#666', marginBottom: '16px', fontSize: '14px' }}>
            Không tìm thấy đơn hàng hoặc gặp vấn đề?
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button href="tel:0987654321" icon={<PhoneOutlined />}>0987 654 321</Button>
            <Button href="https://zalo.me/wonderlandphoto" target="_blank" rel="noopener noreferrer" icon={<MessageOutlined />}>Chat Zalo</Button>
            <Button href="mailto:support@wonderlandphoto.vn" icon={<MailOutlined />}>Email</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
