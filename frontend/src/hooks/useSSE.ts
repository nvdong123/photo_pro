/**
 * SSE hooks for realtime photo stream.
 *
 * usePhotoStream(locationId)
 *   – connects to /api/v1/realtime/stream?location_id=…
 *   – public (no auth), customers watch for new photos
 *
 * useStaffPhotoStream(token)
 *   – connects to /api/v1/realtime/staff-stream?token=…
 *   – authenticated staff: notified when photos finish processing
 */

import { useCallback, useEffect, useRef, useState } from 'react';

const API_BASE = (import.meta.env.VITE_API_URL as string) ?? '';
const RECONNECT_DELAY_MS = 5000;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PhotoEvent {
  type: 'new_photo';
  media_id: string;
  thumb_url: string;
  location_id: string;
}

export interface StaffPhotoEvent {
  type: 'photo_ready';
  media_id: string;
  status: string;
}

// ── usePhotoStream ────────────────────────────────────────────────────────────

interface PhotoStreamResult {
  newPhotos: PhotoEvent[];
  isConnected: boolean;
  error: string | null;
  clearPhotos: () => void;
}

/**
 * Subscribe to SSE location stream.
 * Pass null/empty to skip connecting.
 * Auto-reconnects after 5 s on disconnect.
 */
export function usePhotoStream(locationId: string | null | undefined): PhotoStreamResult {
  const [newPhotos, setNewPhotos] = useState<PhotoEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const esRef = useRef<EventSource | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const connect = useCallback(() => {
    if (!locationId) return;

    const url = `${API_BASE}/api/v1/realtime/stream?location_id=${encodeURIComponent(locationId)}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => {
      setIsConnected(true);
      setError(null);
    };

    es.onmessage = (ev: MessageEvent<string>) => {
      try {
        const data = JSON.parse(ev.data) as { type: string };
        if (data.type === 'new_photo') {
          setNewPhotos((prev) => [data as PhotoEvent, ...prev]);
        }
        // 'ping' events are silently ignored
      } catch {
        // ignore malformed messages
      }
    };

    es.onerror = () => {
      setIsConnected(false);
      setError('Mất kết nối – đang thử lại...');
      es.close();
      retryRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
    };
  }, [locationId]);

  useEffect(() => {
    connect();
    return () => {
      esRef.current?.close();
      if (retryRef.current !== undefined) clearTimeout(retryRef.current);
    };
  }, [connect]);

  return {
    newPhotos,
    isConnected,
    error,
    clearPhotos: () => setNewPhotos([]),
  };
}

// ── useAllPhotosStream ────────────────────────────────────────────────────────

/**
 * Subscribe to the global SSE stream (all locations at once).
 * Used by the Albums list page to display LIVE badges without opening
 * one connection per album.
 */
export function useAllPhotosStream(): PhotoStreamResult {
  const [newPhotos, setNewPhotos] = useState<PhotoEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const esRef = useRef<EventSource | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const connect = useCallback(() => {
    const url = `${API_BASE}/api/v1/realtime/stream`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => {
      setIsConnected(true);
      setError(null);
    };

    es.onmessage = (ev: MessageEvent<string>) => {
      try {
        const data = JSON.parse(ev.data) as { type: string };
        if (data.type === 'new_photo') {
          setNewPhotos((prev) => [data as PhotoEvent, ...prev]);
        }
      } catch {
        // ignore malformed messages
      }
    };

    es.onerror = () => {
      setIsConnected(false);
      setError('Mất kết nối – đang thử lại...');
      es.close();
      retryRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      esRef.current?.close();
      if (retryRef.current !== undefined) clearTimeout(retryRef.current);
    };
  }, [connect]);

  return {
    newPhotos,
    isConnected,
    error,
    clearPhotos: () => setNewPhotos([]),
  };
}

// ── useStaffPhotoStream ───────────────────────────────────────────────────────

interface StaffStreamResult {
  processedPhotos: StaffPhotoEvent[];
  isConnected: boolean;
}

/**
 * Subscribe to staff SSE stream.
 * Uses fetch + ReadableStream with ``credentials: 'include'`` so the browser
 * automatically sends the HttpOnly ``access_token`` cookie set at login.
 * The token is no longer exposed in the URL.
 *
 * ``token`` param is kept for backward compat (mobile / non-cookie clients):
 * when provided AND no cookie is present the server accepts ?token= with a
 * deprecation warning.  Pass null once all clients use cookies.
 */
export function useStaffPhotoStream(token: string | null | undefined): StaffStreamResult {
  const [processedPhotos, setProcessedPhotos] = useState<StaffPhotoEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const connect = useCallback(() => {
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    // Primary auth: HttpOnly cookie sent automatically by the browser.
    // Fallback: ?token= for mobile / legacy clients (server logs a warning).
    const url = token
      ? `${API_BASE}/api/v1/realtime/staff-stream?token=${encodeURIComponent(token)}`
      : `${API_BASE}/api/v1/realtime/staff-stream`;

    fetch(url, { signal: ctrl.signal, credentials: 'include' })
      .then(async (resp) => {
        if (!resp.ok || !resp.body) {
          setIsConnected(false);
          retryRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
          return;
        }
        setIsConnected(true);

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6)) as { type: string };
                if (data.type === 'photo_ready') {
                  setProcessedPhotos((prev) => [data as StaffPhotoEvent, ...prev]);
                }
              } catch {
                // ignore
              }
            }
          }
        }

        // Stream ended – reconnect
        setIsConnected(false);
        retryRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
      })
      .catch((err: Error) => {
        if (err.name !== 'AbortError') {
          setIsConnected(false);
          retryRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
        }
      });
  }, [token]);

  useEffect(() => {
    connect();
    return () => {
      abortRef.current?.abort();
      if (retryRef.current !== undefined) clearTimeout(retryRef.current);
    };
  }, [connect]);

  return { processedPhotos, isConnected };
}
