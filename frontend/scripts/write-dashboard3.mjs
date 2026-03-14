import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
function write(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf8');
  console.log('Written:', path);
}
const base = 'c:/Users/datth/Downloads/photopro-react/src';

// ===== STAFF =====
write(`${base}/pages/dashboard/Staff.tsx`, `
import { useState } from 'react';
import { Input, Select, Button, Tag, Modal, Form, message } from 'antd';
import { SearchOutlined, PlusOutlined, EditOutlined, LockOutlined, UnlockOutlined, UserOutlined } from '@ant-design/icons';
import { hasRole, getAvatarInitials } from '../../hooks/useAuth';

const BORDER = '#e2e5ea';
const PRIMARY = '#1a6b4e';
const DANGER = '#d63b3b';
const SURFACE_ALT = '#f6f7f9';
const TEXT_MUTED = '#8b91a0';

type StaffRole = 'admin-system'|'admin-sales'|'manager'|'staff';
type StaffStatus = 'active'|'locked';
interface StaffMember { id:number; name:string; email:string; role:StaffRole; uploads:number; joinDate:string; status:StaffStatus; }

const ROLE_MAP: Record<StaffRole,{color:string;label:string}> = {
  'admin-system':{color:'red',label:'Admin System'},
  'admin-sales':{color:'orange',label:'Admin Sales'},
  'manager':{color:'blue',label:'Manager'},
  'staff':{color:'default',label:'Staff'},
};

const INITIAL_STAFF: StaffMember[] = [
  {id:1,name:'Nguyễn Văn A',email:'a@photopro.vn',role:'admin-sales',uploads:150,joinDate:'01/01/2025',status:'active'},
  {id:2,name:'Trần Thị B',email:'b@photopro.vn',role:'manager',uploads:120,joinDate:'15/02/2025',status:'active'},
  {id:3,name:'Lê Văn C',email:'c@photopro.vn',role:'staff',uploads:95,joinDate:'01/03/2025',status:'active'},
  {id:4,name:'Phạm Thị D',email:'d@photopro.vn',role:'staff',uploads:80,joinDate:'10/03/2025',status:'active'},
  {id:5,name:'Hoàng Văn E',email:'e@photopro.vn',role:'staff',uploads:0,joinDate:'05/04/2025',status:'locked'},
];

export default function Staff() {
  const [staff, setStaff] = useState<StaffMember[]>(INITIAL_STAFF);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [modal, setModal] = useState<{open:boolean;item:StaffMember|null}>({open:false,item:null});
  const [form] = Form.useForm();

  const canManage = hasRole(['admin-system']);

  const stats = [
    {label:'Tổng nhân viên',val:staff.length,color:PRIMARY},
    {label:'Đang hoạt động',val:staff.filter(s=>s.status==='active').length,color:'#1a854a'},
    {label:'Bị khóa',val:staff.filter(s=>s.status==='locked').length,color:DANGER},
    {label:'Ảnh đã upload',val:staff.reduce((a,s)=>a+s.uploads,0),color:'#2563eb'},
  ];

  const filtered = staff
    .filter(s=>roleFilter==='all'||s.role===roleFilter)
    .filter(s=>s.name.toLowerCase().includes(search.toLowerCase())||s.email.toLowerCase().includes(search.toLowerCase()));

  const openModal = (item:StaffMember|null) => {
    setModal({open:true,item});
    if (item) form.setFieldsValue(item);
    else form.resetFields();
  };

  const handleSave = (vals:any) => {
    if (modal.item) {
      setStaff(p=>p.map(s=>s.id===modal.item!.id?{...s,...vals}:s));
      message.success('Cập nhật thành công!');
    } else {
      setStaff(p=>[...p,{id:Date.now(),...vals,uploads:0,joinDate:new Date().toLocaleDateString('vi-VN'),status:'active' as StaffStatus}]);
      message.success('Thêm nhân viên thành công!');
    }
    setModal({open:false,item:null});
  };

  const toggleLock = (s:StaffMember) => {
    setStaff(p=>p.map(x=>x.id===s.id?{...x,status:x.status==='active'?'locked':'active'}:x));
    message.success(s.status==='active'?'Đã khóa tài khoản':'Đã mở khóa tài khoản');
  };

  return (
    <div>
      <h1 style={{fontSize:20,fontWeight:700,marginBottom:16}}>Quản lý Nhân viên</h1>

      {!canManage && (
        <div style={{marginBottom:20,padding:'12px 16px',background:'#eff6ff',border:'1px solid #93c5fd',borderRadius:8,color:'#1d4ed8',fontSize:13}}>
          ℹ️ Bạn chỉ có quyền xem thông tin nhân viên. Chỉ Admin System mới có thể thêm/sửa/xóa.
        </div>
      )}

      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:16,marginBottom:24}}>
        {stats.map(s=>(
          <div key={s.label} style={{background:'#fff',border:\`1px solid \${BORDER}\`,borderRadius:12,padding:16,textAlign:'center'}}>
            <div style={{fontSize:28,fontWeight:800,color:s.color}}>{s.val}</div>
            <div style={{fontSize:13,color:TEXT_MUTED,marginTop:4}}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{display:'flex',gap:12,marginBottom:20,flexWrap:'wrap',justifyContent:'space-between'}}>
        <div style={{display:'flex',gap:12}}>
          <Input prefix={<SearchOutlined/>} placeholder="Tìm nhân viên..." style={{width:260}} value={search} onChange={e=>setSearch(e.target.value)}/>
          <Select value={roleFilter} onChange={setRoleFilter} style={{width:160}}>
            <Select.Option value="all">Tất cả vai trò</Select.Option>
            <Select.Option value="admin-sales">Admin Sales</Select.Option>
            <Select.Option value="manager">Manager</Select.Option>
            <Select.Option value="staff">Staff</Select.Option>
          </Select>
        </div>
        {canManage && <Button type="primary" icon={<PlusOutlined/>} onClick={()=>openModal(null)}>Thêm nhân viên</Button>}
      </div>

      <div style={{background:'#fff',border:\`1px solid \${BORDER}\`,borderRadius:12,overflow:'hidden'}}>
        <table style={{width:'100%',borderCollapse:'collapse'}}>
          <thead><tr style={{background:SURFACE_ALT}}>
            {['Nhân viên','Email','Vai trò','Ảnh upload','Ngày vào','Trạng thái','Hành động'].map(h=>(
              <th key={h} style={{padding:'12px 16px',textAlign:'left',fontSize:11,fontWeight:700,color:'#5a6170',textTransform:'uppercase'}}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {filtered.map(s=>(
              <tr key={s.id} style={{borderTop:\`1px solid \${BORDER}\`}}>
                <td style={{padding:'12px 16px'}}>
                  <div style={{display:'flex',alignItems:'center',gap:12}}>
                    <div style={{width:36,height:36,borderRadius:18,background:PRIMARY,color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:700}}>
                      {getAvatarInitials(s.name)}
                    </div>
                    <div style={{fontWeight:600}}>{s.name}</div>
                  </div>
                </td>
                <td style={{padding:'12px 16px',color:'#5a6170'}}>{s.email}</td>
                <td style={{padding:'12px 16px'}}><Tag color={ROLE_MAP[s.role].color}>{ROLE_MAP[s.role].label}</Tag></td>
                <td style={{padding:'12px 16px'}}>{s.uploads}</td>
                <td style={{padding:'12px 16px',color:'#5a6170'}}>{s.joinDate}</td>
                <td style={{padding:'12px 16px'}}><Tag color={s.status==='active'?'green':'default'}>{s.status==='active'?'Hoạt động':'Bị khóa'}</Tag></td>
                <td style={{padding:'12px 16px'}}>
                  <div style={{display:'flex',gap:6}}>
                    {canManage && <Button size="small" icon={<EditOutlined/>} onClick={()=>openModal(s)}>Sửa</Button>}
                    {canManage && <Button size="small" danger={s.status==='active'} icon={s.status==='active'?<LockOutlined/>:<UnlockOutlined/>} onClick={()=>toggleLock(s)}>{s.status==='active'?'Khóa':'Mở khóa'}</Button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length===0 && <div style={{textAlign:'center',padding:'40px',color:TEXT_MUTED}}>Không tìm thấy nhân viên nào</div>}
      </div>

      <Modal title={modal.item?'Chỉnh sửa nhân viên':'Thêm nhân viên mới'} open={modal.open} onOk={form.submit} onCancel={()=>setModal({open:false,item:null})} okText="Lưu" cancelText="Hủy">
        <Form form={form} layout="vertical" onFinish={handleSave} style={{marginTop:16}}>
          <Form.Item name="name" label="Họ và tên" rules={[{required:true}]}><Input prefix={<UserOutlined/>}/></Form.Item>
          <Form.Item name="email" label="Email" rules={[{required:true,type:'email'}]}><Input/></Form.Item>
          <Form.Item name="role" label="Vai trò" rules={[{required:true}]}>
            <Select>
              <Select.Option value="admin-sales">Admin Sales</Select.Option>
              <Select.Option value="manager">Manager</Select.Option>
              <Select.Option value="staff">Staff</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
`.trimStart());

