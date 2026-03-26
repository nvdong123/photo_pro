import { useAsync } from "./useAsync";
import { apiClient } from "../lib/api-client";

export interface MyLocation {
  id: string;
  name: string;
  address: string | null;
  shoot_date: string | null;
  description: string | null;
  can_upload: boolean;
}

export function useMyLocations() {
  return useAsync(() => apiClient.get<MyLocation[]>("/api/v1/admin/auth/my-locations"));
}
