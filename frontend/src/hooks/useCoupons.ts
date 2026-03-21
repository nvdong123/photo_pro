import { useAsync } from "./useAsync";
import { apiClient } from "../lib/api-client";

export interface Coupon {
  id: string;
  code: string;
  discount_type: string;
  discount_value: number;
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

export interface CreateCouponPayload {
  code: string;
  discount_type: string;
  discount_value: number;
  max_uses?: number | null;
  expires_at?: string | null;
  is_active?: boolean;
}

export function useCoupons() {
  const { data, refetch, loading, error } = useAsync(() =>
    apiClient.get<Coupon[]>("/api/v1/admin/coupons"),
  );

  const create = async (p: CreateCouponPayload) => {
    await apiClient.post("/api/v1/admin/coupons", p);
    await refetch();
  };

  const update = async (id: string, p: Partial<CreateCouponPayload>) => {
    await apiClient.patch(`/api/v1/admin/coupons/${id}`, p);
    await refetch();
  };

  const remove = async (id: string) => {
    await apiClient.delete(`/api/v1/admin/coupons/${id}`);
    await refetch();
  };

  return { coupons: data, loading, error, create, update, remove, refetch };
}
