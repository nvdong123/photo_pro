import { useAsync } from "./useAsync";
import { apiClient, invalidateApiCache, TTL } from "../lib/api-client";

export interface Bundle {
  id: string;
  name: string;
  photo_count: number;
  price: number;
  is_active: boolean;
  is_popular: boolean;
  sort_order: number;
  sold_count: number;
  created_at: string;
}

export interface CreateBundlePayload {
  name: string;
  photo_count: number;
  price: number;
  sort_order?: number;
}

const BUNDLES_PATH = "/api/v1/admin/bundles";

export function useBundles() {
  const { data, refetch, loading, error } = useAsync(() =>
    apiClient.get<Bundle[]>(BUNDLES_PATH, TTL.LONG),
  );

  const create = async (p: CreateBundlePayload) => {
    await apiClient.post(BUNDLES_PATH, p);
    invalidateApiCache(BUNDLES_PATH);
    await refetch();
  };

  const update = async (id: string, p: Partial<Bundle>) => {
    await apiClient.patch(`${BUNDLES_PATH}/${id}`, p);
    invalidateApiCache(BUNDLES_PATH);
    await refetch();
  };

  const remove = async (id: string) => {
    await apiClient.delete(`${BUNDLES_PATH}/${id}`);
    invalidateApiCache(BUNDLES_PATH);
    await refetch();
  };

  return { bundles: data, loading, error, create, update, remove, refetch };
}

export function usePublicBundles() {
  const { data, loading, error } = useAsync(() =>
    apiClient.get<Bundle[]>("/api/v1/bundles", TTL.LONG),
  );
  return { bundles: data ?? [], loading, error };
}
