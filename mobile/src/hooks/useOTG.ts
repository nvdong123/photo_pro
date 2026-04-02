import { useState, useEffect } from 'react';
import { Platform } from 'react-native';
import { pickFilesFromDevice, type CameraFile } from '../services/otgService';

export interface UseOTGState {
  isSupported: boolean;
  picking: boolean;
  files: CameraFile[];
  pickFiles: () => Promise<void>;
  clearFiles: () => void;
}

export function useOTG(): UseOTGState {
  const isSupported = Platform.OS === 'android';
  const [picking, setPicking] = useState(false);
  const [files, setFiles] = useState<CameraFile[]>([]);

  const pickFiles = async () => {
    setPicking(true);
    try {
      const picked = await pickFilesFromDevice();
      setFiles(picked);
    } finally {
      setPicking(false);
    }
  };

  return {
    isSupported,
    picking,
    files,
    pickFiles,
    clearFiles: () => setFiles([]),
  };
}
