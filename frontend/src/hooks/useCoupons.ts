import { useAsync } from "./useAsync";
import { apiClient, invalidateApiCache } from "../lib/api-client";

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

const COUPONS_PATH = "/api/v1/admin/coupons";

export function useCoupons() {
  const { data, refetch, loading, error } = useAsync(() =>
    apiClient.get<Coupon[]>(COUPONS_PATH),
  );

  const create = async (p: CreateCouponPayload) => {
    await apiClient.post(COUPONS_PATH, p);
    invalidateApiCache(COUPONS_PATH);
    await refetch();
  };

  const update = async (id: string, p: Partial<CreateCouponPayload>) => {
    await apiClient.patch(`${COUPONS_PATH}/${id}`, p);
    invalidateApiCache(COUPONS_PATH);
    await refetch();
  };

  const remove = async (id: string) => {
    await apiClient.delete(`${COUPONS_PATH}/${id}`);
    invalidateApiCache(COUPONS_PATH);
    await refetch();
  };

  return { coupons: data, loading, error, create, update, remove, refetch };
}
