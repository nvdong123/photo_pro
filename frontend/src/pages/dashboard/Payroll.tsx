import { useState, useCallback } from 'react';
import {
  Badge, Button, Card, Col, Descriptions, Drawer, Input,
  message, Modal, Row, Select, Space, Table, Tag, Typography,
} from 'antd';
import {
  CheckCircleOutlined, ClockCircleOutlined, DollarOutlined,
  PlusOutlined, ReloadOutlined, SyncOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
  confirmPayrollCycle,
  createPayrollCycle,
  markPayrollItemPaid,
  PayrollCycleOut,
  PayrollCycleDetail,
  PayrollItemOut,
  CycleType,
  PayrollCycleStatus,
  setCommission,
  useCommissionHistory,
  usePayrollCycle,
  usePayrollCycles,
  useStaffCommission,
} from '../../hooks/useCommission';
import { invalidateApiCache } from '../../lib/api-client';

const { Title, Text } = Typography;
const { Option } = Select;

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(v: number) {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
  if (v >= 1_000) return (v / 1_000).toFixed(0) + 'K';
  return v.toLocaleString('vi-VN');
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function cycleLabel(c: CycleType): string {
  return c === 'weekly' ? '7 ngày' : c === 'monthly' ? '1 tháng' : '3 tháng';
}

function cycleName(c: CycleType, start: string): string {
  const [y, m] = start.split('-');
  if (c === 'monthly') return `Tháng ${parseInt(m)}/${y}`;
  if (c === 'quarterly') {
    const q = Math.ceil(parseInt(m) / 3);
    return `Quý ${q}/${y}`;
  }
  return `Tuần ${fmtDate(start)}`;
}

function defaultRange(cycle: CycleType): [string, string] {
  const now = new Date();
  const end = toISODate(now);
  if (cycle === 'weekly') {
    const s = new Date(now);
    s.setDate(s.getDate() - 6);
    return [toISODate(s), end];
  }
  if (cycle === 'monthly') {
    const s = new Date(now.getFullYear(), now.getMonth(), 1);
    return [toISODate(s), end];
  }
  const s = new Date(now);
  s.setMonth(s.getMonth() - 2);
  s.setDate(1);
  return [toISODate(s), end];
}

const STATUS_TAG: Record<PayrollCycleStatus, { label: string; color: string; icon: React.ReactNode }> = {
  pending:    { label: 'Chờ xử lý',  color: 'warning',   icon: <ClockCircleOutlined /> },
  processing: { label: 'Đang xử lý', color: 'processing', icon: <SyncOutlined spin /> },
  paid:       { label: 'Đã trả',     color: 'success',   icon: <CheckCircleOutlined /> },
};

// ── Create Cycle Modal ────────────────────────────────────────────────────────

interface CreateModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (c: PayrollCycleDetail) => void;
}

