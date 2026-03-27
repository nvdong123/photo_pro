import { useAsync } from "./useAsync";
import { apiClient, invalidateApiCache } from "../lib/api-client";

export interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  role: "SYSTEM" | "SALES" | "MANAGER" | "STAFF";
  employee_code: string | null;
  is_active: boolean;
  created_at: string;
  total_photos: number;
  commission_rate: number;
}

const STAFF_PATH = "/api/v1/admin/auth/users";

export function useAdminStaff() {
  const { data, loading, error, refetch } = useAsync(() =>
    apiClient.get<AdminUser[]>(STAFF_PATH),
  );

  const createStaff = async (payload: {
    email: string;
    password: string;
    full_name?: string;
    role: string;
    commission_rate?: number;
  }) => {
    await apiClient.post(STAFF_PATH, payload);
    invalidateApiCache(STAFF_PATH);
    await refetch();
  };

  const updateStaff = async (
    id: string,
    updates: { full_name?: string; role?: string; is_active?: boolean; employee_code?: string; commission_rate?: number; password?: string },
  ) => {
    await apiClient.patch(`${STAFF_PATH}/${id}`, updates);
    invalidateApiCache(STAFF_PATH);
    await refetch();
  };

  const deleteStaff = async (id: string) => {
    await apiClient.delete(`${STAFF_PATH}/${id}`);
    invalidateApiCache(STAFF_PATH);
    await refetch();
  };

  return { staff: data ?? [], loading, error, createStaff, updateStaff, deleteStaff };
}
