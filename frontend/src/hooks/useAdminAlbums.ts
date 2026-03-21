import { useAsync } from "./useAsync";
import { apiClient, invalidateApiCache, TTL } from "../lib/api-client";

export interface AdminAlbum {
  id: string;
  name: string;
  description: string | null;
  media_count: number;
}

const ALBUMS_PATH = "/api/v1/admin/albums";

export function useAdminAlbums() {
  const { data, loading, error, refetch } = useAsync(() =>
    apiClient.get<AdminAlbum[]>(ALBUMS_PATH, TTL.LONG),
  );

  const createAlbum = async (name: string, description?: string) => {
    await apiClient.post(ALBUMS_PATH, { name, description: description ?? null });
    invalidateApiCache(ALBUMS_PATH);
    await refetch();
  };

  const deleteAlbum = async (id: string) => {
    await apiClient.delete(`${ALBUMS_PATH}/${id}`);
    invalidateApiCache(ALBUMS_PATH);
    await refetch();
  };

  const patchAlbum = async (id: string, updates: { name?: string; description?: string }) => {
    await apiClient.patch(`${ALBUMS_PATH}/${id}`, updates);
    invalidateApiCache(ALBUMS_PATH);
    await refetch();
  };

  return { albums: data ?? [], loading, error, createAlbum, deleteAlbum, patchAlbum };
}
