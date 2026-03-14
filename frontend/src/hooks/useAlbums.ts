import { useAsync } from "./useAsync";
import { apiClient } from "../lib/api-client";

export interface AlbumItem {
  id: string;
  name: string;
  media_count: number;
}

export function useAlbums() {
  return useAsync(() =>
    apiClient.get<AlbumItem[]>("/api/v1/search/albums"),
  );
}
