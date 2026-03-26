import { useState, useCallback } from 'react';
import {
  Button,
  Card,
  Col,
  Input,
  message,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { CheckCircleOutlined, ClockCircleOutlined, DollarOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
  createPayments,
  markPaid,
  PendingStaffRow,
  PaymentCycle,
  PaymentStatus,
  StaffPaymentOut,
  usePayrollPayments,
  usePendingPayroll,
} from '../../hooks/usePayroll';
import { invalidateApiCache } from '../../lib/api-client';

const { Title, Text } = Typography;
const { Option } = Select;

function fmt(v: number) {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
  if (v >= 1_000) return (v / 1_000).toFixed(0) + 'K';
  return v.toLocaleString('vi-VN');
}

function cycleLabel(c: PaymentCycle) {
  return c === 'weekly' ? '7 ngày' : c === 'monthly' ? '1 tháng' : '3 tháng';
}

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function cycleDateRange(cycle: PaymentCycle): [string, string] {
  const now = new Date();
  const end = toISODate(now);
  if (cycle === 'weekly') {
    const start = new Date(now);
    start.setDate(start.getDate() - 6);
    return [toISODate(start), end];
  }
  if (cycle === 'monthly') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return [toISODate(start), end];
  }
  const start = new Date(now);
  start.setMonth(start.getMonth() - 2);
  start.setDate(1);
  return [toISODate(start), end];
}

function fmtShortDate(iso: string) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function CreatePaymentTab() {
  const [cycle, setCycle] = useState<PaymentCycle>('monthly');
  const [range, setRange] = useState<[string, string]>(() => cycleDateRange('monthly'));
  const [loading, setLoading] = useState(false);

  const [periodStart, periodEnd] = range;

  const { data: rows, loading: scanning, refetch } = usePendingPayroll(periodStart, periodEnd);

  const handleCycleChange = (c: PaymentCycle) => {
    setCycle(c);
    setRange(cycleDateRange(c));
  };

  const handleCreate = useCallback(async () => {
    setLoading(true);
    try {
      const created = await createPayments({ period_start: periodStart, period_end: periodEnd, cycle });
      if (!created.length) {
        message.warning('Tất cả nhân viên đã có bản ghi cho kỳ này');
      } else {
        message.success(`Đã tạo ${created.length} bản ghi thanh toán`);
      }
      invalidateApiCache('/api/v1/admin/payroll/payments');
    } catch {
      message.error('Không thể tạo đợt thanh toán');
    } finally {
      setLoading(false);
    }
  }, [periodStart, periodEnd, cycle]);

  const columns: ColumnsType<PendingStaffRow> = [
    { title: 'Mã NV', dataIndex: 'employee_code', key: 'code', render: (v) => <Text code>{v ?? '—'}</Text>, width: 100 },
    { title: 'Họ tên', dataIndex: 'staff_name', key: 'name', render: (v) => v ?? '—' },
    { title: '% Hoa hồng', dataIndex: 'commission_rate', key: 'rate', align: 'right', render: (v) => <Tag color="blue">{v}%</Tag>, width: 110 },
    { title: 'Doanh thu gộp', dataIndex: 'gross_revenue', key: 'gross', align: 'right', render: (v) => `${fmt(v)} ₫` },
    { title: 'Thực nhận', dataIndex: 'net_amount', key: 'net', align: 'right', render: (v) => <Text strong style={{ color: '#52c41a' }}>{fmt(v)} ₫</Text> },
  ];

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={16}>
      <Card size="small">
        <Space wrap>
          <span>Chu kỳ: <Select value={cycle} onChange={handleCycleChange} style={{ width: 130 }}>
            <Option value="weekly">7 ngày</Option>
            <Option value="monthly">1 tháng</Option>
            <Option value="quarterly">3 tháng</Option>
          </Select></span>
          <span>Từ: <Input type="date" value={periodStart} onChange={(e) => setRange([e.target.value, periodEnd])} style={{ width: 155 }} /></span>
          <span>Đến: <Input type="date" value={periodEnd} onChange={(e) => setRange([periodStart, e.target.value])} style={{ width: 155 }} /></span>
          <Button icon={<ReloadOutlined />} onClick={refetch} loading={scanning}>Tính toán</Button>
        </Space>
      </Card>
      <Table<PendingStaffRow>
        columns={columns} dataSource={rows ?? []} rowKey="staff_id" loading={scanning} pagination={false} size="middle"
        summary={(pageData) => {
          const totalGross = pageData.reduce((s, r) => s + r.gross_revenue, 0);
          const totalNet = pageData.reduce((s, r) => s + r.net_amount, 0);
          return (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={3}><Text strong>Tổng cộng</Text></Table.Summary.Cell>
              <Table.Summary.Cell index={3} align="right"><Text strong>{fmt(totalGross)} ₫</Text></Table.Summary.Cell>
              <Table.Summary.Cell index={4} align="right"><Text strong style={{ color: '#52c41a' }}>{fmt(totalNet)} ₫</Text></Table.Summary.Cell>
            </Table.Summary.Row>
          );
        }}
      />
      <Button type="primary" icon={<DollarOutlined />} loading={loading} disabled={!rows?.length} onClick={handleCreate}>
        Tạo đợt thanh toán ({cycleLabel(cycle)})
      </Button>
    </Space>
  );
}

