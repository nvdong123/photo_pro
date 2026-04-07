import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { requestAndroidUsbPermission, scanAndroidUsbCamera, clearUsbCache } from '../services/androidUsbCamera';
import { scanOtgDevice, type CameraFile } from '../services/otgService';

export interface UseOTGState {
  isSupported: boolean;
  scanning: boolean;
  files: CameraFile[];
  deviceName: string;
  permissionRequired: boolean;
  errorMessage: string;
  newPhotoHandles: Set<number>; // For highlighting new photos
  pickFiles: () => Promise<void>;
  clearFiles: () => void;
  startAutoScan: () => void;
  stopAutoScan: () => void;
}

export function useOTG(): UseOTGState {
  const isSupported = Platform.OS === 'android';
  const [scanning, setScanning] = useState(false);
  const [files, setFiles] = useState<CameraFile[]>([]);
  const [deviceName, setDeviceName] = useState('');
  const [permissionRequired, setPermissionRequired] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [newPhotoHandles, setNewPhotoHandles] = useState<Set<number>>(new Set());
  const previousFilesRef = useRef<CameraFile[]>([]);
  const autoScanTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const scanInFlightRef = useRef(false);
  const permissionRequestRef = useRef<Promise<boolean> | null>(null);

  const scanNow = useCallback(async (usePickerFallback = false) => {
    if (scanInFlightRef.current) {
      return;
    }

    scanInFlightRef.current = true;
    setScanning(true);
    setErrorMessage('');
    try {
      const nativeResult = await scanAndroidUsbCamera(120);
      if (nativeResult) {
        setDeviceName(nativeResult.deviceName ?? nativeResult.devices[0]?.label ?? '');
        setPermissionRequired(nativeResult.state === 'permission_required');
        setErrorMessage(nativeResult.error ?? '');

        if (nativeResult.files.length > 0) {
          // Detect new photos
          const previousHandles = new Set(previousFilesRef.current.map(f => (f.source as any)?.cacheKey));
          const newHandles = nativeResult.files
            .filter(f => f.source?.type === 'android-usb-camera' && !(f.source as any)?.cacheKey || !previousHandles.has((f.source as any)?.cacheKey))
            .map(f => {
              // Extract handle from cacheKey or filename
              const cacheKey = (f.source as any)?.cacheKey;
              if (cacheKey) {
                const parts = cacheKey.split('_');
                return parseInt(parts[parts.length - 2]); // objectHandle is second to last
              }
              return 0;
            })
            .filter(h => h > 0);

          if (newHandles.length > 0) {
            setNewPhotoHandles(prev => new Set([...prev, ...newHandles]));
            console.log(`[OTG] Detected ${newHandles.length} new photos:`, newHandles);
          }

          previousFilesRef.current = nativeResult.files;
          setFiles(nativeResult.files);
          return;
        }

        if (nativeResult.state === 'permission_required' && nativeResult.primaryDeviceId != null) {
          if (!permissionRequestRef.current) {
            permissionRequestRef.current = requestAndroidUsbPermission(nativeResult.primaryDeviceId)
              .catch(() => false)
              .finally(() => {
                permissionRequestRef.current = null;
              });
          }

          const granted = await permissionRequestRef.current;
          if (granted) {
            const grantedResult = await scanAndroidUsbCamera(120);
            if (grantedResult) {
              setDeviceName(grantedResult.deviceName ?? grantedResult.devices[0]?.label ?? '');
              setPermissionRequired(grantedResult.state === 'permission_required');
              setErrorMessage(grantedResult.error ?? '');
              if (grantedResult.files.length > 0) {
                previousFilesRef.current = grantedResult.files;
                setFiles(grantedResult.files);
              }
            }
          }
          return;
        }

        if (nativeResult.state === 'connected') {
          return;
        }

        if (nativeResult.state === 'idle' || nativeResult.state === 'error') {
          // fall through to the legacy OTG fallback scanner
        } else {
          return;
        }
      } else {
        setDeviceName('');
        setPermissionRequired(false);
      }

      const found = await scanOtgDevice(500, usePickerFallback);
      if (found.length > 0) {
        // Detect new photos for fallback scanner
        const previousNames = new Set(previousFilesRef.current.map(f => f.name));
        const newFiles = found.filter(f => !previousNames.has(f.name));
        if (newFiles.length > 0) {
          console.log(`[OTG] Detected ${newFiles.length} new photos via fallback:`, newFiles.map(f => f.name));
        }
        previousFilesRef.current = found;
        setFiles(found);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setScanning(false);
      scanInFlightRef.current = false;
    }
  }, []);

  const pickFiles = useCallback(async () => {
    await scanNow(true);
  }, [scanNow]);

  const stopAutoScan = useCallback(() => {
    if (autoScanTimer.current) {
      clearInterval(autoScanTimer.current);
      autoScanTimer.current = null;
    }
  }, []);

const startAutoScan = useCallback(() => {
    stopAutoScan();
    void scanNow(false);
    autoScanTimer.current = setInterval(() => {
      void scanNow(false);
    }, 1500);
  }, [scanNow, stopAutoScan]);

  const clearFiles = useCallback(() => {
    setFiles([]);
    setNewPhotoHandles(new Set());
    previousFilesRef.current = [];
    setErrorMessage('');
    setPermissionRequired(false);
  }, []);

  useEffect(() => {
    return () => {
      stopAutoScan();
      if (Platform.OS === 'android') {
        clearUsbCache().catch(() => {});
      }
    };
  }, [stopAutoScan]);

  return useMemo(() => ({
    isSupported,
    scanning,
    files,
    deviceName,
    permissionRequired,
    errorMessage,
    newPhotoHandles,
    pickFiles,
    clearFiles,
    startAutoScan,
    stopAutoScan,
  }), [clearFiles, deviceName, errorMessage, files, isSupported, newPhotoHandles, permissionRequired, pickFiles, scanning, startAutoScan, stopAutoScan]);
}
