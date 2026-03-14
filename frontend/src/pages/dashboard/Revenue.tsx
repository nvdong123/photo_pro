import { useState } from 'react';
import { Tabs, Card, Statistic, Table } from 'antd';
import { ArrowUpOutlined, DollarOutlined, ShoppingCartOutlined, PictureOutlined, TeamOutlined } from '@ant-design/icons';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Tooltip, Legend, Filler } from 'chart.js';
import { useRevenue } from '../../hooks/useRevenue';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Tooltip, Legend, Filler);

const PRIMARY = '#1a6b4e';
const WARNING = '#d4870e';
const INFO = '#2563eb';
const BORDER = '#e2e5ea';
const SURFACE_ALT = '#f6f7f9';
const TEXT_MUTED = '#8b91a0';

function fmt(v:number){return(v/1000000).toFixed(1)+'M';}

export default function Revenue() {
  const [period, setPeriod] = useState<'today'|'week'|'month'|'quarter'|'year'>('month');
  const { data: revenue } = useRevenue({ period });

  const summary = revenue?.summary;
  const byDate = revenue?.by_date ?? [];
  const byPhotographer = revenue?.by_photographer ?? [];
  const byBundle = revenue?.by_bundle ?? [];

  const labels = byDate.map((d) => d.date);
  const lineData = { labels, datasets:[{label:'Doanh thu',data:byDate.map(d=>d.revenue),borderColor:PRIMARY,backgroundColor:'rgba(26,107,78,0.1)',tension:0.4,fill:true}] };
  const lineOptions = { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ y:{ beginAtZero:true, ticks:{ callback:(v:any)=>fmt(v) } } } };

  const barData = { labels: byPhotographer.slice(0,5).map(p=>p.photographer_code), datasets:[{label:'Doanh thu',data:byPhotographer.slice(0,5).map(p=>p.revenue),backgroundColor:PRIMARY}] };
  const barOptions = { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ y:{ beginAtZero:true, ticks:{callback:(v:any)=>fmt(v)} } } };

  const doughnutData = { labels: byBundle.map(b=>b.bundle_name), datasets:[{data:byBundle.map(b=>b.revenue),backgroundColor:[PRIMARY,WARNING,INFO,'#7c3aed','#db2777']}] };
  const doughnutOptions = { responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom' as const}} };

  const stats = [
    {label:'Tổng doanh thu',val:fmt(summary?.total_revenue??0),change:'+0%',icon:<DollarOutlined/>,iconBg:'#fef3e8',iconColor:WARNING},
    {label:'Số đơn hàng',val:(summary?.total_orders??0).toLocaleString(),change:'+0%',icon:<ShoppingCartOutlined/>,iconBg:'#e8f5f0',iconColor:PRIMARY},
    {label:'Ảnh đã bán',val:(summary?.total_photos??0).toLocaleString(),change:'+0%',icon:<PictureOutlined/>,iconBg:'#eff6ff',iconColor:INFO},
    {label:'Nhiếp ảnh gia',val:byPhotographer.length.toString(),change:'',icon:<TeamOutlined/>,iconBg:'#e8f5f0',iconColor:PRIMARY},
  ];

  const topAlbums = byPhotographer.slice(0,4).map(p=>({
    name: p.photographer_code,
    orders: p.orders,
    revenue: fmt(p.revenue),
  }));
  const topStaff = byPhotographer.slice(0,3).map(p=>({
    name: p.photographer_code,
    role: 'Photographer',
    uploads: p.orders,
    revenue: fmt(p.revenue),
  }));

  const cardStyle = { borderRadius:12, border:`1px solid ${BORDER}`, boxShadow:'0 1px 2px rgba(0,0,0,0.05)' };

  const content = (
    <div>
      {/* Stats */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:16,marginBottom:24}}>
        {stats.map(s=>(
          <Card key={s.label} style={{background:'#fff',border:`1px solid ${BORDER}`,borderRadius:12}} bodyStyle={{padding:16}}>
            <div style={{display:'flex',alignItems:'flex-start',gap:12}}>
              <div style={{width:44,height:44,borderRadius:8,background:s.iconBg,color:s.iconColor,display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,flexShrink:0}}>{s.icon}</div>
              <Statistic
                title={<span style={{fontSize:12,color:TEXT_MUTED}}>{s.label}</span>}
                value={s.val}
                valueStyle={{fontSize:22,fontWeight:800}}
                prefix={<span style={{fontSize:11,color:PRIMARY,display:'inline-flex',alignItems:'center',gap:4}}><ArrowUpOutlined/>{s.change}&nbsp;</span>}
              />
            </div>
          </Card>
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
          <Table
            size="small"
            dataSource={topAlbums}
            rowKey="name"
            pagination={false}
            columns={[
              { title: 'Album', dataIndex: 'name', key: 'name', render: (v:string) => <span style={{fontWeight:600}}>{v}</span> },
              { title: 'Đơn', dataIndex: 'orders', key: 'orders' },
              { title: 'Doanh thu', dataIndex: 'revenue', key: 'revenue', render: (v:string) => <span style={{fontWeight:600,color:PRIMARY}}>{v}</span> },
            ]}
          />
        </Card>
        <Card title="Nhân viên xuất sắc" style={cardStyle}>
          <Table
            size="small"
            dataSource={topStaff}
            rowKey="name"
            pagination={false}
            columns={[
              { title: 'Nhân viên', dataIndex: 'name', key: 'name', render: (v:string) => <span style={{fontWeight:600}}>{v}</span> },
              { title: 'Vai trò', dataIndex: 'role', key: 'role', render: (v:string) => <span style={{color:'#5a6170'}}>{v}</span> },
              { title: 'Ảnh', dataIndex: 'uploads', key: 'uploads' },
              { title: 'Doanh thu', dataIndex: 'revenue', key: 'revenue', render: (v:string) => <span style={{fontWeight:600,color:PRIMARY}}>{v}</span> },
            ]}
          />
        </Card>
      </div>
    </div>
  );

  const periodItems = ['day','week','month','quarter','year'].map(k=>({key:k,label:{day:'Ngày',week:'Tuần',month:'Tháng',quarter:'Quý',year:'Năm'}[k],children:content}));

  return (
    <div>
      <h1 style={{fontSize:20,fontWeight:700,marginBottom:24}}>Báo cáo Doanh thu</h1>
      <Tabs items={periodItems} activeKey={period} onChange={(k)=>setPeriod(k as typeof period)}/>
    </div>
  );
}
