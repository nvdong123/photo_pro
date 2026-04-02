/**
 * Direct S3 upload service — presign → PUT S3 → confirm flow.
 *
 * Retry logic: the PUT step retries up to 3 times with exponential backoff
 * (1 s, 2 s, 4 s).  On final failure the UPLOADING DB record is automatically
 * soft-deleted via DELETE /upload/cancel so it doesn’t wait for the
 * 30-minute cleanup worker.
 *
 * Cancellation: pass an AbortSignal to stop mid-flight.  The service calls
 * /upload/cancel automatically when the signal fires.
 */

const API_BASE = (import.meta.env.VITE_API_URL as string) ?? '';
const MAX_CONCURRENT = 3;
const MAX_FILE_SIZE_MB = 50;
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [1000, 2000, 4000] as const;

export interface UploadMetadata {
  location_id: string;
  shoot_date: string;   // YYYY-MM-DD
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
  status: 'success' | 'error' | 'cancelled';
  error?: string;
}

/** Called before each retry attempt: (nextAttemptNumber, maxAttempts) */
export type RetryCallback = (attempt: number, maxAttempts: number) => void;

/** Called right after presign returns with the server-assigned media_id. */
export type OnPresignedCallback = (mediaId: string) => void;

export type ProgressCallback = (completed: number, total: number, currentFile: string) => void;

// ── Helpers ──────────────────────────────────────────────────────────────────

