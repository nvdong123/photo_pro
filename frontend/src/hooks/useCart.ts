import { useState, useEffect, useCallback } from "react";
import { apiClient, APIError, TTL } from "../lib/api-client";

const CART_PATH = "/api/v1/cart";

export interface PackLine {
  bundle_id: string;
  bundle_name: string;
  photo_count: number;
  quantity: number;
  subtotal: number;
}

export interface SuggestedPack {
  lines: PackLine[];
  total_amount: number;
  total_photos_included: number;
}

export interface CartItem {
  media_id: string;
  thumb_url: string | null;
  shoot_date: string;
  photographer_code: string;
  album_code: string | null;
}

export interface CartData {
  session_id: string;
  items: CartItem[];
  count: number;
  suggested_pack: SuggestedPack | null;
}

export function useCart() {
  const [cart, setCart] = useState<CartData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCart = useCallback(async () => {
    try {
      const data = await apiClient.get<CartData>(CART_PATH, TTL.SHORT);
      setCart(data);
    } catch {
      // not critical — might not have session yet
    }
  }, []);

  // Only creates a cart session if one doesn't exist yet (tracked per browser tab).
  const initAndFetch = useCallback(async () => {
    try {
      if (!sessionStorage.getItem("cart_session_initialized")) {
        await apiClient.post("/api/v1/cart/session", {});
        sessionStorage.setItem("cart_session_initialized", "1");
      }
      await fetchCart();
    } catch {
      // ignore
    }
  }, [fetchCart]);

  const addItem = useCallback(async (mediaId: string) => {
    setLoading(true);
    setError(null);
    try {
      await apiClient.post("/api/v1/cart/items", { media_id: mediaId });
      const updated = await apiClient.getFresh<CartData>(CART_PATH);
      setCart(updated);
    } catch (e) {
      if (e instanceof APIError && e.code === "MEDIA_ALREADY_SOLD") {
        setError("Ảnh này đã được người khác mua rồi");
      } else {
        setError(e instanceof Error ? e.message : "Không thể thêm ảnh vào giỏ hàng");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const removeItem = useCallback(async (mediaId: string) => {
    setLoading(true);
    try {
      await apiClient.delete(`/api/v1/cart/items/${mediaId}`);
      const updated = await apiClient.getFresh<CartData>(CART_PATH);
      setCart(updated);
    } finally {
      setLoading(false);
    }
  }, []);

  const clearCart = useCallback(async () => {
    try {
      await apiClient.delete('/api/v1/cart');
      setCart(null);
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => {
    initAndFetch();
  }, [initAndFetch]);

  return { cart, loading, error, addItem, removeItem, clearCart, refetch: fetchCart };
}
