import { useAsync } from "./useAsync";
import { apiClient, invalidateApiCache } from "../lib/api-client";

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

const STAFF_PATH = "/api/v1/admin/auth/users";

export function useStaffManagement() {
  const { data, loading, error, refetch } = useAsync(() =>
    apiClient.get<Staff[]>(STAFF_PATH),
  );

  const create = async (payload: CreateStaffPayload) => {
    await apiClient.post(STAFF_PATH, payload);
    invalidateApiCache(STAFF_PATH);
    await refetch();
  };

  const update = async (
    id: string,
    updates: { full_name?: string; role?: string; is_active?: boolean },
  ) => {
    await apiClient.patch(`${STAFF_PATH}/${id}`, updates);
    invalidateApiCache(STAFF_PATH);
    await refetch();
  };

  const remove = async (id: string) => {
    await apiClient.delete(`${STAFF_PATH}/${id}`);
    invalidateApiCache(STAFF_PATH);
    await refetch();
  };

  const isStaffRole = (role: string) => role === "STAFF";

  return { staffList: data ?? [], loading, error, refetch, create, update, remove, isStaffRole };
}
