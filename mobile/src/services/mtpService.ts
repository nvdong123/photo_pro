/**
 * TypeScript wrapper for the native Android MTP module.
 * The underlying native module (MtpModule.kt) is only available on Android.
 * On other platforms all methods return safe no-op values.
 */
import {
  NativeModules,
  NativeEventEmitter,
  Platform,
  type EmitterSubscription,
} from 'react-native';

export interface CameraDevice {
  deviceName: string;
  vendorId: number;
  productId: number;
}

export interface CameraInfo {
  manufacturer: string;
  model: string;
  serialNumber: string;
}

export interface MtpPhoto {
  handle: number;
  filename: string;
  fileSize: number;
  captureTime: number; // Unix ms
  storageId: number;
  imagePixWidth: number;
  imagePixHeight: number;
  /** Lazily loaded base64 data-URI thumbnail. */
  thumbnail?: string;
}

interface NativeMtpModuleInterface {
  detectDevice(): Promise<CameraDevice | null>;
  connect(): Promise<CameraInfo>;
  getPhotoList(): Promise<MtpPhoto[]>;
  getThumbnail(handle: number): Promise<string>;
  downloadPhoto(handle: number, filename: string): Promise<string>;
  startWatching(): Promise<void>;
  stopWatching(): Promise<void>;
  disconnect(): Promise<void>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

const NativeMtpModule: NativeMtpModuleInterface | undefined =
  Platform.OS === 'android' ? (NativeModules.MtpModule as NativeMtpModuleInterface | undefined) : undefined;

class MtpService {
  private _emitter: NativeEventEmitter | null = null;

  isSupported(): boolean {
    return Platform.OS === 'android' && !!NativeMtpModule;
  }

  private get emitter(): NativeEventEmitter | null {
    if (!NativeMtpModule) return null;
    if (!this._emitter) {
      this._emitter = new NativeEventEmitter(NativeMtpModule as unknown as { addListener: (e: string) => void; removeListeners: (n: number) => void });
    }
    return this._emitter;
  }

  /** Scan for a connected MTP/PTP camera. Returns null if none found. */
  detectDevice(): Promise<CameraDevice | null> {
    if (!NativeMtpModule) return Promise.resolve(null);
    return NativeMtpModule.detectDevice();
  }

  /** Open an MTP session. Must call detectDevice first. */
  connect(): Promise<CameraInfo> {
    if (!NativeMtpModule) return Promise.reject(new Error('MtpModule unavailable'));
    return NativeMtpModule.connect();
  }

  /** Get list of photos on the connected camera. */
  getPhotoList(): Promise<MtpPhoto[]> {
    if (!NativeMtpModule) return Promise.resolve([]);
    return NativeMtpModule.getPhotoList();
  }

  /** Get JPEG thumbnail as base64 data-URI. */
  getThumbnail(handle: number): Promise<string> {
    if (!NativeMtpModule) return Promise.resolve('');
    return NativeMtpModule.getThumbnail(handle);
  }

  /**
   * Download the full-resolution photo to device cache.
   * Returns the absolute file:// URI of the cached file.
   */
  downloadPhoto(handle: number, filename: string): Promise<string> {
    if (!NativeMtpModule) return Promise.reject(new Error('MtpModule unavailable'));
    return NativeMtpModule.downloadPhoto(handle, filename);
  }

  /** Start polling for new photos. Emits MtpNewPhoto events. */
  startWatching(): Promise<void> {
    if (!NativeMtpModule) return Promise.resolve();
    return NativeMtpModule.startWatching();
  }

  stopWatching(): Promise<void> {
    if (!NativeMtpModule) return Promise.resolve();
    return NativeMtpModule.stopWatching();
  }

  disconnect(): Promise<void> {
    if (!NativeMtpModule) return Promise.resolve();
    return NativeMtpModule.disconnect();
  }

  /** Subscribe to new-photo events emitted by the polling watcher. */
  onNewPhoto(callback: (photo: MtpPhoto) => void): EmitterSubscription | null {
    return this.emitter?.addListener('MtpNewPhoto', callback) ?? null;
  }
}

export const mtpService = new MtpService();
