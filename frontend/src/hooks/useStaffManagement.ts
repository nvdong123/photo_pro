import { useAsync } from "./useAsync";
import { apiClient } from "../lib/api-client";

export interface Staff {
  id: string;
  email: string;
  full_name: string | null;
  role: "SYSTEM" | "SALES" | "MANAGER" | "STAFF";
  employee_code: string | null;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
}

export interface CreateStaffPayload {
  email: string;
  password: string;
  full_name?: string;
  role: string;
  employee_code?: string;
  phone?: string;
  /** Location IDs to assign — only relevant for role=STAFF */
  location_ids?: string[];
}

export function useStaffManagement() {
  const { data, loading, error, refetch } = useAsync(() =>
    apiClient.get<Staff[]>("/api/v1/admin/auth/users"),
  );

  const create = async (payload: CreateStaffPayload) => {
    await apiClient.post("/api/v1/admin/auth/users", payload);
    await refetch();
  };

  const update = async (
    id: string,
    updates: { full_name?: string; role?: string; is_active?: boolean },
  ) => {
    await apiClient.patch(`/api/v1/admin/auth/users/${id}`, updates);
    await refetch();
  };

  const remove = async (id: string) => {
    await apiClient.delete(`/api/v1/admin/auth/users/${id}`);
    await refetch();
  };

  const isStaffRole = (role: string) => role === "STAFF";

  return { staffList: data ?? [], loading, error, refetch, create, update, remove, isStaffRole };
}
