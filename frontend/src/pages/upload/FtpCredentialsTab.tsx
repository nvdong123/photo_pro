import { useEffect, useState } from 'react';
import { apiClient } from '../../lib/api-client';

const PRIMARY = '#1a6b4e';
const BORDER = '#e2e5ea';

interface FtpCredentials {
  host: string;
  port: number;
  username: string;
  password: string;
  folder: string;
}

type CameraGuide = 'canon' | 'sony' | 'nikon';

const CAMERA_GUIDES: Record<CameraGuide, { title: string; steps: string[] }> = {
  canon: {
    title: 'Canon EOS R series',
    steps: [
      'Menu → Network → FTP Transfer Settings',
      'FTP Server: [server]',
      'Port: [port], Passive Mode: ON',
      'Login: [username] / [password]',
      'Transfer destination folder: [folder]',
    ],
  },
  sony: {
    title: 'Sony A7 / A9 series',
    steps: [
      'Menu → Network → FTP Transfer Func',
      'Server Setting → Manual',
      'Host Name: [server]',
      'Port: [port], PASV: ON',
      'User Name: [username], Password: [password]',
    ],
  },
  nikon: {
    title: 'Nikon Z series',
    steps: [
      'Menu → Connect to FTP server',
      'Server: [server]',
      'Port: [port], PASV: ON',
      'Username: [username], Password: [password]',
    ],
  },
};

function interpolate(text: string, creds: FtpCredentials): string {
  return text
    .replace('[server]', creds.host)
    .replace('[port]', String(creds.port))
    .replace('[username]', creds.username)
    .replace('[password]', creds.password)
    .replace('[folder]', creds.folder);
}

