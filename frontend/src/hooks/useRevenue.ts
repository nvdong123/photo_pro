import { useAsync } from "./useAsync";
import { apiClient } from "../lib/api-client";

export interface RevenueByDate {
  date: string;
  revenue: number;
  orders: number;
}

export interface RevenueByPhotographer {
  photographer_code: string;
  revenue: number;
  orders: number;
  photos_sold: number;
}

export interface RevenueByBundle {
  bundle_name: string;
  count: number;
  revenue: number;
}

export interface RevenueSummary {
  total_revenue: number;
  total_orders: number;
  total_photos: number;
}

export interface RevenueData {
  summary: RevenueSummary;
  by_date: RevenueByDate[];
  by_photographer: RevenueByPhotographer[];
  by_bundle: RevenueByBundle[];
}

export function useRevenue(filters: {
  period: "today" | "week" | "month" | "quarter" | "year" | "custom";
  from_date?: string;
  to_date?: string;
  photographer_code?: string;
}) {
  const params = new URLSearchParams({ period: filters.period });
  if (filters.from_date) params.set("from_date", filters.from_date);
  if (filters.to_date) params.set("to_date", filters.to_date);
  if (filters.photographer_code)
    params.set("photographer_code", filters.photographer_code);

  return useAsync(
    () => apiClient.get<RevenueData>(`/api/v1/admin/revenue?${params}`),
    [filters.period, filters.from_date, filters.to_date, filters.photographer_code],
  );
}
