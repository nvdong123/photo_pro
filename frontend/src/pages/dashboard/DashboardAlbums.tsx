import { useState } from 'react';
import { Input, Select, Button, Tag, Modal, Form, DatePicker, message, Card, Spin } from 'antd';
import { SearchOutlined, PlusOutlined, EyeOutlined, EditOutlined, DeleteOutlined, PictureOutlined } from '@ant-design/icons';
import { hasRole } from '../../hooks/useAuth';
import { useAdminAlbums } from '../../hooks/useAdminAlbums';

const BORDER = '#e2e5ea';
const PRIMARY = '#1a6b4e';
const SURFACE_ALT = '#f6f7f9';

type AlbumStatus = 'published' | 'processing' | 'archived';
interface Album { id: string; name: string; location: string; date: string; photos: number; orders: number; revenue: string; status: AlbumStatus; }

const STATUS_MAP: Record<AlbumStatus, { color: string; label: string }> = {
  published: { color: 'green', label: 'Đã đăng' },
  processing: { color: 'orange', label: 'Đang xử lý' },
  archived: { color: 'default', label: 'Đã lưu trữ' },
};

export default function DashboardAlbums() {
  const { albums: apiAlbums, loading, createAlbum, deleteAlbum } = useAdminAlbums();
  const albums: Album[] = apiAlbums.map(a => ({
    id: a.id,
    name: a.name,
    location: a.description ?? '-',
    date: '-',
    photos: a.media_count,
    orders: 0,
    revenue: '-',
    status: 'published' as AlbumStatus,
  }));

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sort, setSort] = useState('date-desc');
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Album|null>(null);
  const [form] = Form.useForm();

  const canEdit = hasRole(['admin-system','admin-sales']);

  const filtered = albums
    .filter(a => statusFilter === 'all' || a.status === statusFilter)
    .filter(a => a.name.toLowerCase().includes(search.toLowerCase()) || a.location.toLowerCase().includes(search.toLowerCase()))
    .sort((a,b) => sort === 'orders' ? b.orders - a.orders : sort === 'photos' ? b.photos - a.photos : 0);

  const handleCreate = async (vals: any) => {
    try {
      await createAlbum(vals.name, vals.description || vals.location || undefined);
      message.success('Tạo album thành công!');
      setCreateOpen(false); form.resetFields();
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Tạo album thất bại');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteAlbum(deleteTarget.id);
      message.success('Xóa album thành công!');
      setDeleteTarget(null);
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Xóa album thất bại');
    }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>;

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 }}>
        <h1 style={{ margin:0, fontSize:20, fontWeight:700 }}>Quản lý Album</h1>
        {canEdit && <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>Tạo album mới</Button>}
      </div>

      <div style={{ display:'flex', gap:12, marginBottom:24, flexWrap:'wrap' }}>
        <Input prefix={<SearchOutlined />} placeholder="Tìm kiếm album..." style={{ width:280 }} value={search} onChange={e => setSearch(e.target.value)} />
        <Select value={statusFilter} onChange={setStatusFilter} style={{ width:160 }}>
          <Select.Option value="all">Tất cả trạng thái</Select.Option>
          <Select.Option value="published">Đã đăng</Select.Option>
          <Select.Option value="processing">Đang xử lý</Select.Option>
          <Select.Option value="archived">Đã lưu trữ</Select.Option>
        </Select>
        <Select value={sort} onChange={setSort} style={{ width:160 }}>
          <Select.Option value="date-desc">Mới nhất</Select.Option>
          <Select.Option value="orders">Nhiều đơn nhất</Select.Option>
          <Select.Option value="photos">Nhiều ảnh nhất</Select.Option>
        </Select>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(300px, 1fr))', gap:20 }}>
        {filtered.map(a => (
        <Card
          key={a.id}
          cover={
            <div style={{ height:120, background:`linear-gradient(135deg, ${PRIMARY} 0%, #0f5840 100%)`, display:'flex', alignItems:'center', justifyContent:'center', position:'relative' }}>
              <PictureOutlined style={{ fontSize:48, color:'rgba(255,255,255,0.4)' }} />
              <div style={{ position:'absolute', top:12, right:12 }}><Tag color={STATUS_MAP[a.status].color}>{STATUS_MAP[a.status].label}</Tag></div>
            </div>
          }
          bodyStyle={{ padding:16 }}
          style={{ borderRadius:12, border:`1px solid ${BORDER}`, overflow:'hidden', boxShadow:'0 1px 2px rgba(0,0,0,0.05)' }}
        >
              <div style={{ fontWeight:700, fontSize:15, marginBottom:4 }}>{a.name}</div>
              <div style={{ color:'#8b91a0', fontSize:13, marginBottom:12 }}> {a.location} ·  {a.date}</div>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:12 }}>
                <div style={{ textAlign:'center', flex:1 }}><div style={{ fontWeight:700, color:PRIMARY }}>{a.photos}</div><div style={{ fontSize:11, color:'#8b91a0' }}>Ảnh</div></div>
                <div style={{ textAlign:'center', flex:1, borderLeft:`1px solid ${BORDER}`, borderRight:`1px solid ${BORDER}` }}><div style={{ fontWeight:700, color:'#2563eb' }}>{a.orders}</div><div style={{ fontSize:11, color:'#8b91a0' }}>Đơn</div></div>
                <div style={{ textAlign:'center', flex:1 }}><div style={{ fontWeight:700, color:'#d4870e' }}>{a.revenue}</div><div style={{ fontSize:11, color:'#8b91a0' }}>Doanh thu</div></div>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <Button size="small" icon={<EyeOutlined />} style={{ flex:1 }}>Xem</Button>
                {canEdit && <Button size="small" icon={<EditOutlined />} style={{ flex:1 }}>Chỉnh sửa</Button>}
                {canEdit && <Button size="small" danger icon={<DeleteOutlined />} onClick={() => setDeleteTarget(a)} />}
              </div>
        </Card>
        ))}
      </div>

      {filtered.length === 0 && <div style={{ textAlign:'center', padding:'60px 0', color:'#8b91a0' }}>Không tìm thấy album nào</div>}

      {/* Create Modal */}
      <Modal title="Tạo album mới" open={createOpen} onOk={form.submit} onCancel={() => { setCreateOpen(false); form.resetFields(); }} okText="Tạo album" cancelText="Hủy">
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop:16 }}>
          <Form.Item name="name" label="Tên album" rules={[{ required:true, message:'Nhập tên album' }]}><Input placeholder="VD: Bà Nà Hills 20/02" /></Form.Item>
          <Form.Item name="location" label="Địa điểm" rules={[{ required:true, message:'Nhập địa điểm' }]}><Input placeholder="VD: Đà Nẵng" /></Form.Item>
          <Form.Item name="date" label="Ngày chụp"><DatePicker style={{ width:'100%' }} format="DD/MM/YYYY" /></Form.Item>
          <Form.Item name="description" label="Mô tả"><Input.TextArea rows={3} placeholder="Mô tả album..." /></Form.Item>
        </Form>
      </Modal>

      {/* Delete Modal */}
      <Modal title="Xác nhận xóa" open={!!deleteTarget} onOk={handleDelete} onCancel={() => setDeleteTarget(null)} okText="Xóa" okButtonProps={{ danger:true }} cancelText="Hủy">
        <p>Bạn có chắc muốn xóa album <strong>{deleteTarget?.name}</strong>?</p>
        <p style={{ color:'#d63b3b', fontSize:13 }}> Hành động này không thể hoàn tác. Tất cả ảnh trong album sẽ bị xóa.</p>
      </Modal>
    </div>
  );
}
