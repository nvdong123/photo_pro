import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { useDownloadInfo } from "@/hooks/useDownloadInfo";
import { server } from "@/mocks/server";

describe("useDownloadInfo", () => {
  it("fetches download info by token", async () => {
    const { result } = renderHook(() => useDownloadInfo("valid-token-abc123"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data?.is_active).toBe(true);
    expect(result.current.data?.order_code).toBe("PP20260306ABCXYZ");
    expect(result.current.error).toBeNull();
  });

  it("sets error for invalid token", async () => {
    server.use(
      http.get("http://localhost:8000/api/v1/download/:token/info", () =>
        HttpResponse.json(
          { success: false, error: { code: "ORDER_NOT_FOUND", message: "Not found" } },
          { status: 404 }
        )
      )
    );

    const { result } = renderHook(() => useDownloadInfo("bad-token"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeTruthy();
    expect(result.current.data).toBeNull();
  });

  it("starts loading on mount", () => {
    const { result } = renderHook(() => useDownloadInfo("some-token"));
    expect(result.current.loading).toBe(true);
  });
});