export default function FtpCredentialsTab() {
  const [creds, setCreds] = useState<FtpCredentials | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [openGuide, setOpenGuide] = useState<CameraGuide | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiClient.get<FtpCredentials>('/api/v1/admin/staff/me/ftp-credentials');
      setCreds(data);
    } catch {
      setError('Không thể tải thông tin FTP. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const copyAll = async () => {
    if (!creds) return;
    const text =
      `Server:   ${creds.host}\n` +
      `Port:     ${creds.port}\n` +
      `Username: ${creds.username}\n` +
      `Password: ${creds.password}\n` +
      `Folder:   ${creds.folder}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard not available
    }
  };

  const copyField = async (value: string) => {
    try { await navigator.clipboard.writeText(value); } catch { /* noop */ }
  };

  const resetPassword = async () => {
    if (!creds) return;
    setResetting(true);
    try {
      // Need the staff_id; use the "me" endpoint indirectly via reset endpoint with a special "me" alias
      // The backend /me endpoint auto-resets if needed; we reload creds after nullifying locally
      const token = localStorage.getItem('admin_token');
      if (!token) return;

      // Decode JWT to get sub (staff_id)
      const parts = token.split('.');
      if (parts.length !== 3) return;
      const payload = JSON.parse(atob(parts[1]));
      const staffId: string = payload.sub;

      const data = await apiClient.post<FtpCredentials>(
        `/api/v1/admin/staff/${staffId}/reset-ftp-password`,
        {}
      );
      setCreds(data);
    } catch {
      setError('Reset thất bại. Vui lòng thử lại.');
    } finally {
      setResetting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0', color: '#6b7280' }}>
        Đang tải...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0' }}>
        <p style={{ color: '#dc2626', marginBottom: 16 }}>{error}</p>
        <button onClick={load} style={btnStyle(PRIMARY)}>Thử lại</button>
      </div>
    );
  }

  if (!creds) return null;

  const rows: { label: string; value: string; secret?: boolean }[] = [
    { label: 'Server', value: creds.host },
    { label: 'Port', value: String(creds.port) },
    { label: 'Username', value: creds.username },
    { label: 'Password', value: creds.password, secret: true },
    { label: 'Folder', value: creds.folder },
  ];

  return (
    <div>
      {/* Credentials card */}
      <div style={{
        background: '#fff',
        borderRadius: 12,
        border: `1px solid ${BORDER}`,
        padding: '20px',
        marginBottom: 16,
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: '#1f2937' }}>
          Cài đặt FTP trên máy ảnh
        </h3>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {rows.map(row => (
              <tr key={row.label} style={{ borderBottom: `1px solid #f3f4f6` }}>
                <td style={{ padding: '10px 0', color: '#6b7280', fontSize: 13, width: 90, verticalAlign: 'middle' }}>
                  {row.label}
                </td>
                <td style={{ padding: '10px 0', fontFamily: 'monospace', fontSize: 14, color: '#111827', verticalAlign: 'middle' }}>
                  {row.secret && !showPassword ? '••••••••' : row.value}
                </td>
                <td style={{ padding: '10px 0', textAlign: 'right', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                  {row.secret && (
                    <button
                      onClick={() => setShowPassword(v => !v)}
                      style={{ ...smallBtn, marginRight: 6 }}
                    >
                      {showPassword ? 'Ẩn' : 'Hiện'}
                    </button>
                  )}
                  <button
                    onClick={() => copyField(row.value)}
                    style={smallBtn}
                  >
                    Copy
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button
            onClick={copyAll}
            style={{
              ...btnStyle(PRIMARY),
              flex: 1,
              background: copied ? '#059669' : PRIMARY,
            }}
          >
            {copied ? '✓ Đã sao chép' : 'Sao chép tất cả'}
          </button>
          <button
            onClick={resetPassword}
            disabled={resetting}
            style={{ ...btnStyle('#6b7280'), flex: 1, opacity: resetting ? 0.6 : 1 }}
          >
            {resetting ? 'Đang reset...' : 'Reset mật khẩu'}
          </button>
        </div>
      </div>

      {/* Camera guides accordion */}
      <div style={{
        background: '#fff',
        borderRadius: 12,
        border: `1px solid ${BORDER}`,
        overflow: 'hidden',
        marginBottom: 16,
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      }}>
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${BORDER}`, fontSize: 14, fontWeight: 600, color: '#374151' }}>
          Hướng dẫn cài đặt theo hãng
        </div>
        {(Object.keys(CAMERA_GUIDES) as CameraGuide[]).map(key => {
          const guide = CAMERA_GUIDES[key];
          const isOpen = openGuide === key;
          return (
            <div key={key} style={{ borderBottom: `1px solid #f3f4f6` }}>
              <button
                onClick={() => setOpenGuide(isOpen ? null : key)}
                style={{
                  width: '100%',
                  padding: '14px 20px',
                  background: isOpen ? '#f0fdf4' : 'none',
                  border: 'none',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: 600,
                  color: isOpen ? PRIMARY : '#374151',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                {guide.title}
                <span style={{ fontSize: 12, opacity: 0.6 }}>{isOpen ? '▲' : '▼'}</span>
              </button>
              {isOpen && (
                <ol style={{ margin: 0, padding: '12px 20px 16px 40px', background: '#f9fafb' }}>
                  {guide.steps.map((step, i) => (
                    <li key={i} style={{ fontSize: 13, color: '#374151', marginBottom: 6, lineHeight: 1.5 }}>
                      {interpolate(step, creds)}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          );
        })}
      </div>

      <p style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', lineHeight: 1.6 }}>
        Bật Passive Mode (PASV) trên máy ảnh để hoạt động qua NAT/WiFi hotel.<br />
        Ảnh sẽ tự động xử lý sau khi upload.
      </p>
    </div>
  );
}

const btnStyle = (bg: string): React.CSSProperties => ({
  background: bg,
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  padding: '10px 16px',
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 600,
  transition: 'opacity 0.15s',
});

const smallBtn: React.CSSProperties = {
  background: '#f3f4f6',
  color: '#374151',
  border: `1px solid ${BORDER}`,
  borderRadius: 5,
  padding: '3px 10px',
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 500,
};
