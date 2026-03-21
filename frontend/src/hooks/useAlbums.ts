import { useAsync } from "./useAsync";
import { apiClient, TTL } from "../lib/api-client";

export interface AlbumItem {
  id: string;
  name: string;
  media_count: number;
  thumbnail_url: string | null;
}

export function useAlbums() {
  return useAsync(() =>
    apiClient.get<AlbumItem[]>("/api/v1/search/albums", TTL.LONG),
  );
}
