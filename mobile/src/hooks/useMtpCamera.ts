/**
 * useMtpCamera — React hook for connecting to a camera via Android MTP (USB OTG).
 * Uses the native MtpModule. All state changes are safe across unmount.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { EmitterSubscription } from 'react-native';
import { mtpService, type CameraInfo, type MtpPhoto } from '../services/mtpService';

export type MtpConnectionState = 'idle' | 'detecting' | 'connecting' | 'connected' | 'error';

export interface UseMtpCameraState {
  connectionState: MtpConnectionState;
  cameraInfo: CameraInfo | null;
  photos: MtpPhoto[];
  errorMessage: string;
  isSupported: boolean;
  scanProgress: { loaded: number; total: number; scanning: boolean };
  detectAndConnect: () => Promise<void>;
  loadPhotos: () => Promise<void>;
  disconnect: () => Promise<void>;
  getThumbnail: (handle: number) => Promise<string>;
  downloadAndGetPath: (handle: number, filename: string) => Promise<string>;
}

export function useMtpCamera(): UseMtpCameraState {
  const isSupported = mtpService.isSupported();
  const [connectionState, setConnectionState] = useState<MtpConnectionState>('idle');
  const [cameraInfo, setCameraInfo] = useState<CameraInfo | null>(null);
  const [photos, setPhotos] = useState<MtpPhoto[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [scanProgress, setScanProgress] = useState<{ loaded: number; total: number; scanning: boolean }>({
    loaded: 0,
    total: 0,
    scanning: false,
  });

  const mountedRef = useRef(true);
  const watchSubRef = useRef<EmitterSubscription | null>(null);
  const photoBatchSubRef = useRef<EmitterSubscription | null>(null);
  const handlesBatchSubRef = useRef<EmitterSubscription | null>(null);
  const scanTotalSubRef = useRef<EmitterSubscription | null>(null);
  // Map<handle, MtpPhoto> — enables O(1) merge of stubs and full metadata.
  const photoMapRef = useRef<Map<number, MtpPhoto>>(new Map());
  const connectionStateRef = useRef<MtpConnectionState>('idle');

  // Keep ref in sync so callbacks capture current state without stale closure.
  connectionStateRef.current = connectionState;

  const safeSet = useCallback(<T>(setter: React.Dispatch<React.SetStateAction<T>>, value: T) => {
    if (mountedRef.current) setter(value);
  }, []);

  const cleanup = useCallback(async () => {
    watchSubRef.current?.remove();
    watchSubRef.current = null;
    handlesBatchSubRef.current?.remove();
    handlesBatchSubRef.current = null;
    photoBatchSubRef.current?.remove();
    photoBatchSubRef.current = null;
    scanTotalSubRef.current?.remove();
    scanTotalSubRef.current = null;
    await mtpService.stopWatching().catch(() => undefined);
    await mtpService.disconnect().catch(() => undefined);
  }, []);

  const detectAndConnect = useCallback(async () => {
    if (!isSupported) return;
    safeSet(setConnectionState, 'detecting');
    safeSet(setErrorMessage, '');

    try {
      const device = await mtpService.detectDevice();
      if (!device) {
        safeSet(setConnectionState, 'idle');
        safeSet(setErrorMessage, 'Không tìm thấy máy ảnh. Cắm cáp OTG và thử lại.');
        return;
      }

      safeSet(setConnectionState, 'connecting');
      const info = await mtpService.connect();
      if (!mountedRef.current) return;
      setCameraInfo(info);
      safeSet(setConnectionState, 'connected');

      // Subscribe to new-photo events from the polling watcher.
      watchSubRef.current?.remove();
      watchSubRef.current = mtpService.onNewPhoto((photo) => {
        if (!mountedRef.current) return;
        // Must update photoMapRef so subsequent onPhotosBatch/onHandlesBatch snapshots include it.
        if (!photoMapRef.current.has(photo.handle)) {
          photoMapRef.current.set(photo.handle, photo);
          setPhotos(Array.from(photoMapRef.current.values()));
        }
      });

      await mtpService.startWatching();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      safeSet(setConnectionState, 'error');
      safeSet(setErrorMessage, msg || 'Lỗi kết nối máy ảnh.');
    }
  }, [isSupported, safeSet]);

  const loadPhotos = useCallback(async () => {
    if (connectionStateRef.current !== 'connected') return;

    // Reset
    photoMapRef.current = new Map();
    setPhotos([]);
    setScanProgress({ loaded: 0, total: 0, scanning: true });

    // ── Phase 1: total count ─────────────────────────────────────────────────
    scanTotalSubRef.current?.remove();
    scanTotalSubRef.current = mtpService.onScanTotal((total) => {
      if (!mountedRef.current) return;
      setScanProgress((prev) => ({ ...prev, total }));
    });

    // ── Phase 1b: handle stubs — render grid cells immediately, no metadata ──
    // Stubs have captureTime=0 so they land in "Không có ngày" section first.
    // As metadata arrives (Phase 2), they are upgraded in-place.
    handlesBatchSubRef.current?.remove();
    handlesBatchSubRef.current = mtpService.onHandlesBatch((stubs) => {
      if (!mountedRef.current) return;
      for (const s of stubs) {
        if (!photoMapRef.current.has(s.handle)) {
          photoMapRef.current.set(s.handle, {
            handle: s.handle,
            storageId: s.storageId,
            filename: '',
            fileSize: 0,
            captureTime: 0,
            imagePixWidth: 0,
            imagePixHeight: 0,
          });
        }
      }
      // Snapshot map → state so grid renders all placeholder cells
      setPhotos(Array.from(photoMapRef.current.values()));
    });

    // ── Phase 2: full metadata — upgrades stubs in-place ────────────────────
    photoBatchSubRef.current?.remove();
    photoBatchSubRef.current = mtpService.onPhotosBatch((batch) => {
      if (!mountedRef.current) return;
      for (const photo of batch as MtpPhoto[]) {
        photoMapRef.current.set(photo.handle, photo);
      }
      setPhotos(Array.from(photoMapRef.current.values()));
      setScanProgress((prev) => ({ ...prev, loaded: prev.loaded + batch.length }));
    });

    try {
      await mtpService.getPhotoListStreaming();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      safeSet(setErrorMessage, msg || 'Lỗi đọc danh sách ảnh.');
    } finally {
      handlesBatchSubRef.current?.remove();
      handlesBatchSubRef.current = null;
      photoBatchSubRef.current?.remove();
      photoBatchSubRef.current = null;
      scanTotalSubRef.current?.remove();
      scanTotalSubRef.current = null;
      if (mountedRef.current) {
        setScanProgress((prev) => ({ ...prev, scanning: false }));
      }
    }
  }, [safeSet]);

  const disconnect = useCallback(async () => {
    await cleanup();
    if (!mountedRef.current) return;
    setCameraInfo(null);
    setPhotos([]);
    setConnectionState('idle');
    setErrorMessage('');
  }, [cleanup]);

  // Auto-load photos once connected.
  useEffect(() => {
    if (connectionState === 'connected') {
      void loadPhotos();
    }
  }, [connectionState, loadPhotos]);

  // Cleanup on unmount.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      void cleanup();
    };
  }, [cleanup]);

  return {
    connectionState,
    cameraInfo,
    photos,
    errorMessage,
    isSupported,
    scanProgress,
    detectAndConnect,
    loadPhotos,
    disconnect,
    getThumbnail: mtpService.getThumbnail.bind(mtpService),
    downloadAndGetPath: mtpService.downloadPhoto.bind(mtpService),
  };
}
