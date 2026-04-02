/**
 * SSE client for React Native (fetch-based, since EventSource is unavailable).
 */
import { getApiBase, getToken } from './apiClient';

const RECONNECT_DELAY = 5000;

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

type SseCallback<T> = (event: T) => void;
type CleanupFn = () => void;

/**
 * Subscribe to the public location SSE stream.
 * Returns a cleanup function to close the connection.
 */
export function subscribeLocationStream(
  locationId: string,
  onEvent: SseCallback<PhotoEvent>,
  onError?: (err: Error) => void,
): CleanupFn {
  let active = true;
  let ctrl = new AbortController();

  async function connect(): Promise<void> {
    try {
      const base = await getApiBase();
      const url = `${base}/api/v1/realtime/stream?location_id=${encodeURIComponent(locationId)}`;

      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok || !res.body) throw new Error(`SSE connect failed: ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (active) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6)) as { type: string };
              if (data.type === 'new_photo') {
                onEvent(data as PhotoEvent);
              }
            } catch {
              // ignore
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        onError?.(err instanceof Error ? err : new Error(String(err)));
        if (active) setTimeout(connect, RECONNECT_DELAY);
      }
    }
  }

  connect();

  return () => {
    active = false;
    ctrl.abort();
  };
}

/**
 * Subscribe to the staff SSE stream (requires auth token).
 */
export function subscribeStaffStream(
  onEvent: SseCallback<StaffPhotoEvent>,
  onError?: (err: Error) => void,
): CleanupFn {
  let active = true;
  let ctrl = new AbortController();

  async function connect(): Promise<void> {
    try {
      const base = await getApiBase();
      const token = await getToken();
      if (!token) return;

      const url = `${base}/api/v1/realtime/staff-stream?token=${encodeURIComponent(token)}`;
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok || !res.body) throw new Error(`Staff SSE connect failed: ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (active) {
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
                onEvent(data as StaffPhotoEvent);
              }
            } catch {
              // ignore
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        onError?.(err instanceof Error ? err : new Error(String(err)));
        if (active) setTimeout(connect, RECONNECT_DELAY);
      }
    }
  }

  connect();

  return () => {
    active = false;
    ctrl.abort();
  };
}
