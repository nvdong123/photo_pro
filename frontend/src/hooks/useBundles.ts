import { useAsync } from "./useAsync";
import { apiClient } from "../lib/api-client";

export interface Bundle {
  id: string;
  name: string;
  photo_count: number;
  price: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface CreateBundlePayload {
  name: string;
  photo_count: number;
  price: number;
  sort_order?: number;
}

export function useBundles() {
  const { data, refetch, loading, error } = useAsync(() =>
    apiClient.get<Bundle[]>("/api/v1/admin/bundles"),
  );

  const create = async (p: CreateBundlePayload) => {
    await apiClient.post("/api/v1/admin/bundles", p);
    await refetch();
  };

  const update = async (id: string, p: Partial<Bundle>) => {
    await apiClient.patch(`/api/v1/admin/bundles/${id}`, p);
    await refetch();
  };

  const remove = async (id: string) => {
    await apiClient.delete(`/api/v1/admin/bundles/${id}`);
    await refetch();
  };

  return { bundles: data, loading, error, create, update, remove, refetch };
}
