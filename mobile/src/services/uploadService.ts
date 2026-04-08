/**
 * Upload service for React Native — same presign→PUT S3→confirm flow as PWA.
 */
import { createUploadTask, FileSystemUploadType, type UploadTask } from 'expo-file-system/legacy';
import type { CameraFile } from './otgService';
import type { FileSystemUploadOptions } from 'expo-file-system/legacy';
import { getApiBase, getToken } from './apiClient';
import { materializeAndroidUsbCameraFile } from './androidUsbCamera';

let activeUploadTasks: Map<string, UploadTask> = new Map();

function getCorrectContentType(filename: string, originalMimeType: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  const contentTypeMap: Record<string, string> = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'cr2': 'image/x-canon-cr2',
    'cr3': 'image/x-canon-cr3',
    'nef': 'image/x-nikon-nef',
    'arw': 'image/x-sony-arw',
    'rw2': 'image/x-panasonic-rw2',
    'raf': 'image/x-fuji-raf',
    'tif': 'image/tiff',
    'tiff': 'image/tiff',
  };
  
  return contentTypeMap[ext || ''] || originalMimeType || 'image/jpeg';
}

export function cancelUpload(mediaId: string) {
  const task = activeUploadTasks.get(mediaId);
  if (task) {
    task.cancelAsync();
    activeUploadTasks.delete(mediaId);
  }
}

export function cancelAllUploads() {
  activeUploadTasks.forEach((task) => task.cancelAsync());
  activeUploadTasks.clear();
}

export interface UploadMetadata {
  location_id: string;
  shoot_date: string;
  album_code?: string;
  camera_format?: 'JPG_HD' | 'JPG' | 'RAW_PNG' | 'RAW_JPG';
  camera_mode?: 'manual' | 'auto' | 'burst';
  camera_slot?: 'SD' | 'CF' | 'XQD';
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

export type UploadStatus = 'UNUPLOAD' | 'CACHED' | 'UPLOADING' | 'UPLOADED' | 'FAILED';

export interface BatchUploadProgress {
  index: number;
  id: string;
  filename: string;
  status: UploadStatus;
  progress: number;
  media_id?: string;
  error?: string;
}

async function presign(
  uri: string,
  filename: string,
  contentType: string,
  metadata: UploadMetadata,
  size?: number,
): Promise<PresignResponse> {
  const base = await getApiBase();
  const token = await getToken();

  const body = {
    filename,
    content_type: contentType,
    location_id: metadata.location_id,
    shoot_date: metadata.shoot_date,
    album_code: metadata.album_code,
    camera_format: metadata.camera_format,
    camera_mode: metadata.camera_mode,
    camera_slot: metadata.camera_slot,
  };

  console.log(`[UPLOAD] Presigning ${filename} size=${size ?? 'unknown'} contentType=${contentType}`, body);

  const res = await fetch(`${base}/api/v1/staff/upload/presign`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`[UPLOAD] Presign failed: ${res.status} - ${errText}`);
    const err = await res.json().catch(() => ({})) as Record<string, any>;
    throw new Error(err?.error?.message ?? `Presign failed ${res.status}`);
  }

  const json = await res.json() as { data: PresignResponse };
  console.log(`[UPLOAD] Presigned ${filename}: media_id=${json.data.media_id}, expires_in=${json.data.expires_in}s`);
  return json.data;
}

