import { useState, useCallback } from 'react';
import { uploadFile, type UploadMetadata, type UploadResult } from '../services/uploadService';
import { pickFilesFromDevice } from '../services/otgService';

export interface UseUploadState {
  uploading: boolean;
  completed: number;
  total: number;
  results: UploadResult[];
  currentFile: string;
  startUpload: (metadata: UploadMetadata) => Promise<void>;
}

export function useUpload(): UseUploadState {
  const [uploading, setUploading] = useState(false);
  const [completed, setCompleted] = useState(0);
  const [total, setTotal] = useState(0);
  const [results, setResults] = useState<UploadResult[]>([]);
  const [currentFile, setCurrentFile] = useState('');

  const startUpload = useCallback(async (metadata: UploadMetadata) => {
    const files = await pickFilesFromDevice();
    if (!files.length) return;

    setUploading(true);
    setCompleted(0);
    setTotal(files.length);
    setResults([]);

    for (const f of files) {
      setCurrentFile(f.name);
      const result = await uploadFile(f.uri, f.name, f.mimeType, metadata);
      setResults((prev) => [...prev, result]);
      setCompleted((n) => n + 1);
    }

    setUploading(false);
    setCurrentFile('');
  }, []);

  return { uploading, completed, total, results, currentFile, startUpload };
}
