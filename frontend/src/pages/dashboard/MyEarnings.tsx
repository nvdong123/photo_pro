import { Card, Col, Row, Space, Tag, Typography } from 'antd';
import { DollarOutlined, BarChartOutlined, ClockCircleOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { useMyEarnings, useMyCommission } from '../../hooks/useCommission';

const { Title, Text } = Typography;

function fmt(v: number) {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
  if (v >= 1_000) return (v / 1_000).toFixed(0) + 'K';
  return v.toLocaleString('vi-VN');
}

function StatCard({
  title, value, unit = '', color, icon, sub,
}: {
  title: string;
  value: string | number;
  unit?: string;
  color?: string;
  icon?: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <Card style={{ height: '100%' }}>
      <Space direction="vertical" size={4} style={{ width: '100%' }}>
        <Space>
          {icon}
          <Text type="secondary" style={{ fontSize: 13 }}>{title}</Text>
        </Space>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span style={{ fontSize: 26, fontWeight: 700, color: color ?? '#1a6b4e' }}>
            {value}
          </span>
          {unit && <Text type="secondary" style={{ fontSize: 13 }}>{unit}</Text>}
        </div>
        {sub && <div>{sub}</div>}
      </Space>
    </Card>
  );
}

export default function MyEarnings() {
  const { data: earnings, loading: eLoading } = useMyEarnings();
  const { data: commission } = useMyCommission();

  const rate = commission?.commission_rate ?? earnings?.commission_rate ?? 0;

  if (eLoading) {
    return <div style={{ padding: 32, textAlign: 'center' }}>Đang tải...</div>;
  }

  if (!earnings) {
    return <div style={{ padding: 32, textAlign: 'center' }}>Không có dữ liệu.</div>;
  }

  return (
    <div style={{ padding: '0 0 24px' }}>
      <Title level={4} style={{ marginBottom: 20 }}>Thu Nhập Của Tôi</Title>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={6}>
          <StatCard
            title="Tỉ lệ hoa hồng"
            value={rate}
            unit="%"
            color="#1677ff"
            icon={<BarChartOutlined style={{ color: '#1677ff' }} />}
            sub={
              commission?.effective_from
                ? <Text type="secondary" style={{ fontSize: 12 }}>
                    Hiệu lực từ {commission.effective_from}
                  </Text>
                : null
            }
          />
        </Col>

        <Col xs={24} sm={12} md={6}>
          <StatCard
            title="Doanh thu tháng nay"
            value={fmt(earnings.this_month_gross)}
            unit=""
            color="#8c8c8c"
            icon={<BarChartOutlined style={{ color: '#8c8c8c' }} />}
            sub={<Text type="secondary" style={{ fontSize: 12 }}>Tổng ảnh đã bán</Text>}
          />
        </Col>

        <Col xs={24} sm={12} md={6}>
          <StatCard
            title="Thực nhận tháng nay"
            value={fmt(earnings.this_month_commission)}
            unit=""
            color="#52c41a"
            icon={<DollarOutlined style={{ color: '#52c41a' }} />}
            sub={
              <Text type="secondary" style={{ fontSize: 12 }}>
                = {fmt(earnings.this_month_gross)} x {rate}%
              </Text>
            }
          />
        </Col>

        <Col xs={24} sm={12} md={6}>
          <StatCard
            title="Đang chờ thanh toán"
            value={fmt(earnings.pending_amount)}
            unit=""
            color={earnings.pending_amount > 0 ? '#fa8c16' : '#52c41a'}
            icon={
              earnings.pending_amount > 0
                ? <ClockCircleOutlined style={{ color: '#fa8c16' }} />
                : <CheckCircleOutlined style={{ color: '#52c41a' }} />
            }
            sub={
              earnings.pending_amount > 0
                ? <Tag color="warning">Chưa được thanh toán</Tag>
                : <Tag color="success">Đã thanh toán hết</Tag>
            }
          />
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} sm={12}>
          <StatCard
            title="Tổng thực nhận lịch sử"
            value={fmt(earnings.total_earned_all_time)}
            unit=""
            color="#1a6b4e"
            icon={<DollarOutlined style={{ color: '#1a6b4e' }} />}
            sub={<Text type="secondary" style={{ fontSize: 12 }}>Tính trên toàn bộ đơn hàng đã thanh toán</Text>}
          />
        </Col>
      </Row>
    </div>
  );
}
