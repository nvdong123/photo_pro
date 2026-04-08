/**
 * OTG / USB camera service (Android only).
 *
 * On Android, cameras connected via OTG adapter appear as USB Mass Storage
 * devices.  We use expo-file-system to browse the mounted path and
 * expo-document-picker as a fallback for picking files from any source.
 *
 * NOTE: Direct USB host (MTP/PTP) requires react-native-usb which is a
 * native module and must be added via expo-modules or a bare workflow.
 * This scaffold provides the interface and a file-picker fallback.
 */
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { cacheImage, precacheImages } from './imageCacheService';

export interface CameraFileSource {
  type: 'android-usb-camera';
  cacheKey: string;
}

export interface CameraFile {
  uri: string;
  name: string;
  size?: number;
  mimeType: string;
  uploadUri?: string;
  source?: CameraFileSource;
  capturedAt?: number;
}

/** Check if running on Android (the only platform that supports OTG). */
export function isOtgSupported(): boolean {
  return Platform.OS === 'android';
}

/**
 * Pick image files from device storage / external storage.
 * On Android this surfaces files from OTG-mounted cameras too.
 */
export async function pickFilesFromDevice(maxFiles = 50): Promise<CameraFile[]> {
  const result = await DocumentPicker.getDocumentAsync({
    type: [
      'image/jpeg',
      'image/png',
      'image/x-canon-cr2',
      'image/x-nikon-nef',
      'image/x-sony-arw',
      '*/*', // allow all - some devices mis-report CR2/NEF mime types
    ],
    multiple: true,
    copyToCacheDirectory: false,
  });

  if (result.canceled) return [];

  return result.assets
    .filter(a => !!a.uri)
    .slice(0, maxFiles)
    .map(a => ({
      uri: a.uri,
      name: a.name ?? a.uri.split('/').pop() ?? 'photo.jpg',
      size: a.size,
      mimeType: a.mimeType ?? 'image/jpeg',
    }));
}

/**
 * Browse the device media library (camera roll + external storage).
 *
 * NOTE: expo-media-library requires full media permissions which are
 * unavailable in Expo Go on Android 13+.  Use pickFilesFromDevice()
 * (expo-document-picker) instead - it works in Expo Go without extra
 * permissions and surfaces OTG-mounted camera files too.
 *
 * This function is kept as a stub so callers compile; it always falls
 * back to the document picker in Expo Go and development builds alike.
 */
export async function pickFromMediaLibrary(maxFiles = 50): Promise<CameraFile[]> {
  return pickFilesFromDevice(maxFiles);
}

