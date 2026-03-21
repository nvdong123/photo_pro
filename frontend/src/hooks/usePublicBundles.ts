import { useAsync } from "./useAsync";
import { apiClient, TTL } from "../lib/api-client";

export interface PublicBundle {
  id: string;
  name: string;
  photo_count: number;
  price: number;
  is_active: boolean;
  is_popular: boolean;
  sort_order: number;
}

export function usePublicBundles() {
  const { data, loading, error } = useAsync(() =>
    apiClient.get<PublicBundle[]>("/api/v1/bundles", TTL.LONG),
  );

  const bundles: PublicBundle[] = (data ?? [])
    .filter((b) => b.is_active)
    .sort((a, b) => a.sort_order - b.sort_order || a.photo_count - b.photo_count);

  return { bundles, loading, error };
}