async function putToS3(
  uploadUrl: string,
  uri: string,
  contentType: string,
  mediaId: string,
  onProgress?: (uploaded: number, total: number) => void,
  contentLength?: number,
): Promise<void> {
  console.log(`[UPLOAD] Starting S3 PUT for media_id=${mediaId}, contentType=${contentType}, contentLength=${contentLength ?? 'unknown'}`);

  const options: FileSystemUploadOptions = {
    httpMethod: 'PUT',
    uploadType: FileSystemUploadType.BINARY_CONTENT,
    headers: {
      'Content-Type': contentType,
      ...(contentLength != null ? { 'Content-Length': String(contentLength) } : {}),
    },
  };

  const task = createUploadTask(uploadUrl, uri, options, (progress) => {
    if (progress.totalBytesExpectedToSend > 0) {
      onProgress?.(progress.totalBytesSent, progress.totalBytesExpectedToSend);
    }
  });

  activeUploadTasks.set(mediaId, task);

  try {
    const response = await task.uploadAsync();
    if (response.status < 200 || response.status >= 300) {
      console.error(`[UPLOAD] S3 PUT failed: ${response.status} - ${response.body}`);
      throw new Error(`S3 upload failed: ${response.status} ${response.body}`);
    }
    console.log(`[UPLOAD] S3 PUT success for media_id=${mediaId}`);
  } finally {
    activeUploadTasks.delete(mediaId);
  }
}

async function confirmUpload(mediaId: string): Promise<void> {
  const base = await getApiBase();
  const token = await getToken();

  console.log(`[UPLOAD] Confirming upload for media_id=${mediaId}`);

  const res = await fetch(`${base}/api/v1/staff/upload/confirm`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ media_id: mediaId }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`[UPLOAD] Confirm failed: ${res.status} - ${errText}`);
    throw new Error(`Confirm failed: ${res.status}`);
  }

  console.log(`[UPLOAD] Confirm success for media_id=${mediaId}`);
}

async function resolveUploadUri(item: CameraFile): Promise<{ uri: string; size?: number }> {
  if (item.uploadUri) {
    return { uri: item.uploadUri, size: item.size };
  }

  if (item.source?.type === 'android-usb-camera') {
    const materialized = await materializeAndroidUsbCameraFile(item.source.cacheKey);
    if (!materialized?.uri) {
      throw new Error('Không thể đọc file gốc từ camera. Hãy kiểm tra lại kết nối OTG.');
    }
    return materialized;
  }

  return { uri: item.uri, size: item.size };
}

