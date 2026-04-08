import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

const CACHE_DIR = FileSystem.cacheDirectory + 'photo_cache/';
const MAX_CACHE_SIZE = 100 * 1024 * 1024; // 100MB max cache

export interface CachedImage {
  uri: string;
  localPath: string;
  size?: number;
  cachedAt: number;
}

const imageCache = new Map<string, CachedImage>();

export async function ensureCacheDir(): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(CACHE_DIR);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
    }
  } catch (err) {
    console.error('Failed to create cache directory:', err);
  }
}

export function getCacheKey(uri: string, size: 'thumbnail' | 'full' = 'thumbnail'): string {
  const hash = uri.split('').reduce((acc, char) => {
    return ((acc << 5) - acc) + char.charCodeAt(0);
  }, 0);
  return `${Math.abs(hash)}_${size}`;
}

export async function getCachedImage(uri: string): Promise<string | null> {
  const cached = imageCache.get(uri);
  if (cached) {
    return cached.localPath;
  }
  return null;
}

export async function cacheImage(uri: string): Promise<string> {
  const existing = imageCache.get(uri);
  if (existing) {
    return existing.localPath;
  }

  await ensureCacheDir();

  const cacheKey = getCacheKey(uri, 'thumbnail');
  const localPath = CACHE_DIR + cacheKey + '.jpg';

  try {
    const info = await FileSystem.getInfoAsync(localPath);
    if (!info.exists) {
      await FileSystem.copyAsync({
        from: uri,
        to: localPath,
      });
    }

    const stat = await FileSystem.getInfoAsync(localPath);
    const fileStat = stat as { size?: number };
    imageCache.set(uri, {
      uri,
      localPath,
      size: fileStat.size,
      cachedAt: Date.now(),
    });

    return localPath;
  } catch (err) {
    console.error('Failed to cache image:', err);
    return uri;
  }
}

export async function precacheImages(uris: string[]): Promise<void> {
  const cachePromises = uris.slice(0, 20).map(uri => {
    cacheImage(uri).catch(() => {});
  });
  await Promise.all(cachePromises);
}

export async function clearOldCache(): Promise<void> {
  try {
    await ensureCacheDir();
    const files = await FileSystem.readDirectoryAsync(CACHE_DIR);
    
    if (files.length > 50) {
      const fileInfos = await Promise.all(
        files.map(async (file) => {
          const stat = await FileSystem.getInfoAsync(CACHE_DIR + file);
          const fileStat = stat as { modificationTime?: number };
          return { file, mtime: fileStat.modificationTime ?? 0 };
        })
      );

      fileInfos.sort((a, b) => a.mtime - b.mtime);
      
      const toDelete = fileInfos.slice(0, files.length - 30);
      for (const { file } of toDelete) {
        await FileSystem.deleteAsync(CACHE_DIR + file, { idempotent: true });
      }
    }
  } catch (err) {
    console.error('Failed to clear old cache:', err);
  }
}

export async function getCacheSize(): Promise<number> {
  try {
    await ensureCacheDir();
    const files = await FileSystem.readDirectoryAsync(CACHE_DIR);
    let totalSize = 0;
    
    for (const file of files) {
      const info = await FileSystem.getInfoAsync(CACHE_DIR + file);
      const fileInfo = info as { size?: number };
      totalSize += fileInfo.size ?? 0;
    }
    
    return totalSize;
  } catch {
    return 0;
  }
}

export function useCachedUri(uri: string | undefined): string {
  if (!uri) return '';
  const cached = imageCache.get(uri);
  return cached?.localPath ?? uri;
}