function HistoryTab() {
  const [statusFilter, setStatusFilter] = useState<PaymentStatus | ''>('');
  const [cycleFilter, setCycleFilter] = useState<PaymentCycle | ''>('');
  const [page, setPage] = useState(1);
  const [markingId, setMarkingId] = useState<string | null>(null);

  const { data, loading, refetch } = usePayrollPayments({ status: statusFilter, cycle: cycleFilter, page, limit: 20 });

  const handleMarkPaid = useCallback(async (id: string) => {
    setMarkingId(id);
    try {
      await markPaid(id);
      message.success('Đã đánh dấu thanh toán');
      invalidateApiCache('/api/v1/admin/payroll/payments');
      refetch();
    } catch {
      message.error('Lỗi khi đánh dấu');
    } finally {
      setMarkingId(null);
    }
  }, [refetch]);

  const columns: ColumnsType<StaffPaymentOut> = [
    { title: 'Mã NV', dataIndex: 'employee_code', key: 'code', render: (v) => <Text code>{v ?? '—'}</Text>, width: 90 },
    { title: 'Họ tên', dataIndex: 'staff_name', key: 'name', render: (v) => v ?? '—' },
    { title: 'Kỳ', key: 'period', render: (_, r) => `${fmtShortDate(r.period_start)} - ${fmtShortDate(r.period_end)}`, width: 175 },
    { title: 'Chu kỳ', dataIndex: 'cycle', key: 'cycle', render: (v: PaymentCycle) => cycleLabel(v), width: 90 },
    { title: '% HH', dataIndex: 'commission_rate', key: 'rate', align: 'right', render: (v) => `${v}%`, width: 70 },
    { title: 'Doanh thu', dataIndex: 'gross_revenue', key: 'gross', align: 'right', render: (v) => `${fmt(v)} ₫` },
    { title: 'Thực nhận', dataIndex: 'net_amount', key: 'net', align: 'right', render: (v) => <Text strong style={{ color: '#52c41a' }}>{fmt(v)} ₫</Text> },
    { title: 'Trạng thái', dataIndex: 'status', key: 'status', width: 120, render: (v: PaymentStatus) => v === 'paid' ? <Tag icon={<CheckCircleOutlined />} color="success">Đã trả</Tag> : <Tag icon={<ClockCircleOutlined />} color="warning">Chờ trả</Tag> },
    {
      title: 'Thao tac', key: 'action', width: 130,
      render: (_, r) => r.status === 'pending'
        ? <Button size="small" type="primary" loading={markingId === r.id} onClick={() => handleMarkPaid(r.id)}>Đánh dấu đã trả</Button>
        : <Tooltip title={r.paid_at ? new Date(r.paid_at).toLocaleString('vi-VN') : ''}><Text type="secondary" style={{ fontSize: 12 }}>{r.paid_at ? fmtShortDate(r.paid_at.slice(0, 10)) : '—'}</Text></Tooltip>
    },
  ];

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={16}>
      <Card size="small">
        <Space wrap>
          <span>Trạng thái: <Select value={statusFilter} onChange={(v) => { setStatusFilter(v); setPage(1); }} style={{ width: 130 }}>
            <Option value="">Tất cả</Option>
            <Option value="pending">Chờ trả</Option>
            <Option value="paid">Đã trả</Option>
          </Select></span>
          <span>Chu kỳ: <Select value={cycleFilter} onChange={(v) => { setCycleFilter(v); setPage(1); }} style={{ width: 120 }}>
            <Option value="">Tất cả</Option>
            <Option value="weekly">7 ngày</Option>
            <Option value="monthly">1 tháng</Option>
            <Option value="quarterly">3 tháng</Option>
          </Select></span>
          <Button icon={<ReloadOutlined />} onClick={refetch}>Làm mới</Button>
        </Space>
      </Card>
      <Table<StaffPaymentOut>
        columns={columns} dataSource={data?.items ?? []} rowKey="id" loading={loading}
        pagination={{ current: page, total: data?.total ?? 0, pageSize: 20, onChange: setPage, showTotal: (t) => `Tong ${t} ban ghi` }}
        size="middle"
      />
    </Space>
  );
}

export default function Payroll() {
  const [activeTab, setActiveTab] = useState<'create' | 'history'>('create');
  return (
    <div style={{ padding: '0 0 24px' }}>
      <Row align="middle" style={{ marginBottom: 16 }}>
        <Col flex="auto">
          <Title level={4} style={{ margin: 0 }}>Quản lý Lương Nhân viên</Title>
        </Col>
      </Row>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['create', 'history'] as const).map((tab) => (
          <Button key={tab} type={activeTab === tab ? 'primary' : 'default'} onClick={() => setActiveTab(tab)}>
            {tab === 'create' ? 'Tạo đợt thanh toán' : 'Lịch sử thanh toán'}
          </Button>
        ))}
      </div>
      {activeTab === 'create' ? <CreatePaymentTab /> : <HistoryTab />}
    </div>
  );
}
