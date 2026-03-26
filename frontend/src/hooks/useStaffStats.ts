import { useAsync } from "./useAsync";
import { apiClient } from "../lib/api-client";

export interface StaffStat {
  staff_id: string;
  employee_code: string | null;
  staff_name: string | null;
  avatar_url: string | null;
  is_active: boolean;
  commission_rate: number;
  total_photos_uploaded: number;
  total_photos_sold: number;
  revenue_today: number;
  revenue_this_month: number;
  revenue_this_year: number;
  total_revenue: number;
  net_today: number;
  net_this_month: number;
  net_total: number;
  last_upload_date: string | null;
  conversion_rate: number;
}

export interface RevenuePoint {
  date: string;
  revenue: number;
  photos_sold: number;
}

/** SYSTEM / SALES / MANAGER — statistics for all STAFF members */
export function useAllStaffStats(filters?: { search?: string; period?: string }) {
  const params = new URLSearchParams(
    Object.fromEntries(
      Object.entries(filters ?? {}).filter(([, v]) => v !== undefined && v !== ""),
    ) as Record<string, string>,
  );
  const qs = params.toString() ? `?${params}` : "";
  return useAsync(
    () => apiClient.get<StaffStat[]>(`/api/v1/admin/staff/statistics${qs}`),
    [JSON.stringify(filters)],
  );
}

/** STAFF only — personal statistics */
export function useMyStats() {
  return useAsync(() => apiClient.get<StaffStat>("/api/v1/admin/staff/statistics/me"));
}

/** SYSTEM / SALES / MANAGER — stats for a specific staff member */
export function useStaffStats(staffId: string | undefined) {
  return useAsync(
    () =>
      staffId
        ? apiClient.get<StaffStat>(`/api/v1/admin/staff/statistics/${staffId}`)
        : Promise.resolve(null),
    [staffId],
  );
}

/** Revenue chart data for a specific staff member */
export function useStaffRevenue(
  staffId: string | undefined,
  period: "day" | "month" | "year" = "month",
) {
  return useAsync(
    () =>
      staffId
        ? apiClient.get<{ period: string; by_date: RevenuePoint[] }>(
            `/api/v1/admin/staff/statistics/${staffId}/revenue?period=${period}`,
          )
        : Promise.resolve(null),
    [staffId, period],
  );
}
