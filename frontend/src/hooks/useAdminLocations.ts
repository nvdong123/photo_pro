import { useAsync } from "./useAsync";
import { apiClient, invalidateApiCache } from "../lib/api-client";

export interface AdminLocation {
  id: string;
  name: string;
  address: string | null;
  shoot_date: string | null;
  description: string | null;
  media_count: number;
  thumbnail_url: string | null;
  assigned_staff: { id: string; full_name: string | null; employee_code: string | null; can_upload: boolean }[];
}

export interface LocationStaffAssignment {
  assignment_id: string;
  staff_id: string;
  staff_name: string | null;
  employee_code: string | null;
  can_upload: boolean;
  assigned_at: string;
}

export interface CreateLocationPayload {
  name: string;
  address?: string;
  shoot_date?: string;
  description?: string;
}

const LOCATIONS_PATH = "/api/v1/admin/locations";

/**
 * Admin-side locations hook.
 * Handles CRUD for shooting locations and staff assignment.
 */
export function useAdminLocations() {
  const { data, loading, error, refetch } = useAsync(() =>
    apiClient.get<AdminLocation[]>(LOCATIONS_PATH),
  );

  const create = async (payload: CreateLocationPayload): Promise<AdminLocation> => {
    const result = await apiClient.post<AdminLocation>(LOCATIONS_PATH, payload);
    invalidateApiCache(LOCATIONS_PATH);
    await refetch();
    return result;
  };

  const update = async (id: string, payload: Partial<CreateLocationPayload>) => {
    await apiClient.put(`${LOCATIONS_PATH}/${id}`, payload);
    invalidateApiCache(LOCATIONS_PATH);
    await refetch();
  };

  const remove = async (id: string) => {
    await apiClient.delete(`${LOCATIONS_PATH}/${id}`);
    invalidateApiCache(LOCATIONS_PATH);
    await refetch();
  };

  const getLocationStaff = (locationId: string) =>
    apiClient.getFresh<LocationStaffAssignment[]>(`${LOCATIONS_PATH}/${locationId}/staff`);

  const assignStaff = async (locationId: string, staffId: string, canUpload = true) => {
    await apiClient.post(`${LOCATIONS_PATH}/${locationId}/staff`, {
      staff_id: staffId,
      can_upload: canUpload,
    });
    invalidateApiCache(LOCATIONS_PATH);
    await refetch();
  };

  const removeStaff = async (locationId: string, staffId: string) => {
    await apiClient.delete(`${LOCATIONS_PATH}/${locationId}/staff/${staffId}`);
    invalidateApiCache(LOCATIONS_PATH);
    await refetch();
  };

  return {
    locations: data ?? [],
    loading,
    error,
    refetch,
    create,
    update,
    remove,
    getLocationStaff,
    assignStaff,
    removeStaff,
  };
}
