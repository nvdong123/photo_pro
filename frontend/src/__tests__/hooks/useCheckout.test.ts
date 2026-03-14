import { act, renderHook } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { useCheckout } from "@/hooks/useCheckout";
import { server } from "@/mocks/server";

describe("useCheckout", () => {
  it("redirects to payment_url on success", async () => {
    const originalLocation = window.location;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).location;
    (window as any).location = { href: "" };

    const { result } = renderHook(() => useCheckout());
    await act(async () => {
      await result.current.checkout({
        customer_phone: "0901234567",
        bundle_id: "bundle-uuid",
        payment_method: "vnpay",
      });
    });

    expect(window.location.href).toBe("https://vnpay.test");
    (window as any).location = originalLocation;
  });

  it("sets error on payment failure", async () => {
    server.use(
      http.post("http://localhost:8000/api/v1/checkout", () =>
        HttpResponse.json(
          { success: false, error: { code: "BUNDLE_INACTIVE", message: "Bundle inactive" } },
          { status: 400 }
        )
      )
    );

    const { result } = renderHook(() => useCheckout());
    await act(async () => {
      await result.current.checkout({
        customer_phone: "0901234567",
        bundle_id: "bad-bundle",
        payment_method: "vnpay",
      });
    });

    expect(result.current.error).toBe("Bundle inactive");
  });

  it("starts with no error and not loading", () => {
    const { result } = renderHook(() => useCheckout());
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });
});
