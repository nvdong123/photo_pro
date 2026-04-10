/**
 * UntaggedMedia — Review and bulk-assign location tags to FTP-uploaded photos
 * that don't yet have a location tag.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Card, Col, Empty, Image, Row, Select, Space, Spin, Tag, Typography, message as antMessage } from 'antd';
import { CheckSquareOutlined, EnvironmentOutlined, ReloadOutlined, TagOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { apiClient, invalidateApiCache } from '../../lib/api-client';

const { Title, Text, Paragraph } = Typography;

interface UntaggedItem {
  media_id: string;
  thumb_url: string | null;
  shoot_date: string | null;
  album_code: string | null;
  created_at: string;
}

interface LocationTag {
  id: string;
  name: string;
  shoot_date: string | null;
}

export default function UntaggedMedia() {
  const navigate = useNavigate();
  const [items, setItems] = useState<UntaggedItem[]>([]);
  const [locations, setLocations] = useState<LocationTag[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [targetTagId, setTargetTagId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [untagged, locs] = await Promise.all([
        apiClient.get<UntaggedItem[]>('/api/v1/staff/media/untagged?limit=200'),
        apiClient.get<LocationTag[]>('/api/v1/admin/tags?tag_type=LOCATION&limit=200'),
      ]);
      setItems(untagged ?? []);
      setLocations(locs ?? []);
    } catch {
      void antMessage.error('Không tải được danh sách ảnh chưa tag. Thử lại sau.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => setSelected(new Set(items.map((i) => i.media_id))), [items]);
  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const handleAssign = useCallback(async () => {
    if (!targetTagId) { void antMessage.warning('Vui lòng chọn địa điểm cần gắn tag.'); return; }
    if (!selected.size) { void antMessage.warning('Chưa chọn ảnh nào.'); return; }

    setAssigning(true);
    try {
      const result = await apiClient.post<{ assigned: number; skipped: number }>(
        '/api/v1/staff/media/assign-location',
        { media_ids: [...selected], tag_id: targetTagId },
      );
      void antMessage.success(`Đã gắn tag cho ${result?.assigned ?? 0} ảnh.`);
      invalidateApiCache('/api/v1/staff/media/untagged');
      setSelected(new Set());
      await loadData();
    } catch {
      void antMessage.error('Gắn tag thất bại. Thử lại sau.');
    } finally {
      setAssigning(false);
    }
  }, [loadData, selected, targetTagId]);

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '80px auto' }} />;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 16px' }}>
      <Title level={3} style={{ marginBottom: 4 }}>
        <TagOutlined style={{ marginRight: 8 }} />
        Ảnh chưa gắn địa điểm
      </Title>
      <Paragraph type="secondary" style={{ marginBottom: 24 }}>
        Các ảnh upload qua FTP không có địa điểm hoạt động sẽ xuất hiện ở đây. Chọn ảnh và gắn địa điểm phù hợp.
      </Paragraph>

      {/* ── Toolbar ── */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Button
            icon={<CheckSquareOutlined />}
            onClick={selectAll}
            disabled={!items.length}
          >
            Chọn tất cả ({items.length})
          </Button>
          <Button onClick={clearSelection} disabled={!selected.size}>
            Bỏ chọn ({selected.size})
          </Button>
          <Select
            style={{ width: 280 }}
            placeholder="Chọn địa điểm để gắn tag..."
            allowClear
            value={targetTagId}
            onChange={(val) => setTargetTagId(val ?? null)}
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
            icon={<EnvironmentOutlined />}
            loading={assigning}
            disabled={!selected.size || !targetTagId}
            onClick={() => void handleAssign()}
          >
            Gắn tag cho {selected.size > 0 ? `${selected.size} ảnh` : 'ảnh đã chọn'}
          </Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => void loadData()}
          >
            Làm mới
          </Button>
          <Button onClick={() => navigate('/dashboard/ftp-upload')}>
            ← Về trang FTP
          </Button>
        </Space>
      </Card>

      {/* ── Grid ── */}
      {!items.length ? (
        <Empty
          description="Không có ảnh nào chưa gắn tag"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      ) : (
        <Row gutter={[12, 12]}>
          {items.map((item) => {
            const isSelected = selected.has(item.media_id);
            return (
              <Col key={item.media_id} xs={12} sm={8} md={6} lg={4}>
                <div
                  style={{
                    position: 'relative',
                    borderRadius: 8,
                    overflow: 'hidden',
                    border: isSelected ? '2px solid #1a6b4e' : '2px solid transparent',
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                  onClick={() => toggleSelect(item.media_id)}
                  onMouseDown={() => {
                    longPressTimer.current = setTimeout(() => toggleSelect(item.media_id), 400);
                  }}
                  onMouseUp={() => { if (longPressTimer.current) clearTimeout(longPressTimer.current); }}
                >
                  {item.thumb_url ? (
                    <Image
                      src={item.thumb_url}
                      alt={item.media_id}
                      style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }}
                      preview={false}
                    />
                  ) : (
                    <div style={{ width: '100%', aspectRatio: '1', background: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>Chưa có ảnh</Text>
                    </div>
                  )}
                  {isSelected && (
                    <div style={{ position: 'absolute', top: 4, right: 4 }}>
                      <Tag color="green" style={{ margin: 0 }}>✓</Tag>
                    </div>
                  )}
                  <div style={{ padding: '4px 6px', background: '#fff', fontSize: 11 }}>
                    <Text type="secondary" ellipsis>
                      {item.shoot_date ?? '-'} · {item.album_code ?? 'ftp'}
                    </Text>
                  </div>
                </div>
              </Col>
            );
          })}
        </Row>
      )}
    </div>
  );
}
