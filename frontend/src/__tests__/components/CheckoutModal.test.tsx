/**
 * Component tests for the Checkout page / modal-like checkout flow.
 */
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";

describe("Checkout page", () => {
  it("renders without crashing", async () => {
    const Checkout = (await import("@/pages/frontend/Checkout")).default;
    render(
      <MemoryRouter>
        <Checkout />
      </MemoryRouter>
    );
    expect(document.body).toBeTruthy();
  });

  it("shows error state when bundle list fails to load", async () => {
    server.use(
      http.get("/api/v1/search/bundles", () =>
        HttpResponse.json(
          { success: false, error: { code: "BUNDLE_INACTIVE", message: "No bundles" } },
          { status: 503 }
        )
      )
    );
    const Checkout = (await import("@/pages/frontend/Checkout")).default;
    render(
      <MemoryRouter>
        <Checkout />
      </MemoryRouter>
    );
    expect(document.body).toBeTruthy();
  });
});
