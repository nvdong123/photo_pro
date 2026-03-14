import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
function write(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf8');
  console.log('Written:', path);
}
const base = 'c:/Users/datth/Downloads/photopro-react/src';

// ===== DASHBOARD ALBUMS =====
write(`${base}/pages/dashboard/DashboardAlbums.tsx`, `
import { useState } from 'react';
import { Input, Select, Button, Tag, Modal, Form, DatePicker, message } from 'antd';
import { SearchOutlined, PlusOutlined, EyeOutlined, EditOutlined, DeleteOutlined, PictureOutlined } from '@ant-design/icons';
import { hasRole } from '../../hooks/useAuth';

const BORDER = '#e2e5ea';
const PRIMARY = '#1a6b4e';
const SURFACE_ALT = '#f6f7f9';

type AlbumStatus = 'published' | 'processing' | 'archived';
interface Album { id: number; name: string; location: string; date: string; photos: number; orders: number; revenue: string; status: AlbumStatus; }

const INITIAL_ALBUMS: Album[] = [
  { id:1, name:'Bà Nà Hills 20/02', location:'Đà Nẵng', date:'20/02/2026', photos:150, orders:120, revenue:'6,000,000đ', status:'published' },
  { id:2, name:'Hội An 19/02', location:'Hội An', date:'19/02/2026', photos:200, orders:98, revenue:'4,900,000đ', status:'published' },
  { id:3, name:'Cầu Rồng 18/02', location:'Đà Nẵng', date:'18/02/2026', photos:120, orders:75, revenue:'3,750,000đ', status:'processing' },
  { id:4, name:'Mỹ Khê 17/02', location:'Đà Nẵng', date:'17/02/2026', photos:180, orders:68, revenue:'3,400,000đ', status:'published' },
  { id:5, name:'Bắc Mỹ An 16/02', location:'Đà Nẵng', date:'16/02/2026', photos:90, orders:42, revenue:'2,100,000đ', status:'archived' },
];

const STATUS_MAP: Record<AlbumStatus, { color: string; label: string }> = {
  published: { color: 'green', label: 'Đã đăng' },
  processing: { color: 'orange', label: 'Đang xử lý' },
  archived: { color: 'default', label: 'Đã lưu trữ' },
};

export default function DashboardAlbums() {
  const [albums, setAlbums] = useState<Album[]>(INITIAL_ALBUMS);
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

  const handleCreate = (vals: any) => {
    const newAlbum: Album = { id: Date.now(), name: vals.name, location: vals.location, date: vals.date ? vals.date.format('DD/MM/YYYY') : '', photos: 0, orders: 0, revenue: '0đ', status: 'processing' };
    setAlbums(p => [newAlbum, ...p]);
    message.success('Tạo album thành công!');
    setCreateOpen(false); form.resetFields();
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    setAlbums(p => p.filter(a => a.id !== deleteTarget.id));
    message.success('Xóa album thành công!');
    setDeleteTarget(null);
  };

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
          <div key={a.id} style={{ background:'#fff', borderRadius:12, border:\`1px solid \${BORDER}\`, overflow:'hidden', boxShadow:'0 1px 2px rgba(0,0,0,0.05)' }}>
            <div style={{ height:120, background:\`linear-gradient(135deg, \${PRIMARY} 0%, #0f5840 100%)\`, display:'flex', alignItems:'center', justifyContent:'center', position:'relative' }}>
              <PictureOutlined style={{ fontSize:48, color:'rgba(255,255,255,0.4)' }} />
              <div style={{ position:'absolute', top:12, right:12 }}><Tag color={STATUS_MAP[a.status].color}>{STATUS_MAP[a.status].label}</Tag></div>
            </div>
            <div style={{ padding:16 }}>
              <div style={{ fontWeight:700, fontSize:15, marginBottom:4 }}>{a.name}</div>
              <div style={{ color:'#8b91a0', fontSize:13, marginBottom:12 }}>📍 {a.location} · 📅 {a.date}</div>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:12 }}>
                <div style={{ textAlign:'center', flex:1 }}><div style={{ fontWeight:700, color:PRIMARY }}>{a.photos}</div><div style={{ fontSize:11, color:'#8b91a0' }}>Ảnh</div></div>
                <div style={{ textAlign:'center', flex:1, borderLeft:\`1px solid \${BORDER}\`, borderRight:\`1px solid \${BORDER}\` }}><div style={{ fontWeight:700, color:'#2563eb' }}>{a.orders}</div><div style={{ fontSize:11, color:'#8b91a0' }}>Đơn</div></div>
                <div style={{ textAlign:'center', flex:1 }}><div style={{ fontWeight:700, color:'#d4870e' }}>{a.revenue}</div><div style={{ fontSize:11, color:'#8b91a0' }}>Doanh thu</div></div>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <Button size="small" icon={<EyeOutlined />} style={{ flex:1 }}>Xem</Button>
                {canEdit && <Button size="small" icon={<EditOutlined />} style={{ flex:1 }}>Chỉnh sửa</Button>}
                {canEdit && <Button size="small" danger icon={<DeleteOutlined />} onClick={() => setDeleteTarget(a)} />}
              </div>
            </div>
          </div>
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
        <p style={{ color:'#d63b3b', fontSize:13 }}>⚠️ Hành động này không thể hoàn tác. Tất cả ảnh trong album sẽ bị xóa.</p>
      </Modal>
    </div>
  );
}
`.trimStart());

