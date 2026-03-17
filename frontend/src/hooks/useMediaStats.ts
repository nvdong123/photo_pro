import { useAsync } from "./useAsync";
import { apiClient } from "../lib/api-client";
import { hasRole } from "./useAuth";

export interface MediaStats {
  total: number;
  has_face: number;
  expiring_soon: number;
  by_status: Record<string, number>;
  by_photographer: Array<{ photographer_code: string; count: number }>;
}

export function useMediaStats() {
  const canAccess = hasRole(["admin-system", "admin-sales", "manager"]);
  return useAsync(() => apiClient.get<MediaStats>("/api/v1/admin/media/stats"), [], canAccess);
}

export const reprocessMedia = (mediaId: string) =>
  apiClient.post(`/api/v1/admin/media/${mediaId}/reprocess`, {});
