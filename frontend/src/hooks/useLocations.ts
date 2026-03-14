import { useAsync } from "./useAsync";
import { apiClient } from "../lib/api-client";

export interface LocationItem {
  id: string;
  name: string;
  description: string | null;
  media_count: number;
}

/**
 * Customer-side hook — returns shooting locations (albums) from the public endpoint.
 * Calls the same /api/v1/search/albums endpoint as useAlbums.
 */
export function useLocations() {
  return useAsync(() =>
    apiClient.get<LocationItem[]>("/api/v1/search/albums"),
  );
}
