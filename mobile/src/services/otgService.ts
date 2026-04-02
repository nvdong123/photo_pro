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
import { Platform } from 'react-native';

export interface CameraFile {
  uri: string;
  name: string;
  size?: number;
  mimeType: string;
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
      '*/*', // allow all — some devices mis-report CR2/NEF mime types
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
 * (expo-document-picker) instead — it works in Expo Go without extra
 * permissions and surfaces OTG-mounted camera files too.
 *
 * This function is kept as a stub so callers compile; it always falls
 * back to the document picker in Expo Go and development builds alike.
 */
export async function pickFromMediaLibrary(maxFiles = 50): Promise<CameraFile[]> {
  return pickFilesFromDevice(maxFiles);
}
