import { useAsync } from "./useAsync";
import { apiClient } from "../lib/api-client";

export interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  role: "SYSTEM" | "SALES" | "MANAGER" | "STAFF";
  is_active: boolean;
  created_at: string;
}

export function useAdminStaff() {
  const { data, loading, error, refetch } = useAsync(() =>
    apiClient.get<AdminUser[]>("/api/v1/admin/auth/users"),
  );

  const createStaff = async (payload: {
    email: string;
    password: string;
    full_name?: string;
    role: string;
  }) => {
    await apiClient.post("/api/v1/admin/auth/users", payload);
    await refetch();
  };

  const updateStaff = async (
    id: string,
    updates: { full_name?: string; role?: string; is_active?: boolean },
  ) => {
    await apiClient.patch(`/api/v1/admin/auth/users/${id}`, updates);
    await refetch();
  };

  const deleteStaff = async (id: string) => {
    await apiClient.delete(`/api/v1/admin/auth/users/${id}`);
    await refetch();
  };

  return { staff: data ?? [], loading, error, createStaff, updateStaff, deleteStaff };
}