export async function uploadFile(
  uri: string,
  filename: string,
  contentType: string,
  metadata: UploadMetadata,
  onProgress?: (step: 'presigning' | 'uploading' | 'confirming', percent?: number) => void,
  cancelRef?: { current: boolean },
  presignData?: PresignResponse,
  fileSize?: number,
): Promise<UploadResult> {
  const correctedContentType = getCorrectContentType(filename, contentType);
  console.log(`[UPLOAD] Uploading ${filename} with contentType: ${contentType} -> ${correctedContentType}`);

  let mediaId = '';
  try {
    onProgress?.('presigning', 0);
    const presignResponse = presignData ?? await presign(uri, filename, correctedContentType, metadata, fileSize);
    mediaId = presignResponse.media_id;

    if (cancelRef?.current) {
      return { media_id: '', filename, status: 'error', error: 'Cancelled before upload' };
    }

    onProgress?.('uploading', 0);
    await putToS3(presignResponse.upload_url, uri, correctedContentType, mediaId, (sent, total) => {
      if (cancelRef?.current) {
        cancelUpload(mediaId);
        return;
      }
      const percent = total > 0 ? Math.round((sent / total) * 100) : 0;
      onProgress?.('uploading', percent);
    }, fileSize);

    if (cancelRef?.current) {
      return { media_id: '', filename, status: 'error', error: 'Cancelled during upload' };
    }

    onProgress?.('confirming', 100);
    await confirmUpload(presignResponse.media_id);

    return { media_id: presignData.media_id, filename, status: 'success' };
  } catch (err) {
    if (mediaId) {
      cancelUpload(mediaId);
    }
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[UPLOAD] Upload failed for ${filename}: ${errorMsg}`);
    return {
      media_id: mediaId,
      filename,
      status: 'error',
      error: errorMsg,
    };
  }
}

export async function uploadFileWithRetry(
  item: CameraFile & { id: string },
  metadata: UploadMetadata,
  retries = 3,
  onProgress?: (state: BatchUploadProgress) => void,
  cancelRef?: { current: boolean },
  presignData?: PresignResponse,
): Promise<UploadResult> {
  let lastResult: UploadResult = { media_id: '', filename: item.name, status: 'error' };

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    if (cancelRef?.current) {
      return { media_id: '', filename: item.name, status: 'error', error: 'Cancelled' };
    }

    onProgress?.({
      index: 0,
      id: item.id,
      filename: item.name,
      status: 'UPLOADING',
      progress: 0,
    });

    let resolvedUpload: { uri: string; size?: number };
    try {
      resolvedUpload = await resolveUploadUri(item);
    } catch (err) {
      lastResult = {
        media_id: '',
        filename: item.name,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      };
      if (attempt < retries) {
        const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // Exponential backoff, max 10s
        console.log(`[UPLOAD] Resolve failed, retrying in ${backoffMs}ms (attempt ${attempt}/${retries})`);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        continue;
      }
      break;
    }

    const result = await uploadFile(resolvedUpload.uri, item.name, item.mimeType, metadata, (step, percent) => {
      onProgress?.({
        index: 0,
        id: item.id,
        filename: item.name,
        status: step === 'uploading' ? 'UPLOADING' : step === 'confirming' ? 'UPLOADED' : 'UPLOADING',
        progress: percent ?? (step === 'confirming' ? 100 : 0),
      });
    }, cancelRef, presignData, resolvedUpload.size);
    lastResult = result;

    if (result.status === 'success') {
      onProgress?.({
        index: 0,
        id: item.id,
        filename: item.name,
        status: 'UPLOADED',
        progress: 100,
        media_id: result.media_id,
      });
      return result;
    }

    if (cancelRef?.current) {
      break;
    }

    if (attempt < retries) {
      const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // Exponential backoff, max 10s
      console.log(`[UPLOAD] Upload failed, retrying in ${backoffMs}ms (attempt ${attempt}/${retries}): ${result.error}`);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }

  onProgress?.({
    index: 0,
    id: item.id,
    filename: item.name,
    status: 'FAILED',
    progress: 0,
    error: lastResult.error,
  });

  return lastResult;
}

export async function batchUpload(
  items: Array<CameraFile & { id: string }> ,
  metadata: UploadMetadata,
  concurrent = 1,
  retries = 3,
  onProgress?: (update: BatchUploadProgress) => void,
  cancelRef?: { current: boolean },
): Promise<UploadResult[]> {
  const results: UploadResult[] = [];
  const presignMap = new Map<string, PresignResponse>();

  for (const item of items) {
    if (cancelRef?.current) break;
    if (item.source?.type === 'android-usb-camera') {
      try {
        const correctedContentType = getCorrectContentType(item.name, item.mimeType);
        const presignData = await presign(item.uploadUri ?? item.uri, item.name, correctedContentType, metadata, item.size);
        presignMap.set(item.id, presignData);
      } catch (err) {
        console.warn(`[UPLOAD] Presign before camera read failed for ${item.name}:`, err);
      }
    }
  }

  for (let i = 0; i < items.length; i += concurrent) {
    const chunk = items.slice(i, i + concurrent);

    const chunkResults = await Promise.all(chunk.map(async (item, idx) => {
      if (cancelRef?.current) {
        return { media_id: '', filename: item.name, status: 'error' as const, error: 'Cancelled' };
      }

      onProgress?.({
        index: i + idx,
        id: item.id,
        filename: item.name,
        status: 'UPLOADING',
        progress: 0,
      });

      const result = await uploadFileWithRetry(item, metadata, retries, (state) => {
        onProgress?.({
          ...state,
          index: i + idx,
          id: item.id,
          filename: item.name,
        });
      }, cancelRef, presignMap.get(item.id));

      onProgress?.({
        index: i + idx,
        id: item.id,
        filename: item.name,
        status: result.status === 'success' ? 'UPLOADED' : 'FAILED',
        progress: 100,
        media_id: result.media_id,
        error: result.error,
      });

      return result;
    }));

    results.push(...chunkResults);
  }

  return results;
}
