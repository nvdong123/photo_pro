import { act, renderHook } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { useFaceSearch } from "@/hooks/useFaceSearch";
import { server } from "@/mocks/server";

describe("useFaceSearch", () => {
  it("returns results after search", async () => {
    const { result } = renderHook(() => useFaceSearch());
    const blob = new Blob(["fake-image"], { type: "image/jpeg" });

    await act(async () => {
      await result.current.search(blob);
    });

    expect(result.current.results).toHaveLength(1);
    expect(result.current.results[0].similarity).toBe(96.5);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("sets error on API failure", async () => {
    server.use(
      http.post("http://localhost:8000/api/v1/search/face", () =>
        HttpResponse.json(
          {
            success: false,
            error: { code: "FACE_SERVICE_UNAVAILABLE", message: "Service down" },
          },
          { status: 503 }
        )
      )
    );

    const { result } = renderHook(() => useFaceSearch());
    await act(async () => {
      await result.current.search(new Blob(["img"], { type: "image/jpeg" }));
    });

    expect(result.current.error).toBe("Service down");
    expect(result.current.results).toHaveLength(0);
  });

  it("starts with empty state", () => {
    const { result } = renderHook(() => useFaceSearch());
    expect(result.current.results).toHaveLength(0);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });
});