function getToken(): string {
  return localStorage.getItem('admin_token') ?? '';
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function expectOk(res: Response, context: string): Promise<unknown> {
  if (res.ok) return res.json();
  let msg = `HTTP ${res.status}`;
  try {
    const body = await res.json();
    msg = body?.error?.message ?? body?.detail ?? msg;
  } catch {
    // ignore parse error
  }
  throw new Error(`${context}: ${msg}`);
}

// ── Step 1: Presign ───────────────────────────────────────────────────────────

async function presign(file: File, metadata: UploadMetadata): Promise<PresignResponse> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
  const contentType = file.type || `image/${ext === 'jpg' ? 'jpeg' : ext}`;

  const res = await fetch(`${API_BASE}/api/v1/staff/upload/presign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({
      filename: file.name,
      content_type: contentType,
      location_id: metadata.location_id,
      shoot_date: metadata.shoot_date,
      album_code: metadata.album_code ?? undefined,
    }),
  });
  const json = await expectOk(res, 'Presign');
  return (json as { data: PresignResponse }).data;
}

// ── Step 2: PUT to S3 ─────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function putToS3(
  uploadUrl: string,
  file: File,
  signal?: AbortSignal,
  onProgress?: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      reject(new Error(`File vượt quá ${MAX_FILE_SIZE_MB} MB`));
      return;
    }

    if (signal?.aborted) {
      reject(new DOMException('Upload cancelled', 'AbortError'));
      return;
    }

    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
    xhr.setRequestHeader('Content-Type', file.type || `image/${ext === 'jpg' ? 'jpeg' : ext}`);

    // Wire abort signal → xhr.abort()
    const onAbort = () => {
      xhr.abort();
      reject(new DOMException('Upload cancelled', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) {
        onProgress?.(Math.round((ev.loaded / ev.total) * 100));
      }
    };

    xhr.onload = () => {
      signal?.removeEventListener('abort', onAbort);
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`S3 upload thất bại: HTTP ${xhr.status}`));
      }
    };

    xhr.onerror = () => {
      signal?.removeEventListener('abort', onAbort);
      reject(new Error('Lỗi mạng khi upload lên S3'));
    };
    xhr.ontimeout = () => {
      signal?.removeEventListener('abort', onAbort);
      reject(new Error('Upload timeout'));
    };
    xhr.timeout = 5 * 60 * 1000; // 5 minutes

    xhr.send(file);
  });
}

/**
 * Retry wrapper around putToS3.  Retries up to MAX_RETRY_ATTEMPTS with
 * exponential backoff (1s, 2s, 4s).
 * - AbortError: rethrows immediately, no retry.
 * - After all retries fail: calls DELETE /upload/cancel to clean up the
 *   stuck UPLOADING record, then rethrows the last error.
 */
async function putToS3WithRetry(
  uploadUrl: string,
  file: File,
  mediaId: string,
  signal?: AbortSignal,
  onProgress?: (pct: number) => void,
  onRetry?: RetryCallback,
): Promise<void> {
  let lastError: Error = new Error('Upload failed');

  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
    try {
      await putToS3(uploadUrl, file, signal, onProgress);
      return; // success
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw err; // user-initiated cancel — do not retry
      }
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt < MAX_RETRY_ATTEMPTS) {
        onRetry?.(attempt + 1, MAX_RETRY_ATTEMPTS);
        await sleep(RETRY_DELAYS_MS[attempt - 1]);
        if (signal?.aborted) {
          throw new DOMException('Upload cancelled', 'AbortError');
        }
      }
    }
  }

  // All retries exhausted — soft-delete stuck UPLOADING record
  cancelUpload(mediaId).catch(() => { /* best-effort */ });
  throw lastError;
}

// ── Cancel (cleanup stuck UPLOADING record) ───────────────────────────────────

/**
 * Soft-delete a Media record stuck in UPLOADING state.
 * Called automatically after retry exhaustion or on explicit user cancel.
 */
export async function cancelUpload(mediaId: string): Promise<void> {
  await fetch(`${API_BASE}/api/v1/staff/upload/cancel`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ media_id: mediaId }),
  });
  // Ignore response — endpoint is idempotent
}

// ── Step 3: Confirm ───────────────────────────────────────────────────────────

async function confirm(mediaId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/staff/upload/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ media_id: mediaId }),
  });
  await expectOk(res, 'Confirm');
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Upload a single file: presign → PUT S3 (with retry) → confirm.
 *
 * @param signal      AbortSignal to cancel mid-flight. On abort, calls
 *                    DELETE /upload/cancel automatically.
 * @param onRetry     Called before each retry: (nextAttempt, maxAttempts).
 * @param onPresigned Called right after presign returns with the server's
 *                    media_id (before PUT starts).  Use this to register
 *                    the cancel controller in the calling hook.
 */
export async function presignAndUpload(
  file: File,
  metadata: UploadMetadata,
  onProgress?: (pct: number) => void,
  signal?: AbortSignal,
  onRetry?: RetryCallback,
  onPresigned?: OnPresignedCallback,
): Promise<UploadResult> {
  let mediaId = '';
  try {
    const presignData = await presign(file, metadata);
    mediaId = presignData.media_id;
    onPresigned?.(mediaId);

    await putToS3WithRetry(
      presignData.upload_url,
      file,
      mediaId,
      signal,
      onProgress,
      onRetry,
    );
    onProgress?.(100);
    await confirm(mediaId);
    return { media_id: mediaId, filename: file.name, status: 'success' };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      // User-initiated cancel — clean up the UPLOADING record
      if (mediaId) {
        cancelUpload(mediaId).catch(() => { /* best-effort */ });
      }
      return { media_id: mediaId, filename: file.name, status: 'cancelled' };
    }
    // Other error (retry exhaustion already called cancelUpload internally
    // for the PUT step; presign/confirm errors leave record for cleanup worker)
    return {
      media_id: mediaId,
      filename: file.name,
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Upload multiple files with max-3-concurrent parallelism.
 * Calls onProgress(completed, total, currentFilename) after each file finishes.
 */
export async function batchUpload(
  files: File[],
  metadata: UploadMetadata,
  onProgress?: ProgressCallback,
): Promise<UploadResult[]> {
  const results: UploadResult[] = new Array(files.length);
  let completed = 0;
  const queue = files.map((f, i) => ({ file: f, index: i }));

  async function worker() {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;
      const { file, index } = item;
      onProgress?.(completed, files.length, file.name);
      const result = await presignAndUpload(file, metadata);
      results[index] = result;
      completed++;
      onProgress?.(completed, files.length, file.name);
    }
  }

  const concurrency = Math.min(MAX_CONCURRENT, files.length);
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

/**
 * Get batch presign URLs for multiple files in one API call.
 * Use this when you want to start S3 uploads before the first confirm.
 */
export async function batchPresign(
  files: Array<{ filename: string; content_type: string; size?: number }>,
  metadata: UploadMetadata,
): Promise<PresignResponse[]> {
  const res = await fetch(`${API_BASE}/api/v1/staff/upload/batch-presign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({
      files,
      location_id: metadata.location_id,
      shoot_date: metadata.shoot_date,
      album_code: metadata.album_code ?? undefined,
    }),
  });
  const json = await expectOk(res, 'BatchPresign');
  return ((json as { data: { uploads: PresignResponse[] } }).data.uploads);
}