// ===== ORDERS =====
write(`${base}/pages/dashboard/Orders.tsx`, `
import { useState } from 'react';
import { Input, Select, Button, Tag, Modal, Descriptions, message } from 'antd';
import { SearchOutlined, EyeOutlined, RollbackOutlined } from '@ant-design/icons';
import { hasRole } from '../../hooks/useAuth';

const BORDER = '#e2e5ea';
const SURFACE_ALT = '#f6f7f9';
const PRIMARY = '#1a6b4e';
const TEXT_MUTED = '#8b91a0';
const PAGE_SIZE = 10;

type OrderStatus = 'completed' | 'processing' | 'refunded' | 'expired';
interface Order {
  id:string; code:string; customer:string; album:string; packageName:string; price:string; status:OrderStatus;
  date:string; email:string; phone:string; photos:number; lookupCode:string;
}

const STATUS_MAP: Record<OrderStatus,{color:string;label:string}> = {
  completed:{color:'green',label:'Hoàn thành'}, processing:{color:'orange',label:'Đang xử lý'},
  refunded:{color:'red',label:'Đã hoàn tiền'}, expired:{color:'default',label:'Hết hạn'},
};

const ORDERS: Order[] = [
  {id:'1',code:'#WL2024ABC',customer:'Nguyễn Văn An',album:'Bà Nà Hills 20/02',packageName:'Gói 3 ảnh',price:'50,000đ',status:'completed',date:'20/02/2026 14:23',email:'an@email.com',phone:'0901234567',photos:3,lookupCode:'BNA-2024-001'},
  {id:'2',code:'#OR8765XYZ',customer:'Trần Thị Bình',album:'Hội An 19/02',packageName:'Gói 8 ảnh',price:'100,000đ',status:'completed',date:'19/02/2026 10:15',email:'binh@email.com',phone:'0912345678',photos:8,lookupCode:'HOI-2024-002'},
  {id:'3',code:'#QW4321MNO',customer:'Lê Văn Cường',album:'Cầu Rồng 18/02',packageName:'Gói 1 ảnh',price:'20,000đ',status:'processing',date:'18/02/2026 16:45',email:'cuong@email.com',phone:'0923456789',photos:1,lookupCode:'CAU-2024-003'},
  {id:'4',code:'#AB1234DEF',customer:'Phạm Thị Dung',album:'Bà Nà Hills 20/02',packageName:'Gói 3 ảnh',price:'50,000đ',status:'refunded',date:'20/02/2026 09:30',email:'dung@email.com',phone:'0934567890',photos:3,lookupCode:'BNA-2024-004'},
  {id:'5',code:'#CD5678GHI',customer:'Hoàng Văn Em',album:'Mỹ Khê 17/02',packageName:'Gói 8 ảnh',price:'100,000đ',status:'expired',date:'17/02/2026 11:00',email:'em@email.com',phone:'0945678901',photos:8,lookupCode:'MYK-2024-005'},
  {id:'6',code:'#EF9012JKL',customer:'Vũ Thị Hoa',album:'Hội An 19/02',packageName:'Gói 1 ảnh',price:'20,000đ',status:'completed',date:'19/02/2026 13:20',email:'hoa@email.com',phone:'0956789012',photos:1,lookupCode:'HOI-2024-006'},
  {id:'7',code:'#GH3456MNO',customer:'Đặng Văn Ích',album:'Cầu Rồng 18/02',packageName:'Gói 3 ảnh',price:'50,000đ',status:'processing',date:'18/02/2026 08:45',email:'ich@email.com',phone:'0967890123',photos:3,lookupCode:'CAU-2024-007'},
  {id:'8',code:'#IJ7890PQR',customer:'Bùi Thị Kiều',album:'Bà Nà Hills 20/02',packageName:'Gói 8 ảnh',price:'100,000đ',status:'completed',date:'20/02/2026 15:10',email:'kieu@email.com',phone:'0978901234',photos:8,lookupCode:'BNA-2024-008'},
];

export default function Orders() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [packageFilter, setPackageFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [detailOrder, setDetailOrder] = useState<Order|null>(null);
  const [refundOrder, setRefundOrder] = useState<Order|null>(null);
  const [refundReason, setRefundReason] = useState('');

  const canRefund = hasRole(['admin-system','admin-sales']);

  const filtered = ORDERS.filter(o =>
    (statusFilter === 'all' || o.status === statusFilter) &&
    (packageFilter === 'all' || o.packageName === packageFilter) &&
    (o.code.toLowerCase().includes(search.toLowerCase()) || o.customer.toLowerCase().includes(search.toLowerCase()))
  );
  const paginated = filtered.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const stats = [
    {label:'Tổng đơn',val:ORDERS.length,color:'#2563eb'},
    {label:'Hoàn thành',val:ORDERS.filter(o=>o.status==='completed').length,color:PRIMARY},
    {label:'Đang xử lý',val:ORDERS.filter(o=>o.status==='processing').length,color:'#d4870e'},
    {label:'Đã hoàn tiền',val:ORDERS.filter(o=>o.status==='refunded').length,color:'#d63b3b'},
  ];

  const handleRefund = () => {
    if (!refundReason.trim()) { message.error('Vui lòng nhập lý do hoàn tiền'); return; }
    message.success('Đã xử lý hoàn tiền thành công!');
    setRefundOrder(null); setRefundReason('');
  };

  return (
    <div>
      <h1 style={{fontSize:20,fontWeight:700,marginBottom:24}}>Quản lý Đơn hàng</h1>

      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:16,marginBottom:24}}>
        {stats.map(s=>(
          <div key={s.label} style={{background:'#fff',border:\`1px solid \${BORDER}\`,borderRadius:12,padding:16,textAlign:'center'}}>
            <div style={{fontSize:28,fontWeight:800,color:s.color}}>{s.val}</div>
            <div style={{fontSize:13,color:TEXT_MUTED,marginTop:4}}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{display:'flex',gap:12,marginBottom:20,flexWrap:'wrap'}}>
        <Input prefix={<SearchOutlined/>} placeholder="Mã đơn, khách hàng..." style={{width:260}} value={search} onChange={e=>setSearch(e.target.value)} />
        <Select value={statusFilter} onChange={setStatusFilter} style={{width:160}}>
          <Select.Option value="all">Tất cả</Select.Option>
          <Select.Option value="completed">Hoàn thành</Select.Option>
          <Select.Option value="processing">Đang xử lý</Select.Option>
          <Select.Option value="refunded">Đã hoàn tiền</Select.Option>
          <Select.Option value="expired">Hết hạn</Select.Option>
        </Select>
        <Select value={packageFilter} onChange={setPackageFilter} style={{width:140}}>
          <Select.Option value="all">Tất cả gói</Select.Option>
          <Select.Option value="Gói 1 ảnh">Gói 1 ảnh</Select.Option>
          <Select.Option value="Gói 3 ảnh">Gói 3 ảnh</Select.Option>
          <Select.Option value="Gói 8 ảnh">Gói 8 ảnh</Select.Option>
        </Select>
        <Button onClick={()=>{setSearch('');setStatusFilter('all');setPackageFilter('all');}}>Đặt lại</Button>
      </div>

      <div style={{background:'#fff',border:\`1px solid \${BORDER}\`,borderRadius:12,overflow:'hidden'}}>
        <table style={{width:'100%',borderCollapse:'collapse'}}>
          <thead><tr style={{background:SURFACE_ALT}}>
            {['Mã đơn','Khách hàng','Album','Gói','Giá','Trạng thái','Ngày','Hành động'].map(h=>(
              <th key={h} style={{padding:'12px 16px',textAlign:'left',fontSize:11,fontWeight:700,color:'#5a6170',textTransform:'uppercase',letterSpacing:'0.5px'}}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {paginated.map(o=>(
              <tr key={o.id} style={{borderTop:\`1px solid \${BORDER}\`}}>
                <td style={{padding:'12px 16px',fontWeight:700,fontFamily:'monospace'}}>{o.code}</td>
                <td style={{padding:'12px 16px'}}>{o.customer}</td>
                <td style={{padding:'12px 16px',color:'#5a6170'}}>{o.album}</td>
                <td style={{padding:'12px 16px'}}>{o.packageName}</td>
                <td style={{padding:'12px 16px',fontWeight:600}}>{o.price}</td>
                <td style={{padding:'12px 16px'}}><Tag color={STATUS_MAP[o.status].color}>{STATUS_MAP[o.status].label}</Tag></td>
                <td style={{padding:'12px 16px',color:'#5a6170',fontSize:13}}>{o.date}</td>
                <td style={{padding:'12px 16px'}}>
                  <div style={{display:'flex',gap:6}}>
                    <Button size="small" icon={<EyeOutlined/>} onClick={()=>setDetailOrder(o)}>Chi tiết</Button>
                    {canRefund && o.status==='completed' && <Button size="small" icon={<RollbackOutlined/>} onClick={()=>setRefundOrder(o)}>Hoàn tiền</Button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {paginated.length === 0 && <div style={{textAlign:'center',padding:'40px',color:TEXT_MUTED}}>Không có đơn hàng nào</div>}
        {totalPages > 1 && (
          <div style={{padding:'16px',display:'flex',justifyContent:'flex-end',gap:8,borderTop:\`1px solid \${BORDER}\`}}>
            <Button disabled={page===1} onClick={()=>setPage(p=>p-1)}>« Trước</Button>
            <span style={{padding:'4px 12px',lineHeight:'24px'}}>{page} / {totalPages}</span>
            <Button disabled={page===totalPages} onClick={()=>setPage(p=>p+1)}>Sau »</Button>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      <Modal title={\`Chi tiết đơn hàng \${detailOrder?.code}\`} open={!!detailOrder} onOk={()=>setDetailOrder(null)} onCancel={()=>setDetailOrder(null)} cancelButtonProps={{style:{display:'none'}}} okText="Đóng" width={600}>
        {detailOrder && (
          <Descriptions bordered column={2} size="small" style={{marginTop:16}}>
            <Descriptions.Item label="Mã đơn" span={2}><strong>{detailOrder.code}</strong></Descriptions.Item>
            <Descriptions.Item label="Khách hàng">{detailOrder.customer}</Descriptions.Item>
            <Descriptions.Item label="Email">{detailOrder.email}</Descriptions.Item>
            <Descriptions.Item label="Điện thoại">{detailOrder.phone}</Descriptions.Item>
            <Descriptions.Item label="Album">{detailOrder.album}</Descriptions.Item>
            <Descriptions.Item label="Gói">{detailOrder.packageName}</Descriptions.Item>
            <Descriptions.Item label="Số ảnh">{detailOrder.photos}</Descriptions.Item>
            <Descriptions.Item label="Giá">{detailOrder.price}</Descriptions.Item>
            <Descriptions.Item label="Mã tra cứu">{detailOrder.lookupCode}</Descriptions.Item>
            <Descriptions.Item label="Trạng thái"><Tag color={STATUS_MAP[detailOrder.status].color}>{STATUS_MAP[detailOrder.status].label}</Tag></Descriptions.Item>
            <Descriptions.Item label="Ngày mua" span={2}>{detailOrder.date}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>

      {/* Refund Modal */}
      <Modal title="Xử lý hoàn tiền" open={!!refundOrder} onOk={handleRefund} onCancel={()=>{setRefundOrder(null);setRefundReason('');}} okText="Xác nhận hoàn tiền" okButtonProps={{danger:true}} cancelText="Hủy">
        {refundOrder && (
          <div style={{marginTop:16}}>
            <p>Đơn hàng: <strong>{refundOrder.code}</strong> - {refundOrder.customer}</p>
            <p>Số tiền hoàn: <strong>{refundOrder.price}</strong></p>
            <div style={{marginTop:12}}>
              <label style={{display:'block',fontWeight:600,marginBottom:6}}>Lý do hoàn tiền <span style={{color:'#d63b3b'}}>*</span></label>
              <Input.TextArea rows={3} value={refundReason} onChange={e=>setRefundReason(e.target.value)} placeholder="Nhập lý do hoàn tiền..." />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
`.trimStart());