// ===== SETTINGS =====
write(`${base}/pages/dashboard/Settings.tsx`, `
import { useState } from 'react';
import { Tabs, Form, Input, InputNumber, Select, Button, message, Tag } from 'antd';
import { SaveOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { hasRole } from '../../hooks/useAuth';

const BORDER = '#e2e5ea';
const PRIMARY = '#1a6b4e';
const SURFACE_ALT = '#f6f7f9';

const COLOR_PRESETS = [
  {name:'Xanh lá',value:'#1a6b4e'},{name:'Xanh dương',value:'#2563eb'},{name:'Tím',value:'#7c3aed'},
  {name:'Đỏ',value:'#dc2626'},{name:'Cam',value:'#ea580c'},{name:'Hồng',value:'#db2777'},
];

export default function Settings() {
  const canEdit = hasRole(['admin-system']);
  const [storageForm] = Form.useForm();
  const [domainForm] = Form.useForm();
  const [paymentForm] = Form.useForm();
  const [uiForm] = Form.useForm();

  const [retention, setRetention] = useState(30);
  const [ttl, setTtl] = useState(168);
  const [selectedColor, setSelectedColor] = useState('#1a6b4e');

  const handleSave = (formName: string, vals: any) => {
    console.log(formName, vals);
    message.success('Lưu cài đặt thành công!');
  };

  const sectionStyle = { background:'#fff', border:\`1px solid \${BORDER}\`, borderRadius:12, padding:24, marginBottom:20 };
  const labelStyle = { fontWeight:600, display:'block' as const, marginBottom:4, fontSize:14 };

  const storageTab = (
    <div>
      {!canEdit && <div style={{marginBottom:20,padding:'12px 16px',background:'#eff6ff',border:'1px solid #93c5fd',borderRadius:8,color:'#1d4ed8',fontSize:13}}>ℹ️ Chỉ Admin System mới có thể thay đổi cài đặt.</div>}
      <Form form={storageForm} layout="vertical" onFinish={v=>handleSave('storage',v)} initialValues={{retention:30,ttl:168,maxDownloads:5,autoDelete:true}}>
        <div style={sectionStyle}>
          <h3 style={{margin:'0 0 16px',fontWeight:700}}>Cài đặt Lưu trữ</h3>
          <Form.Item name="retention" label={<span style={labelStyle}>Thời hạn lưu ảnh (ngày)</span>}>
            <InputNumber min={1} max={365} style={{width:'100%'}} disabled={!canEdit} onChange={v=>setRetention(v||30)}/>
          </Form.Item>
          <div style={{padding:'12px 16px',background:'#fef3e8',border:'1px solid #fcd34d',borderRadius:8,fontSize:13,marginBottom:16}}>
            ⚠️ Ảnh sẽ tự động xóa sau <strong>{retention} ngày</strong> kể từ ngày chụp. Không thể khôi phục sau khi xóa.
          </div>
          <Form.Item name="ttl" label={<span style={labelStyle}>Thời hạn link tải xuống (giờ)</span>}>
            <InputNumber min={1} max={720} style={{width:'100%'}} disabled={!canEdit} onChange={v=>setTtl(v||168)}/>
          </Form.Item>
          <div style={{padding:'12px 16px',background:SURFACE_ALT,border:\`1px solid \${BORDER}\`,borderRadius:8,fontSize:13,marginBottom:16}}>
            📎 Link ảnh hết hạn sau <strong>{ttl} giờ</strong> ({Math.floor(ttl/24)} ngày {ttl%24} giờ) kể từ khi tạo.
          </div>
          <Form.Item name="maxDownloads" label={<span style={labelStyle}>Số lần tải tối đa mỗi link</span>}>
            <InputNumber min={1} max={100} style={{width:'100%'}} disabled={!canEdit}/>
          </Form.Item>
          {canEdit && <Button type="primary" htmlType="submit" icon={<SaveOutlined/>}>Lưu cài đặt</Button>}
        </div>
      </Form>
    </div>
  );

  const domainTab = (
    <Form form={domainForm} layout="vertical" onFinish={v=>handleSave('domain',v)} initialValues={{subdomain:'studio-abc',customDomain:''}}>
      <div style={sectionStyle}>
        <h3 style={{margin:'0 0 16px',fontWeight:700}}>Cài đặt Domain</h3>
        <Form.Item name="subdomain" label={<span style={labelStyle}>Subdomain</span>}>
          <Input addonAfter=".photopro.vn" disabled={!canEdit} placeholder="studio-abc"/>
        </Form.Item>
        <Form.Item name="customDomain" label={<span style={labelStyle}>Domain tùy chỉnh</span>}>
          <Input disabled={!canEdit} placeholder="photos.yourstudio.com"/>
        </Form.Item>
        <div style={{padding:'12px 16px',background:SURFACE_ALT,border:\`1px solid \${BORDER}\`,borderRadius:8,fontSize:13,marginBottom:16}}>
          📎 URL truy cập: <strong>https://studio-abc.photopro.vn</strong>
        </div>
        {canEdit && <Button type="primary" htmlType="submit" icon={<SaveOutlined/>}>Lưu cài đặt</Button>}
      </div>
    </Form>
  );

  const paymentTab = (
    <Form form={paymentForm} layout="vertical" onFinish={v=>handleSave('payment',v)} initialValues={{provider:'vnpay',currency:'VND'}}>
      <div style={sectionStyle}>
        <h3 style={{margin:'0 0 16px',fontWeight:700}}>Cài đặt Thanh toán</h3>
        <Form.Item name="provider" label={<span style={labelStyle}>Cổng thanh toán</span>}>
          <Select disabled={!canEdit}>
            <Select.Option value="vnpay">VNPay</Select.Option>
            <Select.Option value="momo">MoMo</Select.Option>
            <Select.Option value="zalopay">ZaloPay</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item name="merchantId" label={<span style={labelStyle}>Merchant ID</span>}>
          <Input disabled={!canEdit} placeholder="Nhập Merchant ID..."/>
        </Form.Item>
        <Form.Item name="secretKey" label={<span style={labelStyle}>Secret Key</span>}>
          <Input.Password disabled={!canEdit} placeholder="••••••••••••"/>
        </Form.Item>
        <Form.Item name="currency" label={<span style={labelStyle}>Đơn vị tiền tệ</span>}>
          <Select disabled={!canEdit}><Select.Option value="VND">VND - Việt Nam Đồng</Select.Option></Select>
        </Form.Item>
        {canEdit && <Button type="primary" htmlType="submit" icon={<SaveOutlined/>}>Lưu cài đặt</Button>}
      </div>
    </Form>
  );

  const uiTab = (
    <div>
      <div style={sectionStyle}>
        <h3 style={{margin:'0 0 16px',fontWeight:700}}>Giao diện & Thương hiệu</h3>
        <Form form={uiForm} layout="vertical" onFinish={v=>handleSave('ui',{...v,primaryColor:selectedColor})}>
          <Form.Item name="siteName" label={<span style={labelStyle}>Tên studio</span>} initialValue="PhotoPro Studio">
            <Input disabled={!canEdit}/>
          </Form.Item>
          <Form.Item label={<span style={labelStyle}>Màu chủ đạo</span>}>
            <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:8}}>
              {COLOR_PRESETS.map(c=>(
                <button key={c.value} onClick={()=>canEdit&&setSelectedColor(c.value)}
                  style={{cursor:canEdit?'pointer':'not-allowed',border:selectedColor===c.value?\`3px solid \${c.value}\`:\`1px solid \${BORDER}\`,borderRadius:8,padding:'8px 4px',background:SURFACE_ALT,display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
                  <div style={{width:28,height:28,borderRadius:6,background:c.value,position:'relative'}}>
                    {selectedColor===c.value && <CheckCircleOutlined style={{position:'absolute',top:-6,right:-6,color:c.value,background:'#fff',borderRadius:8,fontSize:14}}/>}
                  </div>
                  <span style={{fontSize:10}}>{c.name}</span>
                </button>
              ))}
            </div>
          </Form.Item>
          <Form.Item name="language" label={<span style={labelStyle}>Ngôn ngữ</span>} initialValue="vi">
            <Select disabled={!canEdit}><Select.Option value="vi">Tiếng Việt</Select.Option><Select.Option value="en">English</Select.Option></Select>
          </Form.Item>
          {canEdit && <Button type="primary" htmlType="submit" icon={<SaveOutlined/>}>Lưu giao diện</Button>}
        </Form>
      </div>
    </div>
  );

  return (
    <div>
      <h1 style={{fontSize:20,fontWeight:700,marginBottom:24}}>Cài đặt Hệ thống</h1>
      <Tabs items={[
        {key:'storage',label:'Thời hạn lưu trữ',children:storageTab},
        {key:'domain',label:'Domain',children:domainTab},
        {key:'payment',label:'Thanh toán',children:paymentTab},
        {key:'ui',label:'Giao diện',children:uiTab},
      ]}/>
    </div>
  );
}
`.trimStart());