export async function pickFromGallery(maxFiles = 50): Promise<CameraFile[]> {
  try {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
      selectionLimit: maxFiles,
    });

    if (result.canceled) return [];

    return result.assets.slice(0, maxFiles).map((asset) => ({
      uri: asset.uri,
      name: (asset.fileName ?? asset.uri.split('/').pop() ?? 'photo.jpg'),
      size: asset.fileSize,
      mimeType: asset.type === 'image' ? 'image/jpeg' : 'application/octet-stream',
    }));
  } catch (err) {
    throw new Error(`Gallery picker error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.crw', '.cr2', '.cr3', '.nef', '.nrw', '.arw', '.dng', '.raf', '.orf', '.rw2', '.pef', '.srw']);

const SD_CARD_PATHS = [
  '/storage/extSdCard',
  '/storage/external_sd',
  '/storage/sdcard0',
  '/storage/SD card',
  '/storage/外置存储卡',
  '/mnt/extSdCard',
  '/mnt/ext_card',
  '/mnt/sdcard0',
  '/external_sd',
];

const USB_PATHS = [
  '/storage/USBStorage0',
  '/storage/usb0',
  '/storage/usbdisk0',
  '/mnt/usb_storage',
  '/mnt/usb',
  '/usb',
];

function normalizeDirectoryUri(dirPath: string): string {
  const trimmed = dirPath.replace(/\/+$/, '');
  if (trimmed.startsWith('file://')) return trimmed;
  if (trimmed.startsWith('/')) return `file://${trimmed}`;
  return trimmed;
}

function joinDirectoryUri(baseUri: string, fileName: string): string {
  return `${baseUri.replace(/\/+$/, '')}/${fileName}`;
}

async function listMountedRoots(parentPath: string): Promise<string[]> {
  const parentUri = normalizeDirectoryUri(parentPath);

  try {
    const parentInfo = await FileSystem.getInfoAsync(parentUri);
    if (!parentInfo.exists || !parentInfo.isDirectory) {
      return [];
    }

    const entries = await FileSystem.readDirectoryAsync(parentUri);
    return entries
      .filter((entry) => {
        const normalized = entry.toLowerCase();
        return normalized !== 'emulated' && normalized !== 'self';
      })
      .map((entry) => `${parentPath.replace(/\/+$/, '')}/${entry}`);
  } catch (_err) {
    return [];
  }
}

async function scanDirectoryForImages(dirPath: string, maxDepth = 3, currentDepth = 0): Promise<CameraFile[]> {
  const results: CameraFile[] = [];

  if (currentDepth > maxDepth) return results;

  try {
    const dirUri = normalizeDirectoryUri(dirPath);
    const dirInfo = await FileSystem.getInfoAsync(dirUri);
    if (!dirInfo.exists || !dirInfo.isDirectory) {
      return results;
    }

    const files = await FileSystem.readDirectoryAsync(dirUri);

    for (const file of files) {
      try {
        const fileUri = joinDirectoryUri(dirUri, file);
        const fileInfo = await FileSystem.getInfoAsync(fileUri);

        if (fileInfo.isDirectory) {
          // Scan subdirectories (camera DCIM folders, etc)
          const subResults = await scanDirectoryForImages(fileUri, maxDepth, currentDepth + 1);
          results.push(...subResults);
        } else if (fileInfo.exists && fileInfo.size && fileInfo.size > 0) {
          // Check if it's an image
          const extIndex = file.lastIndexOf('.');
          if (extIndex < 0) continue;

          const ext = file.slice(extIndex).toLowerCase();
          if (IMAGE_EXTENSIONS.has(ext)) {
            results.push({
              uri: fileUri,
              name: file,
              size: fileInfo.size,
              mimeType: 'image/jpeg', // simplified; could detect from ext
            });
          }
        }
      } catch (_err) {
        // skip files that fail to stat
      }
    }
  } catch (_err) {
    // directory doesn't exist or can't be read
  }

  return results;
}

export async function getMountedStoragePaths(): Promise<string[]> {
  const mountedRoots = await Promise.all([
    listMountedRoots('/storage'),
    listMountedRoots('/mnt/media_rw'),
    listMountedRoots('/mnt'),
    listMountedRoots('/storage/emulated'),
  ]);

  return mountedRoots.flat();
}

export async function getAllStoragePaths(): Promise<string[]> {
  const mounted = await getMountedStoragePaths();
  
  const allPaths = [
    '/storage/emulated/0/DCIM',
    '/storage/emulated/0/DCIM/100MSDCF',
    '/storage/emulated/0/DCIM/101MSDCF',
    '/storage/emulated/0/DCIM/Canon',
    '/storage/emulated/0/DCIM/Nikon',
    '/storage/emulated/0/DCIM/Sony',
    '/storage/self/primary/DCIM',
    '/sdcard/DCIM',
    '/sdcard/DCIM/100MSDCF',
    '/storage/DCIM',
    '/storage/USB',
    '/mnt/media_rw/USB',
    '/storage/USBStorage0',
    '/mnt/usb_storage',
    '/mnt/usb',
    ...SD_CARD_PATHS,
    ...USB_PATHS,
    ...mounted.filter(p => !p.includes('emulated') && !p.includes('self')),
  ];

  return Array.from(new Set(allPaths));
}

export function getReadableExtensions(): string[] {
  return Array.from(IMAGE_EXTENSIONS);
}

/**
 * Scan common OTG mount paths for connected USB camera/storage devices.
 * Returns all image files found on the mounted device.
 */
export async function scanOtgDevice(maxFiles = 500, usePickerFallback = false): Promise<CameraFile[]> {
  if (Platform.OS !== 'android') return [];

  const mountedRoots = await Promise.all([
    listMountedRoots('/storage'),
    listMountedRoots('/mnt/media_rw'),
    listMountedRoots('/mnt'),
  ]);

  const commonPaths = [
    '/storage/emulated/0/DCIM',
    '/storage/emulated/0/DCIM/100MSDCF',
    '/storage/emulated/0/DCIM/101MSDCF',
    '/storage/emulated/0/DCIM/Canon',
    '/storage/emulated/0/DCIM/Nikon',
    '/storage/emulated/0/DCIM/Sony',
    '/storage/self/primary/DCIM',
    '/sdcard/DCIM',
    '/sdcard/DCIM/100MSDCF',
    '/storage/DCIM',
    '/storage/USB',
    '/mnt/media_rw/USB',
    '/storage/USBStorage0',
    '/mnt/usb_storage',
    '/mnt/usb',
    ...SD_CARD_PATHS,
    ...USB_PATHS,
  ];

  const candidatePaths = Array.from(new Set([
    ...commonPaths,
    ...mountedRoots.reduce<string[]>((all, roots) => all.concat(roots), []),
  ]));

  const allFiles: CameraFile[] = [];
  const seenUris = new Set<string>();

  for (const basePath of candidatePaths) {
    const files = await scanDirectoryForImages(basePath);
    for (const f of files) {
      if (!seenUris.has(f.uri)) {
        seenUris.add(f.uri);
        allFiles.push(f);
        if (allFiles.length >= maxFiles) break;
      }
    }
    if (allFiles.length >= maxFiles) break;
  }

  if (allFiles.length > 0) {
    precacheImages(allFiles.map(f => f.uri)).catch(() => {});
  }

  if (!allFiles.length && usePickerFallback) {
    try {
      return await pickFilesFromDevice(maxFiles);
    } catch (_err) {
      return [];
    }
  }

  return allFiles;
}

