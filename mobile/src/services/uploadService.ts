/**
 * Upload service for React Native — same presign→PUT S3→confirm flow as PWA.
 */
import { getApiBase, getToken } from './apiClient';

export interface UploadMetadata {
  location_id: string;
  shoot_date: string;
  album_code?: string;
}

export interface PresignResponse {
  upload_url: string;
  media_id: string;
  s3_key: string;
  expires_in: number;
}

export interface UploadResult {
  media_id: string;
  filename: string;
  status: 'success' | 'error';
  error?: string;
}

async function presign(
  uri: string,
  filename: string,
  contentType: string,
  metadata: UploadMetadata,
): Promise<PresignResponse> {
  const base = await getApiBase();
  const token = await getToken();

  const res = await fetch(`${base}/api/v1/staff/upload/presign`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      filename,
      content_type: contentType,
      location_id: metadata.location_id,
      shoot_date: metadata.shoot_date,
      album_code: metadata.album_code,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as Record<string, Record<string, string>>;
    throw new Error(err?.error?.message ?? `Presign failed ${res.status}`);
  }
  const json = await res.json() as { data: PresignResponse };
  return json.data;
}

async function putToS3(
  uploadUrl: string,
  uri: string,
  contentType: string,
): Promise<void> {
  // react-native fetch supports URI-based upload
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: { uri, type: contentType, name: 'upload' } as unknown as BodyInit,
  });
  if (!res.ok) {
    throw new Error(`S3 upload failed: ${res.status}`);
  }
}

async function confirmUpload(mediaId: string): Promise<void> {
  const base = await getApiBase();
  const token = await getToken();

  const res = await fetch(`${base}/api/v1/staff/upload/confirm`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ media_id: mediaId }),
  });
  if (!res.ok) {
    throw new Error(`Confirm failed: ${res.status}`);
  }
}

export async function uploadFile(
  uri: string,
  filename: string,
  contentType: string,
  metadata: UploadMetadata,
  onProgress?: (step: 'presigning' | 'uploading' | 'confirming') => void,
): Promise<UploadResult> {
  try {
    onProgress?.('presigning');
    const presignData = await presign(uri, filename, contentType, metadata);

    onProgress?.('uploading');
    await putToS3(presignData.upload_url, uri, contentType);

    onProgress?.('confirming');
    await confirmUpload(presignData.media_id);

    return { media_id: presignData.media_id, filename, status: 'success' };
  } catch (err) {
    return {
      media_id: '',
      filename,
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
