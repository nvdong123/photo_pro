/**
 * FTPUpload — Staff page for managing FTP uploads and active location tag.
 *
 * Features:
 *  - Select active location tag for automatic FTP photo tagging
 *  - View FTP connection credentials
 *  - See count of untagged media with a link to the review page
 */
import { useCallback, useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, Col, Row, Select, Space, Spin, Tag, Typography, message } from 'antd';
import { CheckCircleOutlined, CloudServerOutlined, DisconnectOutlined, FolderOpenOutlined, InfoCircleOutlined, ReloadOutlined, WifiOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { apiClient, invalidateApiCache } from '../../lib/api-client';

const { Title, Text, Paragraph } = Typography;

interface LocationTag {
  id: string;
  name: string;
  address: string | null;
  shoot_date: string | null;
  description?: string | null;
  media_count?: number;
}

interface ActiveLocationResponse {
  tag_id: string | null;
  tag_name: string | null;
  tag_type: string | null;
  address: string | null;
  shoot_date: string | null;
}

interface FTPCredentials {
  host: string;
  port: number;
  username: string;
  password: string;
  passive_mode: boolean;
  upload_path: string;
}

interface FTPStatus {
  connected: boolean;
  client_ip: string;
  last_file: string;
  last_upload_at: string;
}

export default function FTPUpload() {
  const navigate = useNavigate();
  const [locations, setLocations] = useState<LocationTag[]>([]);
  const [activeLocation, setActiveLocation] = useState<ActiveLocationResponse | null>(null);
  const [credentials, setCredentials] = useState<FTPCredentials | null>(null);
  const [ftpStatus, setFtpStatus] = useState<FTPStatus | null>(null);
  const [untaggedCount, setUntaggedCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [locs, active, creds, untagged] = await Promise.all([
        apiClient.get<LocationTag[]>('/api/v1/admin/locations'),
        apiClient.get<ActiveLocationResponse>('/api/v1/staff/active-location'),
        apiClient.get<FTPCredentials>('/api/v1/staff/ftp-credentials'),
        apiClient.get<unknown[]>('/api/v1/staff/media/untagged?limit=1'),
      ]);
      setLocations(locs ?? []);
      setActiveLocation(active);
      setSelectedTagId(active?.tag_id ?? null);
      setCredentials(creds);
      setUntaggedCount(Array.isArray(untagged) ? untagged.length : 0);
    } catch {
      void message.error('Không tải được dữ liệu FTP. Thử lại sau.');
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshFTPStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const status = await apiClient.get<FTPStatus>('/api/v1/staff/ftp/status');
      setFtpStatus(status);
    } catch {
      // ignore
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
    void refreshFTPStatus();
    const timer = setInterval(() => void refreshFTPStatus(), 10_000);
    return () => clearInterval(timer);
  }, [loadData, refreshFTPStatus]);

  const handleSaveLocation = useCallback(async () => {
    setSaving(true);
    try {
      const result = await apiClient.post<ActiveLocationResponse>('/api/v1/staff/active-location', {
        tag_id: selectedTagId ?? null,
      });
      setActiveLocation(result);
      invalidateApiCache('/api/v1/staff/active-location');
      void message.success(
        selectedTagId
          ? `Đã đặt địa điểm FTP: ${result?.tag_name}`
          : 'Đã xoá địa điểm FTP. Ảnh mới qua FTP sẽ không có tag.',
      );
    } catch {
      void message.error('Không lưu được địa điểm. Thử lại sau.');
    } finally {
      setSaving(false);
    }
  }, [selectedTagId]);

  const handleResetPassword = useCallback(async () => {
    try {
      const result = await apiClient.post<{ password: string }>('/api/v1/staff/ftp-credentials/reset', {});
      setCredentials((prev) => prev ? { ...prev, password: result?.password ?? '' } : null);
      void message.success('Mật khẩu FTP đã được đổi thành công.');
    } catch {
      void message.error('Không đổi được mật khẩu. Thử lại sau.');
    }
  }, []);

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '80px auto' }} />;

  const isDirty = selectedTagId !== (activeLocation?.tag_id ?? null);

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px' }}>
      <Title level={3} style={{ marginBottom: 4 }}>
        <CloudServerOutlined style={{ marginRight: 8 }} />
        Quản lý FTP Upload
      </Title>
      <Paragraph type="secondary" style={{ marginBottom: 24 }}>
        Chọn địa điểm hoạt động để ảnh upload qua FTP được tự động gắn tag. Ảnh chưa có tag có thể gắn sau tại trang duyệt ảnh.
      </Paragraph>

      {/* ── Untagged media alert ── */}
      {untaggedCount > 0 && (
        <Alert
          message={`Có ${untaggedCount} ảnh chưa được gắn địa điểm`}
          description="Nhấn vào nút bên dưới để vào trang duyệt và gắn tag cho các ảnh này."
          type="warning"
          showIcon
          action={
            <Button size="small" onClick={() => navigate('/dashboard/untagged-media')}>
              Duyệt ảnh chưa tag
            </Button>
          }
          style={{ marginBottom: 24 }}
        />
      )}

      <Row gutter={[16, 16]}>
        {/* ── Active location selector ── */}
        <Col xs={24}>
          <Card
            title={<><FolderOpenOutlined style={{ marginRight: 8 }} />Địa điểm FTP hiện tại</>}
            size="small"
          >
            {activeLocation?.tag_id && (
              <Alert
                message={
                  <span>
                    Ảnh FTP sẽ tự động gắn vào: <strong>{activeLocation.tag_name}</strong>
                    {activeLocation.shoot_date && (
                      <Text type="secondary" style={{ marginLeft: 8 }}>({activeLocation.shoot_date})</Text>
                    )}
                  </span>
                }
                type="success"
                showIcon
                icon={<CheckCircleOutlined />}
                style={{ marginBottom: 16 }}
              />
            )}
            {!activeLocation?.tag_id && (
              <Alert
                message="Chưa chọn địa điểm — ảnh FTP sẽ dùng tên thư mục làm album_code (có thể không khớp tag nào)."
                type="info"
                showIcon
                icon={<InfoCircleOutlined />}
                style={{ marginBottom: 16 }}
              />
            )}
            <Space direction="vertical" style={{ width: '100%' }} size={12}>
              <Select
                style={{ width: '100%' }}
                placeholder="Chọn địa điểm..."
                allowClear
                value={selectedTagId}
                onChange={(val) => setSelectedTagId(val ?? null)}
                options={locations.map((l) => ({
                  value: l.id,
                  label: `${l.name}${l.shoot_date ? ` (${l.shoot_date})` : ''}`,
                }))}
                showSearch
                filterOption={(input, opt) =>
                  (opt?.label as string ?? '').toLowerCase().includes(input.toLowerCase())
                }
              />
              <Button
                type="primary"
                loading={saving}
                disabled={!isDirty}
                onClick={() => void handleSaveLocation()}
              >
                Lưu địa điểm FTP
              </Button>
            </Space>
          </Card>
        </Col>

        {/* ── FTP connection status ── */}
        <Col xs={24} md={12}>
          <Card
            title={
              <>
                <WifiOutlined style={{ marginRight: 8 }} />
                Trạng thái kết nối FTP
              </>
            }
            size="small"
            extra={
              <Button
                size="small"
                icon={<ReloadOutlined spin={statusLoading} />}
                onClick={() => void refreshFTPStatus()}
              />
            }
          >
            {ftpStatus ? (
              <Space direction="vertical" size={4} style={{ width: '100%' }}>
                <div>
                  <Tag color={ftpStatus.connected ? 'green' : 'default'} icon={ftpStatus.connected ? <WifiOutlined /> : <DisconnectOutlined />}>
                    {ftpStatus.connected ? 'Đang kết nối' : 'Chưa kết nối'}
                  </Tag>
                </div>
                {ftpStatus.client_ip && (
                  <Text type="secondary">IP camera: <Text code>{ftpStatus.client_ip}</Text></Text>
                )}
                {ftpStatus.last_file && (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    File gần nhất: <Text code style={{ fontSize: 12 }}>{ftpStatus.last_file}</Text>
                  </Text>
                )}
                {ftpStatus.last_upload_at && (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Lúc: {ftpStatus.last_upload_at}
                  </Text>
                )}
              </Space>
            ) : (
              <Text type="secondary">Đang kiểm tra...</Text>
            )}
          </Card>
        </Col>

        {/* ── FTP credentials ── */}
        <Col xs={24} md={12}>
          <Card
            title={<><InfoCircleOutlined style={{ marginRight: 8 }} />Thông tin đăng nhập FTP</>}
            size="small"
          >
            {credentials ? (
              <Space direction="vertical" size={4} style={{ width: '100%' }}>
                <div><Text type="secondary">Host:</Text> <Text copyable code>{credentials.host}</Text></div>
                <div><Text type="secondary">Port:</Text> <Text code>{credentials.port}</Text></div>
                <div><Text type="secondary">User:</Text> <Text copyable code>{credentials.username}</Text></div>
                <div>
                  <Text type="secondary">Mật khẩu:</Text>{' '}
                  <Text copyable code>{credentials.password}</Text>
                </div>
                <Button
                  size="small"
                  danger
                  style={{ marginTop: 8 }}
                  onClick={() => void handleResetPassword()}
                >
                  Đổi mật khẩu FTP
                </Button>
              </Space>
            ) : (
              <Text type="secondary">Đang tải...</Text>
            )}
          </Card>
        </Col>

        {/* ── Untagged summary ── */}
        <Col xs={24}>
          <Card size="small">
            <Space>
              <Badge count={untaggedCount} showZero overflowCount={999} color={untaggedCount > 0 ? '#f59e0b' : '#6b7280'} />
              <Text>ảnh chưa có tag địa điểm</Text>
              <Button
                size="small"
                onClick={() => navigate('/dashboard/untagged-media')}
                disabled={untaggedCount === 0}
              >
                Gắn tag cho ảnh
              </Button>
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
