import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';
import type { CameraFile } from './otgService';

export interface UsbCameraDeviceInfo {
  deviceId: number;
  label: string;
  manufacturer?: string | null;
  productName?: string | null;
  hasPermission: boolean;
}

export interface UsbCameraFileMaterialized {
  uri: string;
  size?: number;
}

export interface UsbCameraScanResult {
  state: 'idle' | 'permission_required' | 'connected' | 'error';
  deviceName?: string | null;
  primaryDeviceId?: number | null;
  devices: UsbCameraDeviceInfo[];
  files: CameraFile[];
  error?: string | null;
}

interface PhotoProUsbCameraNativeModule {
  scanConnectedCamerasAsync(maxFiles?: number): Promise<UsbCameraScanResult>;
  requestCameraPermissionAsync(deviceId: number): Promise<boolean>;
  materializeFileAsync(cacheKey: string): Promise<UsbCameraFileMaterialized>;
  getThumbnailAsync(cacheKey: string): Promise<string | null>;
  clearCache(): Promise<void>;
}

const nativeModule = Platform.OS === 'android'
  ? requireOptionalNativeModule<PhotoProUsbCameraNativeModule>('PhotoProUsbCamera')
  : null;

export function isAndroidUsbCameraNativeAvailable(): boolean {
  return !!nativeModule;
}

export async function scanAndroidUsbCamera(maxFiles = 120): Promise<UsbCameraScanResult | null> {
  if (!nativeModule) {
    return null;
  }
  return nativeModule.scanConnectedCamerasAsync(maxFiles);
}

export async function requestAndroidUsbPermission(deviceId: number): Promise<boolean> {
  if (!nativeModule) {
    return false;
  }
  return nativeModule.requestCameraPermissionAsync(deviceId);
}

export async function materializeAndroidUsbCameraFile(cacheKey: string): Promise<UsbCameraFileMaterialized | null> {
  if (!nativeModule) {
    return null;
  }
  return nativeModule.materializeFileAsync(cacheKey);
}

export async function getAndroidUsbCameraThumbnail(cacheKey: string): Promise<string | null> {
  if (!nativeModule) {
    return null;
  }
  return nativeModule.getThumbnailAsync(cacheKey);
}

export async function clearUsbCache(): Promise<void> {
  if (!nativeModule) {
    return;
  }
  return nativeModule.clearCache();
}
