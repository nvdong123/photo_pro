import { useAsync } from "./useAsync";
import { apiClient } from "../lib/api-client";

export interface AdminAlbum {
  id: string;
  name: string;
  description: string | null;
  media_count: number;
}

export function useAdminAlbums() {
  const { data, loading, error, refetch } = useAsync(() =>
    apiClient.get<AdminAlbum[]>("/api/v1/admin/albums"),
  );

  const createAlbum = async (name: string, description?: string) => {
    await apiClient.post("/api/v1/admin/albums", { name, description: description ?? null });
    await refetch();
  };

  const deleteAlbum = async (id: string) => {
    await apiClient.delete(`/api/v1/admin/albums/${id}`);
    await refetch();
  };

  const patchAlbum = async (id: string, updates: { name?: string; description?: string }) => {
    await apiClient.patch(`/api/v1/admin/albums/${id}`, updates);
    await refetch();
  };

  return { albums: data ?? [], loading, error, createAlbum, deleteAlbum, patchAlbum };
}
