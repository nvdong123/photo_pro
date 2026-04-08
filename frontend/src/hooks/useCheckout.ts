import { useState } from "react";
import { apiClient } from "../lib/api-client";

export function useCheckout() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkout = async (payload: {
    customer_phone: string;
    customer_email?: string;
    bundle_id: string;
    payment_method: "vnpay" | "momo" | "payos" | "bank";
  }) => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.post<{
        order_id: string;
        order_code: string;
        payment_url?: string;
        download_url?: string;
      }>("/api/v1/checkout", payload);
      
      // If SKIP_PAYMENT is enabled, download_url is set → go to download page
      if (data.download_url) {
        window.location.href = data.download_url;
      } 
      // Otherwise, redirect to payment gateway
      else if (data.payment_url) {
        window.location.href = data.payment_url;
      } else {
        throw new Error("No payment URL or download URL in response");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi thanh toán");
      setLoading(false);
    }
  };

  return { checkout, loading, error };
}
