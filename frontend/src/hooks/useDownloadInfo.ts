import { useAsync } from "./useAsync";
import { apiClient } from "../lib/api-client";

export interface PhotoPreview {
  media_id: string;
  preview_url: string;
}

export interface DownloadInfo {
  order_code: string;
  photo_previews: PhotoPreview[];
  expires_at: string;
  is_active: boolean;
}

export function useDownloadInfo(token: string) {
  return useAsync(
    () =>
      apiClient.get<DownloadInfo>(`/api/v1/download/${token}/info`),
    [token],
  );
}