// ===== PRICING =====
write(`${base}/pages/dashboard/Pricing.tsx`, `
import { useState } from 'react';
import { Tabs, Button, Tag, Modal, Form, Input, Select, InputNumber, message } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, StarFilled } from '@ant-design/icons';
import { hasRole } from '../../hooks/useAuth';

const BORDER = '#e2e5ea';
const PRIMARY = '#1a6b4e';
const WARNING = '#d4870e';
const TEXT_MUTED = '#8b91a0';

interface Bundle { id:number; photos:number; price:number; label:string; popular:boolean; features:string[]; }
interface Coupon { id:number; code:string; type:'percent'|'fixed'; value:number; description:string; status:'active'|'expired'; used:number; limit:number; }

const BUNDLES: Bundle[] = [
  {id:1, photos:1, price:20000, label:'Gói 1 ảnh', popular:false, features:['Tải xuống 1 ảnh chất lượng cao','Link chia sẻ 7 ngày','Hỗ trợ PNG/JPG']},
  {id:2, photos:3, price:50000, label:'Gói 3 ảnh', popular:true, features:['Tải xuống 3 ảnh chất lượng cao','Link chia sẻ 14 ngày','Hỗ trợ PNG/JPG','Tiết kiệm 17%']},
  {id:3, photos:8, price:100000, label:'Gói 8 ảnh', popular:false, features:['Tải xuống 8 ảnh chất lượng cao','Link chia sẻ 30 ngày','Hỗ trợ PNG/JPG','Tiết kiệm 38%']},
];
const COUPONS: Coupon[] = [
  {id:1, code:'WELCOME2026', type:'percent', value:20, description:'Giảm 20% cho lần đầu', status:'active', used:45, limit:100},
  {id:2, code:'TETNGUYENDAN', type:'fixed', value:10000, description:'Giảm 10k dịp Tết', status:'expired', used:200, limit:200},
  {id:3, code:'FIRSTBUY', type:'percent', value:15, description:'Giảm 15% mua lần đầu', status:'active', used:30, limit:50},
];

export default function Pricing() {
  const [bundles, setBundles] = useState<Bundle[]>(BUNDLES);
  const [coupons, setCoupons] = useState<Coupon[]>(COUPONS);
  const [bundleModal, setBundleModal] = useState<{open:boolean;item:Bundle|null}>({open:false,item:null});
  const [couponModal, setCouponModal] = useState<{open:boolean;item:Coupon|null}>({open:false,item:null});
  const [bundleForm] = Form.useForm();
  const [couponForm] = Form.useForm();

  const canEdit = hasRole(['admin-system','admin-sales']);

  const formatPrice = (p:number) => p.toLocaleString('vi-VN') + 'đ';

  const openBundle = (item:Bundle|null) => {
    setBundleModal({open:true,item});
    if (item) bundleForm.setFieldsValue(item);
    else bundleForm.resetFields();
  };
  const openCoupon = (item:Coupon|null) => {
    setCouponModal({open:true,item});
    if (item) couponForm.setFieldsValue(item);
    else couponForm.resetFields();
  };
  const saveBundle = (vals:any) => {
    if (bundleModal.item) setBundles(p=>p.map(b=>b.id===bundleModal.item!.id?{...b,...vals}:b));
    else setBundles(p=>[...p,{id:Date.now(),...vals,popular:false,features:[]}]);
    message.success('Lưu gói thành công!');
    setBundleModal({open:false,item:null});
  };
  const saveCoupon = (vals:any) => {
    if (couponModal.item) setCoupons(p=>p.map(c=>c.id===couponModal.item!.id?{...c,...vals}:c));
    else setCoupons(p=>[...p,{id:Date.now(),...vals,used:0}]);
    message.success('Lưu mã giảm giá thành công!');
    setCouponModal({open:false,item:null});
  };

  const bundleTab = (
    <div>
      {canEdit && <div style={{marginBottom:20}}><Button type="primary" icon={<PlusOutlined/>} onClick={()=>openBundle(null)}>Tạo gói mới</Button></div>}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:20}}>
        {bundles.map(b=>(
          <div key={b.id} style={{background:'#fff',border:b.popular?\`2px solid \${PRIMARY}\`:\`1px solid \${BORDER}\`,borderRadius:12,overflow:'hidden',position:'relative',boxShadow: b.popular ? '0 4px 20px rgba(26,107,78,0.15)' : 'none'}}>
            {b.popular && <div style={{background:PRIMARY,color:'#fff',textAlign:'center',padding:'6px',fontSize:12,fontWeight:700,letterSpacing:'0.5px'}}>⭐ PHỔ BIẾN NHẤT</div>}
            <div style={{padding:24}}>
              <div style={{fontSize:22,fontWeight:800,color:PRIMARY,marginBottom:4}}>{b.label}</div>
              <div style={{fontSize:36,fontWeight:800,color:'#1a1d23',marginBottom:4}}>{formatPrice(b.price)}</div>
              <div style={{fontSize:13,color:TEXT_MUTED,marginBottom:16}}>cho {b.photos} ảnh ({Math.round(b.price/b.photos/1000)*1000}đ/ảnh)</div>
              <ul style={{margin:'0 0 20px',paddingLeft:0,listStyle:'none'}}>
                {b.features.map((f,i)=><li key={i} style={{padding:'4px 0',fontSize:13,display:'flex',alignItems:'center',gap:6}}><span style={{color:PRIMARY}}>✓</span>{f}</li>)}
              </ul>
              {canEdit && (
                <div style={{display:'flex',gap:8}}>
                  <Button size="small" icon={<EditOutlined/>} onClick={()=>openBundle(b)} style={{flex:1}}>Chỉnh sửa</Button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const couponTab = (
    <div>
      {canEdit && <div style={{marginBottom:20}}><Button type="primary" icon={<PlusOutlined/>} onClick={()=>openCoupon(null)}>Tạo mã mới</Button></div>}
      <div style={{background:'#fff',border:\`1px solid \${BORDER}\`,borderRadius:12,overflow:'hidden'}}>
        <table style={{width:'100%',borderCollapse:'collapse'}}>
          <thead><tr style={{background:'#f6f7f9'}}>
            {['Mã','Loại giảm','Giá trị','Mô tả','Đã dùng','Trạng thái',''].map(h=><th key={h} style={{padding:'12px 16px',textAlign:'left',fontSize:11,fontWeight:700,color:'#5a6170',textTransform:'uppercase'}}>{h}</th>)}
          </tr></thead>
          <tbody>
            {coupons.map(c=>(
              <tr key={c.id} style={{borderTop:\`1px solid \${BORDER}\`}}>
                <td style={{padding:'12px 16px',fontWeight:700,fontFamily:'monospace'}}>{c.code}</td>
                <td style={{padding:'12px 16px'}}>{c.type==='percent'?'Phần trăm':'Số tiền cố định'}</td>
                <td style={{padding:'12px 16px',fontWeight:600}}>{c.type==='percent'?\`-\${c.value}%\`:\`-\${c.value.toLocaleString()}đ\`}</td>
                <td style={{padding:'12px 16px',color:'#5a6170'}}>{c.description}</td>
                <td style={{padding:'12px 16px'}}>{c.used}/{c.limit}</td>
                <td style={{padding:'12px 16px'}}><Tag color={c.status==='active'?'green':'default'}>{c.status==='active'?'Hoạt động':'Hết hạn'}</Tag></td>
                <td style={{padding:'12px 16px'}}>
                  {canEdit && <Button size="small" icon={<EditOutlined/>} onClick={()=>openCoupon(c)}>Sửa</Button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div>
      <h1 style={{fontSize:20,fontWeight:700,marginBottom:24}}>Quản lý Bảng giá</h1>
      <Tabs items={[{key:'bundles',label:'Gói Bundle',children:bundleTab},{key:'coupons',label:'Mã giảm giá',children:couponTab}]} />

      <Modal title={bundleModal.item?'Chỉnh sửa gói':'Tạo gói mới'} open={bundleModal.open} onOk={bundleForm.submit} onCancel={()=>setBundleModal({open:false,item:null})} okText="Lưu" cancelText="Hủy">
        <Form form={bundleForm} layout="vertical" onFinish={saveBundle} style={{marginTop:16}}>
          <Form.Item name="label" label="Tên gói" rules={[{required:true}]}><Input/></Form.Item>
          <Form.Item name="photos" label="Số ảnh" rules={[{required:true}]}><InputNumber min={1} style={{width:'100%'}}/></Form.Item>
          <Form.Item name="price" label="Giá (VNĐ)" rules={[{required:true}]}><InputNumber min={0} step={1000} style={{width:'100%'}}/></Form.Item>
        </Form>
      </Modal>

      <Modal title={couponModal.item?'Chỉnh sửa mã':'Tạo mã mới'} open={couponModal.open} onOk={couponForm.submit} onCancel={()=>setCouponModal({open:false,item:null})} okText="Lưu" cancelText="Hủy">
        <Form form={couponForm} layout="vertical" onFinish={saveCoupon} style={{marginTop:16}}>
          <Form.Item name="code" label="Mã giảm giá" rules={[{required:true}]}><Input style={{textTransform:'uppercase'}}/></Form.Item>
          <Form.Item name="type" label="Loại" rules={[{required:true}]}>
            <Select><Select.Option value="percent">Phần trăm (%)</Select.Option><Select.Option value="fixed">Số tiền cố định (đ)</Select.Option></Select>
          </Form.Item>
          <Form.Item name="value" label="Giá trị" rules={[{required:true}]}><InputNumber min={0} style={{width:'100%'}}/></Form.Item>
          <Form.Item name="description" label="Mô tả"><Input/></Form.Item>
          <Form.Item name="limit" label="Giới hạn sử dụng"><InputNumber min={1} style={{width:'100%'}}/></Form.Item>
          <Form.Item name="status" label="Trạng thái">
            <Select><Select.Option value="active">Hoạt động</Select.Option><Select.Option value="expired">Hết hạn</Select.Option></Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
`.trimStart());

