import { useAsync } from "./useAsync";
import { apiClient } from "../lib/api-client";

export interface AdminOrder {
  id: string;
  order_code: string;
  customer_phone: string;
  customer_email: string | null;
  photo_count: number;
  amount: number;
  status: "CREATED" | "PAID" | "FAILED" | "REFUNDED";
  payment_method: string;
  created_at: string;
  delivery_token: string | null;
  delivery_expires_at: string | null;
}

export interface OrderPhoto {
  media_id: string;
  preview_url: string | null;
  filename: string;
}

export interface OrderDelivery {
  id: string;
  download_token: string;
  expires_at: string;
  download_count: number;
  max_downloads: number;
  is_active: boolean;
  download_url: string;
}

export interface OrderDetail extends AdminOrder {
  items: Array<{ id: string; media_id: string; photographer_code: string; thumb_url: string | null }>;
  photos: OrderPhoto[];
  delivery: OrderDelivery | null;
}

export function useOrders(filters: {
  status?: string;
  search?: string;
  page?: number;
}) {
  const params = new URLSearchParams({
    page: String(filters.page ?? 1),
    limit: "20",
    ...(filters.status && { status: filters.status }),
    ...(filters.search && { search: filters.search }),
  });

  return useAsync(
    () =>
      apiClient.get<{ items: AdminOrder[]; total: number; page: number; pages: number }>(
        `/api/v1/admin/orders?${params}`,
      ),
    [JSON.stringify(filters)],
  );
}

export function useOrderDetail(orderId: string) {
  return useAsync(
    () => apiClient.get<OrderDetail>(`/api/v1/admin/orders/${orderId}`),
    [orderId],
  );
}

export const resendEmail = (id: string) =>
  apiClient.patch(`/api/v1/admin/orders/${id}/resend-email`, {});

export const revokeLink = (id: string) =>
  apiClient.patch(`/api/v1/admin/orders/${id}/revoke-link`, {});

export const newLink = (id: string) =>
  apiClient.patch(`/api/v1/admin/orders/${id}/new-link`, {});