// ===== PROFILE =====
write(`${base}/pages/dashboard/Profile.tsx`, `
import { useState } from 'react';
import { Tabs, Form, Input, Button, Switch, message, Tag } from 'antd';
import { UserOutlined, LockOutlined, BellOutlined, HistoryOutlined, CameraOutlined } from '@ant-design/icons';
import { getUser, getAvatarInitials, ROLE_LABELS } from '../../hooks/useAuth';

const BORDER = '#e2e5ea';
const PRIMARY = '#1a6b4e';
const SURFACE_ALT = '#f6f7f9';
const TEXT_MUTED = '#8b91a0';

const SESSIONS = [
  {id:1,device:'Chrome / Windows',location:'Đà Nẵng, VN',time:'Hiện tại',current:true},
  {id:2,device:'Safari / iPhone',location:'Hội An, VN',time:'2 giờ trước',current:false},
  {id:3,device:'Firefox / macOS',location:'TPHCM, VN',time:'1 ngày trước',current:false},
];

const ACTIVITIES = [
  {time:'14:23',action:'Đăng nhập hệ thống','icon':'🔐'},
  {time:'13:45',action:'Tạo album mới "Bà Nà Hills 20/02"','icon':'📁'},
  {time:'12:30',action:'Cập nhật bảng giá gói 3 ảnh','icon':'💰'},
  {time:'10:15',action:'Xử lý hoàn tiền đơn #OR8765XYZ','icon':'💳'},
  {time:'09:00',action:'Đăng nhập hệ thống','icon':'🔐'},
];

export default function Profile() {
  const user = getUser();
  const [infoForm] = Form.useForm();
  const [pwForm] = Form.useForm();
  const [notifications, setNotifications] = useState({ newOrder:true, refund:true, autoDelete:true, system:false, weekly:true });

  const handleInfoSave = (vals: any) => { console.log(vals); message.success('Cập nhật thông tin thành công!'); };
  const handlePwSave = (vals: any) => {
    if (vals.newPassword !== vals.confirmPassword) { message.error('Mật khẩu xác nhận không khớp!'); return; }
    message.success('Đổi mật khẩu thành công!'); pwForm.resetFields();
  };

  const stats = [
    {label:'Ảnh đã upload',val:'1,250',color:PRIMARY},
    {label:'Đơn đã xử lý',val:'348',color:'#2563eb'},
    {label:'Doanh thu',val:'12,5M',color:'#d4870e'},
  ];

  const infoTab = (
    <div style={{maxWidth:560}}>
      <div style={{textAlign:'center',marginBottom:28}}>
        <div style={{width:80,height:80,borderRadius:40,background:PRIMARY,color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:28,fontWeight:700,margin:'0 auto 12px'}}>
          {getAvatarInitials(user?.name||'User')}
        </div>
        <button style={{color:PRIMARY,background:'none',border:'none',cursor:'pointer',fontSize:13}}>
          <CameraOutlined/> Thay đổi ảnh đại diện
        </button>
      </div>
      <Form form={infoForm} layout="vertical" onFinish={handleInfoSave} initialValues={{name:user?.name,email:user?.username,phone:'',bio:''}}>
        <Form.Item name="name" label="Họ và tên" rules={[{required:true}]}><Input prefix={<UserOutlined/>}/></Form.Item>
        <Form.Item name="email" label="Email" rules={[{required:true,type:'email'}]}><Input/></Form.Item>
        <Form.Item name="phone" label="Số điện thoại"><Input placeholder="0901234567"/></Form.Item>
        <Form.Item name="bio" label="Giới thiệu"><Input.TextArea rows={3} placeholder="Mô tả ngắn về bạn..."/></Form.Item>
        <Button type="primary" htmlType="submit">Lưu thông tin</Button>
      </Form>
    </div>
  );

  const securityTab = (
    <div style={{maxWidth:480}}>
      <div style={{background:'#fff',border:\`1px solid \${BORDER}\`,borderRadius:12,padding:24,marginBottom:20}}>
        <h3 style={{margin:'0 0 16px',fontWeight:700}}>Đổi mật khẩu</h3>
        <Form form={pwForm} layout="vertical" onFinish={handlePwSave}>
          <Form.Item name="currentPassword" label="Mật khẩu hiện tại" rules={[{required:true}]}><Input.Password prefix={<LockOutlined/>}/></Form.Item>
          <Form.Item name="newPassword" label="Mật khẩu mới" rules={[{required:true,min:8,message:'Ít nhất 8 ký tự'}]}><Input.Password prefix={<LockOutlined/>}/></Form.Item>
          <Form.Item name="confirmPassword" label="Xác nhận mật khẩu mới" rules={[{required:true}]}><Input.Password prefix={<LockOutlined/>}/></Form.Item>
          <Button type="primary" htmlType="submit" danger>Đổi mật khẩu</Button>
        </Form>
      </div>
      <div style={{background:'#fff',border:\`1px solid \${BORDER}\`,borderRadius:12,padding:24}}>
        <h3 style={{margin:'0 0 16px',fontWeight:700}}>Phiên đăng nhập</h3>
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          {SESSIONS.map(s=>(
            <div key={s.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:12,background:SURFACE_ALT,borderRadius:8}}>
              <div>
                <div style={{fontWeight:600,fontSize:13}}>{s.device}</div>
                <div style={{fontSize:12,color:TEXT_MUTED}}>{s.location} · {s.time}</div>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                {s.current ? <Tag color="green">Hiện tại</Tag> : <Button size="small" danger>Đăng xuất</Button>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const activityTab = (
    <div style={{maxWidth:560}}>
      <div style={{background:'#fff',border:\`1px solid \${BORDER}\`,borderRadius:12,padding:24}}>
        <h3 style={{margin:'0 0 20px',fontWeight:700}}>Hoạt động gần đây</h3>
        <div style={{display:'flex',flexDirection:'column',gap:0}}>
          {ACTIVITIES.map((a,i)=>(
            <div key={i} style={{display:'flex',gap:16,paddingBottom:20,position:'relative'}}>
              {i < ACTIVITIES.length-1 && <div style={{position:'absolute',left:18,top:36,width:2,height:'calc(100% - 16px)',background:BORDER}}/>}
              <div style={{width:36,height:36,borderRadius:18,background:SURFACE_ALT,display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,flexShrink:0}}>{a.icon}</div>
              <div style={{paddingTop:6}}>
                <div style={{fontSize:13}}>{a.action}</div>
                <div style={{fontSize:12,color:TEXT_MUTED,marginTop:4}}>{a.time}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const notifKeys = Object.keys(notifications) as (keyof typeof notifications)[];
  const notifLabels: Record<keyof typeof notifications,string> = {
    newOrder:'Đơn hàng mới', refund:'Yêu cầu hoàn tiền', autoDelete:'Cảnh báo xóa tự động', system:'Thông báo hệ thống', weekly:'Báo cáo tuần'
  };
  const notifTab = (
    <div style={{maxWidth:480}}>
      <div style={{background:'#fff',border:\`1px solid \${BORDER}\`,borderRadius:12,padding:24}}>
        <h3 style={{margin:'0 0 20px',fontWeight:700}}>Cài đặt Thông báo</h3>
        <div style={{display:'flex',flexDirection:'column',gap:16}}>
          {notifKeys.map(k=>(
            <div key={k} style={{display:'flex',justifyContent:'space-between',alignItems:'center',paddingBottom:16,borderBottom:\`1px solid \${BORDER}\`}}>
              <div>
                <div style={{fontWeight:600,fontSize:14}}>{notifLabels[k]}</div>
                <div style={{fontSize:12,color:TEXT_MUTED,marginTop:2}}>Nhận thông báo qua email</div>
              </div>
              <Switch checked={notifications[k]} onChange={v=>setNotifications(p=>({...p,[k]:v}))}/>
            </div>
          ))}
        </div>
        <Button type="primary" style={{marginTop:20}} onClick={()=>message.success('Lưu cài đặt thành công!')}>Lưu cài đặt</Button>
      </div>
    </div>
  );

  return (
    <div>
      {/* Banner */}
      <div style={{height:120,background:\`linear-gradient(135deg, \${PRIMARY} 0%, #0f5840 100%)\`,borderRadius:12,marginBottom:-48,position:'relative'}}>
        <div style={{position:'absolute',bottom:-40,left:32,display:'flex',alignItems:'flex-end',gap:16}}>
          <div style={{width:80,height:80,borderRadius:40,background:'#fff',padding:3}}>
            <div style={{width:'100%',height:'100%',borderRadius:40,background:PRIMARY,display:'flex',alignItems:'center',justifyContent:'center',fontSize:24,fontWeight:700,color:'#fff'}}>
              {getAvatarInitials(user?.name||'User')}
            </div>
          </div>
        </div>
      </div>
      <div style={{paddingLeft:136,paddingTop:8,marginBottom:24,display:'flex',justifyContent:'space-between',alignItems:'flex-end'}}>
        <div>
          <div style={{fontSize:18,fontWeight:700}}>{user?.name||'User'}</div>
          <div style={{color:TEXT_MUTED,fontSize:13}}>{ROLE_LABELS[user?.role||'manager']} · {user?.username}</div>
        </div>
        <div style={{display:'flex',gap:20,marginRight:8}}>
          {stats.map(s=>(
            <div key={s.label} style={{textAlign:'center'}}>
              <div style={{fontWeight:800,fontSize:18,color:s.color}}>{s.val}</div>
              <div style={{fontSize:12,color:TEXT_MUTED}}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <Tabs items={[
        {key:'info',label:<><UserOutlined/> Thông tin</>,children:infoTab},
        {key:'security',label:<><LockOutlined/> Bảo mật</>,children:securityTab},
        {key:'activity',label:<><HistoryOutlined/> Hoạt động</>,children:activityTab},
        {key:'notifications',label:<><BellOutlined/> Thông báo</>,children:notifTab},
      ]}/>
    </div>
  );
}
`.trimStart());

console.log('Staff, Settings, Profile written!');
