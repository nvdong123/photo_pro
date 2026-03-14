import { act, renderHook } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { useCart } from "@/hooks/useCart";
import { server } from "@/mocks/server";

describe("useCart", () => {
  it("loads empty cart on mount", async () => {
    const { result } = renderHook(() => useCart());

    // wait for initial load
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.cart?.count).toBe(0);
    expect(result.current.loading).toBe(false);
  });

  it("adds an item and refetches cart", async () => {
    server.use(
      http.post("http://localhost:8000/api/v1/cart/items", () =>
        HttpResponse.json({ success: true, data: {} })
      ),
      http.get("http://localhost:8000/api/v1/cart", () =>
        HttpResponse.json({
          success: true,
          data: {
            items: [{ media_id: "uuid-1", thumb_url: "https://mock/t.jpg" }],
            count: 1,
            suggested_pack: { total_amount: 20000, lines: [] },
          },
        })
      )
    );

    const { result } = renderHook(() => useCart());
    await act(async () => {
      await result.current.addItem("uuid-1");
    });

    expect(result.current.cart?.count).toBe(1);
    expect(result.current.error).toBeNull();
  });

  it("sets error when adding item fails", async () => {
    server.use(
      http.post("http://localhost:8000/api/v1/cart/items", () =>
        HttpResponse.json(
          { success: false, error: { code: "MEDIA_NOT_FOUND", message: "Not found" } },
          { status: 404 }
        )
      )
    );

    const { result } = renderHook(() => useCart());
    await act(async () => {
      await result.current.addItem("bad-uuid");
    });

    expect(result.current.error).toBeTruthy();
  });
});