function CreateCycleModal({ open, onClose, onCreated }: CreateModalProps) {
  const [ctype, setCtype] = useState<CycleType>('monthly');
  const [range, setRange] = useState<[string, string]>(() => defaultRange('monthly'));
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCycleChange = (c: CycleType) => {
    setCtype(c);
    const r = defaultRange(c);
    setRange(r);
    setName(cycleName(c, r[0]));
  };

  const handleOpen = () => {
    const r = defaultRange('monthly');
    setCtype('monthly');
    setRange(r);
    setName(cycleName('monthly', r[0]));
    setNote('');
  };

  const handleCreate = async () => {
    if (!name.trim()) { message.error('Vui lòng nhập tên chu kỳ'); return; }
    setLoading(true);
    try {
      const created = await createPayrollCycle({
        name: name.trim(),
        cycle_type: ctype,
        start_date: range[0],
        end_date: range[1],
        note: note || null,
      });
      message.success(`Đã tạo chu kỳ "${created.name}" với ${created.item_count} nhân viên`);
      onCreated(created);
      onClose();
    } catch (e: any) {
      message.error(e?.message ?? 'Không thể tạo chu kỳ');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="Tạo chu kỳ lương mới"
      open={open}
      onCancel={onClose}
      onOk={handleCreate}
      okText="Tạo chu kỳ"
      confirmLoading={loading}
      afterOpenChange={(v) => v && handleOpen()}
    >
      <Space direction="vertical" style={{ width: '100%' }} size={12}>
        <div>
          <Text type="secondary">Loại chu kỳ</Text>
          <Select value={ctype} onChange={handleCycleChange} style={{ width: '100%', marginTop: 4 }}>
            <Option value="weekly">Tuần (7 ngày)</Option>
            <Option value="monthly">Tháng (1 tháng)</Option>
            <Option value="quarterly">Quý (3 tháng)</Option>
          </Select>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <Text type="secondary">Từ ngày</Text>
            <Input type="date" value={range[0]} onChange={(e) => setRange([e.target.value, range[1]])} style={{ marginTop: 4 }} />
          </div>
          <div style={{ flex: 1 }}>
            <Text type="secondary">Đến ngày</Text>
            <Input type="date" value={range[1]} onChange={(e) => setRange([range[0], e.target.value])} style={{ marginTop: 4 }} />
          </div>
        </div>
        <div>
          <Text type="secondary">Tên chu kỳ</Text>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ví dụ: Tháng 3/2026" style={{ marginTop: 4 }} />
        </div>
        <div>
          <Text type="secondary">Ghi chú (tùy chọn)</Text>
          <Input value={note} onChange={(e) => setNote(e.target.value)} style={{ marginTop: 4 }} />
        </div>
      </Space>
    </Modal>
  );
}

// ── Cycle Detail Drawer ───────────────────────────────────────────────────────

function CycleDetailDrawer({ cycleId, onClose }: { cycleId: string | null; onClose: () => void }) {
  const { data: cycle, loading, refetch } = usePayrollCycle(cycleId);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [markingStaff, setMarkingStaff] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (!cycleId) return;
    setConfirmingId(cycleId);
    try {
      await confirmPayrollCycle(cycleId);
      message.success('Đã xác nhận toàn bộ chu kỳ');
      refetch();
    } catch {
      message.error('Lỗi xác nhận');
    } finally {
      setConfirmingId(null);
    }
  };

  const handleMarkItem = async (staffId: string) => {
    if (!cycleId) return;
    setMarkingStaff(staffId);
    try {
      await markPayrollItemPaid(cycleId, staffId);
      message.success('Đã đánh dấu đã trả');
      refetch();
    } catch {
      message.error('Lỗi đánh dấu');
    } finally {
      setMarkingStaff(null);
    }
  };

  const itemCols: ColumnsType<PayrollItemOut> = [
    { title: 'Mã NV', dataIndex: 'employee_code', key: 'code', render: (v) => <Text code>{v ?? '---'}</Text>, width: 90 },
    { title: 'Họ tên', dataIndex: 'staff_name', key: 'name' },
    { title: '% HH', dataIndex: 'commission_rate', key: 'rate', align: 'right', render: (v) => `${v}%`, width: 70 },
    { title: 'Doanh thu', dataIndex: 'gross_revenue', key: 'gross', align: 'right', render: (v) => `${fmt(v)} ₫` },
    { title: 'Hoa hồng', dataIndex: 'commission_amount', key: 'amt', align: 'right', render: (v) => <Text strong style={{ color: '#52c41a' }}>{fmt(v)} ₫</Text> },
    {
      title: 'Trạng thái', dataIndex: 'status', key: 'status', width: 130,
      render: (v: string, r) => v === 'paid'
        ? <Tag color="success" icon={<CheckCircleOutlined />}>Đã trả</Tag>
        : <Button size="small" type="primary" loading={markingStaff === r.staff_id}
            onClick={() => handleMarkItem(r.staff_id)}>Đánh dấu đã trả</Button>
    },
  ];

  const isPaid = cycle?.status === 'paid';
  const allPaid = cycle ? cycle.paid_count === cycle.item_count : false;

  return (
    <Drawer
      title={cycle ? cycle.name : 'Chi tiết chu kỳ'}
      width={720}
      open={!!cycleId}
      onClose={onClose}
      extra={
        !isPaid && (
          <Button type="primary" icon={<CheckCircleOutlined />}
            loading={confirmingId === cycleId}
            disabled={allPaid && isPaid}
            onClick={() => Modal.confirm({
              title: 'Xác nhận đã trả lương?',
              content: 'Tất cả nhân viên trong chu kỳ này sẽ được đánh dấu đã nhận.',
              okText: 'Xác nhận', cancelText: 'Hủy',
              onOk: handleConfirm,
            })}>
            Xác nhận đã trả
          </Button>
        )
      }
    >
      {cycle && (
        <Space direction="vertical" style={{ width: '100%' }} size={16}>
          <Descriptions size="small" bordered column={2}>
            <Descriptions.Item label="Khoảng thời gian">{fmtDate(cycle.start_date)} – {fmtDate(cycle.end_date)}</Descriptions.Item>
            <Descriptions.Item label="Loại chu kỳ">{cycleLabel(cycle.cycle_type)}</Descriptions.Item>
            <Descriptions.Item label="Tổng trả">{fmt(cycle.total_amount)} ₫</Descriptions.Item>
            <Descriptions.Item label="Trạng thái">
              <Tag color={STATUS_TAG[cycle.status].color} icon={STATUS_TAG[cycle.status].icon}>
                {STATUS_TAG[cycle.status].label}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Số NV">{cycle.item_count} ({cycle.paid_count} đã trả)</Descriptions.Item>
            {cycle.note && <Descriptions.Item label="Ghi chú" span={2}>{cycle.note}</Descriptions.Item>}
          </Descriptions>

          <Table<PayrollItemOut>
            columns={itemCols}
            dataSource={cycle.items}
            rowKey="id"
            loading={loading}
            pagination={false}
            size="small"
          />
        </Space>
      )}
    </Drawer>
  );
}

