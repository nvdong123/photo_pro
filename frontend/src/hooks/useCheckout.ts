import { useState } from "react";
import { apiClient } from "../lib/api-client";

export function useCheckout() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkout = async (payload: {
    customer_phone: string;
    customer_email?: string;
    bundle_id: string;
    payment_method: "vnpay" | "momo";
  }) => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.post<{
        order_id: string;
        order_code: string;
        payment_url: string;
      }>("/api/v1/checkout", payload);
      window.location.href = data.payment_url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi thanh toán");
      setLoading(false);
    }
  };

  return { checkout, loading, error };
}
