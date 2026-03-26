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
  return c === 'weekly' ? '7 ngay' : c === 'monthly' ? '1 thang' : '3 thang';
}

function cycleName(c: CycleType, start: string): string {
  const [y, m] = start.split('-');
  if (c === 'monthly') return `Thang ${parseInt(m)}/${y}`;
  if (c === 'quarterly') {
    const q = Math.ceil(parseInt(m) / 3);
    return `Quy ${q}/${y}`;
  }
  return `Tuan ${fmtDate(start)}`;
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
  pending:    { label: 'Cho xu ly', color: 'warning',   icon: <ClockCircleOutlined /> },
  processing: { label: 'Dang xu ly', color: 'processing', icon: <SyncOutlined spin /> },
  paid:       { label: 'Da tra',    color: 'success',   icon: <CheckCircleOutlined /> },
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
    if (!name.trim()) { message.error('Vui long nhap ten chu ky'); return; }
    setLoading(true);
    try {
      const created = await createPayrollCycle({
        name: name.trim(),
        cycle_type: ctype,
        start_date: range[0],
        end_date: range[1],
        note: note || null,
      });
      message.success(`Da tao chu ky "${created.name}" voi ${created.item_count} nhan vien`);
      onCreated(created);
      onClose();
    } catch (e: any) {
      message.error(e?.message ?? 'Khong the tao chu ky');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="Tao chu ky luong moi"
      open={open}
      onCancel={onClose}
      onOk={handleCreate}
      okText="Tao chu ky"
      confirmLoading={loading}
      afterOpenChange={(v) => v && handleOpen()}
    >
      <Space direction="vertical" style={{ width: '100%' }} size={12}>
        <div>
          <Text type="secondary">Loai chu ky</Text>
          <Select value={ctype} onChange={handleCycleChange} style={{ width: '100%', marginTop: 4 }}>
            <Option value="weekly">Tuan (7 ngay)</Option>
            <Option value="monthly">Thang (1 thang)</Option>
            <Option value="quarterly">Quy (3 thang)</Option>
          </Select>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <Text type="secondary">Tu ngay</Text>
            <Input type="date" value={range[0]} onChange={(e) => setRange([e.target.value, range[1]])} style={{ marginTop: 4 }} />
          </div>
          <div style={{ flex: 1 }}>
            <Text type="secondary">Den ngay</Text>
            <Input type="date" value={range[1]} onChange={(e) => setRange([range[0], e.target.value])} style={{ marginTop: 4 }} />
          </div>
        </div>
        <div>
          <Text type="secondary">Ten chu ky</Text>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Vi du: Thang 3/2026" style={{ marginTop: 4 }} />
        </div>
        <div>
          <Text type="secondary">Ghi chu (tuy chon)</Text>
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
      message.success('Da xac nhan toan bo chu ky');
      refetch();
    } catch {
      message.error('Loi xac nhan');
    } finally {
      setConfirmingId(null);
    }
  };

  const handleMarkItem = async (staffId: string) => {
    if (!cycleId) return;
    setMarkingStaff(staffId);
    try {
      await markPayrollItemPaid(cycleId, staffId);
      message.success('Da danh dau da tra');
      refetch();
    } catch {
      message.error('Loi danh dau');
    } finally {
      setMarkingStaff(null);
    }
  };

  const itemCols: ColumnsType<PayrollItemOut> = [
    { title: 'Ma NV', dataIndex: 'employee_code', key: 'code', render: (v) => <Text code>{v ?? '---'}</Text>, width: 90 },
    { title: 'Ho ten', dataIndex: 'staff_name', key: 'name' },
    { title: '% HH', dataIndex: 'commission_rate', key: 'rate', align: 'right', render: (v) => `${v}%`, width: 70 },
    { title: 'Doanh thu', dataIndex: 'gross_revenue', key: 'gross', align: 'right', render: (v) => `${fmt(v)} ` },
    { title: 'Hoa hong', dataIndex: 'commission_amount', key: 'amt', align: 'right', render: (v) => <Text strong style={{ color: '#52c41a' }}>{fmt(v)} </Text> },
    {
      title: 'Trang thai', dataIndex: 'status', key: 'status', width: 130,
      render: (v: string, r) => v === 'paid'
        ? <Tag color="success" icon={<CheckCircleOutlined />}>Da tra</Tag>
        : <Button size="small" type="primary" loading={markingStaff === r.staff_id}
            onClick={() => handleMarkItem(r.staff_id)}>Danh dau da tra</Button>
    },
  ];

  const isPaid = cycle?.status === 'paid';
  const allPaid = cycle ? cycle.paid_count === cycle.item_count : false;

  return (
    <Drawer
      title={cycle ? cycle.name : 'Chi tiet chu ky'}
      width={720}
      open={!!cycleId}
      onClose={onClose}
      extra={
        !isPaid && (
          <Button type="primary" icon={<CheckCircleOutlined />}
            loading={confirmingId === cycleId}
            disabled={allPaid && isPaid}
            onClick={() => Modal.confirm({
              title: 'Xac nhan da tra luong?',
              content: 'Tat ca nhan vien trong chu ky nay se duoc danh dau da nhan.',
              okText: 'Xac nhan', cancelText: 'Huy',
              onOk: handleConfirm,
            })}>
            Xac nhan da tra
          </Button>
        )
      }
    >
      {cycle && (
        <Space direction="vertical" style={{ width: '100%' }} size={16}>
          <Descriptions size="small" bordered column={2}>
            <Descriptions.Item label="Khoang thoi gian">{fmtDate(cycle.start_date)} - {fmtDate(cycle.end_date)}</Descriptions.Item>
            <Descriptions.Item label="Loai chu ky">{cycleLabel(cycle.cycle_type)}</Descriptions.Item>
            <Descriptions.Item label="Tong tra">{fmt(cycle.total_amount)} </Descriptions.Item>
            <Descriptions.Item label="Trang thai">
              <Tag color={STATUS_TAG[cycle.status].color} icon={STATUS_TAG[cycle.status].icon}>
                {STATUS_TAG[cycle.status].label}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="So NV">{cycle.item_count} ({cycle.paid_count} da tra)</Descriptions.Item>
            {cycle.note && <Descriptions.Item label="Ghi chu" span={2}>{cycle.note}</Descriptions.Item>}
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
    if (isNaN(r) || r < 0 || r > 100) { message.error('Ti le phai tu 0 den 100'); return; }
    setSaving(true);
    try {
      await setCommission(staffId, { commission_rate: r, effective_from: effDate, note: note || null });
      message.success('Da cap nhat ti le hoa hong');
      setRate('');
      setNote('');
      refetchCurrent();
      refetchHistory();
    } catch {
      message.error('Loi cap nhat');
    } finally {
      setSaving(false);
    }
  };

  const histCols: ColumnsType<any> = [
    { title: 'Hieu luc', dataIndex: 'effective_from', key: 'eff', render: fmtDate, width: 110 },
    { title: '% HH', dataIndex: 'commission_rate', key: 'rate', render: (v: number) => <Tag color="blue">{v}%</Tag>, width: 80 },
    { title: 'Ghi chu', dataIndex: 'note', key: 'note', render: (v: string | null) => v ?? '---' },
    { title: 'Ngay tao', dataIndex: 'created_at', key: 'created', render: (v: string) => fmtDate(v.slice(0, 10)), width: 110 },
    { title: 'Nguoi tao', dataIndex: 'created_by_name', key: 'by', render: (v: string | null) => v ?? '---' },
  ];

  return (
    <Drawer title={`Hoa hong: ${staffName ?? ''}`} width={560} open={!!staffId} onClose={onClose}>
      <Space direction="vertical" style={{ width: '100%' }} size={16}>
        {current && (
          <Card size="small">
            <Text>Ti le hien tai: </Text>
            <Tag color="blue" style={{ fontSize: 15 }}>{current.commission_rate}%</Tag>
            {current.effective_from && <Text type="secondary" style={{ marginLeft: 8 }}>tu {fmtDate(current.effective_from)}</Text>}
          </Card>
        )}
        <Card title="Cap nhat ti le" size="small">
          <Space direction="vertical" style={{ width: '100%' }} size={8}>
            <div style={{ display: 'flex', gap: 8 }}>
              <Input
                type="number" min={0} max={100} step={0.5}
                placeholder="VD: 30" suffix="%" value={rate}
                onChange={(e) => setRate(e.target.value)} style={{ width: 120 }}
              />
              <Input type="date" value={effDate} onChange={(e) => setEffDate(e.target.value)} style={{ flex: 1 }} />
            </div>
            <Input placeholder="Ghi chu (tuy chon)" value={note} onChange={(e) => setNote(e.target.value)} />
            <Button type="primary" loading={saving} onClick={handleSave}>Luu ti le moi</Button>
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
      title: 'Ten chu ky', dataIndex: 'name', key: 'name',
      render: (v, r) => (
        <Button type="link" style={{ padding: 0 }} onClick={() => setSelectedCycleId(r.id)}>
          {v}
        </Button>
      ),
    },
    { title: 'Loai', dataIndex: 'cycle_type', key: 'type', render: (v: CycleType) => cycleLabel(v), width: 90 },
    {
      title: 'Khoang thoi gian', key: 'period',
      render: (_, r) => `${fmtDate(r.start_date)} - ${fmtDate(r.end_date)}`,
      width: 185,
    },
    { title: 'So NV', key: 'count', render: (_, r) => `${r.paid_count}/${r.item_count}`, width: 80, align: 'center' },
    { title: 'Tong tra', dataIndex: 'total_amount', key: 'total', align: 'right', render: (v) => `${fmt(v)} ` },
    {
      title: 'Trang thai', dataIndex: 'status', key: 'status', width: 130,
      render: (v: PayrollCycleStatus) => (
        <Tag color={STATUS_TAG[v].color} icon={STATUS_TAG[v].icon}>
          {STATUS_TAG[v].label}
        </Tag>
      ),
    },
    {
      title: 'Ngay tra', dataIndex: 'paid_at', key: 'paid_at', width: 110,
      render: (v: string | null) => v ? fmtDate(v.slice(0, 10)) : '---',
    },
    {
      title: '', key: 'action', width: 90,
      render: (_, r) => (
        <Button size="small" onClick={() => setSelectedCycleId(r.id)}>Chi tiet</Button>
      ),
    },
  ];

  return (
    <div style={{ padding: '0 0 24px' }}>
      <Row align="middle" style={{ marginBottom: 16 }}>
        <Col flex="auto">
          <Title level={4} style={{ margin: 0 }}>Bang Luong</Title>
        </Col>
        <Col>
          <Space>
            <Select value={statusFilter} onChange={(v) => setStatusFilter(v)} style={{ width: 140 }}>
              <Option value="">Tat ca trang thai</Option>
              <Option value="pending">Cho xu ly</Option>
              <Option value="processing">Dang xu ly</Option>
              <Option value="paid">Da tra</Option>
            </Select>
            <Button icon={<ReloadOutlined />} onClick={refetch}>Lam moi</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              Tao chu ky moi
            </Button>
          </Space>
        </Col>
      </Row>

      <Table<PayrollCycleOut>
        columns={cols}
        dataSource={cycles ?? []}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 20, showTotal: (t) => `Tong ${t} chu ky` }}
        size="middle"
      />

      <CreateCycleModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={handleCreated} />
      <CycleDetailDrawer cycleId={selectedCycleId} onClose={() => setSelectedCycleId(null)} />
    </div>
  );
}