// ── Commission Drawer (per-staff) ─────────────────────────────────────────────

export function CommissionDrawer({ staffId, staffName, onClose }: { staffId: string | null; staffName?: string; onClose: () => void }) {
  const { data: current, refetch: refetchCurrent } = useStaffCommission(staffId ?? undefined);
  const { data: history, refetch: refetchHistory } = useCommissionHistory(staffId ?? undefined);
  const [rate, setRate] = useState('');
  const [effDate, setEffDate] = useState(toISODate(new Date()));
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!staffId) return;
    const r = parseFloat(rate);
    if (isNaN(r) || r < 0 || r > 100) { message.error('Tỉ lệ phải từ 0 đến 100'); return; }
    setSaving(true);
    try {
      await setCommission(staffId, { commission_rate: r, effective_from: effDate, note: note || null });
      message.success('Đã cập nhật tỉ lệ hoa hồng');
      setRate('');
      setNote('');
      refetchCurrent();
      refetchHistory();
    } catch {
      message.error('Lỗi cập nhật');
    } finally {
      setSaving(false);
    }
  };

  const histCols: ColumnsType<any> = [
    { title: 'Hiệu lực', dataIndex: 'effective_from', key: 'eff', render: fmtDate, width: 110 },
    { title: '% HH', dataIndex: 'commission_rate', key: 'rate', render: (v: number) => <Tag color="blue">{v}%</Tag>, width: 80 },
    { title: 'Ghi chú', dataIndex: 'note', key: 'note', render: (v: string | null) => v ?? '---' },
    { title: 'Ngày tạo', dataIndex: 'created_at', key: 'created', render: (v: string) => fmtDate(v.slice(0, 10)), width: 110 },
    { title: 'Người tạo', dataIndex: 'created_by_name', key: 'by', render: (v: string | null) => v ?? '---' },
  ];

  return (
    <Drawer title={`Hoa hồng: ${staffName ?? ''}`} width={560} open={!!staffId} onClose={onClose}>
      <Space direction="vertical" style={{ width: '100%' }} size={16}>
        {current && (
          <Card size="small">
            <Text>Tỉ lệ hiện tại: </Text>
            <Tag color="blue" style={{ fontSize: 15 }}>{current.commission_rate}%</Tag>
            {current.effective_from && <Text type="secondary" style={{ marginLeft: 8 }}>từ {fmtDate(current.effective_from)}</Text>}
          </Card>
        )}
        <Card title="Cập nhật tỉ lệ" size="small">
          <Space direction="vertical" style={{ width: '100%' }} size={8}>
            <div style={{ display: 'flex', gap: 8 }}>
              <Input
                type="number" min={0} max={100} step={0.5}
                placeholder="VD: 30" suffix="%" value={rate}
                onChange={(e) => setRate(e.target.value)} style={{ width: 120 }}
              />
              <Input type="date" value={effDate} onChange={(e) => setEffDate(e.target.value)} style={{ flex: 1 }} />
            </div>
            <Input placeholder="Ghi chú (tùy chọn)" value={note} onChange={(e) => setNote(e.target.value)} />
            <Button type="primary" loading={saving} onClick={handleSave}>Lưu tỉ lệ mới</Button>
          </Space>
        </Card>
        <Table columns={histCols} dataSource={history ?? []} rowKey="id" size="small" pagination={false} />
      </Space>
    </Drawer>
  );
}