// ===== REVENUE =====
write(`${base}/pages/dashboard/Revenue.tsx`, `
import { useState } from 'react';
import { Tabs, Card } from 'antd';
import { ArrowUpOutlined, DollarOutlined, ShoppingCartOutlined, PictureOutlined, TeamOutlined } from '@ant-design/icons';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Tooltip, Legend, Filler } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Tooltip, Legend, Filler);

const PRIMARY = '#1a6b4e';
const WARNING = '#d4870e';
const INFO = '#2563eb';
const BORDER = '#e2e5ea';
const SURFACE_ALT = '#f6f7f9';
const TEXT_MUTED = '#8b91a0';

const FEB_DATA = [850000,1200000,980000,1450000,1100000,1750000,1300000,1950000,1600000,2200000,1800000,2400000,2100000,2600000,
                  2300000,2700000,2400000,2900000,2600000,3100000,2800000,3300000,3000000,3500000,3200000,3700000,3400000,3900000];

function fmt(v:number){return(v/1000000).toFixed(1)+'M';}

export default function Revenue() {
  const [period, setPeriod] = useState('month');

  const labels28 = Array.from({length:28},(_,i)=>\`\${i+1}/02\`);
  const lineData = { labels:labels28, datasets:[{label:'Doanh thu',data:FEB_DATA,borderColor:PRIMARY,backgroundColor:'rgba(26,107,78,0.1)',tension:0.4,fill:true}] };
  const lineOptions = { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ y:{ beginAtZero:true, ticks:{ callback:(v:any)=>fmt(v) } } } };

  const barData = { labels:['Bà Nà Hills','Hội An','Cầu Rồng','Mỹ Khê','Bắc Mỹ An'], datasets:[{label:'Doanh thu',data:[6000000,4900000,3750000,3400000,2100000],backgroundColor:PRIMARY}] };
  const barOptions = { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ y:{ beginAtZero:true, ticks:{callback:(v:any)=>fmt(v)} } } };

  const doughnutData = { labels:['Gói 8 ảnh','Gói 3 ảnh','Gói 1 ảnh'], datasets:[{data:[42000000,14000000,3000000],backgroundColor:[PRIMARY,WARNING,INFO]}] };
  const doughnutOptions = { responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom' as const}} };

  const stats = [
    {label:'Tổng doanh thu',val:'42,5M',change:'+18%',icon:<DollarOutlined/>,iconBg:'#fef3e8',iconColor:WARNING},
    {label:'Số đơn hàng',val:'850',change:'+22%',icon:<ShoppingCartOutlined/>,iconBg:'#e8f5f0',iconColor:PRIMARY},
    {label:'Ảnh đã bán',val:'3,200',change:'+15%',icon:<PictureOutlined/>,iconBg:'#eff6ff',iconColor:INFO},
    {label:'Khách hàng mới',val:'245',change:'+30%',icon:<TeamOutlined/>,iconBg:'#e8f5f0',iconColor:PRIMARY},
  ];

  const topAlbums = [
    {name:'Bà Nà Hills 20/02',orders:120,revenue:'6,000,000đ'},{name:'Hội An 19/02',orders:98,revenue:'4,900,000đ'},
    {name:'Cầu Rồng 18/02',orders:75,revenue:'3,750,000đ'},{name:'Mỹ Khê 17/02',orders:68,revenue:'3,400,000đ'},
  ];
  const topStaff = [
    {name:'Nguyễn Văn A',role:'Admin Sales',uploads:150,revenue:'12,000,000đ'},
    {name:'Trần Thị B',role:'Manager',uploads:120,revenue:'9,800,000đ'},
    {name:'Lê Văn C',role:'Staff',uploads:95,revenue:'7,500,000đ'},
  ];

  const cardStyle = { borderRadius:12, border:\`1px solid \${BORDER}\`, boxShadow:'0 1px 2px rgba(0,0,0,0.05)' };

  const content = (
    <div>
      {/* Stats */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:16,marginBottom:24}}>
        {stats.map(s=>(
          <div key={s.label} style={{background:'#fff',border:\`1px solid \${BORDER}\`,borderRadius:12,padding:16,display:'flex',alignItems:'flex-start',gap:12}}>
            <div style={{width:44,height:44,borderRadius:8,background:s.iconBg,color:s.iconColor,display:'flex',alignItems:'center',justifyContent:'center',fontSize:20}}>{s.icon}</div>
            <div><div style={{fontSize:12,color:TEXT_MUTED}}>{s.label}</div><div style={{fontSize:22,fontWeight:800}}>{s.val}</div><div style={{fontSize:11,color:PRIMARY,display:'flex',alignItems:'center',gap:4}}><ArrowUpOutlined/>{s.change}</div></div>
          </div>
        ))}
      </div>

      {/* Line Chart */}
      <Card title="Doanh thu theo ngày (Tháng 2/2026)" style={{...cardStyle,marginBottom:24}}>
        <div style={{height:280}}><Line data={lineData} options={lineOptions}/></div>
      </Card>

      {/* Bar + Doughnut */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20,marginBottom:24}}>
        <Card title="Doanh thu theo album" style={cardStyle}><div style={{height:260}}><Bar data={barData} options={barOptions}/></div></Card>
        <Card title="Doanh thu theo gói" style={cardStyle}><div style={{height:260}}><Doughnut data={doughnutData} options={doughnutOptions}/></div></Card>
      </div>

      {/* Top Tables */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>
        <Card title="Album bán chạy" style={cardStyle}>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead><tr style={{background:SURFACE_ALT}}>{['Album','Đơn','Doanh thu'].map(h=><th key={h} style={{padding:'10px 12px',textAlign:'left',fontSize:11,fontWeight:700,color:'#5a6170',textTransform:'uppercase'}}>{h}</th>)}</tr></thead>
            <tbody>{topAlbums.map((a,i)=><tr key={i} style={{borderTop:\`1px solid \${BORDER}\`}}><td style={{padding:'10px 12px',fontWeight:600}}>{a.name}</td><td style={{padding:'10px 12px'}}>{a.orders}</td><td style={{padding:'10px 12px',fontWeight:600,color:PRIMARY}}>{a.revenue}</td></tr>)}</tbody>
          </table>
        </Card>
        <Card title="Nhân viên xuất sắc" style={cardStyle}>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead><tr style={{background:SURFACE_ALT}}>{['Nhân viên','Vai trò','Ảnh','Doanh thu'].map(h=><th key={h} style={{padding:'10px 12px',textAlign:'left',fontSize:11,fontWeight:700,color:'#5a6170',textTransform:'uppercase'}}>{h}</th>)}</tr></thead>
            <tbody>{topStaff.map((s,i)=><tr key={i} style={{borderTop:\`1px solid \${BORDER}\`}}><td style={{padding:'10px 12px',fontWeight:600}}>{s.name}</td><td style={{padding:'10px 12px',color:'#5a6170'}}>{s.role}</td><td style={{padding:'10px 12px'}}>{s.uploads}</td><td style={{padding:'10px 12px',fontWeight:600,color:PRIMARY}}>{s.revenue}</td></tr>)}</tbody>
          </table>
        </Card>
      </div>
    </div>
  );

  const periodItems = ['day','week','month','quarter','year'].map(k=>({key:k,label:{day:'Ngày',week:'Tuần',month:'Tháng',quarter:'Quý',year:'Năm'}[k],children:content}));

  return (
    <div>
      <h1 style={{fontSize:20,fontWeight:700,marginBottom:24}}>Báo cáo Doanh thu</h1>
      <Tabs items={periodItems} activeKey={period} onChange={setPeriod}/>
    </div>
  );
}
`.trimStart());

console.log('Albums, Orders, Pricing, Revenue written!');
