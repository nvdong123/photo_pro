import { useState, useCallback, useRef } from 'react';
import {
  uploadFile,
  batchUpload,
  type UploadMetadata,
  type UploadResult,
  type UploadStatus,
} from '../services/uploadService';
import type { CameraFile } from '../services/otgService';
import { pickFilesFromDevice } from '../services/otgService';

export interface UploadItem extends CameraFile {
  id: string;
  status: UploadStatus;
  progress: number;
  media_id?: string;
  error?: string;
  addedAt: string;
  selected?: boolean;
}

export interface UseUploadState {
  uploading: boolean;
  completed: number;
  total: number;
  results: UploadResult[];
  currentFile: string;
  files: UploadItem[];
  addFiles: (files: CameraFile[]) => void;
  clearFiles: () => void;
  toggleSelectFile: (id: string) => void;
  setAllSelected: (selected: boolean) => void;
  startUpload: (metadata: UploadMetadata, selectedIds?: string[]) => Promise<void>;
  cancelUpload: () => void;
  markMediaUploaded: (mediaId: string) => void;
}

export function useUpload(): UseUploadState {
  const [uploading, setUploading] = useState(false);
  const [completed, setCompleted] = useState(0);
  const [total, setTotal] = useState(0);
  const [results, setResults] = useState<UploadResult[]>([]);
  const [currentFile, setCurrentFile] = useState('');
  const [files, setFiles] = useState<UploadItem[]>([]);
  const cancelRef = useRef(false);
  const filesRef = useRef<UploadItem[]>([]);
  filesRef.current = files;

  const addFiles = useCallback((incoming: CameraFile[]) => {
    setFiles((prev) => {
      const existingKeys = new Set(prev.map((f) => f.uri));
      const newFiles = incoming.filter((f) => !existingKeys.has(f.uri)).map((f) => ({
        ...f,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        status: 'UNUPLOAD' as UploadStatus,
        progress: 0,
        addedAt: new Date().toISOString(),
        selected: false,
      }));
      return [...prev, ...newFiles];
    });
  }, []);

  const clearFiles = useCallback(() => {
    if (uploading) return;
    setFiles([]);
    setResults([]);
    setCompleted(0);
    setTotal(0);
    setCurrentFile('');
  }, [uploading]);

  const toggleSelectFile = useCallback((id: string) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, selected: !f.selected } : f)));
  }, []);

  const setAllSelected = useCallback((selected: boolean) => {
    setFiles((prev) => prev.map((f) => ({ ...f, selected })));
  }, []);

  const cancelUpload = useCallback(() => {
    cancelRef.current = true;
  }, []);

  const markMediaUploaded = useCallback((mediaId: string) => {
    setFiles((prev) => prev.map((file) => (file.media_id === mediaId ? { ...file, status: 'UPLOADED' as UploadStatus } : file)));
  }, []);

  const startUpload = useCallback(async (metadata: UploadMetadata, selectedIds?: string[]) => {
    let queue: UploadItem[] = [];
    const currentFiles = filesRef.current;
    
    if (selectedIds?.length) {
      queue = currentFiles.filter((f) => selectedIds.includes(f.id) && f.status !== 'UPLOADED');
    } else if (currentFiles.length) {
      queue = currentFiles.filter((f) => f.status !== 'UPLOADED');
    } else {
      const picked = await pickFilesFromDevice();
      if (!picked.length) return;
      addFiles(picked);
      queue = picked.map((f) => ({
        ...f,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        status: 'UNUPLOAD' as UploadStatus,
        progress: 0,
        addedAt: new Date().toISOString(),
        selected: false,
      }));
    }

    if (!queue.length) return;

    setUploading(true);
    setCompleted(0);
    setTotal(queue.length);
    setResults([]);
    cancelRef.current = false;

    setFiles((prev) => prev.map((f) => (queue.some((q) => q.id === f.id) ? { ...f, status: 'UPLOADING' as UploadStatus, error: undefined } : f)));

    const cancelRefCopy = cancelRef;
    const uploadResults = await batchUpload(queue, metadata, 1, 3, (update) => {
      if (cancelRefCopy.current) return;
      setFiles((prev) => prev.map((f) => {
        if (f.id !== update.id) return f;
        return {
          ...f,
          status: update.status,
          progress: update.progress,
          media_id: update.media_id ?? f.media_id,
          error: update.error ?? f.error,
        };
      }));
      if (update.filename) setCurrentFile(update.filename);
      if (update.status !== 'UPLOADING') {
        setCompleted((p) => p + 1);
      }
    }, cancelRef);

    setResults(uploadResults);
    setUploading(false);
    setCurrentFile('');

    if (cancelRef.current) {
      setFiles((prev) => prev.map((f) => (queue.some((q) => q.id === f.id) && f.status === 'UPLOADING' ? ({ ...f, status: 'FAILED' as UploadStatus, error: 'Đã huỷ'} ) : f)));
      cancelRef.current = false;
    }
  }, [addFiles, files]);

  return {
    uploading,
    completed,
    total,
    results,
    currentFile,
    files,
    addFiles,
    clearFiles,
    toggleSelectFile,
    setAllSelected,
    startUpload,
    cancelUpload,
    markMediaUploaded,
  };
}
