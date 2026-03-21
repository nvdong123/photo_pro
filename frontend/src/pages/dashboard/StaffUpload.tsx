import { Tag, Spin, Button } from 'antd';
import { EnvironmentOutlined, CalendarOutlined, UploadOutlined, ExportOutlined } from '@ant-design/icons';
import { useMyLocations } from '../../hooks/useMyLocations';
import { useMyStats } from '../../hooks/useStaffStats';

const BORDER = '#e2e5ea';
const TEXT_MUTED = '#8b91a0';
const PRIMARY = '#1a6b4e';
const SURFACE = '#f6f7f9';

const CARD_COLORS = [
  { color: '#1a6b4e', bg: '#e8f5f0' },
  { color: '#2563eb', bg: '#eff6ff' },
  { color: '#d4870e', bg: '#fef3e8' },
  { color: '#7c3aed', bg: '#f5f3ff' },
  { color: '#db2777', bg: '#fdf2f8' },
];

export default function StaffUpload() {
  const { data: locations, loading: locLoading } = useMyLocations();
  const { data: myStats, loading: statsLoading } = useMyStats();

  const stats = [
    { label: 'Địa điểm', value: locations?.length ?? 0, color: PRIMARY, bg: '#e8f5f0' },
    { label: 'Tổng ảnh', value: myStats?.total_photos_uploaded ?? 0, color: PRIMARY, bg: '#e8f5f0' },
    { label: 'Đã bán', value: myStats?.total_photos_sold ?? 0, color: '#1a854a', bg: '#dcfce7' },
    { label: 'Hôm nay', value: 0, color: '#d4870e', bg: '#fef3e8' },
  ];

  function openVeno(url: string | null) {
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Upload Ảnh</h1>
      </div>

      {/* Quick Stats */}
      <div style={{
        display: 'flex', alignItems: 'center', background: '#fff',
        border: `1px solid ${BORDER}`, borderRadius: 12,
        padding: '16px 24px', marginBottom: 24,
      }}>
        {stats.map((item, i, arr) => (
          <div key={item.label} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10, background: item.bg, color: item.color,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0,
            }}>
              {i === 0 ? <EnvironmentOutlined /> : i === 2 ? '✓' : i === 3 ? '📅' : <UploadOutlined />}
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#1a1d23', lineHeight: 1.1 }}>
                {statsLoading || locLoading ? '—' : item.value}
              </div>
              <div style={{ fontSize: 12, color: TEXT_MUTED, fontWeight: 500 }}>{item.label}</div>
            </div>
            {i < arr.length - 1 && <div style={{ width: 1, height: 36, background: BORDER, margin: '0 8px' }} />}
          </div>
        ))}
      </div>

      {/* Locations */}
      <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
        <div style={{
          padding: '16px 20px', borderBottom: `1px solid ${BORDER}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <h3 style={{ margin: 0 }}>Chọn Địa Điểm</h3>
          {!locLoading && locations && (
            <Tag color="blue">{locations.length} địa điểm</Tag>
          )}
        </div>
        <div style={{ padding: 20 }}>
          {locLoading ? (
            <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
          ) : !locations || locations.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: TEXT_MUTED }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📍</div>
              <h4 style={{ margin: '0 0 4px', fontWeight: 600 }}>Chưa có địa điểm</h4>
              <p style={{ margin: 0 }}>Bạn chưa được phân công vào địa điểm nào. Liên hệ Admin để được phân công.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {locations.map((loc, i) => {
                const palette = CARD_COLORS[i % CARD_COLORS.length];
                return (
                  <div key={loc.id} style={{
                    border: `2px solid ${palette.color}33`,
                    borderRadius: 14, overflow: 'hidden',
                    background: '#fff',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                    transition: 'box-shadow 0.2s',
                  }}>
                    {/* Color bar */}
                    <div style={{ height: 5, background: palette.color }} />
                    <div style={{ padding: 20 }}>
                      {/* Header */}
                      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 16 }}>
                        <div style={{
                          width: 44, height: 44, borderRadius: 11, background: palette.bg, color: palette.color,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0,
                        }}>
                          <EnvironmentOutlined />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 2 }}>{loc.name}</div>
                          {loc.shoot_date && (
                            <div style={{ fontSize: 12, color: TEXT_MUTED, display: 'flex', alignItems: 'center', gap: 4 }}>
                              <CalendarOutlined /> {loc.shoot_date}
                            </div>
                          )}
                          {loc.address && (
                            <div style={{ fontSize: 12, color: TEXT_MUTED, marginTop: 2 }}>{loc.address}</div>
                          )}
                        </div>
                        {loc.can_upload ? (
                          <Tag color="green" style={{ flexShrink: 0 }}>Upload</Tag>
                        ) : (
                          <Tag color="default" style={{ flexShrink: 0 }}>Chỉ xem</Tag>
                        )}
                      </div>

                      {/* Veno Upload Button */}
                      {loc.veno_folder_url ? (
                        <Button
                          type="primary"
                          icon={<ExportOutlined />}
                          block
                          onClick={() => openVeno(loc.veno_folder_url)}
                          style={{ background: palette.color, borderColor: palette.color }}
                          disabled={!loc.can_upload}
                        >
                          Mở thư mục Veno để upload
                        </Button>
                      ) : (
                        <div style={{
                          padding: '10px 14px', background: SURFACE, borderRadius: 8,
                          fontSize: 13, color: TEXT_MUTED, textAlign: 'center',
                        }}>
                          Chưa có thư mục Veno — liên hệ Admin
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Instructions */}
      <div style={{
        marginTop: 20, padding: '14px 18px', background: '#eff6ff',
        border: '1px solid #93c5fd', borderRadius: 10, fontSize: 13, color: '#1d4ed8',
      }}>
        <strong>Hướng dẫn upload:</strong>
        <ol style={{ margin: '8px 0 0', paddingLeft: 20 }}>
          <li>Nhấn <strong>"Mở thư mục Veno để upload"</strong> — trang Veno File Manager sẽ mở trực tiếp vào thư mục của bạn.</li>
          <li>Đăng nhập bằng tài khoản Veno (username = mã nhân viên, mật khẩu xem ở trang <strong>Hồ sơ</strong>).</li>
          <li>Upload ảnh JPEG vào đúng thư mục. Hệ thống sẽ tự động xử lý trong vòng 5 phút.</li>
        </ol>
      </div>
    </div>
  );
}
