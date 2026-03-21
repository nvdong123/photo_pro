import { useAsync } from "./useAsync";
import { apiClient } from "../lib/api-client";

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

/**
 * Admin-side locations hook.
 * Handles CRUD for shooting locations and staff assignment.
 */
export function useAdminLocations() {
  const { data, loading, error, refetch } = useAsync(() =>
    apiClient.get<AdminLocation[]>("/api/v1/admin/locations"),
  );

  const create = async (payload: CreateLocationPayload): Promise<AdminLocation> => {
    const result = await apiClient.post<AdminLocation>("/api/v1/admin/locations", payload);
    await refetch();
    return result;
  };

  const update = async (id: string, payload: Partial<CreateLocationPayload>) => {
    await apiClient.put(`/api/v1/admin/locations/${id}`, payload);
    await refetch();
  };

  const remove = async (id: string) => {
    await apiClient.delete(`/api/v1/admin/locations/${id}`);
    await refetch();
  };

  const getLocationStaff = (locationId: string) =>
    apiClient.get<LocationStaffAssignment[]>(`/api/v1/admin/locations/${locationId}/staff`);

  const assignStaff = async (locationId: string, staffId: string, canUpload = true) => {
    await apiClient.post(`/api/v1/admin/locations/${locationId}/staff`, {
      staff_id: staffId,
      can_upload: canUpload,
    });
    await refetch();
  };

  const removeStaff = async (locationId: string, staffId: string) => {
    await apiClient.delete(`/api/v1/admin/locations/${locationId}/staff/${staffId}`);
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
