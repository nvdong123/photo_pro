/**
 * useUpload — manages per-file upload state with retry + cancel support.
 *
 * Each file gets its own AbortController.  After presign returns, the
 * server-assigned mediaId is tracked so cancelFile(mediaId) can abort the
 * right in-flight XHR and call DELETE /upload/cancel.
 */

import { useCallback, useRef, useState } from 'react';
import {
  cancelUpload,
  presignAndUpload,
  type UploadMetadata,
} from '../services/uploadService';

export type FileStatus =
  | 'pending'
  | 'uploading'
  | 'retrying'
  | 'done'
  | 'processing'
  | 'indexed'
  | 'cancelled'
  | 'error';

export interface FileItem {
  id: string;          // stable key: `${name}-${size}-${lastModified}`
  file: File;
  progress: number;    // 0-100 during the PUT step
  status: FileStatus;
  mediaId?: string;    // set right after presign returns
  error?: string;
  retryAttempt?: number;   // current attempt shown in UI (2 or 3)
  maxRetries: number;      // always MAX_RETRY_ATTEMPTS (3)
}

export interface UseUploadResult {
  fileItems: FileItem[];
  uploading: boolean;
  uploadDone: boolean;
  setFiles: (files: File[]) => void;
  startUpload: (metadata: UploadMetadata) => Promise<void>;
  cancelFile: (mediaId: string) => void;
  markIndexed: (mediaId: string) => void;
}

const MAX_CONCURRENT = 3;
const MAX_RETRIES = 3;
const ALLOWED_EXTS = ['.jpg', '.jpeg', '.png', '.cr2', '.nef', '.arw', '.rw2', '.rw', '.raf'];
const MAX_FILES = 50;

export function useUpload(): UseUploadResult {
  const [fileItems, setFileItems] = useState<FileItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadDone, setUploadDone] = useState(false);

  // itemId → AbortController (active uploads)
  const controllersRef = useRef<Map<string, AbortController>>(new Map());
  // mediaId → itemId (populated as presign returns for each file)
  const mediaToItemRef = useRef<Map<string, string>>(new Map());

  // ── setFiles ─────────────────────────────────────────────────────────────

  const setFiles = useCallback((files: File[]) => {
    const items: FileItem[] = files
      .filter((f) => {
        const ext = '.' + (f.name.split('.').pop()?.toLowerCase() ?? '');
        return ALLOWED_EXTS.includes(ext);
      })
      .slice(0, MAX_FILES)
      .map((f) => ({
        id: `${f.name}-${f.size}-${f.lastModified}`,
        file: f,
        progress: 0,
        status: 'pending' as FileStatus,
        maxRetries: MAX_RETRIES,
      }));

    setFileItems(items);
    setUploadDone(false);
    controllersRef.current.clear();
    mediaToItemRef.current.clear();
  }, []);

  // ── cancelFile ───────────────────────────────────────────────────────────

  const cancelFile = useCallback((mediaId: string) => {
    const itemId = mediaToItemRef.current.get(mediaId);

    if (itemId) {
      // Abort the in-flight XHR; presignAndUpload will call cancelUpload(mediaId)
      controllersRef.current.get(itemId)?.abort();
      // Optimistically update UI; the worker will also set 'cancelled' from result
      setFileItems((prev) =>
        prev.map((fi) => (fi.id === itemId ? { ...fi, status: 'cancelled' } : fi)),
      );
    } else {
      // No active upload tracked (edge case) — call cancel API directly
      cancelUpload(mediaId).catch(() => { /* ignore */ });
      setFileItems((prev) =>
        prev.map((fi) => (fi.mediaId === mediaId ? { ...fi, status: 'cancelled' } : fi)),
      );
    }
  }, []);

  // ── markIndexed (called by SSE listener) ─────────────────────────────────

  const markIndexed = useCallback((mediaId: string) => {
    setFileItems((prev) =>
      prev.map((fi) =>
        fi.mediaId === mediaId && fi.status !== 'cancelled' && fi.status !== 'error'
          ? { ...fi, status: 'indexed' }
          : fi,
      ),
    );
  }, []);

  // ── startUpload ──────────────────────────────────────────────────────────

  const startUpload = useCallback(
    async (metadata: UploadMetadata) => {
      const pending = fileItems.filter((fi) => fi.status === 'pending');
      if (!pending.length || uploading) return;

      setUploading(true);
      setUploadDone(false);

      // Create one AbortController per pending file
      for (const fi of pending) {
        controllersRef.current.set(fi.id, new AbortController());
      }

      const queue = [...pending];

      async function worker() {
        while (true) {
          const fi = queue.shift();
          if (!fi) break;

          const ctrl = controllersRef.current.get(fi.id);
          if (!ctrl || ctrl.signal.aborted) {
            // Already cancelled before this worker picked it up
            setFileItems((prev) =>
              prev.map((item) =>
                item.id === fi.id ? { ...item, status: 'cancelled' } : item,
              ),
            );
            continue;
          }

          // Transition to uploading
          setFileItems((prev) =>
            prev.map((item) =>
              item.id === fi.id
                ? { ...item, status: 'uploading', progress: 0 }
                : item,
            ),
          );

          const result = await presignAndUpload(
            fi.file,
            metadata,
            // onProgress
            (pct) =>
              setFileItems((prev) =>
                prev.map((item) =>
                  item.id === fi.id ? { ...item, progress: pct } : item,
                ),
              ),
            // signal
            ctrl.signal,
            // onRetry
            (attempt, maxAttempts) =>
              setFileItems((prev) =>
                prev.map((item) =>
                  item.id === fi.id
                    ? {
                        ...item,
                        status: 'retrying',
                        retryAttempt: attempt,
                        maxRetries: maxAttempts,
                        progress: 0,
                      }
                    : item,
                ),
              ),
            // onPresigned — register mediaId right after presign returns
            (mediaId) => {
              mediaToItemRef.current.set(mediaId, fi.id);
              setFileItems((prev) =>
                prev.map((item) =>
                  item.id === fi.id ? { ...item, mediaId } : item,
                ),
              );
            },
          );

          controllersRef.current.delete(fi.id);

          if (result.status === 'success') {
            setFileItems((prev) =>
              prev.map((item) =>
                item.id === fi.id
                  ? { ...item, status: 'done', progress: 100, mediaId: result.media_id }
                  : item,
              ),
            );
          } else if (result.status === 'cancelled') {
            setFileItems((prev) =>
              prev.map((item) =>
                item.id === fi.id ? { ...item, status: 'cancelled' } : item,
              ),
            );
          } else {
            setFileItems((prev) =>
              prev.map((item) =>
                item.id === fi.id
                  ? {
                      ...item,
                      status: 'error',
                      error: result.error ?? 'Upload thất bại — thử lại sau',
                    }
                  : item,
              ),
            );
          }
        }
      }

      const concurrency = Math.min(MAX_CONCURRENT, pending.length);
      await Promise.all(Array.from({ length: concurrency }, () => worker()));

      setUploading(false);
      setUploadDone(true);
      controllersRef.current.clear();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fileItems, uploading],
  );

  return { fileItems, uploading, uploadDone, setFiles, startUpload, cancelFile, markIndexed };
}
