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

  const mountedRef = useRef(true);
  const watchSubRef = useRef<EmitterSubscription | null>(null);
  const connectionStateRef = useRef<MtpConnectionState>('idle');

  // Keep ref in sync so callbacks capture current state without stale closure.
  connectionStateRef.current = connectionState;

  const safeSet = useCallback(<T>(setter: React.Dispatch<React.SetStateAction<T>>, value: T) => {
    if (mountedRef.current) setter(value);
  }, []);

  const cleanup = useCallback(async () => {
    watchSubRef.current?.remove();
    watchSubRef.current = null;
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
        safeSet(setErrorMessage, 'Khong tim thay may anh. Cai cap OTG va thu lai.');
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
        setPhotos((prev) => {
          if (prev.some((p) => p.handle === photo.handle)) return prev;
          return [photo, ...prev];
        });
      });

      await mtpService.startWatching();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      safeSet(setConnectionState, 'error');
      safeSet(setErrorMessage, msg || 'Loi ket noi may anh.');
    }
  }, [isSupported, safeSet]);

  const loadPhotos = useCallback(async () => {
    if (connectionStateRef.current !== 'connected') return;
    try {
      const list = await mtpService.getPhotoList();
      if (mountedRef.current) setPhotos(list);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      safeSet(setErrorMessage, msg || 'Loi doc danh sach anh.');
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
    detectAndConnect,
    loadPhotos,
    disconnect,
    getThumbnail: mtpService.getThumbnail.bind(mtpService),
    downloadAndGetPath: mtpService.downloadPhoto.bind(mtpService),
  };
}