// ── Offline queue (IndexedDB) ─────────────────────────────────────────────────

const IDB_NAME = 'photopro-upload-queue';
const IDB_STORE = 'pending';
const IDB_VERSION = 1;

interface QueuedUpload {
  id?: number;      // auto-incremented IDB key
  filename: string;
  type: string;
  size: number;
  data: ArrayBuffer;
  metadata: UploadMetadata;
  queuedAt: number;
}

function openQueueDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(IDB_STORE, { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Add one file to the offline upload queue. */
export async function queueUploadOffline(file: File, metadata: UploadMetadata): Promise<void> {
  const data = await file.arrayBuffer();
  const entry: QueuedUpload = {
    filename: file.name,
    type: file.type,
    size: file.size,
    data,
    metadata,
    queuedAt: Date.now(),
  };
  const db = await openQueueDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).add(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

/** Get all pending entries from the queue. */
async function dequeueAll(): Promise<QueuedUpload[]> {
  const db = await openQueueDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).getAll();
    req.onsuccess = () => { resolve(req.result as QueuedUpload[]); db.close(); };
    req.onerror = () => reject(req.error);
  });
}

/** Remove a single entry by IDB key after it has been uploaded. */
async function removeQueued(id: number): Promise<void> {
  const db = await openQueueDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

/**
 * Drain the offline queue.  Called when the browser comes back online.
 * Uploads are attempted sequentially to avoid hammering the network on
 * a flaky connection.  Failed entries are left in the queue for the
 * next online event.
 */
export async function processOfflineQueue(
  onProgress?: (done: number, total: number, filename: string) => void,
): Promise<void> {
  const entries = await dequeueAll();
  if (!entries.length) return;

  let done = 0;
  for (const entry of entries) {
    const file = new File([entry.data], entry.filename, { type: entry.type });
    onProgress?.(done, entries.length, entry.filename);
    const result = await presignAndUpload(file, entry.metadata);
    if (result.status === 'success' && entry.id !== undefined) {
      await removeQueued(entry.id);
    }
    done++;
  }
  onProgress?.(done, entries.length, '');
}

/**
 * Attempt to upload a file immediately if online, or queue it for later.
 *
 * Callers that need progress/cancel support should use presignAndUpload()
 * directly.  This helper is designed for fire-and-forget scenarios where
 * the photographer just wants photos queued and uploaded automatically.
 */
export async function uploadOrQueue(
  file: File,
  metadata: UploadMetadata,
): Promise<{ queued: boolean; result?: UploadResult }> {
  if (!navigator.onLine) {
    await queueUploadOffline(file, metadata);
    return { queued: true };
  }
  const result = await presignAndUpload(file, metadata);
  return { queued: false, result };
}

// ── Auto-drain on 'online' event ──────────────────────────────────────────────
// Registered once at module load. Silently processes the queue whenever the
// browser regains connectivity. Errors per-file are logged but don't abort
// the rest of the queue.
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    processOfflineQueue().catch((err) => {
      console.warn('[PhotoPro] Offline queue drain error:', err);
    });
  });
}
