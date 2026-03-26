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
    return <div style={{ padding: 32, textAlign: 'center' }}>Dang tai...</div>;
  }

  if (!earnings) {
    return <div style={{ padding: 32, textAlign: 'center' }}>Khong co du lieu.</div>;
  }

  return (
    <div style={{ padding: '0 0 24px' }}>
      <Title level={4} style={{ marginBottom: 20 }}>Thu Nhap Cua Toi</Title>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={6}>
          <StatCard
            title="Ti le hoa hong"
            value={rate}
            unit="%"
            color="#1677ff"
            icon={<BarChartOutlined style={{ color: '#1677ff' }} />}
            sub={
              commission?.effective_from
                ? <Text type="secondary" style={{ fontSize: 12 }}>
                    Hieu luc tu {commission.effective_from}
                  </Text>
                : null
            }
          />
        </Col>

        <Col xs={24} sm={12} md={6}>
          <StatCard
            title="Doanh thu thang nay"
            value={fmt(earnings.this_month_gross)}
            unit=""
            color="#8c8c8c"
            icon={<BarChartOutlined style={{ color: '#8c8c8c' }} />}
            sub={<Text type="secondary" style={{ fontSize: 12 }}>Tong anh da ban</Text>}
          />
        </Col>

        <Col xs={24} sm={12} md={6}>
          <StatCard
            title="Thuc nhan thang nay"
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
            title="Dang cho thanh toan"
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
                ? <Tag color="warning">Chua duoc thanh toan</Tag>
                : <Tag color="success">Da thanh toan het</Tag>
            }
          />
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} sm={12}>
          <StatCard
            title="Tong thuc nhan lich su"
            value={fmt(earnings.total_earned_all_time)}
            unit=""
            color="#1a6b4e"
            icon={<DollarOutlined style={{ color: '#1a6b4e' }} />}
            sub={<Text type="secondary" style={{ fontSize: 12 }}>Tinh tren toan bo don hang da thanh toan</Text>}
          />
        </Col>
      </Row>
    </div>
  );
}