// ── Main Payroll Page ─────────────────────────────────────────────────────────

export default function Payroll() {
  const [statusFilter, setStatusFilter] = useState<PayrollCycleStatus | ''>('');
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);

  const { data: cycles, loading, refetch } = usePayrollCycles({ status: statusFilter || undefined });

  const handleCreated = useCallback((c: PayrollCycleDetail) => {
    invalidateApiCache('/api/v1/admin/payroll');
    refetch();
    setSelectedCycleId(c.id);
  }, [refetch]);

  const cols: ColumnsType<PayrollCycleOut> = [
    {
      title: 'Tên chu kỳ', dataIndex: 'name', key: 'name',
      render: (v, r) => (
        <Button type="link" style={{ padding: 0 }} onClick={() => setSelectedCycleId(r.id)}>
          {v}
        </Button>
      ),
    },
    { title: 'Loại', dataIndex: 'cycle_type', key: 'type', render: (v: CycleType) => cycleLabel(v), width: 90 },
    {
      title: 'Khoảng thời gian', key: 'period',
      render: (_, r) => `${fmtDate(r.start_date)} – ${fmtDate(r.end_date)}`,
      width: 185,
    },
    { title: 'Số NV', key: 'count', render: (_, r) => `${r.paid_count}/${r.item_count}`, width: 80, align: 'center' },
    { title: 'Tổng trả', dataIndex: 'total_amount', key: 'total', align: 'right', render: (v) => `${fmt(v)} ₫` },
    {
      title: 'Trạng thái', dataIndex: 'status', key: 'status', width: 130,
      render: (v: PayrollCycleStatus) => (
        <Tag color={STATUS_TAG[v].color} icon={STATUS_TAG[v].icon}>
          {STATUS_TAG[v].label}
        </Tag>
      ),
    },
    {
      title: 'Ngày trả', dataIndex: 'paid_at', key: 'paid_at', width: 110,
      render: (v: string | null) => v ? fmtDate(v.slice(0, 10)) : '---',
    },
    {
      title: '', key: 'action', width: 90,
      render: (_, r) => (
        <Button size="small" onClick={() => setSelectedCycleId(r.id)}>Chi tiết</Button>
      ),
    },
  ];

  return (
    <div style={{ padding: '0 0 24px' }}>
      <Row align="middle" style={{ marginBottom: 16 }}>
        <Col flex="auto">
          <Title level={4} style={{ margin: 0 }}>Bảng Lương</Title>
        </Col>
        <Col>
          <Space>
            <Select value={statusFilter} onChange={(v) => setStatusFilter(v)} style={{ width: 140 }}>
              <Option value="">Tất cả trạng thái</Option>
              <Option value="pending">Chờ xử lý</Option>
              <Option value="processing">Đang xử lý</Option>
              <Option value="paid">Đã trả</Option>
            </Select>
            <Button icon={<ReloadOutlined />} onClick={refetch}>Làm mới</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              Tạo chu kỳ mới
            </Button>
          </Space>
        </Col>
      </Row>

      <Table<PayrollCycleOut>
        columns={cols}
        dataSource={cycles ?? []}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 20, showTotal: (t) => `Tổng ${t} chu kỳ` }}
        size="middle"
      />

      <CreateCycleModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={handleCreated} />
      <CycleDetailDrawer cycleId={selectedCycleId} onClose={() => setSelectedCycleId(null)} />
    </div>
  );
}
